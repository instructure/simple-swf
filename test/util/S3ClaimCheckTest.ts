import { assert } from 'chai'
import { S3 } from 'aws-sdk'

import { S3ClaimCheck, S3CheckFormat } from '../../src/util'
import newContext from '../sinonHelper'


describe('S3ClaimCheck', () => {
  describe('constructor', () => {
    it('should init properly and allowing passing a custom s3 client', () => {
      let sandbox = newContext()
      let client = new S3()
      let mockClient = sandbox.mock(client)
      let checker = new S3ClaimCheck('fake-bucket', 'some-prefix/', client)
      assert(checker.s3Client != null)
    })
  })
  describe('buildCheck', () => {
    it('should make an s3 request we expect', (done) => {
      let sandbox = newContext()
      let client = new S3()
      let mockClient = sandbox.mock(client)
      let checker = new S3ClaimCheck('fake-bucket', 'some-prefix/', client)
      let callArgs = mockClient.expects('putObject').once().callsArgWithAsync(1, null).args
      let input = 'some big long string here'
      checker.buildCheck(input, (err, cc) => {
        assert.ifError(err)
        cc = JSON.parse(cc) as S3CheckFormat
        let s3Params = callArgs[0][0]
        assert.equal(s3Params.Bucket, 'fake-bucket')
        assert.include(s3Params.Key, cc.key)
        assert.equal(s3Params.Body, input)
        mockClient.verify()
        done()
      })
    })
    it('should handle an error from s3', (done) => {
      let sandbox = newContext()
      let client = new S3()
      let mockClient = sandbox.mock(client)
      let checker = new S3ClaimCheck('fake-bucket', 'some-prefix/', client)
      mockClient.expects('putObject').once().callsArgWithAsync(1, new Error('on no'))
      checker.buildCheck('should fail', (err, output) => {
        assert.typeOf(err, 'error')
        mockClient.verify()
        done()
      })
    })
  })
  describe('retriveCheck', () => {
    it('should retrieve a check from s3', (done) => {
      let sandbox = newContext()
      let client = new S3()
      let mockClient = sandbox.mock(client)
      let checker = new S3ClaimCheck('fake-bucket', 'some-prefix/', client)
      let callArgs = mockClient.expects('getObject').once().callsArgWithAsync(1, null, {Body: 'some claim check'}).args
      let cc: S3CheckFormat= {
        _claimCheck: true,
        key: 'some-prefix/thing',
        url: 's3://fake-bucket/some-prefix/thing'
      }
      checker.retriveCheck(cc, (err, output) => {
        assert.ifError(err)
        assert.equal(output, 'some claim check')
        let s3Params = callArgs[0][0]
        assert.equal(s3Params.Bucket, 'fake-bucket')
        assert.equal(s3Params.Key, cc.key)
        mockClient.verify()
        done()
      })
    })
    it('should an error from s3', (done) => {
      let sandbox = newContext()
      let client = new S3()
      let mockClient = sandbox.mock(client)
      let checker = new S3ClaimCheck('fake-bucket', 'some-prefix/', client)
      mockClient.expects('getObject').once().callsArgWithAsync(1, new Error('on no'))
      checker.retriveCheck({_claimCheck: true, key: 'a key'}, (err, output) => {
        assert.typeOf(err, 'error')
        mockClient.verify()
        done()
      })
    })
  })
})
