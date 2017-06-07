import { assert } from 'chai'
import * as crypto from 'crypto'

import { FieldSerializer, ClaimCheck, CheckFormat } from '../../src/util'

class MockClaimCheck extends ClaimCheck {
  db: { [key: string]: string }
  constructor() {
    super()
    this.db = {}
  }
  buildCheck(input: string, cb: {(Error, string)}) {
    let hashed = crypto.createHash('sha1').update(input).digest('hex')
    this.db[hashed] = input
    let ccObj: CheckFormat = {
      _claimCheck: true,
      key: hashed
    }
    cb(null, JSON.stringify(ccObj))
  }
  retriveCheck(input: CheckFormat, cb: {(Error?, string?)}) {
    let key = input.key
    let ret = this.db[key]
    cb(null, ret)
  }
}

describe('FieldSerializer', () => {
  describe('constructor', () => {
    let checker = new MockClaimCheck()
    it('sets some defaults', () => {
      let serializer = new FieldSerializer(checker)
      assert.isArray(serializer.fields)
      assert.typeOf(serializer.maxLength, 'number')
    })
    it('should allow us to set some overrides of fields', () => {
      let serializer = new FieldSerializer(checker, ['foo', 'bar'], {maxLength: 1000})
      assert.deepEqual(serializer.fields, ['foo', 'bar'])
      assert.equal(serializer.maxLength, 1000)
    })
  })
  describe('serialize', () => {
    let checker = new MockClaimCheck()
    describe('should handle different types', () => {
      let serializer = new FieldSerializer(checker, null!, {maxLength: 10})
      it('like strings', (done) => {
        let input = '12345678910'
        serializer.serialize(input, (err, checkObj) => {
          assert.ifError(err)
          let cc = JSON.parse(checkObj)
          assert(cc._claimCheck)
          assert.typeOf(cc.key, 'string')
          assert.equal(checker.db[cc.key], input)
          done()
        })
      })
      it('like objects', (done) => {
        let input = {foobar: ['one', 'two', 'three'], coolStuff: 'anytime'}
        serializer.serialize(input, (err, checkObj) => {
          assert.ifError(err)
          let cc = JSON.parse(checkObj)
          assert(cc._claimCheck)
          assert.typeOf(cc.key, 'string')
          assert.equal(checker.db[cc.key], JSON.stringify(input))
          done()
        })
      })
      it('like anything else', (done) => {
        let input = 12345678900000000
        serializer.serialize(input, (err, checkObj) => {
          assert.ifError(err)
          let cc = JSON.parse(checkObj)
          assert(cc._claimCheck)
          assert.typeOf(cc.key, 'string')
          assert.equal(checker.db[cc.key], JSON.stringify(input))
          done()
        })
      })
    })
    describe('should reclaim check if already a claim check', () => {
      let serializer = new FieldSerializer(checker, null!, {maxLength: 10})
      let cc: CheckFormat = {
        _claimCheck: true,
        key: '12345678'
      }
      it('as an object', (done) => {
        serializer.serialize(cc, (err, output) => {
          assert.ifError(err)
          let fullCC = JSON.parse(output)
          assert.equal(fullCC.key, cc.key)
          assert.isUndefined(checker.db[cc.key])
          done()
        })
      })
      it('as a string', (done) => {
        serializer.serialize(JSON.stringify(cc), (err, output) => {
          assert.ifError(err)
          let fullCC = JSON.parse(output)
          assert.equal(fullCC.key, cc.key)
          assert.isUndefined(checker.db[cc.key])
          done()
        })
      })
    })
    describe('should only claim check if large enough', () => {
      let serializer = new FieldSerializer(checker, null!, {maxLength: 100})
      it('with strings', (done) => {
        serializer.serialize('hey guys', (err, output) => {
          assert.ifError(err)
          assert.equal(output, 'hey guys')
          done()
        })
      })
      it('with objects', (done) => {
        serializer.serialize({hey: 'guys'}, (err, output) => {
          assert.ifError(err)
          assert.equal(output, JSON.stringify({hey: 'guys'}))
          done()
        })
      })
    })
  })
  describe('serializeAll', () => {
    it('should serialize all fields specified if over length', (done) => {
      let checker = new MockClaimCheck()
      let serializer = new FieldSerializer(checker, ['foo', 'bar'], {maxLength: 10})
      let input = {
        foo: '12345678910',
        bar: '123',
        baz: 'can be too long and be ok'
      }
      serializer.serializeAll(input, (err, output) => {
        assert.ifError(err)
        assert(JSON.parse(output.foo)._claimCheck)
        assert.equal(output.bar, input.bar)
        assert.equal(output.baz, input.baz)
        done()
      })
    })
  })
  describe('deserialize', () => {
    let checker = new MockClaimCheck()
    let serializer = new FieldSerializer(checker, ['foo', 'bar'], {maxLength: 10})
    interface ACheckTest {
      isAClaimCheck: boolean
    }
    let input: ACheckTest = {
      isAClaimCheck: true
    }
    let cc: CheckFormat = {
      _claimCheck: true,
      key: 'isACheck'
    }

    it('should handle nulls', (done) => {
      serializer.deserialize<any>(null, (err, output) => {
        assert.ifError(err)
        assert(output == null)
        done()
      })
    })
    it('should handle fields that are not a claim check', (done) => {
      interface NotACheckTest {
        notACheck: boolean
      }
      let t: NotACheckTest = {
        notACheck: true
      }
      serializer.deserialize<NotACheckTest>(JSON.stringify(t), (err, output) => {
        assert.ifError(err)
        assert.deepEqual(output, t)
        done()
      })
    })
    it('should handle a claim check and hydrate it', (done) => {
      checker.db[cc.key] = JSON.stringify(input)
      serializer.deserialize<ACheckTest>(JSON.stringify(cc), (err, output) => {
        assert.ifError(err)
        assert.deepEqual(output, input)
        assert(serializer.isCached(cc.key))
        done()
      })
    })
    it('should retrieve from the cache if we already grabbed it', (done) => {
      checker.db[cc.key] = '{}'
      serializer.deserialize<ACheckTest>(JSON.stringify(cc), (err, output) => {
        assert.ifError(err)
        assert.deepEqual(output, input)
        assert(serializer.isCached(cc.key))
        done()
      })
    })
  })
  describe('deserializeSome', () => {
    it('should deserialize all fields specified and retrieve claim checks where applicable', (done) => {
      let checker = new MockClaimCheck()
      let serializer = new FieldSerializer(checker, ['foo', 'bar'], {maxLength: 10})
      let foo = {
        hello: 'world',
        number: 123456789
      }
      checker.db['fooField'] = JSON.stringify(foo)
      let fooCheck: CheckFormat = {
        _claimCheck: true,
        key: 'fooField'
      }
      let bar = {
        another: 'one',
        notA: 'claimCheck'
      }
      let baz = {
        shouldStay: 'an object'
      }
      let input = {
        foo: JSON.stringify(fooCheck),
        bar: JSON.stringify(bar),
        baz: baz
      }
      interface SomeTest {
        foo: {
          hello: string,
          number: number
        }
        bar: {
          another: string,
          notA: string
        }
        baz: {
          shouldStay: string
        }
      }
      serializer.deserializeSome<SomeTest>(['foo', 'bar'], input, (err, output) => {
        assert.ifError(err)
        assert.deepEqual(output, {foo, bar, baz})
        done()
      })
    })
  })
  describe('deserializeAll', () => {
    it('should behave the same as deserializeSome, but uses args from constructor', (done) => {
      let checker = new MockClaimCheck()
      let serializer = new FieldSerializer(checker, ['foo', 'bar'], {maxLength: 10})
      let foo = {
        hello: 'world',
        number: 123456789
      }
      checker.db['fooField'] = JSON.stringify(foo)
      let fooCheck: CheckFormat = {
        _claimCheck: true,
        key: 'fooField'
      }
      let bar = {
        another: 'one',
        notA: 'claimCheck'
      }
      let baz = {
        shouldStay: 'an object'
      }
      let input = {
        foo: JSON.stringify(fooCheck),
        bar: JSON.stringify(bar),
        baz: baz
      }
      interface SomeTest {
        foo: {
          hello: string,
          number: number
        }
        bar: {
          another: string,
          notA: string
        }
        baz: {
          shouldStay: string
        }
      }
      serializer.deserializeAll<SomeTest>(input, (err, output) => {
        assert.ifError(err)
        assert.deepEqual(output, {foo, bar, baz})
        done()
      })
    })
  })
})
