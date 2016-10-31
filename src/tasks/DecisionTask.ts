import { SWF } from 'aws-sdk'
import * as _ from 'lodash'
import * as async from 'async'

import { Task } from './Task'
import { Workflow } from '../entities/Workflow'
import { ActivityType } from '../entities/ActivityType'
import { FieldSerializer } from '../util/FieldSerializer'
import { CodedError, EntityTypes, TaskInput, TaskStatus } from '../interfaces'
import { EventRollup, Event, EventData } from './EventRollup'
import { ConfigOverride } from '../SWFConfig'
import { DecisionTypeAttributeMap } from '../util'


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
type SWFWorkflowStart = SWF.WorkflowExecutionStartedEventAttributes

const SWF_MAX_RETRY = 5
export class DecisionTask extends Task<SWF.DecisionTask> {
  fieldSerializer: FieldSerializer
  decisions: Decision[]
  private executionContext: any
  private rollup: EventRollup
  private workflowAttrs: SWFWorkflowStart
  id: string
  constructor(workflow: Workflow, rawTask: SWF.DecisionTask) {
    super(workflow, rawTask)
    this.fieldSerializer = workflow.fieldSerializer
    this.decisions = []
    this.workflowAttrs = this.extractWorkflowInput(rawTask.events)
    this.rollup = new EventRollup(rawTask, this.getWorkflowTaskInput().env)
    this.id = rawTask.startedEventId.toString()
  }
  getWorkflowTaskInput(): TaskInput {
    // this is hacky and ugly, but we already have deserialized stuff
    // so we force input to be our TaskInput
    let input = this.workflowAttrs.input as any
    return input as TaskInput
  }
  getWorkflowInput(): any {
    return this.getWorkflowTaskInput().input
  }
  setExecutionContext(context: any) {
    this.executionContext = context
  }
  private buildTaskInput(input: any, overrideEnv?: any): string {
    return JSON.stringify({
      input: input,
      env: overrideEnv || this.getEnv(),
      originWorkflow: this.getOriginWorkflow()
    } as TaskInput)
  }
  private encodeExecutionContext(cb: {(err: Error | null, s: string)}) {
    if (!this.executionContext) return cb(null, '')
    this.fieldSerializer.serialize(this.executionContext, cb)
  }
  private wrapDecisions(decisions: Decision[], cb: {(Error, dec: SWF.Decision[])}) {
    async.map(decisions, (decision: Decision, cb) => {
      let swfDec = decision.decision
      let attrName = DecisionTypeAttributeMap[swfDec.decisionType]
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
        this.swfClient.respondDecisionTaskCompleted(params, cb)
      })
    })
  }
  getParentWorkflowInfo(): SWF.WorkflowExecution | null {
    return this.rawTask.events[0].workflowExecutionStartedEventAttributes!.parentWorkflowExecution || null
  }
  isChildWorkflow(): boolean {
    return this.getParentWorkflowInfo() !== null
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
  scheduleTask(activityId: string, input: any, activity: ActivityType, opts: ConfigOverride = {}, overrideEnv?: any) {
    let maxRetry = opts['maxRetry'] as number || activity.maxRetry
    let taskInput = this.buildTaskInput(input, overrideEnv)
    this.decisions.push({
      entities: ['activity'],
      overrides: opts,
      decision: {
        decisionType: 'ScheduleActivityTask',
        scheduleActivityTaskDecisionAttributes: {
          input: taskInput,
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
  startChildWorkflow(workflowId: string, input: any, opts: ConfigOverride = {}, overrideEnv?: any) {
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
          input: this.buildTaskInput(input, overrideEnv),
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
  completeWorkflow(result: TaskStatus, opts: ConfigOverride = {}, overrideEnv?: any) {
    result.env = overrideEnv || this.getEnv()
    this.decisions.push({
      entities: ['workflow'],
      overrides: opts,
      decision: {
        decisionType: 'CompleteWorkflowExecution',
        completeWorkflowExecutionDecisionAttributes: {
          result: JSON.stringify(result)
        }
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
  continueAsNewWorkflow(overrideInput: string | null = null, opts: ConfigOverride = {}, overrideEnv?: any) {
    let params: SWF.ContinueAsNewWorkflowExecutionDecisionAttributes = {
      input: this.buildTaskInput(overrideInput || this.workflowAttrs.input, overrideEnv),
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
  scheduleLambda(lambdaName: string, id: string, input: any, opts: ConfigOverride = {}, overrideEnv?: any) {
    this.decisions.push({
      entities: ['activity'],
      overrides: opts,
      decision: {
        decisionType: 'ScheduleLambdaFunction',
        scheduleLambdaFunctionDecisionAttributes: {
          id: id,
          name: lambdaName,
          input: this.buildTaskInput(input, overrideEnv),
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
  getGroupedEvents(): EventData {
    return this.rollup.data
  }
  getEnv(): Object {
    return this.rollup.env || {}
  }
  getOriginWorkflow(): string {
    return this.getWorkflowTaskInput().originWorkflow
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
  private extractWorkflowInput(rawEvents: SWF.HistoryEvent[]): SWFWorkflowStart {
    if (rawEvents[0].eventType !== 'WorkflowExecutionStarted') {
      throw new Error('WorkflowExecutionStarted was not first event')
    }
    return rawEvents[0].workflowExecutionStartedEventAttributes!
  }
}
