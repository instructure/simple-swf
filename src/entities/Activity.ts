import { EventEmitter } from 'events'
import { ActivityType } from './ActivityType'
import { Workflow } from './Workflow'
import { ActivityTask } from '../tasks/ActivityTask'
import { StopReasons, TaskStatus, UnknownResourceFault, CodedError } from '../interfaces'

export enum TaskState {
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
  taskStatus: TaskState
  id: string
  activityType: ActivityType
  workflowId: string
  heartbeatInterval: number
  private timer: NodeJS.Timer
  // this constructor is not to be called by the user, it gets created
  // when an activity of this type exists
  constructor(workflow: Workflow, activityType: ActivityType, task: ActivityTask) {
    super()
    this.task = task
    this.workflow = workflow
    // heartbeatTimout is in seconds, convert to milliseconds
    this.heartbeatInterval = activityType.heartbeatTimeout(workflow.config) * 1000
    this.activityType = activityType
    this.taskStatus = TaskState.Stopped
    this.id = task.rawTask.activityId
  }

  status(): TaskStatus {
    return {status: 'UNKNOWN'}
  }
  stop(reason: StopReasons | null, cb: {(err: CodedError, details: TaskStatus | null)}) {
    throw new Error('this method must be overriden!')
  }
  run(input: any, env: Object | null, cb: {(err: CodedError, details: TaskStatus)}) {
    throw new Error('this method must be overriden!')
  }

  _start(cb: {(err: CodedError, success: boolean, details?: TaskStatus)}) {
    this.startHeartbeat()
    this.taskStatus = TaskState.Started
    this.task.getInput((err, input, env) => {
      if (err) return cb(err, false)
      this.run(input, env, (err, details) => {
        clearInterval(this.timer)
        // if a task is canceled before we call to respond, don't respond
        if (this.taskStatus === TaskState.Canceled) return

        if (err) {
          this.taskStatus = TaskState.Failed
          this.emit('failed', err, details)
          return this.task.respondFailed({error: err, details: details}, (err) => cb(err, false, details))
        }

        this.taskStatus = TaskState.Finished
        this.emit('completed', details)
        this.task.respondSuccess(details, (err) => cb(err, true, details))
      })
    })
  }
  _requestStop(reason: StopReasons, doNotRespond: boolean, cb: {(err?: CodedError)}) {
    this.taskStatus = TaskState.ShouldStop
    clearInterval(this.timer)
    this.stop(reason, (err, details) => {
      if (err) return cb(err)
      if (doNotRespond) {
        this.taskStatus = TaskState.Canceled
        this.emit('canceled', reason)
        return cb()
      }
      // if we finished, don't try and cancel, probably have outstanding completion
      if (this.taskStatus === TaskState.Finished) return
      this.task.respondCanceled({reason, details}, (err) => {
        if (err) return cb(err)
        this.taskStatus = TaskState.Canceled
        this.emit('canceled', reason)
        cb()
      })
    })
  }
  protected startHeartbeat() {
    this.timer = setInterval(() => {
      // if we happened to finished, just bail out
      if (this.taskStatus === TaskState.Finished) return
      let status = this.status()
      this.emit('heartbeat', status)
      this.task.sendHeartbeat(status, (err, shouldCancel) => {
        if (err && err.code === UnknownResourceFault) {
          // could finish the task but have sent off the heartbeat, so check here
          if (this.taskStatus === TaskState.Finished) return
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
  }, (this.heartbeatInterval * 0.5))
  }
  static getActivityType(): ActivityType {
    throw new Error('this method must be overriden!')
  }
}
