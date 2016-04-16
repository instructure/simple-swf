import { SWF } from 'aws-sdk'
import { Task } from './Task'
import { Workflow } from '../entities/Workflow'
import { FieldSerializer } from '../util/FieldSerializer'
import { ActivityStatus, CodedError, ActivityFailed, ActivityCanceled } from '../interaces'

const UNKNOWN_FAULT = 'UnknownResourceFault'
export class ActivityTask extends Task<SWF.ActivityTask> {
  fieldSerializer: FieldSerializer
  constructor(workflow: Workflow, rawTask: SWF.ActivityTask) {
    super(workflow, rawTask)
    this.fieldSerializer = workflow.fieldSerializer
  }

  respondSuccess(result: ActivityStatus, cb) {
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
      let params: SWF.RespondActivityTaskFailedInput = {
        taskToken: this.rawTask.taskToken,
        reason: result.error.message,
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

  getInput(cb: {(err: Error, input: any)}) {
    this.fieldSerializer.deserialize(this.rawTask.input, cb)
  }

  sendHeartbeat(status: ActivityStatus, cb: {(Error, boolean)}) {
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
}
