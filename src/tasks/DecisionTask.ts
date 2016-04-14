import { SWF } from 'aws-sdk'
import { Task } from './Task'
import { Workflow } from '../entities/Workflow'
import { ClaimCheck } from '../util/ClaimCheck'
import { CodedError } from '../interaces'


export class DecisionTask extends Task<SWF.DecisionTask> {
  claimChecker: ClaimCheck
  decisions: SWF.Decision[]
  constructor(workflow: Workflow, rawTask: SWF.DecisionTask) {
    super(workflow, rawTask)
    this.claimChecker = workflow.claimChecker
    this.decisions = []
  }
  sendDecisions(cb) {
    let params: SWF.RespondDecisionTaskCompletedInput = {
      taskToken: this.rawTask.taskToken,
    }
    this.swfClient.respondDecisionTaskCompleted(params, cb)
  }
}
