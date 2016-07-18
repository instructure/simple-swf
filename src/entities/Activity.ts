import { EventEmitter } from 'events'
import { ActivityType } from './ActivityType'
import { Workflow } from './Workflow'
import { ActivityTask } from '../tasks/ActivityTask'
import { StopReasons, ActivityStatus, UnknownResourceFault, CodedError } from '../interfaces'

export enum TaskStatus {
  Started,
  Stopped,
  ShouldStop,
  Finished,
  Canceled,
  Failed
}
// this is really an abstract class, but there isn't
// of expressing abstract static methods or passing a generic type
// make up for this by throwing errors (which is better for non-ts code anyways)
export class Activity extends EventEmitter {

  task: ActivityTask
  workflow: Workflow
  taskStatus: TaskStatus
  id: string
  activityType: ActivityType
  workflowId: string
  private heartbeatInterval: number
  private timer: NodeJS.Timer
  // this constructor is not to be called by the user, it gets created
  // when an activity of this type exists
  constructor(workflow: Workflow, activityType: ActivityType, task: ActivityTask) {
    super()
    this.task = task
    this.workflow = workflow
    this.heartbeatInterval = activityType.heartbeatTimeout(workflow.config)
    this.activityType = activityType
    this.taskStatus = TaskStatus.Stopped
    this.id = task.rawTask.activityId
  }

  status(): ActivityStatus {
    return {status: 'UNKNOWN'}
  }
  stop(reason: StopReasons | null, cb: {(err: CodedError, details: ActivityStatus | null)}) {
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
        clearInterval(this.timer)
        // if a task is canceled before we call to respond, don't respond
        if (this.taskStatus === TaskStatus.Canceled) return

        if (err) {
          this.taskStatus = TaskStatus.Failed
          this.emit('failed', err, details)
          return this.task.respondFailed({error: err, details: details}, (err) => cb(err, false, details))
        }

        this.taskStatus = TaskStatus.Finished
        this.emit('completed', details)
        this.task.respondSuccess(details, (err) => cb(err, true, details))
      })
    })
  }
  _requestStop(reason: StopReasons, doNotRespond: boolean, cb: {(err?: CodedError)}) {
    this.taskStatus = TaskStatus.ShouldStop
    clearInterval(this.timer)
    this.stop(reason, (err, details) => {
      if (err) return cb(err)
      if (doNotRespond) {
        this.taskStatus = TaskStatus.Canceled
        this.emit('canceled', reason)
        return cb()
      }
      // if we finished, don't try and cancel, probably have outstanding completion
      if (this.taskStatus === TaskStatus.Finished) return
      this.task.respondCanceled({reason, details}, (err) => {
        if (err) return cb(err)
        this.taskStatus = TaskStatus.Canceled
        this.emit('canceled', reason)
        cb()
      })
    })
  }
  protected startHeartbeat() {
    this.timer = setInterval(() => {
      // if we happened to finished, just bail out
      if (this.taskStatus === TaskStatus.Finished) return
      let status = this.status()
      this.emit('heartbeat', status)
      this.task.sendHeartbeat(status, (err, shouldCancel) => {
        if (err && err.code === UnknownResourceFault) {
          // could finish the task but have sent off the heartbeat, so check here
          if (this.taskStatus === TaskStatus.Finished) return
          return this._requestStop(StopReasons.UnknownResource, true, (err) => {
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
  }
}
