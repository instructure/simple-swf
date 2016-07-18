import { SWF, Request } from 'aws-sdk'
import * as _ from 'lodash'

import { DecisionTask } from '../tasks'
import { Decider, Workflow } from '../entities'
import { Worker } from './Worker'
import { buildIdentity } from '../util/buildIdentity'
import { SWFConfig, ConfigOverride } from '../SWFConfig'
import { CodedError } from '../interfaces'
import { FieldSerializer } from '../util/FieldSerializer'

export class DeciderWorker extends Worker<SWF.DecisionTask, DecisionTask> {
  swfClient: SWF
  config: SWFConfig
  opts: ConfigOverride
  decider: Decider
  constructor(decider: Decider, opts: ConfigOverride = {}) {
    // ensure string from overrides as ConfigOverride allows numbers
    let identity = (opts['identity'] || buildIdentity('activity')).toString()
    super(decider.workflow, identity)
    this.decider = decider
    this.config = this.workflow.config
    this.swfClient = this.workflow.swfClient
    this.opts = opts
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
  sendRequest(req: Request<any, any>, cb: {(err: CodedError | null, d: SWF.DecisionTask | null)}) {
    let events: SWF.HistoryEvent[] = []
    let decisionTask: SWF.DecisionTask | null = null
    req.eachPage((err: CodedError, data: SWF.DecisionTask) => {
      if (err) return cb(err, null)
      if (!data) {
        decisionTask!.events = events
        return cb(null, decisionTask)
      }
      if (!decisionTask) decisionTask = data
      events.push(...data.events)
    })
  }

  handleError(err: Error): boolean {
    return false
  }

  wrapTask(workflow: Workflow, task: SWF.DecisionTask): DecisionTask {
    return new DecisionTask(workflow, task)
  }


  performTask(task: DecisionTask) {
    this.emit('decision', task)
    task.deserializeWorkflowInput((err) => {
      if (err) return this.emit('error', err)
      this.decider.makeDecisions(task, (err) => {
        if (err) return this.emit('error', err)
        task.sendDecisions((err) => {
          if (err) return this.emit('error', err)
          this.emit('madeDecision', task)
        })
      })
    })
  }

  stop(cb) {
    cb()
  }

  start(cb) {
    this._start()
    cb()
  }

  deserializeWorkflowInput(cb: {(err: Error, input: any)}) {

  }

}
