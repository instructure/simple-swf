import { Decider, Workflow } from '../../src/entities'
import { DecisionTask } from '../../src/tasks'
import { SWFConfig } from '../../src/SWFConfig'

import { SWF } from 'aws-sdk'

import { assert } from 'chai'
import newContext from '../sinonHelper'

class DeciderMock extends Decider {
  onDecision: {(task: DecisionTask)}
  makeDecisions(task: DecisionTask, cb: {(Error, DecisionTask)}) {
    if (this.onDecision) this.onDecision(task)
    cb(null, task)
  }
}
describe('Decider', () => {
  describe('contructor', () => {
    let sandbox = newContext()
    let workflow = sandbox.stubClass<Workflow>(Workflow)
    it('inits the properties', () => {
      workflow.swfClient = {} as SWF
      workflow.config = new SWFConfig()
      let decider = new DeciderMock(workflow)
      assert.equal(decider.workflow, workflow)
      assert.equal(decider.config, workflow.config)
      assert.equal(decider.swfClient, workflow.swfClient)
    })
  })
  describe('getDefaultConfig', () => {
    it('should return a config', () => {
      assert(Decider.getDefaultConfig())
    })
  })

})
