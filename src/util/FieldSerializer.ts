import * as async from 'async'

import { ConfigOverride } from '../SWFConfig'
import { ClaimCheck } from './ClaimCheck'

// we can go to about 32k, but we cap it quite a bit smaller for reasons...
const DefaultLenLim = 10000
export const DefaultFields = ['input', 'control', 'reason', 'details', 'result']

/**
 * we want to be able to pass around JSON objects but SWF
 * only really supports strings for most of its data fields
 * this class takes care of wrapping fields as well as claimChecking
 * fields that are above the max length
 */
export class FieldSerializer {
  fields: string[]
  claimChecker: ClaimCheck
  maxLength: number
  constructor(claimChecker: ClaimCheck, fields: string[] = DefaultFields, opts: ConfigOverride = {}) {
    this.fields = fields
    this.claimChecker = claimChecker
    this.maxLength = opts['maxLength'] as number || DefaultLenLim
  }
  serializeAll<T>(input: any, cb: {(Error, T)}) {
    if (typeof input !== 'object') return this.serialize(input, cb)
    async.each(this.fields, (fieldName, cb) => {
      if (!input[fieldName]) return process.nextTick(cb)
      this.serialize(input[fieldName], (err, serialized) => {
        if (err) return cb(err)
        input[fieldName] = serialized
        cb(null)
      })
    }, (err) => {
      if (err) return cb(err, null)
      cb(null, input as T)
    })
  }
  serialize(input: any, cb: {(Error, string)}) {
    let stringified: string = null
    let isAlreadyCK = false
    if (typeof input === 'object') {
      isAlreadyCK = this.claimChecker.isClaimCheck(input)
      stringified = JSON.stringify(input)
    } else if (typeof input === 'string') {
      isAlreadyCK = this.claimChecker.isClaimCheck(input)
      stringified = input
    } else {
      stringified = input.toString()
    }
    if (!this.tooLong(stringified) || isAlreadyCK) return process.nextTick(() => cb(null, stringified))
    this.claimChecker.buildCheck(stringified, cb)
  }
  deserializeAll<T>(input: Object, cb: {(err, T)}) {
    this.deserializeSome(this.fields, input, cb)
  }
  deserializeSome<T>(fields: string[], input: Object, cb: {(err, t)}) {
    async.each(fields, (fieldName, cb) => {
      if (!input[fieldName]) return process.nextTick(cb)
      this.deserialize<T>(input[fieldName], (err, deserialized) => {
        if (err) return cb(err)
        input[fieldName] = deserialized
        cb(null)
      })
    }, (err) => {
      if (err) return cb(err, null)
      cb(null, input as T)
    })
  }
  deserialize<T>(input: string, cb: {(Error, T)}) {
    let parsed: any = null
    try {
      parsed = JSON.parse(input)
    } catch (e) {
      // ignore if error, assume a string body
      return cb(null, parsed as T)
    }
    if (!this.claimChecker.isClaimCheck(parsed)) return cb(null, parsed as T)
    this.claimChecker.retriveCheck(parsed, (err, res) => {
      if (err) return cb(err, null)
      let parsed = null
      try {
        parsed = JSON.parse(res)
      } catch (e) {
        parsed = res
      }
      cb(null, parsed as T)
    })
  }

  private tooLong(field: string) {
    return field.length > DefaultLenLim
  }
}
