import { SWF } from 'aws-sdk'
import * as _ from 'lodash'
import * as async from 'async'

import { Task } from './Task'
import { Workflow } from '../entities/Workflow'
import { ActivityType } from '../entities/ActivityType'
import { FieldSerializer } from '../util/FieldSerializer'
import { CodedError, EntityTypes } from '../interfaces'
import { EventRollup, Event } from './EventRollup'
import { ConfigOverride } from '../SWFConfig'

export const AttributeTypeMap = {
  CompleteWorkflowExecution: 'completeWorkflowExecutionDecisionAttributes',
  FailWorkflowExecution: 'failWorkflowExecutionDecisionAttributes',
  ScheduleActivityTask: 'scheduleActivityTaskDecisionAttributes',
  RecordMarker: 'recordMarkerDecisionAttributes',
  StartChildWorkflowExecution: 'startChildWorkflowExecutionDecisionAttributes',
  RequestCancelActivityTask: 'requestCancelActivityTaskDecisionAttributes',
  CancelWorkflowExecution: 'cancelWorkflowExecutionDecisionAttributes',
  ContinueAsNewWorkflowExecution: 'continueAsNewWorkflowExecutionDecisionAttributes',
  StartTimer: 'startTimerDecisionAttributes',
  CancelTimer: 'cancelTimerDecisionAttributes',
  SignalExternalWorkflowExecution: 'signalExternalWorkflowExecutionDecisionAttributes',
  RequestCancelExternalWorkflowExecution: 'requestCancelExternalWorkflowExecutionDecisionAttributes',
  ScheduleLambdaFunction: 'scheduleLambdaFunctionDecisionAttributes'
}

export interface Decision {
  entities: EntityTypes[],
  overrides: ConfigOverride
  decision: SWF.Decision
}

export interface DecisionRollup {
  [decisionType: string]: number
}

type SWFScheduleChild = SWF.StartChildWorkflowExecutionDecisionAttributes
type SWFScheduleTask = SWF.ScheduleActivityTaskDecisionAttributes
export type SWFWorkflowStart = SWF.WorkflowExecutionStartedEventAttributes

