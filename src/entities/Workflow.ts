import { SWF } from 'aws-sdk'
import * as _ from 'lodash'

import { Domain } from './Domain'
import { SWFConfig, ConfigGroup, ConfigDefaultUnit, ConfigOverride } from '../SWFConfig'
import { CodedError, WorkflowInfo, TypeExistsFault } from '../interaces'
import { ClaimCheck } from '../util/ClaimCheck'

export class Workflow {
  name: string
  version: string
  domain: Domain
  swfClient: SWF
  config: SWFConfig
  claimChecker: ClaimCheck
  constructor(domain: Domain, name: string, version: string, claimChecker: ClaimCheck) {
    this.domain = domain
    this.name = name
    this.version = version
    this.swfClient = domain.swfClient
    this.config = domain.config
    this.claimChecker = claimChecker
  }
  ensureWorkflow(opts: ConfigOverride, cb: {(Error, boolean)}) {
    let defaults = this.config.populateDefaults({api: 'registerWorkflowType'}, opts)
    let params: SWF.RegisterWorkflowTypeInput = {
      name: this.name,
      version: this.version,
      domain: this.domain.name
    }
    this.swfClient.registerWorkflowType(_.defaults<SWF.RegisterWorkflowTypeInput>(params, defaults), (err: CodedError) => {
      if (err && err.code !== TypeExistsFault) return cb(err, false)
      if (err) return cb(null, false)
      cb(null, true)
    })
  }
  startWorkflow(id: string, input: any, opts: ConfigOverride, cb: {(Error, WorkflowInfo)}) {
    let defaults = this.config.populateDefaults({api: 'startWorkflowExecution'})
    this.claimChecker.encode(input, (err, encoded) => {
      let params: SWF.StartWorkflowExecutionInput = {
        domain: this.domain.name,
        workflowId: id,
        input: encoded,
        workflowType: {
          name: this.name,
          version: this.version
        }
      }
      this.swfClient.startWorkflowExecution(_.defaults<SWF.StartWorkflowExecutionInput>(params, defaults), cb)
    })
  }

  static getDefaultConfig(): ConfigGroup {
    return {
      startToCloseTimeout: {
        description: 'The maximum amount of time this workflow can run. This has a max value of 1 year',
        mappings: [
          {api: 'registerWorkflowType', name: 'defaultExecutionStartToCloseTimeout'},
          {api: 'startWorkflowExecution', name: 'executionStartToCloseTimeout'},
          {api: 'respondDecisionTaskCompleted', attribute: 'continueAsNewWorkflowExecutionDecisionAttributes', name: 'executionStartToCloseTimeout'},
          {api: 'respondDecisionTaskCompleted', attribute: 'startChildWorkflowExecutionDecisionAttributes', name: 'executionStartToCloseTimeout'}
        ],
        value: 60 * 60 * 24 * 30,
        unit: ConfigDefaultUnit.Second
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
        unit: ConfigDefaultUnit.Enum
      },
      taskList: {
        description: 'The defaultTaskList that will be assigned to activities in this workflow, see SWF docs for task list details',
        mappings: [
          {api: 'registerWorkflowType', name: 'defaultTaskList'},
          {api: 'respondDecisionTaskCompleted', attribute: 'continueAsNewWorkflowExecutionDecisionAttributes', name: 'taskList'},
          {api: 'respondDecisionTaskCompleted', attribute: 'startChildWorkflowExecutionDecisionAttributes', name: 'taskList'},
          {api: 'startWorkflowExecution', name: 'taskList'}
        ],
        value: 'simple-swf',
        format: function(name) {
          return {name}
        },
        unit: ConfigDefaultUnit.String
      },
      taskPriority: {
        description: 'The priority allows for tasks to be prioritized above others, see SWF docs for details',
        mappings: [
          {api: 'registerWorkflowType', name: 'defaultTaskPriority'},
          {api: 'respondDecisionTaskCompleted', attribute: 'continueAsNewWorkflowExecutionDecisionAttributes', name: 'taskPriority'},
          {api: 'respondDecisionTaskCompleted', attribute: 'startChildWorkflowExecutionDecisionAttributes', name: 'taskPriority'},
          {api: 'startWorkflowExecution', name: 'taskPriority'}
        ],
        value: 0,
        unit: ConfigDefaultUnit.Number
      },
      description: {
        description: 'Provides a text description for this workflow',
        mappings: [
          {api: 'registerWorkflowType', name: 'description'}
        ],
        value: null,
        unit: ConfigDefaultUnit.String
      },
      lambdaRole: {
        description: 'Lambda role to be used if using lambdaTasks',
        mappings: [
          {api: 'registerWorkflowType', name: 'defaultLambdaRole'},
          {api: 'respondDecisionTaskCompleted', attribute: 'continueAsNewWorkflowExecutionDecisionAttributes', name: 'lambdaRole'},
          {api: 'respondDecisionTaskCompleted', attribute: 'startChildWorkflowExecutionDecisionAttributes', name: 'lambdaRole'},
          {api: 'startWorkflowExecution', name: 'lambdaRole'}
        ],
        value: null,
        unit: ConfigDefaultUnit.String
      }
    }
  }
}
