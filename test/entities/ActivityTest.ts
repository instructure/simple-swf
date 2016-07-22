import { assert } from 'chai'
import { SWF } from 'aws-sdk'

import { Activity, TaskState, Workflow, ActivityType } from '../../src/entities'
import { ActivityTask } from '../../src/tasks'
import { TaskStatus, StopReasons } from '../../src/interfaces'
import newContext from '../sinonHelper'

describe('Activity', () => {
  describe('constructor', () => {
    let sandbox = newContext()
    let workflowMock = sandbox.stubClass<Workflow>(Workflow)
    let activityTypeMock = sandbox.stubClass<ActivityType>(ActivityType)
    activityTypeMock.stubMethod('heartbeatTimeout').returns(10)
    activityTypeMock.name = 'foo'
    let activity = new Activity(workflowMock, activityTypeMock, {rawTask: {activityId: '1234'}} as ActivityTask)
    it('should populate correct fields on instance new instace', () => {
      it('should throw an error on default implementation', () => {
        assert.equal(activity['_heartbeatInterval'], 10)
        assert.deepEqual(activity.task, {})
        assert.equal(activity.workflow, workflowMock)
        assert.equal(activity.taskStatus, TaskState.Stopped)
        assert.include(activity.id, 'foo')
      })
    })
  })

  describe('getActivityType', () => {
    it('should throw an error on default implementation', () => {
      assert.throws(() => Activity.getActivityType(), 'overriden')
    })
  })

  describe('run', () => {
    let sandbox = newContext()
    let workflowMock = sandbox.stubClass<Workflow>(Workflow)
    let activityTypeMock = sandbox.stubClass<ActivityType>(ActivityType)
    activityTypeMock.stubMethod('heartbeatTimeout').returns(10)
    let activity = new Activity(workflowMock, activityTypeMock, {rawTask: {activityId: '1234'}} as ActivityTask)
    it('should throw an error on default implementation', () => {
      assert.throws(() => activity.run(null, {}, () => {}), 'overriden')
    })
  })

  describe('stop', () => {
    let sandbox = newContext()
    let workflowMock = sandbox.stubClass<Workflow>(Workflow)
    let activityTypeMock = sandbox.stubClass<ActivityType>(ActivityType)
    activityTypeMock.stubMethod('heartbeatTimeout').returns(10)
    let activity = new Activity(workflowMock, activityTypeMock, {rawTask: {activityId: '1234'}} as ActivityTask)
    it('should throw an error on default implementation', () => {
      assert.throws(() => activity.stop(null, () => {}), 'overriden')
    })
  })

  describe('_start', () => {
    let sandbox = newContext()
    let workflowMock = sandbox.stubClass<Workflow>(Workflow)
    let activityTypeMock = sandbox.stubClass<ActivityType>(ActivityType)
    activityTypeMock.stubMethod('heartbeatTimeout').returns(10)
    it('should work to do a normal task', (done) => {
      let taskMock = sandbox.mockClass<ActivityTask>(ActivityTask)
      taskMock.object.rawTask = {activityId: '1234'} as SWF.ActivityTask
      taskMock.expects('getInput').once().callsArgWithAsync(0, null, {myTask: 'input'})
      taskMock.expects('respondSuccess').once().callsArgWithAsync(1, null, true, {status: 'test'})
      let runCalled = false
      let activity = new Activity(workflowMock, activityTypeMock, taskMock.object)
      activity.run = function(input: any, env: Object | null, cb) {
        runCalled = true
        cb(null, {status: 'test'})
      }
      activity._start((err, success, res) => {
        assert.ifError(err)
        assert(runCalled)
        assert.equal(activity.taskStatus, TaskState.Finished)
        assert(success)
        assert(res!.status, 'test')
        taskMock.verify()
        done()
      })
      assert.equal(activity.taskStatus, TaskState.Started, 'should change state after starting')
    })
    it('should respond if a task failed', (done) => {
      let taskMock = sandbox.mockClass<ActivityTask>(ActivityTask)
      taskMock.object.rawTask = {activityId: '1234'} as SWF.ActivityTask
      taskMock.expects('getInput').once().callsArgWithAsync(0, null, {myTask: 'input'})
      taskMock.expects('respondSuccess').never()
      taskMock.expects('respondFailed').once().callsArgWithAsync(1, null)
      let runCalled = false
      let activity = new Activity(workflowMock, activityTypeMock, taskMock.object)
      activity.run = function(input: any, env: Object | null, cb) {
        cb(new Error('a problem'), {status: 'failed'})
      }
      activity._start((err, success, res) => {
        assert.ifError(err)
        assert.equal(activity.taskStatus, TaskState.Failed)
        assert(!success)
        assert(res!.status, 'failed')
        taskMock.verify()
        done()
      })
      assert.equal(activity.taskStatus, TaskState.Started, 'should change state after starting')
    })

    it('should emit heartbeats for long running tasks', (done) => {
      let taskMock = sandbox.mockClass<ActivityTask>(ActivityTask)
      taskMock.object.rawTask = {activityId: '1234'} as SWF.ActivityTask
      taskMock.expects('getInput').once().callsArgWithAsync(0, null, {myTask: 'input'})
      taskMock.expects('respondSuccess').once().callsArgWithAsync(1, null, true, {status: 'test'})
      taskMock.expects('sendHeartbeat').once().callsArgWithAsync(1, null, false)
      let activity = new Activity(workflowMock, activityTypeMock, taskMock.object)
      let gotHeartbeat = false
      let finHeartbeat = false
      activity.run = function(input: any, env: Object | null, cb) {
        setTimeout(() => {
          cb(null, {status: 'test'})
        }, 6)
      }
      activity.on('heartbeat', () => gotHeartbeat = true)
      activity.on('heartbeatComplete', () => finHeartbeat = true )
      activity._start((err, success, res) => {
        assert.ifError(err)
        assert(gotHeartbeat)
        assert(finHeartbeat)
        taskMock.verify()
        done()
      })
    })

    it('should work to have a heartbeat cancel an operation', (done) => {
      let taskMock = sandbox.mockClass<ActivityTask>(ActivityTask)
      taskMock.object.rawTask = {activityId: '1234'} as SWF.ActivityTask
      taskMock.expects('getInput').once().callsArgWithAsync(0, null, {myTask: 'input'})
      taskMock.expects('respondCanceled').once().callsArgWithAsync(1, null)
      taskMock.expects('respondSuccess').never()
      taskMock.expects('sendHeartbeat').once().callsArgWithAsync(1, null, true)
      let activity = new Activity(workflowMock, activityTypeMock, taskMock.object)
      let stopCalled = false
      let stopReason: StopReasons | null = null
      let cancelEvent = false
      activity.stop = function(reason: StopReasons, cb) {
        stopCalled = true
        stopReason = reason
        setTimeout(() => {
          cb()
        }, 5)
      }
      let didFinish = false
      let runTimeout: NodeJS.Timer | null = null
      activity.run = function(input: any, env: Object | null, cb) {
        runTimeout = setTimeout(() => {
          didFinish = true
          cb(null, {status: 'test'})
        }, 100)
      }
      activity.on('canceled', () => {
        cancelEvent = true
        clearTimeout(runTimeout!)
        assert(!didFinish)
        assert(stopCalled)
        assert(cancelEvent)
        assert.equal(activity.taskStatus, TaskState.Canceled)
        assert.equal(stopReason, StopReasons.HeartbeatCancel)
        taskMock.verify()
        done()
      })
      activity._start((err, success, res) => {
        // we should never get here!
        assert(false)
      })
    })

    it('should recover from an UnknownResourceFault by cancelling but not reporting the cancel', (done) => {
      let taskMock = sandbox.mockClass<ActivityTask>(ActivityTask)
      taskMock.object.rawTask = {activityId: '1234'} as SWF.ActivityTask
      taskMock.expects('getInput').once().callsArgWithAsync(0, null, {myTask: 'input'})
      taskMock.expects('respondCanceled').never()
      taskMock.expects('respondSuccess').never()
      taskMock.expects('sendHeartbeat').once().callsArgWithAsync(1, {code: "UnknownResourceFault"}, true)
      let activity = new Activity(workflowMock, activityTypeMock, taskMock.object)
      let stopCalled = false
      let stopReason: StopReasons | null = null
      let cancelEvent = false
      activity.stop = function(reason: StopReasons, cb) {
        stopCalled = true
        stopReason = reason
        setTimeout(() => {
          cb()
        }, 5)
      }
      let didFinish = false
      let runTimeout: NodeJS.Timer | null = null
      activity.run = function(input: any, env: Object | null, cb) {
        runTimeout = setTimeout(() => {
          didFinish = true
          cb(null, {status: 'test'})
        }, 100)
      }
      activity.on('canceled', () => {
        cancelEvent = true
        clearTimeout(runTimeout!)
        assert(!didFinish)
        assert(stopCalled)
        assert(cancelEvent)
        assert.equal(activity.taskStatus, TaskState.Canceled)
        assert.equal(stopReason, StopReasons.UnknownResource)
        taskMock.verify()
        done()
      })
      activity._start((err, success, res) => {
        // we should never get here!
        assert(false)
      })
    })
  })

  describe('_requestStop', () => {
    let sandbox = newContext()
    let workflowMock = sandbox.stubClass<Workflow>(Workflow)
    let activityTypeMock = sandbox.stubClass<ActivityType>(ActivityType)
    activityTypeMock.stubMethod('heartbeatTimeout').returns(10)
    it('should work to do a normal task', (done) => {
      let taskMock = sandbox.mockClass<ActivityTask>(ActivityTask)
      taskMock.object.rawTask = {activityId: '1234'} as SWF.ActivityTask
      taskMock.expects('getInput').once().callsArgWithAsync(0, null, {myTask: 'input'})
      taskMock.expects('respondSuccess').never()
      taskMock.expects('respondCanceled').once().callsArgWithAsync(1, null)
      let runCalled = false
      let activity = new Activity(workflowMock, activityTypeMock, taskMock.object)
      activity.run = function(input: any, cb) {
        setTimeout(() => {
          cb(null, {status: 'test'})
        }, 100)
      }
      activity._start((err, success, res) => {
        // should never get here
        assert(false)
      })
      let stopCalled = false
      activity.stop = function(reason: StopReasons, cb) {
        stopCalled = true
        setTimeout(() => {
          cb()
        }, 5)
      }
      assert.equal(activity.taskStatus, TaskState.Started, 'should change state after starting')
      activity._requestStop(StopReasons.ProcessExit, false,  (err) => {
        assert.ifError(err)
        assert.equal(activity.taskStatus, TaskState.Canceled)
        assert(stopCalled)
        done()
      })
    })
  })
})
