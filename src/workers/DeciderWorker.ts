import { SWF, Request } from 'aws-sdk'

import { DecisionTask } from '../tasks/decisionTask'
import { Decider } from '../entities/Decider'
import { Workflow } from '../entities/Workflow'
import { Worker } from './Worker'
import { buildIdentity } from '../util/Identity'
import { SWFConfig, ConfigOverride } from '../SWFConfig'
import { CodedError } from '../interaces'

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
    this.opts = opts
  }

  buildApiRequest(): Request {
    let defaults = this.config.populateDefaults({api: 'pollForDecisionTask'}, this.opts)
    let taskList = defaults[this.config.getMappingName('taskList', {api: 'pollForDecisionTask'})]
    let params: SWF.PollForDecisionTaskInput = {
      domain: this.workflow.domain.name,
      taskList: taskList
    }
    return this.swfClient.pollForDecisionTask(_.defaults<SWF.PollForDecisionTaskInput>(params, defaults))
  }

  // DecisionTaks have pagination, override this to paginate
  sendRequest(req: Request, cb: {(err: CodedError, d: SWF.DecisionTask)}) {
    let events: SWF.HistoryEvent[] = []
    let decisionTask: SWF.DecisionTask = null
    req.eachPage((err: CodedError, data: SWF.DecisionTask) => {
      if (err) return cb(err, null)
      if (!data) {
        decisionTask.events = events
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
    this.decider.makeDecisions(task, (err) => {
      if (err) return this.emit('error', err)
      task.sendDecisions((err) => {
        if (err) return this.emit('error', err)
        this.emit('madeDecision', task)
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

}
