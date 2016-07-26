import { SWF, Request } from 'aws-sdk'
import * as _ from 'lodash'
import * as async from 'async'

import { Activity, ActivityType, Workflow } from '../entities'
import { ActivityTask } from '../tasks'
import { Worker } from './Worker'
import { buildIdentity } from '../util/buildIdentity'
import { SWFConfig, ConfigOverride } from '../SWFConfig'
import { UnknownResourceFault, StopReasons } from '../interfaces'

export interface ActivityTypeCreated {
  activity: ActivityType,
  created: boolean
}

export class ActivityWorker extends Worker<SWF.ActivityTask, ActivityTask> {
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
    this.activityRegistry = {}
    this.activeActivities = {}
    this.swfClient = this.workflow.swfClient
  }

  buildApiRequest(): Request<any, any> {
    let defaults = this.config.populateDefaults({entities: ['activity'], api: 'pollForActivityTask'}, this.opts)
    let taskListKey = this.config.getMappingName('taskList', {entities: ['activity'], api: 'pollForActivityTask'})
    let taskList = defaults[taskListKey!]
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
      // this error should only indicate AWS errors, the actual result of the task
      // is handler by the activity
      if (err && err.code !== UnknownResourceFault) this.emit('error', err)
      if (err) this.emit('warn', err)
      this.emit('finished', task, execution, status, details)
      delete this.activeActivities[execution.id]
    })
  }

  stop(cb: {(err?: Error)}) {
    async.forEachOf(this.activeActivities, (execution: Activity, keyName, cb) => {
      delete this.activeActivities[keyName]
      execution._requestStop(StopReasons.ProcessExit, false, cb)
    }, (err) => {
      // even if we have an error, we want still stop the polling
      this._stop((stopError) => {
        cb(err || stopError)
      })
    })
  }

  start(cb: {(Error?, res?: ActivityTypeCreated[])}) {
    let activities = _.values<ActivityType>(this.activityRegistry)
    async.map(
      activities,
      (act, cb: {(err?: Error, s?: boolean)}) => act.ensureActivityType(this.workflow.domain, cb),
      (err, results) => {
      if (err) return cb(err)
      const withCreated = activities.map((act, index) => ({activity: act, created: results[index] as boolean}))
      this._start()
      cb(null!, withCreated)
    })
  }

  registerActivityType(activity: ActivityType) {
    this.activityRegistry[activity.name] = activity
  }

  getActivityType(name: string): ActivityType {
    return this.activityRegistry[name]
  }
}
