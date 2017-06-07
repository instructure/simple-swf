import { Domain } from '../../src/entities'
import { SWFConfig } from '../../src/SWFConfig'

import { SWF, Request } from 'aws-sdk'

import { assert } from 'chai'
import newContext from '../sinonHelper'

describe('Domain', () => {
  describe('constructor', () => {
    let sandbox = newContext()
    let config = new SWFConfig()

    it('should set properties and create own SWF', () => {
      let domain = new Domain('testDomain', config)
      assert.equal(domain.name, 'testDomain')
      assert.equal(domain.config, config)
      assert(domain.swfClient != null)
      assert.instanceOf(domain.swfClient, SWF)
    })
    it('should use passed in SWF instance', () => {
      let mySwf = new SWF()
      let domain = new Domain('testDomain', config, mySwf)
      assert.equal(domain.name, 'testDomain')
      assert.equal(domain.config, config)
      assert(domain.swfClient != null)
      assert.equal(domain.swfClient, mySwf)
    })
  })
  describe('ensureDomain', () => {
    let sandbox = newContext()
    let config = new SWFConfig()

    it('should register the domain using defaults from config and overrides', (done) => {
      let domainParams: SWF.RegisterDomainInput | null = null
      let swfMock = {
        registerDomain(params: SWF.RegisterDomainInput,
         cb?: {(Error?, any?)}): Request<any, any>  {
          domainParams = params
          process.nextTick(() => {
            if (cb) {
              cb()
            }
          })
          return {} as Request<any, any>
        }
      } as SWF
      let config = new SWFConfig()
      let configMock = sandbox.mock(config)
      configMock.expects('populateDefaults').once()
        .withArgs({entities: ['domain'], api: 'registerDomain'}, {workflowExecutionRetentionPeriodInDays: 24})
        .returns({workflowExecutionRetentionPeriodInDays: 24})
      let domain = new Domain('test', config, swfMock)
      let swfSpy = sandbox.spy(swfMock, 'registerDomain')
      domain.ensureDomain({workflowExecutionRetentionPeriodInDays: 24}, (err) => {
        assert.ifError(err)
        assert.equal(swfSpy.callCount, 1)
        configMock.verify()
        assert.deepEqual(domainParams as any, {
          name: 'test',
          workflowExecutionRetentionPeriodInDays: 24
        })
        done()
      })
    })
  })
  describe('getDefaultConfig', () => {
    it('should return a config', () => {
      assert(Domain.getDefaultConfig())
    })
  })
})
