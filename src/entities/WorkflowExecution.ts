import { SWF } from 'aws-sdk'
import * as async from 'async'

import {Workflow} from './Workflow'
import {WorkflowInfo, TaskInput} from '../interfaces'
import {ListFilter} from './Domain'
import {EventData} from '../tasks/EventRollup'
import {processEvents} from '../tasks/processEvents'
import {EventDeserializer} from '../util/EventDeserializer'
const objectAssign = require('object-assign')

export interface ExecutionHistory {
  progress: EventData,
  wfInput: TaskInput
}

export class WorkflowExecution {
  workflow: Workflow
  runInfo: WorkflowInfo
  startTimestamp?: Date
  executionStatus?: SWF.ExecutionStatus
  cancelRequested: boolean
  deserializer: EventDeserializer
  constructor(workflow: Workflow, runInfo: WorkflowInfo) {
    this.workflow = workflow
    this.runInfo = runInfo
    this.deserializer = new EventDeserializer(true, this.workflow.fieldSerializer)
  }
  describeWorkflowExecution(cb: {(err?: Error | null, data?: any)}) {
    this.workflow.swfClient.describeWorkflowExecution(
      {domain: this.workflow.domain.name, execution: this.runInfo},
      cb
    )
  }
  signalWorkflowExecution(signalName: string, input: any, cb: {(err?: Error | null)}) {
    this.workflow.fieldSerializer.serialize(input, (err, serialized) => {
      if (err) return cb
      this.workflow.swfClient.signalWorkflowExecution({
        signalName,
        domain: this.workflow.domain.name,
        workflowId: this.runInfo.workflowId,
        runId: this.runInfo.runId,
        input: serialized,
      }, cb)
    })
  }
  terminateWorkflowExecution(childPolicy: SWF.ChildPolicy, reason: string, details: string, cb: {(err?: Error | null)}) {
    this.workflow.swfClient.terminateWorkflowExecution({
      domain: this.workflow.domain.name,
      workflowId: this.runInfo.workflowId,
      runId: this.runInfo.runId,
      reason,
      childPolicy,
      details
    })
  }
  requestCancelWorkflowExecution(cb: {(err?: Error | null)}) {
    this.workflow.swfClient.requestCancelWorkflowExecution({
      domain: this.workflow.domain.name,
      workflowId: this.runInfo.workflowId,
      runId: this.runInfo.runId
    }, cb)
  }
  getWorkflowExecutionHistory(opts: ListFilter, cb: {(err?: Error | null, data?: ExecutionHistory)}) {
    const withExecutionInfo = objectAssign(opts, {
      domain: this.workflow.domain.name,
      execution: this.runInfo
    }) as SWF.GetWorkflowExecutionHistoryInput
    let events: SWF.HistoryEvent[] = []
    this.workflow.swfClient.getWorkflowExecutionHistory(withExecutionInfo).eachPage((err, data, done) => {
      if (err) return cb(err)
      if (!data) {
        if (events[0].eventType !== 'WorkflowExecutionStarted') return cb(new Error('unexpected workflow state'))
        // this is slightly hacky, when we cann deserializeEvent it changes this from strings
        // to hydrated objects
        const input = events[0]!.workflowExecutionStartedEventAttributes!.input as any
        return cb(null, {
          progress: processEvents(events),
          wfInput: input as TaskInput
        })
      }
      async.map<SWF.HistoryEvent, SWF.HistoryEvent>(
        data.events,
        this.deserializer.deserializeEvent.bind(this.deserializer),
        (err, newEvents) => {
          if (err) return cb(err)
          events = events.concat(newEvents)
          if (!done) return cb(new Error('unexpected, should have had done callback'))
          done()
        }
      )
    })
  }
  toJSON(): Object {
    return {
      execution: this.runInfo,
      status: this.executionStatus,
      startTimestamp: this.startTimestamp,
      cancelRequested: this.cancelRequested,
      domain: this.workflow.domain.name,
      workflowType: {
        name: this.workflow.name,
        version: this.workflow.version
      }
    }
  }

}
