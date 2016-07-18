import { SWF } from 'aws-sdk'
import { Workflow } from '../entities/Workflow'
import { SWFTask } from '../interfaces'
import { SWFConfig } from '../SWFConfig'

export abstract class Task<T extends SWFTask > {
  workflow: Workflow
  rawTask: T
  swfClient: SWF
  config: SWFConfig
  constructor(workflow: Workflow, rawTask: T) {
    this.workflow = workflow
    this.rawTask = rawTask
    this.swfClient = workflow.swfClient
    this.config = workflow.config
  }

  getEventId(): number {
    return this.rawTask.startedEventId
  }
  getWorkflowInfo(): SWF.WorkflowExecution {
    return this.rawTask.workflowExecution
  }
  getWorkflowId(): string {
    return this.rawTask.workflowExecution.workflowId
  }
}
