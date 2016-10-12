import { ActivityType, Domain, Workflow, Activity } from '../../src/entities'
import { ActivityTask } from '../../src/tasks'
import { SWFConfig } from '../../src/SWFConfig'

import { SWF, Request } from 'aws-sdk'

import { assert } from 'chai'
import newContext from '../sinonHelper'

class FakeActivity extends Activity {
  run(cb) {
    this.emit('ran')
    cb(null, {status: 'didStuff'})
  }
}
describe('ActivityType', () => {
  describe('constructor', () => {
    let sandbox = newContext()
    it('should properly set properties we expect', () => {
      let activityType = new ActivityType('testAct', '1.0.0', FakeActivity)
      assert.equal(activityType.name, 'testAct')
      assert.equal(activityType.version, '1.0.0')
      assert.deepEqual(activityType.opts, {})
      assert.equal(activityType.maxRetry, 5)
    })
  })
  describe('heartbeatTimeout', () => {
    let sandbox = newContext()
    it('should grab the default from the config', () => {
      let configMock = sandbox.mockClass<SWFConfig>(SWFConfig)
      configMock.expects('getValueForParam').once().returns(10)
      let activityType = new ActivityType('testAct', '1.0.0', FakeActivity)
      assert.equal(activityType.heartbeatTimeout(configMock.object), 10)
      configMock.verify()
    })
    it('should grab an override from the class', () => {
      let configMock = sandbox.mockClass<SWFConfig>(SWFConfig)
      configMock.expects('getValueForParam').never()
      let activityType = new ActivityType('testAct', '1.0.0', FakeActivity, {heartbeatTimeout: 20})
      assert.equal(activityType.heartbeatTimeout(configMock.object), 20)
      configMock.verify()
    })
  })
  describe('createExecution', () => {
    let sandbox = newContext()
    let workflow = sandbox.stubClass<Workflow>(Workflow)
    let actTask = sandbox.stubClass<ActivityTask>(ActivityTask)
    actTask.rawTask = {activityId: '1234'} as SWF.ActivityTask

    it('should return an execution of the class passed in', () => {
      let activityType = new ActivityType('testAct', '1.0.0', FakeActivity)
      sandbox.stub(activityType, 'heartbeatTimeout', () => 10)
      let execution = activityType.createExecution(workflow, actTask)
      assert.instanceOf(execution, FakeActivity)
      assert.equal(execution.id, '1234')
    })
  })
  describe('ensureActivityType', () => {
    let sandbox = newContext()
    let domain = sandbox.stubClass<Domain>(Domain)
    domain.setProp('name', 'mydomain')

    it('should register the activity using defaults from config and overrides', (done) => {
      let activityType = new ActivityType('testAct', '1.0.0', FakeActivity, {hello: 'world'})
      let swfMock = {
        registerActivityType(params: SWF.RegisterWorkflowTypeInput,
         cb?: {(Error?, any?)}): Request<any, any>  {
          inputParams = params
          process.nextTick(() => {
            if (cb) {
              cb()
            }
          })
          return {} as Request<any, any>
        }
      } as SWF
      let swfSpy = sandbox.spy(swfMock, 'registerActivityType')
      let configMock = sandbox.mockClass<SWFConfig>(SWFConfig)
      configMock.expects('populateDefaults').once()
        .withArgs({entities: ['activity'], api: 'registerActivityType'}, {hello: 'world'})
        .returns({
          foobar: 'stuff',
          hello: 'world',
          domain: 'not this value'
        })
      let inputParams = {}
      domain.swfClient = swfMock
      domain.config = configMock.object
      activityType.ensureActivityType(domain, (err) => {
        assert.ifError(err)
        assert.equal(swfSpy.callCount, 1)
        configMock.verify()
        assert.deepEqual(inputParams, {
          domain: 'mydomain',
          foobar: 'stuff',
          hello: 'world',
          name: 'testAct',
          version: '1.0.0'
        })
        done()
      })
    })
  })
  describe('getDefaultConfig', () => {
    it('should return a config', () => {
      assert(ActivityType.getDefaultConfig())
    })
  })
})
