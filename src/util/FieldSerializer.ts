import * as async from 'async'
import * as lru from 'lru-cache'

import { ConfigOverride } from '../SWFConfig'
import { ClaimCheck } from './ClaimCheck'

// we can go to about 32k, but we cap it quite a bit smaller for reasons...
const DefaultLenLim = 10000
export const DefaultFields = ['input', 'control', 'reason', 'details', 'result']

const DefaultCacheLim = 100

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
  private cache: lru.Cache<any>
  constructor(claimChecker: ClaimCheck, fields: string[] = DefaultFields, opts: ConfigOverride = {}) {
    this.fields = fields
    this.claimChecker = claimChecker
    this.maxLength = opts['maxLength'] as number || DefaultLenLim
    this.cache = lru<any>({max: opts['maxCacheItems'] as number || DefaultCacheLim})
  }
  serializeAll<T>(input: any, cb: {(Error?, T?)}) {
    if (typeof input !== 'object') return this.serialize(input, cb)
    async.each(this.fields, (fieldName, cb) => {
      if (!input[fieldName]) return process.nextTick(cb)
      this.serialize(input[fieldName], (err, serialized) => {
        if (err) return cb(err)
        input[fieldName] = serialized
        cb()
      })
    }, (err) => {
      if (err) return cb(err, null)
      cb(null, input as T)
    })
  }
  serialize(input: any, cb: {(err: Error | null, output: string)}) {
    let stringified: string = ''
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
  deserializeAll<T>(input: Object, cb: {(Error?, T?)}) {
    this.deserializeSome(this.fields, input, cb)
  }
  deserializeSome<T>(fields: string[], input: Object, cb: {(Error?, T?)}) {
    async.each(fields, (fieldName, cb) => {
      if (!input[fieldName]) return process.nextTick(cb)
      this.deserialize<T>(input[fieldName], (err, deserialized) => {
        if (err) return cb(err)
        input![fieldName] = deserialized
        cb()
      })
    }, (err) => {
      if (err) return cb(err, null)
      cb(null, input as T)
    })
  }
  deserialize<T>(input: string | null, cb: {(Error?, T?)}) {
    let parsed: any = null
    if (!input) return cb()
    try {
      parsed = JSON.parse(input)
    } catch (e) {
      // ignore if error, assume a string body
      return cb(null, parsed as T)
    }
    if (!this.claimChecker.isClaimCheck(parsed)) return cb(null, parsed as T)
    const cacheKey = parsed.key
    if (this.isCached(cacheKey)) return cb(null, this.getFromCache<T>(cacheKey) as T)
    this.claimChecker.retriveCheck(parsed, (err, res) => {
      if (err) return cb(err, null)
      let parsed: T | string
      try {
        parsed = JSON.parse(res)
      } catch (e) {
        parsed = res
      }
      this.saveToCache<T>(cacheKey, parsed! as T)
      cb(null, parsed! as T)
    })
  }
  isCached(key: string): boolean {
    return this.cache.has(key)
  }
  getFromCache<T>(key: string): T | null {
    return this.cache.get(key)
  }
  saveToCache<T>(key: string, val: T) {
    this.cache.set(key, val)
  }
  private tooLong(field: string) {
    return field.length > this.maxLength
  }
}
