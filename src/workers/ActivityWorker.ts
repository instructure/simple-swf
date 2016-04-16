import { SWF, Request } from 'aws-sdk'
import * as _ from 'lodash'
import * as async from 'async'

import { Activity, ActivityType, Workflow } from '../entities'
import { ActivityTask } from '../tasks'
import { Worker } from './Worker'
import { buildIdentity } from '../util/buildIdentity'
import { SWFConfig, ConfigOverride } from '../SWFConfig'
import { UnknownResourceFault, StopReasons } from '../interaces'



class ActivityWorker extends Worker<SWF.ActivityTask, ActivityTask> {
  swfClient: SWF
  config: SWFConfig
  opts: ConfigOverride
  activityRegistry: {[name: string]: ActivityType}
  activeActivities: {[activeId: string]: Activity }
  constructor(workflow: Workflow, opts: ConfigOverride = {}) {
    // ensure string from overrides as ConfigOverride allows numbers
    let identity = (opts['identity'] || buildIdentity('activity')).toString()
    super(workflow, identity)
    this.config = this.workflow.config
    this.opts = opts
  }

  buildApiRequest(): Request {
    let defaults = this.config.populateDefaults({entity: 'activity', api: 'pollForActivityTask'}, this.opts)
    let taskList = defaults[this.config.getMappingName('taskList', {entity: 'activity', api: 'pollForActivityTask'})]
    let params: SWF.PollForActivityTaskInput = {
      domain: this.workflow.domain.name,
      taskList: taskList
    }
    return this.swfClient.pollForActivityTask(_.defaults<SWF.PollForActivityTaskInput>(params, defaults))
  }

  handleError(err: Error): boolean {
    return false
  }

  wrapTask(workflow: Workflow, task: SWF.ActivityTask): ActivityTask {
    return new ActivityTask(workflow, task)
  }

  performTask(task: ActivityTask) {
    let activityType = this.getActivityType(task.activityName())
    let execution = activityType.createExecution(this.workflow, task)
    this.emit('startTask', task, execution)
    this.activeActivities[execution.id] = execution
    execution.on('failedToStop', (err) => {
      this.emit('error', err)
    })
    execution._start((err, status, details) => {
      if (err && err.code !== UnknownResourceFault) this.emit('error', err)
      if (err) this.emit('warn', err)
      this.emit('finished', task, execution, status, details)
      delete this.activeActivities[execution.id]
    })
  }

  stop(cb) {
    async.forEachOf(this.activeActivities, (execution: Activity, keyName, cb) => {
      delete this.activeActivities[keyName]
      execution._requestStop(StopReasons.ProcessExit, false, cb)
    }, cb)
  }

  start(cb) {
    let activitties = _.values<ActivityType>(this.activityRegistry)
    async.map(activitties, (act, cb) => act.ensureActivityType(this.workflow.domain, cb), (err) => {
      if (err) return cb(err)
      this._start()
      cb()
    })
  }

  registerActivityType(activity: ActivityType) {
    this.activityRegistry[activity.name] = activity
  }

  getActivityType(name: string): ActivityType {
    return this.activityRegistry[name]
  }

}

export default ActivityWorker
