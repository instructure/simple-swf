import { EventEmitter } from 'events'

import { ActivityType } from './ActivityType'
import { Workflow } from './Workflow'
import { ActivityTask } from '../tasks/ActivityTask'
import { StopReasons, ActivityStatus, UnknownResourceFault, CodedError } from '../interaces'
import { buildIdentity } from '../util/Identity'

export enum TaskStatus {
  Started,
  Stopped,
  ShouldStop
}
// this is really an abstract class, but there isn't
// of expressing abstract static methods or passing a generic type
// make up for this by throwing errors (which is better for non-ts code anyways)
export class Activity extends EventEmitter {

  task: ActivityTask
  workflow: Workflow
  taskStatus: TaskStatus
  id: string
  private heartbeatInterval: number
  private timer: NodeJS.Timer
  // this constructor is not to be called by the user, it gets created
  // when an activity of this type exists
  constructor(workflow: Workflow, activityType: ActivityType, task: ActivityTask) {
    super()
    this.task = task
    this.workflow = workflow
    this.heartbeatInterval = activityType.heartbeatTimeout(workflow.config)
    this.taskStatus = TaskStatus.Stopped
    this.id = buildIdentity(activityType.name)
  }

  status(): ActivityStatus {
    return {status: 'UNKNOWN'}
  }
  signal(string: string) {
    return
  }
  stop(reason: StopReasons, cb: {(err: CodedError, details?: ActivityStatus)}) {
    throw new Error('this method must be overriden!')
  }
  run(input: any, cb: {(err: CodedError, details: ActivityStatus)}) {
    throw new Error('this method must be overriden!')
  }

  _start(cb: {(err: CodedError, success: boolean, details?: ActivityStatus)}) {
    this.startHeartbeat()
    this.taskStatus = TaskStatus.Started
    this.task.getInput((err, input) => {
      if (err) return cb(err, false)
      this.run(input, (err, details) => {
        if (err) return this.task.respondFailed({error: err, details: details}, (err) => cb(err, false, details))
        this.task.respondSuccess(details, (err) => cb(err, true, details))
      })
    })
  }
  _requestStop(reason: StopReasons, doNotRespond: boolean, cb: {(err: CodedError)}) {
    this.taskStatus = TaskStatus.ShouldStop
    clearInterval(this.timer)
    this.stop(reason, (err, details) => {
      if (err) return cb(err)
      if (doNotRespond) {
        this.emit('cancelled')
        return cb(null)
      }
      this.task.respondCancelled({reason, details}, (err) => {
        if (err) return cb(err)
        this.emit('cancelled', reason)
      })
    })
  }
  protected startHeartbeat() {
    this.timer = setInterval(() => {
      let status = this.status()
      this.emit('heartbeat', status)
      this.task.sendHeartbeat(status, (err, shouldCancel) => {
        if (err && err.code === UnknownResourceFault) {
          return this._requestStop(StopReasons.HeartbeatCancel, true, (err) => {
            if (err) return this.emit('failedToStop', err)
          })
        }
        if (err) return this.emit('error', err)
        if (shouldCancel) {
          this._requestStop(StopReasons.HeartbeatCancel, false, (err) => {
            if (err) return this.emit('failedToStop', err)
          })
        }
        this.emit('heartbeatComplete')

      })
    // use half the interval to ensure we do it in time!
    }, this.heartbeatInterval * 0.5)
  }
  static getActivityType(): ActivityType {
    throw new Error('this method must be overriden!')
    //return new ActivityType('myTask', '1.0.0', Activity)
  }
}
