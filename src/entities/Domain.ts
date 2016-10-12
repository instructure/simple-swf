import { SWF } from 'aws-sdk'
import * as _ from 'lodash'

import { ConfigGroup, ConfigDefaultUnit, SWFConfig, ConfigOverride } from '../SWFConfig'
import { CodedError, DomainExistsFaults } from '../interfaces'
import { WorkflowExecution } from './WorkflowExecution'
import { Workflow } from './Workflow'
import { FieldSerializer } from '../util/FieldSerializer'
import { ActivityTypeInfo } from './ActivityTypeInfo'
const objectAssign = require('object-assign')

export interface SWFFilterBase {
  domain?: string,
  executionFilter?: SWF.WorkflowExecutionFilter,
  startTimeFilter: SWF.ExecutionTimeFilter,
  typeFilter?: SWF.WorkflowTypeFilter,
  tagFilter?: SWF.TagFilter
}
export interface ListFilter {
  maximumPageSize?: number,
  nextPageToken?: string,
  reverseOrder?: boolean
}
export interface ClosedFilter {
  closeStatusFilter?: SWF.CloseStatusFilter,
  closeTimeFilter?: SWF.ExecutionTimeFilter
}
export interface ClosedCountInput extends SWFFilterBase, ClosedFilter {
}
export interface ClosedListFilter extends ListFilter, ClosedFilter {
}
export interface ListActivityType extends ListFilter {
  registrationStatus: SWF.RegistrationStatus,
  name?: string,
}

export type countCallback = {(err?: Error | null, count?: number | null, truncated?: boolean | null)}

