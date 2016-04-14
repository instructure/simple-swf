import { SWF } from 'aws-sdk'
import { SWFConfig, ConfigGroup, ConfigDefaultUnit } from '../SWFConfig'
import { Workflow } from './Workflow'
import { DecisionTask } from '../tasks/DecisionTask'

export abstract class Decider {
  workflow: Workflow
  swfClient: SWF
  config: SWFConfig
  constructor(workflow: Workflow) {
    this.workflow = workflow
    this.config = workflow.config
    this.swfClient = workflow.swfClient
  }
  abstract makeDecisions(task: DecisionTask, cb: {(err: Error, decision: DecisionTask)})

  static getDefaultConfig(): ConfigGroup {
    return {
      startToCloseTimeout: {
        description: 'The maximum amount of time a decision task can take to complete. 0 or NONE inidcate no limit',
        mappings: [
          {api: 'startWorkflowExecution', name: 'taskStartToCloseTimeout'},
          {api: 'registerWorkflowType', name: 'defaultTaskStartToCloseTimeout'},
          {api: 'respondDecisionTaskCompleted', attribute: 'continueAsNewWorkflowExecutionDecisionAttributes', name: 'taskStartToCloseTimeout'},
          {api: 'respondDecisionTaskCompleted', attribute: 'startChildWorkflowExecutionDecisionAttributes', name: 'taskStartToCloseTimeout'}
        ],
        value: 60,
        unit: ConfigDefaultUnit.Second,
      },
      taskList: {
        description: 'Specifies the taskList name for a specific decision, see SWF docs for more stails',
        mappings: [
          {api: 'pollForDecisionTask', name: 'taskList'}
        ],
        value: 'simple-swf',
        format: function(name) {
          return {name}
        },
        unit: ConfigDefaultUnit.String
      }
    }
  }
}
