import { SWF } from 'aws-sdk'
import {FieldSerializer} from './FieldSerializer'
import { EventTypeAttributeMap } from './'

export class EventDeserializer {
  eventsToDeserialize: {[eventType: string]: boolean}
  deserializeAll: boolean
  fieldSerializer: FieldSerializer

  constructor(eventsToDeserialize: {[eventType: string]: boolean} | boolean, fieldSerializer: FieldSerializer) {
    if (typeof eventsToDeserialize === 'object') {
      this.eventsToDeserialize = eventsToDeserialize
      this.deserializeAll = false
    } else {
      this.eventsToDeserialize = {}
      this.deserializeAll = true
    }
    this.eventsToDeserialize = this.eventsToDeserialize || {}
    this.fieldSerializer = fieldSerializer
  }

  deserializeEvent(event: SWF.HistoryEvent, cb: {(err: Error | null, e: SWF.HistoryEvent | null)}) {
    if (!this.eventsToDeserialize[event.eventType] && !this.deserializeAll) return process.nextTick(() => cb(null, event))
    const attrName = EventTypeAttributeMap[event.eventType]
    if (!attrName) return cb(new Error('cannot find attributes for event ' + event.eventType), null)
    this.fieldSerializer.deserializeAll(event[attrName], (err, des) => {
      if (err) return cb(err, null)
      event[attrName] = des
      cb(null, event)
    })
  }
}
