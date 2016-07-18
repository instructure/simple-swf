import { Workflow, Domain } from '../../src/entities'
import { FieldSerializer } from '../../src/util'
import { SWFConfig } from '../../src/SWFConfig'

import { SWF, Request } from 'aws-sdk'

import { assert } from 'chai'
import newContext from '../sinonHelper'

describe('Workflow', () => {
  describe('constructor', () => {
    let sandbox = newContext()
    let config = new SWFConfig()
    let domain = sandbox.stubClass<Domain>(Domain)
    let fieldSerializer = sandbox.stubClass<FieldSerializer>(FieldSerializer)
    domain.config = config
    domain.swfClient = new SWF

    it('should set properties', () => {
      let workflow = new Workflow(domain, 'myworkflow', '1.0.0', fieldSerializer)
      assert.equal(workflow.name, 'myworkflow')
      assert.equal(workflow.version, '1.0.0')
      assert.equal(workflow.config, domain.config)
      assert.equal(workflow.swfClient, domain.swfClient)
      assert.equal(workflow.fieldSerializer, fieldSerializer)
    })
  })
  describe('ensureWorkflow', () => {
    let sandbox = newContext()
    let config = new SWFConfig()
    let domain = sandbox.stubClass<Domain>(Domain)
    let fieldSerializer = sandbox.stubClass<FieldSerializer>(FieldSerializer)

    it('should register the workflow using defaults from config and overrides', (done) => {
      let wfParams: SWF.RegisterWorkflowTypeInput | null = null
      let swfMock = {
        registerWorkflowType(params: SWF.RegisterWorkflowTypeInput,
         cb?: {(Error?, any?)}): Request<any, any>  {
          wfParams = params
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
        .withArgs({entities: ['workflow'], api: 'registerWorkflowType'}, {hello: 'world'})
        .returns({hello: 'world'})
      domain.config = config
      domain.swfClient = swfMock
      domain.name = 'testDomain'
      let workflow = new Workflow(domain, 'myworkflow', '1.0.0', fieldSerializer)
      let swfSpy = sandbox.spy(swfMock, 'registerWorkflowType')
      workflow.ensureWorkflow({hello: 'world'}, (err) => {
        assert.ifError(err)
        assert.equal(swfSpy.callCount, 1)
        configMock.verify()
        assert.deepEqual(wfParams, {
          domain: 'testDomain',
          name: 'myworkflow',
          version: '1.0.0',
          hello: 'world'
        })
        done()
      })
    })
  })
  describe('startWorkflow', () => {
    let sandbox = newContext()
    let config = new SWFConfig()

    it('should register the workflow using defaults from config and overrides', (done) => {
      let fieldSerializer = sandbox.mockClass<FieldSerializer>(FieldSerializer)
      fieldSerializer.expects('serializeAll').once().withArgs({
        domain: 'testDomain',
        workflowId: 'myId',
        input: {field: 'value'},
        taskStartToCloseTimeout: '10',
        workflowType: {
          name: 'myworkflow',
          version: '1.0.0'
        },
        hello: 'world'
      }).callsArgWithAsync(1, null, {
        domain: 'testDomain',
        workflowId: 'myId',
        input: '{"field": "value"}',
        taskStartToCloseTimeout: '10',
        workflowType: {
          name: 'myworkflow',
          version: '1.0.0'
        },
        hello: 'world'
      })
      let wfParams: SWF.StartWorkflowExecutionInput | null = null
      let swfMock = {
        startWorkflowExecution(params: SWF.StartWorkflowExecutionInput,
         cb?: {(Error?, any?)}): Request<any, any>  {
          wfParams = params
          process.nextTick(() => {
            if (cb) {
              cb(null, {runId: '1234'})
            }
          })
          return {} as Request<any, any>
        }
      } as SWF
      let config = new SWFConfig()
      let configMock = sandbox.mock(config)
      configMock.expects('populateDefaults').once()
        .withArgs({entities: ['workflow', 'decision'], api: 'startWorkflowExecution'}, {hello: 'world'})
        .returns({hello: 'world', taskStartToCloseTimeout: '10'})
      let domain = sandbox.stubClass<Domain>(Domain)
      domain.config = config
      domain.swfClient = swfMock
      domain.name = 'testDomain'
      let workflow = new Workflow(domain, 'myworkflow', '1.0.0', fieldSerializer.object)
      let swfSpy = sandbox.spy(swfMock, 'startWorkflowExecution')
      workflow.startWorkflow('myId', {field: 'value'}, {hello: 'world'}, (err, workflowInfo) => {
        assert.ifError(err)
        assert.equal(swfSpy.callCount, 1)
        configMock.verify()
        assert.deepEqual(wfParams, {
          domain: 'testDomain',
          workflowId: 'myId',
          input: '{"field": "value"}',
          taskStartToCloseTimeout: '10',
          workflowType: {
            name: 'myworkflow',
            version: '1.0.0'
          },
          hello: 'world'
        })
        done()
      })
    })
  })
  describe('getDefaultConfig', () => {
    it('should return a config', () => {
      assert(Workflow.getDefaultConfig())
    })
  })
})
