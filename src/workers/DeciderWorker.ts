import { SWF, Request } from 'aws-sdk'
import * as _ from 'lodash'
import * as async from 'async'

import { DecisionTask } from '../tasks'
import { Decider, Workflow } from '../entities'
import { Worker } from './Worker'
import { buildIdentity } from '../util/buildIdentity'
import { EventTypeAttributeMap } from '../util'
import { SWFConfig, ConfigOverride } from '../SWFConfig'
import { CodedError } from '../interfaces'
import { FieldSerializer } from '../util/FieldSerializer'
import { EventDeserializer } from '../util/EventDeserializer'

// only try to deserialize these events types, since we really only
// care about the 'result' field to build the env
const EventsToDeserialize = {
  WorkflowExecutionStarted: true,
  WorkflowExecutionCompleted: true,
  ActivityTaskCompleted: true,
  ChildWorkflowExecutionCompleted: true,
  LambdaFunctionCompleted: true,
  WorkflowExecutionSignaled: true
}

export class DeciderWorker extends Worker<SWF.DecisionTask, DecisionTask> {
  swfClient: SWF
  config: SWFConfig
  opts: ConfigOverride
  decider: Decider
  deserializer: EventDeserializer
  constructor(decider: Decider, opts: ConfigOverride = {}) {
    // ensure string from overrides as ConfigOverride allows numbers
    let identity = (opts['identity'] || buildIdentity('activity')).toString()
    super(decider.workflow, identity)
    this.decider = decider
    this.config = this.workflow.config
    this.swfClient = this.workflow.swfClient
    this.opts = opts
    this.deserializer = new EventDeserializer(EventsToDeserialize, this.workflow.fieldSerializer)
  }

  buildApiRequest(): Request<any, any> {
    let defaults = this.config.populateDefaults({entities: ['decision'], api: 'pollForDecisionTask'}, this.opts)
    let taskListKey = this.config.getMappingName('taskList', {entities: ['decision'], api: 'pollForDecisionTask'})
    let taskList = defaults[taskListKey!]
    let params: SWF.PollForDecisionTaskInput = {
      domain: this.workflow.domain.name,
      taskList: taskList,
      identity: this.identity
    }
    return this.swfClient.pollForDecisionTask(_.defaults<SWF.PollForDecisionTaskInput>(params, defaults))
  }

  // DecisionTaks have pagination, override this to paginate
  sendRequest(req: Request<any, any>, cb: {(err?: CodedError, d?: SWF.DecisionTask)}) {
    let events: SWF.HistoryEvent[] = []
    let decisionTask: SWF.DecisionTask | null = null
    let cbCalled = false
    req.eachPage((err: CodedError, data: SWF.DecisionTask, done: {(): any}) => {
      if (err) return cb(err)
      if (cbCalled) return false
      // this happens when we abort requests, seems like a small aws-sdk bug when I would expect an error
      if (!data && !decisionTask) return cb()
      if (!data) {
        decisionTask!.events = events
        return cb(null!, decisionTask!)
      }
      if (!decisionTask) decisionTask = data
      async.map<SWF.HistoryEvent, SWF.HistoryEvent>(
        data.events,
        this.deserializer.deserializeEvent.bind(this.deserializer),
        (err, desEvents) => {
          if (err) {
            cb(err)
            cbCalled = true
            // return false to stop pagination
            return false
          }
          events.push(...desEvents)
          done()
      })
    })
  }

  handleError(err: Error): boolean {
    return false
  }

  wrapTask(workflow: Workflow, task: SWF.DecisionTask, cb: {(err: Error | null, task: DecisionTask | null)}) {
    cb(null, new DecisionTask(workflow, task))
  }

  performTask(task: DecisionTask) {
    this.emit('decision', task)
    this.decider.makeDecisions(task, (err) => {
      if (err) return this.emit('error', err)
      task.sendDecisions((err) => {
        if (err) return this.emit('error', err)
        this.emit('madeDecision', task)
      })
    })
  }

  stop(cb: {(Error?)}) {
    this._stop(cb)
  }

  start(cb: {(Error?)}) {
    this._start()
    cb()
  }
}
