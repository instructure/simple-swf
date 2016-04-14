import { SWF } from 'aws-sdk'
import { Workflow } from '../entities/Workflow'
import { SWFTask } from '../interaces'
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

}
