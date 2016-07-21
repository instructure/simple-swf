import { SWF } from 'aws-sdk'
import * as _ from 'lodash'

import { SWFConfig, ConfigGroup, ConfigDefaultUnit, ConfigOverride } from '../SWFConfig'
import { CodedError, TypeExistsFault, EntityTypes } from '../interfaces'
import { Domain } from './Domain'
import { Workflow } from './Workflow'
import { ActivityTask } from '../tasks/ActivityTask'
import { Activity } from './Activity'

export class ActivityType {
  name: string
  version: string
  HandlerClass: { new(...args: any[]): Activity }
  opts: ConfigOverride
  maxRetry: number
  constructor(name: string, version: string, HandlerClass: { new(...args: any[]): Activity }, opts: ConfigOverride = {}) {
    this.name = name
    this.version = version
    this.HandlerClass = HandlerClass
    this.opts = opts
    this.maxRetry = opts['maxRetry'] as number || 5
  }
  ensureActivityType(domain: Domain, cb: {(err: Error | null, success: boolean)}) {
    let defaults = domain.config.populateDefaults({entities: ['activity'], api: 'registerActivityType'}, this.opts)
    let params: SWF.RegisterActivityTypeInput = {
      name: this.name,
      version: this.version,
      domain: domain.name
    }
    domain.swfClient.registerActivityType(_.defaults<SWF.RegisterActivityTypeInput>(params, defaults), (err: CodedError) => {
      if (err && err.code !== TypeExistsFault) return cb(err, false)
      if (err) return cb(null, false)

      cb(null, true)
    })
  }
  createExecution(workflow: Workflow, task: ActivityTask): Activity {
    return new this.HandlerClass(workflow, this, task)
  }
  heartbeatTimeout(config: SWFConfig): number {
    if (this.opts['heartbeatTimeout']) return (<number>this.opts['heartbeatTimeout'])
    return (<number>config.getValueForParam('activity', 'heartbeatTimeout'))
  }
  static getDefaultConfig(): ConfigGroup {
    return {
      heartbeatTimeout: {
        description: 'A task must make a RecordActivityTaskHeartbeat call once within this interval. If not, the task is marked as invalid and rescheduled',
        mappings: [
          {api: 'respondDecisionTaskCompleted', attribute: 'scheduleActivityTaskDecisionAttributes', name: 'heartbeatTimeout'},
          {api: 'registerActivityType', name: 'defaultTaskHeartbeatTimeout'}
        ],
        value: 120,
        unit: ConfigDefaultUnit.Second
      },
      startToCloseTimeout: {
        description: 'The maximum amount of time an activity task can be outstanding after being started. 0 or NONE indiciate no limit',
        mappings: [
          {api: 'registerActivityType', name: 'defaultTaskStartToCloseTimeout'},
          {api: 'startWorkflowExecution', name: 'taskStartToCloseTimeout'},
          {api: 'respondDecisionTaskCompleted', attribute: 'scheduleActivityTaskDecisionAttributes', name: 'startToCloseTimeout'},
          {api: 'respondDecisionTaskCompleted', attribute: 'scheduleLambdaFunctionDecisionAttributes', name: 'startToCloseTimeout'}
        ],
        value: 'NONE',
        unit: ConfigDefaultUnit.Second,
      },
      scheduleToStartTimeout: {
        description: 'The maximum amount of time a task can be waiting to be started. 0 or NONE indicate no limit',
        mappings: [
          {api: 'registerActivityType', name: 'defaultTaskScheduleToStartTimeout'},
          {api: 'respondDecisionTaskCompleted', attribute: 'scheduleActivityTaskDecisionAttributes', name: 'scheduleToStartTimeout'},
        ],
        value: 'NONE',
        unit: ConfigDefaultUnit.Second,
      },
      scheduleToCloseTimeout: {
        description: 'The maximum amount of time a task can be outstanding, including scheudling delay. 0 or NONE indicate no limit',
        mappings: [
          {api: 'registerActivityType', name: 'defaultTaskScheduleToCloseTimeout'},
          {api: 'respondDecisionTaskCompleted', attribute: 'scheduleActivityTaskDecisionAttributes', name: 'scheduleToCloseTimeout'},
        ],
        value: 'NONE',
        unit: ConfigDefaultUnit.Second,
      },
      taskList: {
        description: 'Specifies the taskList name for a specific activity or filters by taskList, see SWF docs for more stails',
        mappings: [
          {api: 'registerActivityType', name: 'defaultTaskList'},
          {api: 'respondDecisionTaskCompleted', attribute: 'startChildWorkflowExecutionDecisionAttributes', name: 'taskList'},
          {api: 'pollForActivityTask', name: 'taskList'}
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
          {api: 'registerActivityType', name: 'defaultTaskPriority'},
          {api: 'respondDecisionTaskCompleted', attribute: 'startChildWorkflowExecutionDecisionAttributes', name: 'taskPriority'}
        ],
        value: 0,
        unit: ConfigDefaultUnit.Number
      },
      description: {
        description: 'Provides a text description for this activty type',
        mappings: [
          {api: 'registerActivityType', name: 'description'}
        ],
        value: null,
        unit: ConfigDefaultUnit.String
      }
    }
  }
}