export class Domain {
  name: string
  swfClient: SWF
  config: SWFConfig
  status?: SWF.RegistrationStatus
  description?: string
  constructor(name: string, config: SWFConfig, swfClient?: SWF) {
    this.name = name
    this.config = config
    this.swfClient = swfClient || new SWF()
  }
  ensureDomain(opts: ConfigOverride, cb: {(err?: Error, success?: boolean)}) {
    let defaults = this.config.populateDefaults({entities: ['domain'], api: 'registerDomain'}, opts)
    let retentionKey = this.config.getMappingName('executionRetentionPeriodInDays', {entities: ['domain'],
     api: 'registerDomain'})
    let retention = defaults[retentionKey!]
    let params: SWF.RegisterDomainInput = {
      name: this.name,
      workflowExecutionRetentionPeriodInDays: retention,
    }
    this.swfClient.registerDomain(_.defaults<SWF.RegisterDomainInput>(params, defaults), (err: CodedError) => {
      if (err && err.code !== DomainExistsFaults) return cb(err, false)
      if (err) return cb(null!, false)
      cb(null!, true)
    })
  }
  countClosedWorkflowExecutions(input: ClosedCountInput, cb: countCallback) {
    const withDomain = objectAssign(input, {domain: this.name}) as SWF.CountClosedWorkflowExecutionsInput
    this.swfClient.countClosedWorkflowExecutions(withDomain, (err, data) => {
      if (err) return cb(err)
      cb(null, data.count, data.truncated)
    })
  }
  countOpenWorkflowExecutions(input: SWFFilterBase, cb: countCallback) {
    const withDomain = objectAssign(input, {domain: this.name}) as SWF.CountOpenWorkflowExecutionsInput
    this.swfClient.countOpenWorkflowExecutions(withDomain, (err, data) => {
      if (err) return cb(err)
      cb(null, data.count, data.truncated)
    })
  }
  private buildWfExection(serializer: FieldSerializer, info: any): WorkflowExecution {
    const wf = new Workflow(this, info.workflowType.name, info.workflowType.version, serializer)
    const wfExec = wf.buildExecution(info.execution.workflowId, info.execution.runId)
    wfExec.startTimestamp = info.startTimestamp
    wfExec.executionStatus = info.executionStatus
    wfExec.cancelRequested = info.cancelRequested
    return wf.buildExecution(info.execution.workflowId, info.execution.runId)
  }
  listOpenWorkflowExecutions(
    serializer: FieldSerializer,
    input: ListFilter,
    cb: {(err?: Error, workflows?: WorkflowExecution[])}
  ) {
    const withDomain = objectAssign(input, {domain: this.name}) as SWF.ListOpenWorkflowExecutionsInput
    let workflows: WorkflowExecution[] = []
    const buildExecBound = this.buildWfExection.bind(this, serializer)
    this.swfClient.listOpenWorkflowExecutions(withDomain).eachPage((err, data) => {
      if (err) return cb(err)
      if (!data) return cb(null!, workflows)
      workflows = workflows.concat(data.executionInfos.map(buildExecBound))
    })
  }
  listClosedWorkflowExecutions(
    serializer: FieldSerializer,
    input: ClosedListFilter,
    cb: {(err?: Error, workflows?: WorkflowExecution[])}
  ) {
    const withDomain = objectAssign(input, {domain: this.name}) as SWF.ListClosedWorkflowExecutionsInput
    let workflows: WorkflowExecution[] = []
    const buildExecBound = this.buildWfExection.bind(this, serializer)
    this.swfClient.listClosedWorkflowExecutions(withDomain).eachPage((err, data) => {
      if (err) return cb(err)
      if (!data) return cb(undefined, workflows)
      workflows = workflows.concat(data.executionInfos.map(buildExecBound))
    })
  }
  listActivityTypes(
    input: ListActivityType,
    cb: {(err?: Error | null, actTypes?: ActivityTypeInfo[] | null)}
  ) {
    const withDomain = objectAssign(input, {domain: this.name}) as SWF.ListActivityTypesInput
    let actTypes: ActivityTypeInfo[] = []
    this.swfClient.listActivityTypes(withDomain).eachPage((err, data) => {
      if (err) return cb(err)
      if (!data) return cb(null, actTypes)
      actTypes = actTypes.concat(data.typeInfos.map((actInfo) => {
        let actType = new ActivityTypeInfo(actInfo.activityType.name, actInfo.activityType.version)
        actType.domainScope[this.name] = {
          status: actInfo.status,
          description: actInfo.description,
          creationDate: actInfo.creationDate,
          deprecationDate: actInfo.deprecationDate
        }
        return actType
      }))
    })
  }
  countPendingActivityTasks(name: string, cb: countCallback) {
    this.swfClient.countPendingActivityTasks({domain: this.name, taskList: {name}}, (err, data) => {
      if (err) return cb(err)
      cb(null, data.count, data.truncated)
    })
  }
  countPendingDecisionTasks(name: string, cb: countCallback) {
    this.swfClient.countPendingDecisionTasks({domain: this.name, taskList: {name}}, (err, data) => {
      if (err) return cb(err)
      cb(null, data.count, data.truncated)
    })
  }
  deprecateDomain(cb: {(err?: Error)}) {
    this.swfClient.deprecateDomain({name: this.name}, cb)
  }
  describeDomain(cb: {(err?: Error, data?: any)}) {
    this.swfClient.describeDomain({name: this.name}, cb)
  }

  static loadDomain(config: SWFConfig, swfClient: SWF, name: string) {
    return new Domain(name, config, swfClient)
  }
  static listDomains(
    config: SWFConfig,
    swfClient: SWF,
    regStatus: string = 'REGISTERED',
    cb: {(err?: Error, domains?: Domain[])}
  ) {
    const boundLoad = Domain.bind(Domain, config, swfClient)
    let domains: Domain[] = []
    swfClient.listDomains({registrationStatus: regStatus}).eachPage((err, data) => {
      if (err) return cb(err)
      if (!data) return cb(undefined, domains)
      domains = domains.concat(data.domainInfos.map((di) => {
        const d = boundLoad(di.name) as Domain
        d.status = di.status
        d.description = di.description
        return d
      }))
    })
  }
  static getDefaultConfig(): ConfigGroup {
    return {
      executionRetentionPeriodInDays: {
        description: 'The amount of time to keep the record of the workflow execution.',
        mappings: [{api: 'registerDomain', name: 'workflowExecutionRetentionPeriodInDays'}],
        value: 5,
        unit: ConfigDefaultUnit.Second
      },
      description: {
        description: 'Provides a text description for this domain',
        mappings: [
          {api: 'registerDomain', name: 'description'}
        ],
        value: null,
        unit: ConfigDefaultUnit.String
      },
    }
  }
}
