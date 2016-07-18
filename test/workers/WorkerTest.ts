import { assert } from 'chai'
import { Request, SWF } from 'aws-sdk'

import { Worker } from '../../src/workers'
import { Workflow } from '../../src/entities'
import { SWFTask } from '../../src/interfaces'
import { Task } from '../../src/tasks'
import newContext from '../sinonHelper'


describe('Worker', () => {
  describe('loop', () => {
    let sandbox = newContext()
    let worker = sandbox.mockClass<Worker<SWFTask, Task<SWFTask>>>(Worker)
    it('should emit events as it polls and keep looping', (done) => {
      let reqObj = sandbox.stubClass<Request<any, any>>(Request)
      let loopCount = 0
      reqObj.on = function(event, cb) {
        if (event === 'error') process.nextTick(() => cb(new Error('break out')))
        return reqObj
      }
      reqObj.abort = function() {
        return reqObj
      }
      worker.object.buildApiRequest = function() {
        return reqObj
      }
      let sendCalled = false
      worker.object.sendRequest = function(req, cb) {
        sendCalled = true
        cb(undefined, {} as SWF.DecisionTask)
      }
      worker.object.on('poll', (req) => {
        loopCount++
        if (loopCount === 3) {
          assert.deepEqual(req, reqObj)
          worker.object._stop(() => {
            assert(sendCalled)
            assert.equal(loopCount, 3)
            done()
          })
        }
      })
      worker.object._start()
    })
    it('should emit task events and call run method', (done) => {
      let reqObj = sandbox.stubClass<Request<any, any>>(Request)
      let taskCalled = false
      let performCalled = false
      reqObj.on = function(event, cb) {
        if (event === 'error') process.nextTick( () => cb(new Error('break out')))
        return reqObj
      }
      reqObj.abort = function() {
        return reqObj
      }
      worker.object.buildApiRequest = function() {
        return reqObj
      }

      let taskObj = sandbox.stubClass<Task<SWF.DecisionTask>>(Task)
      worker.object.wrapTask = function(wf, data) {
        taskObj.rawTask = data as SWF.DecisionTask
        return taskObj
      }
      worker.object.sendRequest = function(req, cb) {
        cb(undefined, {taskToken: '1234'} as SWF.DecisionTask)
      }
      worker.object.on('task', (task) => {
        taskCalled = true
        assert.deepEqual(task.rawTask, taskObj.rawTask)
      })
      worker.object.performTask = function(task) {
        performCalled = true
        worker.object._stop(() => {
          assert(taskCalled)
          assert(performCalled)
          done()
        })
       }
      worker.object._start()
    })
  })
})
