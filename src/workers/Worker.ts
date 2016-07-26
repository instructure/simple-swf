import { EventEmitter } from 'events'
import { Request } from 'aws-sdk'
import { SWFTask, CodedError } from '../interfaces'
import { Task } from '../tasks/Task'
import { Workflow } from '../entities/Workflow'

enum PollingStates {
  Stopped,
  Started,
  ShouldStop
}

export abstract class Worker<T extends SWFTask, W extends Task<SWFTask>> extends EventEmitter {
  identity: string
  workflow: Workflow

  private currentRequest: Request<any, any> | null
  private pollingState: PollingStates

  constructor(workflow: Workflow, identity: string) {
    super()
    this.workflow = workflow
    this.identity = identity
  }
  _start() {
    this.pollingState = PollingStates.Started
    this.loop()
  }
  _stop(cb) {
    this.pollingState = PollingStates.ShouldStop
    if (!this.currentRequest) {
      this.pollingState = PollingStates.Stopped
      return cb()
    }
    this.currentRequest.on('error', (err) => {
      this.pollingState = PollingStates.Stopped
      this.currentRequest = null
      // ignore this error, its always going to be aborted by user
      cb()
    })
    this.currentRequest.abort()
    this.currentRequest = null
  }

  loop() {
    if (this.pollingState === PollingStates.ShouldStop || this.pollingState === PollingStates.Stopped) return
    let req = this.buildApiRequest()
    this.currentRequest = req
    this.emit('poll', req)
    this.sendRequest(req, (err: CodedError, data: T) => {
      if (this.pollingState === PollingStates.ShouldStop || this.pollingState === PollingStates.Stopped) return
      if (err) {
        this.emit('error', err)
        let toContinue = this.handleError(err)
        if (!toContinue) return
        return this.loop()
      }
      // didn't get any work, poll again
      if (!data || !data.taskToken) return this.loop()
      let task = this.wrapTask(this.workflow, data)
      this.emit('task', task)
      this.performTask(task)
      this.loop()
    })
  }

  sendRequest(req: Request<any, any>, cb: {(err?: CodedError, data?: T)}) {
    req.send(cb)
  }

  abstract wrapTask(workflow: Workflow, data: T): W
  abstract buildApiRequest(): Request<any, any>
  abstract performTask(task: W)
  abstract handleError(err: Error): boolean
}
