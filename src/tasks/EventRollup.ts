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

  constructor(rawTask: SWF.DecisionTask) {
    this.data = processEvents(rawTask.events) as EventData
  }
  getTimedOutEvents(): SelectedEvents {
    return {
      activity: _.filter(this.data.activity!, {current: 'timedOut'}),
      workflow: _.filter(this.data.workflow!, {current: 'timedOut'})
    }
  }
  getFailedEvents(): SelectedEvents {
    return {
      activity: _.filter(this.data.activity!, {current: 'failed'}),
      workflow: _.filter(this.data.workflow!, {current: 'failed'})
    }
  }
}
