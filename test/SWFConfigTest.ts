import { assert } from 'chai'

import { SWFConfig, ConfigDefaultUnit, MappingUse, ConfigOverride } from '../src/SWFConfig'
import { Domain } from '../src/entities'
import newContext from './sinonHelper'

describe('SWFConfig', () => {
  describe('constructor', () => {
    let config = new SWFConfig()
    it('should set merged defaults', () => {
      assert.equal(config.defaults['activity']['heartbeatTimeout'].value, 120)
    })
    let overriden = new SWFConfig({activity: {startToCloseTimeout: 20}})
    it('should set merged defaults with overrides', () => {
      assert.equal(overriden.defaults['activity']['startToCloseTimeout'].value, 20)
      assert.notEqual(overriden.defaults['workflow']['startToCloseTimeout'].value, 20)
    })
  })
  describe('applyOverrideConfig', () => {
    let config = new SWFConfig()
    it('should override values correctly', () => {
      let group = config.applyOverrideConfig(Domain.getDefaultConfig(), {description: 'new desc'})
      assert.equal(group['description'].value, 'new desc')
    })
    it('should add new values correctly', () => {
      let group = config.applyOverrideConfig(Domain.getDefaultConfig(), {myValue: 'new desc', numValue: 0})
      assert.equal(group['myValue'].value, 'new desc')
      assert.equal(group['myValue'].unit, ConfigDefaultUnit.String)
      assert.equal(group['numValue'].unit, ConfigDefaultUnit.Number)
      assert.equal(group['numValue'].value, 0)
    })
  })
  describe('getParamsForApi', () => {
    let config = new SWFConfig()
    it('should grab the config values', () => {
      let configVals = config.getParamsForApi({
        entity: 'activity',
        api: 'respondDecisionTaskCompleted',
        attribute: 'scheduleActivityTaskDecisionAttributes'
      })
      assert.typeOf(configVals['heartbeatTimeout'].value, 'number')
      assert.typeOf(configVals['startToCloseTimeout'].value, 'number')
      assert(configVals['description'] == null)
    })
    it('should reduce to only the single mapping ask for', () => {
      let configVals = config.getParamsForApi({entity: 'activity', api: 'registerActivityType'})
      assert.equal(configVals['startToCloseTimeout'].mappings.length, 1)
      assert.equal(configVals['startToCloseTimeout'].mappings[0].api, 'registerActivityType')
    })
    it('should return an empty config group for invalid configs', () => {
      let configVals = config.getParamsForApi({entity: 'activity', api: 'fakeApi'})
      assert.deepEqual(configVals, {})
    })
    it('should handle an invalid entity by return empty config', () => {
      let configVals = config.getParamsForApi({entity: 'marker', api: 'fakeApi'})
      assert.deepEqual(configVals, {})
    })
  })
  describe('getMappingName', () => {
    let config = new SWFConfig()
    it('should return the proper name of a config', () => {
      let decActName = config.getMappingName('heartbeatTimeout', {
        entity: 'activity',
        api: 'respondDecisionTaskCompleted',
        attribute: 'scheduleActivityTaskDecisionAttributes'
      })
      assert.equal(decActName, 'heartbeatTimeout')
      let regActName = config.getMappingName('heartbeatTimeout', {entity: 'activity', api: 'registerActivityType'})
      assert.equal(regActName, 'defaultTaskHeartbeatTimeout')
    })
    it('should null if invalid api', () => {
      let badApi = config.getMappingName('heartbeatTimeout', {entity: 'activity', api: 'noApi'})
      assert.isNull(badApi)
      let badConfig = config.getMappingName('fakeConfig', {entity: 'activity', api: 'registerActivityType'})
      assert.isNull(badConfig)
      //valid entity type, but no config.. good enough for now
      let badEntity = config.getMappingName('heartbeatTimeout', {entity: 'marker', api: 'registerActivityType'})
      assert.isNull(badEntity)
    })
  })
  describe('populateDefaults', () => {
    let config = new SWFConfig()
    it('should populate values for a given api', () => {
      let registerActivityVals = config.populateDefaults({entity: 'activity', api: 'registerActivityType'})
      assert.equal(registerActivityVals['defaultTaskHeartbeatTimeout'], '120', 'should be a string')
      // strip out values that default to null
      assert.isUndefined(registerActivityVals['description'])
    })
    it('should properly use the format function', () => {
      let registerActivityVals = config.populateDefaults({entity: 'workflow', api: 'registerWorkflowType'})
      assert.deepEqual(registerActivityVals['defaultTaskList'], {name: 'simple-swf'})
    })
    it('should properly use overrides', () => {
      let overrides: ConfigOverride = {taskList: 'hello', startToCloseTimeout: 100}
      let registerActivityVals = config.populateDefaults({entity: 'workflow', api: 'registerWorkflowType'}, overrides)
      assert.deepEqual(registerActivityVals['defaultTaskList'], {name: 'hello'})
      assert.deepEqual(registerActivityVals['defaultExecutionStartToCloseTimeout'], '100')
    })
  })
})
