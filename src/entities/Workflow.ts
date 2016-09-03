import { SWF } from 'aws-sdk'
import * as _ from 'lodash'

import { Domain } from './Domain'
import { SWFConfig, ConfigGroup, ConfigDefaultUnit, ConfigOverride } from '../SWFConfig'
import { CodedError, WorkflowInfo, TypeExistsFault, TaskInput } from '../interfaces'
import { FieldSerializer } from '../util/FieldSerializer'

export class Workflow {
  name: string
  version: string
  domain: Domain
  swfClient: SWF
  config: SWFConfig
  fieldSerializer: FieldSerializer
  constructor(domain: Domain, name: string, version: string, fieldSerializer: FieldSerializer) {
    this.domain = domain
    this.name = name
    this.version = version
    this.swfClient = domain.swfClient
    this.config = domain.config
    this.fieldSerializer = fieldSerializer
  }
  ensureWorkflow(opts: ConfigOverride, cb: {(err: Error | null, success: boolean)}) {
    let defaults = this.config.populateDefaults({entities: ['workflow'], api: 'registerWorkflowType'}, opts)
    let params: SWF.RegisterWorkflowTypeInput = {
      name: this.name,
      version: this.version,
      domain: this.domain.name
    }
    this.swfClient.registerWorkflowType(_.defaults<SWF.RegisterWorkflowTypeInput>(params, defaults), (err: CodedError) => {
      if (err && err.code !== TypeExistsFault) return cb(err, false)
      if (err) return cb(null!, false)
      cb(null!, true)
    })
  }
  startWorkflow(id: string, input: any, env: Object | null, opts: ConfigOverride, cb: {(Error, WorkflowInfo)}) {
    let defaults = this.config.populateDefaults({entities: ['workflow', 'decision'], api: 'startWorkflowExecution'}, opts)
    // TODO: get rid of this hack, currently need it as this API crosses entties, need
    // to take care of in config layer
    let taskStartParam = this.config.getMappingName('startToCloseTimeout', {entities: ['decision'], api: 'startWorkflowExecution'})
    let params: SWF.StartWorkflowExecutionInput = {
      domain: this.domain.name,
      workflowId: id,
      input: JSON.stringify({
        input: input,
        env: env,
        originWorkflow: id
      } as TaskInput),
      taskStartToCloseTimeout: defaults[taskStartParam!],
      workflowType: {
        name: this.name,
        version: this.version
      }
    }
    let merged = _.defaults(params, defaults)
    this.fieldSerializer.serializeAll<SWF.StartWorkflowExecutionInput>(merged, (err, encoded) => {
      if (err) return cb(err, null)
      this.swfClient.startWorkflowExecution(encoded, (err, data) => {
        if (err) return cb(err, null)
        const runInfo = {
          workflowId: id,
          runId: data.runId
        }
        cb(null, runInfo)
      })
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
