// a holder for all the different config options with sane defaults
const UnitTypes = {
  SECOND: 'second',
  DAY: 'day',
  ENUM: 'enum'
}
class SWFConfig {
  constructor(config) {
    this.setDefaults(config)
  }
  static defaultConfig = {
    activity: {
      // all the following are in seconds
      heartbeatTimeout: {
        description: 'A task must make a RecordActivityTaskHeartbeat call once within this interval. If not, the task is marked as invalid and rescheduled',
        mappings: [
          {api: 'respondDecisionTaskCompleted', attribute: 'scheduleActivityTaskDecisionAttributes'},
          {api: 'registerActivityType', name: 'defaultTaskHeartbeatTimeout'}
        ]
        value: 120,
        unit: UnitTypes.SECOND
      },
      startToCloseTimeout: {
        description: 'The maximum amount of time an activity task can be outstanding after being started. 0 or NONE indiciate no limit',
        mappings: [
          {api: 'registerActivityType', name: 'defaultTaskStartToCloseTimeout'},
          {api: 'respondDecisionTaskCompleted', attribute: 'scheduleActivityTaskDecisionAttributes', name: 'startToCloseTimeout'},
          {api: 'respondDecisionTaskCompleted', attribute: 'scheduleLambdaFunctionDecisionAttributes', name: 'startToCloseTimeout'}
        ],
        value: 0,
        unit: UnitTypes.SECOND,
      },
      scheduleToStartTimeout: {
        description: 'The maximum amount of time a task can be waiting to be started. 0 or NONE indicate no limit',
        mappings: [
          {api: 'registerActivityType', name: 'defaultTaskScheduleToStartTimeout'},
          {api: 'respondDecisionTaskCompleted', attribute: 'scheduleActivityTaskDecisionAttributes', name: 'scheduleToStartTimeout'},
        ],
        value: 0,
        unit: UnitTypes.SECOND,
      },
      scheduleToCloseTimeout: {
        description: 'The maximum amount of time a task can be outstanding, including scheudling delay. 0 or NONE indicate no limit',
        mappings: [
          {api: 'registerActivityType', name: 'defaultTaskScheduleToCloseTimeout'},
          {api: 'respondDecisionTaskCompleted', attribute: 'scheduleActivityTaskDecisionAttributes', name: 'scheduleToCloseTimeout'},
        ],
        value: 0,
        unit: UnitTypes.SECOND,
      }
    },
    decision: {
      startToCloseTimeout: {
        description: 'The maximum amount of time a decision task can take to complete. 0 or NONE inidcate no limit',
        mappings: [
          {api: 'startWorkflowExecution', name: 'taskStartToCloseTimeout'},
          {api: 'registerWorkflowType', name: 'defaultTaskStartToCloseTimeout'},
          {api: 'respondDecisionTaskCompleted', attribute: 'continueAsNewWorkflowExecutionDecisionAttributes', name: 'taskStartToCloseTimeout'},
          {api: 'respondDecisionTaskCompleted', attribute: 'startChildWorkflowExecutionDecisionAttributes', name: 'taskStartToCloseTimeout'}
        ],
        value: 60,
        unit: UnitTypes.SECOND,
      }
    },
    domain: {
      executionRetentionPeriodInDays: {
        description: 'The amount of time to keep the record of the workflow execution.'
        mapping: [{api: 'registerDomain', name: 'workflowExecutionRetentionPeriodInDays'}],
        value: 5,
        unit: UnitTypes.DAY
      }
    },
    workflow: {
      startToCloseTimeout: {
        description: 'The maximum amount of time this workflow can run. This has a max value of 1 year',
        mappings: [
          {api: 'registerWorkflowType', name: 'defaultExecutionStartToCloseTimeout'},
          {api: 'startWorkflowExecution', name: 'executionStartToCloseTimeout'}
          {api: 'respondDecisionTaskCompleted', attribute: 'continueAsNewWorkflowExecutionDecisionAttributes', name: 'executionStartToCloseTimeout'},
          {api: 'respondDecisionTaskCompleted', attribute: 'startChildWorkflowExecutionDecisionAttributes', name: 'executionStartToCloseTimeout'}
        ]
        value: 60 * 60 * 24 * 30,
        unit: UnitTypes.SECOND
      },
      childPolicy: {
        description: 'The behvaior child policies should have if the parent workflow dies',
        mappings: [
          {api: 'registerWorkflowType', name: 'defaultChildPolicy'},
          {api: 'terminateWorkflowExecution', name: 'childPolicy'},
          {api: 'startWorkflowExecution', name: 'childPolicy'},
          {api: 'respondDecisionTaskCompleted', attribute: 'continueAsNewWorkflowExecutionDecisionAttributes', name: 'childPolicy'},
          {api: 'respondDecisionTaskCompleted', attribute: 'startChildWorkflowExecutionDecisionAttributes', name: 'childPolicy'}
        ],
        possible: ['TERMINATE', 'REQUEST_CANCEL', 'ABANDON'],
        value: 'TERMINATE',
        unit: UnitTypes.ENUM
      }
    }
  }
}
