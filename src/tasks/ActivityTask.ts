import { SWF } from 'aws-sdk'
import { Task } from './Task'
import { Workflow } from '../entities/Workflow'
import { ClaimCheck } from '../util/ClaimCheck'
import { ActivityStatus, CodedError, ActivityFailed, ActivityCancelled } from '../interaces'

const UNKNOWN_FAULT = 'UnknownResourceFault'
export class ActivityTask extends Task<SWF.ActivityTask> {
  claimChecker: ClaimCheck
  constructor(workflow: Workflow, rawTask: SWF.ActivityTask) {
    super(workflow, rawTask)
    this.claimChecker = workflow.claimChecker
  }

  respondSuccess(result: ActivityStatus, cb) {
    this.claimChecker.encode(result, (err, encoded) => {
      if (err) return cb(err)
      let params: SWF.RespondActivityTaskCompletedInput = {
        taskToken: this.rawTask.taskToken,
        result: encoded
      }
      this.swfClient.respondActivityTaskCompleted(params, cb)
    })
  }
  respondFailed(result: ActivityFailed, cb) {
    this.claimChecker.encode(result.details, (err, encoded) => {
      if (err) return cb(err)
      let params: SWF.RespondActivityTaskFailedInput = {
        taskToken: this.rawTask.taskToken,
        reason: result.error.message,
        details: encoded
      }
      this.swfClient.respondActivityTaskFailed(params, cb)
    })
  }
  respondCancelled(result: ActivityCancelled, cb) {
    this.claimChecker.encode(result, (err, encoded) => {
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
    this.claimChecker.decode(this.rawTask.input, cb)
  }

  sendHeartbeat(status: ActivityStatus, cb: {(Error, boolean)}) {
    this.claimChecker.encode(status, (err, encoded) => {
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
