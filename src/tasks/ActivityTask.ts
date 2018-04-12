import { SWF } from 'aws-sdk'
import { Task } from './Task'
import { Workflow } from '../entities/Workflow'
import { FieldSerializer } from '../util/FieldSerializer'
import { TaskStatus, CodedError, ActivityFailed, ActivityCanceled, TaskInput } from '../interfaces'

export class ActivityTask extends Task<SWF.ActivityTask> {
  fieldSerializer: FieldSerializer
  id: string
  taskInput: TaskInput
  constructor(workflow: Workflow, rawTask: SWF.ActivityTask, taskInput: TaskInput) {
    super(workflow, rawTask)
    this.fieldSerializer = workflow.fieldSerializer
    this.id = rawTask.activityId
    this.taskInput = taskInput
  }

  respondSuccess(result: TaskStatus, cb) {
    this.fieldSerializer.serialize(result, (err, encoded) => {
      if (err) return cb(err)
      let params: SWF.RespondActivityTaskCompletedInput = {
        taskToken: this.rawTask.taskToken,
        result: encoded
      }
      this.swfClient.respondActivityTaskCompleted(params, cb)
    })
  }
  respondFailed(result: ActivityFailed, cb) {
    this.fieldSerializer.serialize(result.details, (err, encoded) => {
      if (err) return cb(err)
      const resErr = result.error || {}
      const errMessage = resErr.message || ''
      let params: SWF.RespondActivityTaskFailedInput = {
        taskToken: this.rawTask.taskToken,
        // small guard to make sure this never gets too crazy...
        reason: errMessage.slice(0, 100),
        details: encoded
      }
      this.swfClient.respondActivityTaskFailed(params, cb)
    })
  }
  respondCanceled(result: ActivityCanceled, cb) {
    this.fieldSerializer.serialize(result, (err, encoded) => {
      if (err) return cb(err)
      let params: SWF.RespondActivityTaskCanceledInput = {
        taskToken: this.rawTask.taskToken,
        details: encoded
      }
      this.swfClient.respondActivityTaskFailed(params, cb)
    })
  }

  activityName(): string {
    return this.rawTask.activityType.name
  }

  sendHeartbeat(status: TaskStatus, cb: {(err: CodedError, success: boolean)}) {
    this.fieldSerializer.serialize(status, (err, encoded) => {
      let params: SWF.RecordActivityTaskHeartbeatInput = {
        taskToken: this.rawTask.taskToken,
        details: encoded
      }
      this.swfClient.recordActivityTaskHeartbeat(params, (err: CodedError, data: {cancelRequested: boolean}) => {
        if (err) return cb(err, false)
        cb(err, data.cancelRequested || false)
      })
    })
  }

  getInput(): any {
    return this.taskInput.input
  }
  getEnv(): Object {
    return this.taskInput.env || {}
  }
  getControl(): any {
    return this.taskInput.control || {}
  }
  getOriginWorkflow(): string {
    return this.taskInput.originWorkflow
  }
}