const SWF_MAX_RETRY = 5
export class DecisionTask extends Task<SWF.DecisionTask> {
  fieldSerializer: FieldSerializer
  decisions: Decision[]
  executionContext: any
  rollup: EventRollup
  rawEvents: SWF.HistoryEvent[]
  workflowAttrs: SWFWorkflowStart
  id: string
  constructor(workflow: Workflow, rawTask: SWF.DecisionTask) {
    super(workflow, rawTask)
    this.fieldSerializer = workflow.fieldSerializer
    this.decisions = []
    this.rollup = new EventRollup(rawTask)
    this.rawEvents = rawTask.events
    this.id = rawTask.startedEventId.toString()
  }
  deserializeWorkflowInput(cb) {
    if (this.rawEvents[0].eventType !== 'WorkflowExecutionStarted') {
      return cb(new Error('WorkflowExecutionStarted was not first event'))
    }
    let initialEvent = this.rawEvents[0].workflowExecutionStartedEventAttributes
    this.fieldSerializer.deserializeAll<SWFWorkflowStart>(initialEvent!, (err, event) => {
      if (err) return cb(err)
      this.workflowAttrs = event
      cb()
    })
  }
  getWorkflowInput(): any {
    return this.workflowAttrs.input
  }
  setExecutionContext(context: any) {
    this.executionContext = context
  }
  private encodeExecutionContext(cb: {(Error, string)}) {
    if (!this.executionContext) return cb(null, null)
    this.fieldSerializer.serialize(this.executionContext, cb)
  }
  private wrapDecisions(decisions: Decision[], cb: {(Error, dec: SWF.Decision[])}) {
    async.map(decisions, (decision: Decision, cb) => {
      let swfDec = decision.decision
      let attrName = AttributeTypeMap[swfDec.decisionType]
      let swfAttrs = swfDec[attrName]
      let apiUse = {entities: decision.entities, api: 'respondDecisionTaskCompleted', attribute: attrName}
      let defaults = this.config.populateDefaults(apiUse, decision.overrides)
      let merged = _.defaults(swfAttrs, defaults)
      this.fieldSerializer.serializeAll(merged, (err, serialized) => {
        if (err) return cb(err)
        swfDec[attrName] = serialized
        cb(null, swfDec)
      })
    }, cb)
  }
  sendDecisions(cb) {
    this.encodeExecutionContext((err, context) => {
      if (err) return cb(err)
      this.wrapDecisions(this.decisions, (err, decisions) => {
        if (err) return cb(err)
        let params: SWF.RespondDecisionTaskCompletedInput = {
          taskToken: this.rawTask.taskToken,
          decisions: decisions,
          executionContext: context
        }
        console.log(params.decisions)
        this.swfClient.respondDecisionTaskCompleted(params, cb)
      })
    })
  }
  getParentWorkflowInfo(): SWF.WorkflowExecution | null {
    return this.rawTask.events[0].workflowExecutionStartedEventAttributes!.parentWorkflowExecution || null
  }
  isChildWorkflow(): boolean {
    return this.getParentWorkflowInfo != null
  }
  rescheduleTimedOutEvents(): Event[] {
    let timedOut = this.rollup.getTimedOutEvents()
    let actFailRe = this.rescheduleOfType<SWFScheduleTask>(
      timedOut.activity,
      'activityTaskScheduledEventAttributes',
      this.rescheduleTask.bind(this)
    )

    let workFailRe = this.rescheduleOfType<SWFScheduleChild>(
      timedOut.workflow,
      'startChildWorkflowExecutionInitiatedEventAttributes',
      this.rescheduleChild.bind(this)
    )
    return actFailRe.concat(workFailRe)
  }
  rescheduleFailedEvents(): Event[] {
    let failed = this.rollup.getFailedEvents()
    let actFailRe = this.rescheduleOfType<SWFScheduleTask>(
      failed.activity,
      'activityTaskScheduledEventAttributes',
      this.rescheduleTask.bind(this)
    )
    let workFailRe = this.rescheduleOfType<SWFScheduleChild>(
      failed.workflow,
      'startChildWorkflowExecutionInitiatedEventAttributes',
      this.rescheduleChild.bind(this)
    )
    return actFailRe.concat(workFailRe)
  }
  private rescheduleOfType<T>(toReschedule: Event[], attrName: string, addFunc: {(T): boolean}): Event[] {
    let failedReschedule: Event[] = []
    for (let task of toReschedule) {
      let startAttrs = _.clone(task.scheduled[attrName])
      // this is an invalid option when scheduling activites and child workflows
      // otherwise, the attributes from the scheduled event are the same as the attributes to schedule a new event
      delete startAttrs.decisionTaskCompletedEventId
      if (!addFunc(startAttrs as T)) failedReschedule.push(task)
    }
    return failedReschedule
  }
  rescheduleTask(taskAttrs: SWF.ScheduleActivityTaskDecisionAttributes): boolean {
    // we don't want to rebuild the manifest, so don't put it in the normal place
    let control = this.getControlDoc(taskAttrs.control)
    if (control.executionCount > control.maxRetry) return false
    taskAttrs.control = JSON.stringify(control)
    this.decisions.push({
      entities: ['activity'],
      overrides: {},
      decision: {
        decisionType: 'ScheduleActivityTask',
        scheduleActivityTaskDecisionAttributes: taskAttrs
      }
    })
    return true
  }
  rescheduleChild(childAttrs: SWF.StartChildWorkflowExecutionDecisionAttributes): boolean {
    // we don't want to rebuild the manifest, so don't put it in the normal place
    let control = this.getControlDoc(childAttrs.control)
    if (control.executionCount > control.maxRetry) return false
    childAttrs.control = JSON.stringify(control)
    this.decisions.push({
      entities: ['workflow'],
      overrides: {},
      decision: {
        decisionType: 'StartChildWorkflowExecution',
        startChildWorkflowExecutionDecisionAttributes: childAttrs
      }
    })
    return true
  }
  scheduleTask(activityId: string, input: any, activity: ActivityType, opts: ConfigOverride = {}) {
    let maxRetry = opts['maxRetry'] as number || activity.maxRetry
    this.decisions.push({
      entities: ['activity'],
      overrides: opts,
      decision: {
        decisionType: 'ScheduleActivityTask',
        scheduleActivityTaskDecisionAttributes: {
          input: input,
          activityId: activityId,
          activityType: {
            name: activity.name,
            version: activity.version
          },
          control: JSON.stringify(this.buildInitialControlDoc(maxRetry))
        }
      }
    })
  }
  startChildWorkflow(workflowId: string, input: any, opts: ConfigOverride = {}) {
    let maxRetry = opts['maxRetry'] as number
    this.decisions.push({
      entities: ['workflow', 'decision'],
      overrides: opts,
      decision: {
        decisionType: 'StartChildWorkflowExecution',
        startChildWorkflowExecutionDecisionAttributes: {
          workflowId: workflowId,
          workflowType: {
            name: this.workflow.name,
            version: this.workflow.version
          },
          input: input,
          control: JSON.stringify(this.buildInitialControlDoc(maxRetry))
        }
      }
    })
  }
  failWorkflow(reason: string, details: string, opts: ConfigOverride = {}) {
    // when you fail workflow, the only thing that should be in it is the fail decision, any other
    // decisions can cause an error! so zero them out
    this.decisions = []
    this.decisions.push({
      entities: ['workflow'],
      overrides: opts,
      decision: {
        decisionType: 'FailWorkflowExecution',
        failWorkflowExecutionDecisionAttributes: {reason, details}
      }
    })
  }
  completeWorkflow(result: any, opts: ConfigOverride = {}) {
    this.decisions.push({
      entities: ['workflow'],
      overrides: opts,
      decision: {
        decisionType: 'CompleteWorkflowExecution',
        completeWorkflowExecutionDecisionAttributes: {result}
      }
    })
  }
  addMarker(markerName: string, details: any, opts: ConfigOverride = {}) {
    this.decisions.push({
      entities: ['activity'], // this is really an activity... but call it one
      overrides: opts,
      decision: {
        decisionType: 'RecordMarker',
        recordMarkerDecisionAttributes: { markerName, details }
      }
    })
  }
  cancelWorkflow(details: any, opts: ConfigOverride = {}) {
    this.decisions.push({
      entities: ['workflow'],
      overrides: opts,
      decision: {
        decisionType: 'CancelWorkflowExecution',
        cancelWorkflowExecutionDecisionAttributes: {details}
      }
    })
  }
  cancelActivity(activityId: string, opts: ConfigOverride = {}) {
    this.decisions.push({
      entities: ['activity'],
      overrides: opts,
      decision: {
        decisionType: 'RequestCancelActivityTask',
        requestCancelActivityTaskDecisionAttributes: {activityId}
      }
    })
  }
  startTimer(timerId: string, timerLength: number, control?: any) {
    this.decisions.push({
      entities: ['timer'],
      overrides: {},
      decision: {
        decisionType: 'StartTimer',
        startTimerDecisionAttributes: {
          timerId: timerId,
          startToFireTimeout: timerLength.toString(),
          control: control
        }
      }
    })
  }
  cancelTimer(timerId: string) {
    this.decisions.push({
      entities: ['timer'],
      overrides: {},
      decision: {
        decisionType: 'CancelTimer',
        cancelTimerDecisionAttributes: {timerId: timerId}
      }
    })
  }
  continueAsNewWorkflow(overrideInput: string | null = null, opts: ConfigOverride = {}) {
    let params: SWF.ContinueAsNewWorkflowExecutionDecisionAttributes = {
      input: overrideInput || this.workflowAttrs.input,
      childPolicy: this.workflowAttrs.childPolicy,
      executionStartToCloseTimeout: this.workflowAttrs.executionStartToCloseTimeout,
      lambdaRole: this.workflowAttrs.lambdaRole,
      tagList: this.workflowAttrs.tagList,
      taskList: this.workflowAttrs.taskList,
      taskPriority: this.workflowAttrs.taskPriority,
      taskStartToCloseTimeout: this.workflowAttrs.taskStartToCloseTimeout,
      workflowTypeVersion: this.workflow.version
    }
    this.decisions.push({
      entities: ['workflow'],
      overrides: opts,
      decision: {
        decisionType: 'ContinueAsNewWorkflowExecution',
        continueAsNewWorkflowExecutionDecisionAttributes: params
      }
    })
  }
  scheduleLambda(lambdaName: string, id: string, input: any, opts: ConfigOverride = {}) {
    this.decisions.push({
      entities: ['activity'],
      overrides: opts,
      decision: {
        decisionType: 'ScheduleLambdaFunction',
        scheduleLambdaFunctionDecisionAttributes: {
          id: id,
          name: lambdaName,
          input: input
        }
      }
    })
  }
  // responds with the info made in this decision
  getDecisionInfo(): DecisionRollup {
    return this.decisions.reduce((rollup, decision) => {
      if (rollup[decision.decision.decisionType]) {
        rollup[decision.decision.decisionType] += 1
      } else {
        rollup[decision.decision.decisionType] = 1
      }
      return rollup
    }, {} as DecisionRollup)
  }

  // TODO: implement these
  // SignalExternalWorkflowExecution: 'signalExternalWorkflowExecutionDecisionAttributes',
  // RequestCancelExternalWorkflowExecution: 'requestCancelExternalWorkflowExecutionDecisionAttributes',
  private buildInitialControlDoc(maxRetry: number = SWF_MAX_RETRY) {
    return {executionCount: 1, maxRetry}
  }
  private getControlDoc(existingControl: any) {
    if (typeof existingControl === 'string') {
      existingControl = JSON.parse(existingControl)
    }
    return {
      executionCount: (existingControl.executionCount + 1 || 1),
      maxRetry: (existingControl.maxRetry || SWF_MAX_RETRY)
    }
  }
}
