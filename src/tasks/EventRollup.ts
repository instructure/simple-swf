import { SWF } from 'aws-sdk'
import { processEvents } from './processEvents'
import * as _ from 'lodash'

export interface Event {
  id: string,
  current: string,
  scheduled?: any,
  failedToSchedule?: any
  started?: any,
  failed?: any,
  completed?: any,
  timedOut?: any,
  terminate?: any,
  toCancel?: any,
  canceling?: any,
  canceled?: any,
  cancelFailed?: any,
  result?: any
}
export interface EventsById {
  [id: string]: Event
}
export interface EventData {
  activity?: EventsById,
  decision?: EventsById,
  workflow?: EventsById,
  marker?: EventsById,
  // all grouped together
  byEventId?: EventsById,
  completed?: Event[]
}

export interface SelectedEvents {
  activity: Event[],
  workflow: Event[]
}

export class EventRollup {
  data: EventData
  env: Object

  constructor(rawTask: SWF.DecisionTask, workflowEnv?: Object) {
    this.data = processEvents(rawTask.events) as EventData
    this.env = this.buildEnv(workflowEnv || {}, this.data.completed)
  }
  getTimedOutEvents(): SelectedEvents {
    return {
      activity: _.filter(this.data.activity || [], {current: 'timedOut'}),
      workflow: _.filter(this.data.workflow || [], {current: 'timedOut'})
    }
  }
  getFailedEvents(): SelectedEvents  {
    return {
      activity: _.filter(this.data.activity || [], {current: 'failed'}),
      workflow: _.filter(this.data.workflow || [], {current: 'failed'})
    }
  }
  getRetryableFailedToScheduleEvents(): SelectedEvents | false {
    const activity = _.filter(this.data.activity || [], (event) => {
      if (event.current !== 'failedToSchedule') {
        return false
      } else {
        const retryableCauses = [
          'OPEN_ACTIVITIES_LIMIT_EXCEEDED',
          'ACTIVITY_CREATION_RATE_EXCEEDED'
        ]

        return retryableCauses.indexOf(event.failedToSchedule.scheduleActivityTaskFailedEventAttributes.cause) > -1
      }
    })

    const workflow = _.filter(this.data.workflow || [], (event) => {
      if (event.current !== 'failedToSchedule') {
        return false
      } else {
        const retryableCauses = [
          'OPEN_WORKFLOWS_LIMIT_EXCEEDED',
          'OPEN_CHILDREN_LIMIT_EXCEEDED',
          'CHILD_CREATION_RATE_EXCEEDED'
        ]

        return retryableCauses.indexOf(event.failedToSchedule.startChildWorkflowExecutionFailedEventAttributes.cause) > -1
      }
    })

    if (!activity.length && !workflow.length) {
      return false
    }

    return {activity, workflow}
  }
  buildEnv(currentEnv: Object, completed?: any[]): Object {
    if (!completed) return currentEnv
    for (let event of completed) {
      if (event.state && event.state.result && event.state.result.env && typeof event.state.result.env === 'object') {
        currentEnv = _.merge(currentEnv || {}, event.state.result.env || {})
      }
    }
    return currentEnv
  }
}
