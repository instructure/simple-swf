
// TODO: port this code! it is fairly well tested
// in etl_engine, but too much work to port now...
/*
 * translates the list of events grouped by state and encapsulating id (such as activity of workflow id)
 * first group by type
 *  {
 *    'activity': ...
 *    'workflow': ...
 *    'decider': ...
 *    'markers': ...
 *    'signal':...
 *    'byEventId': {
 *      'event1': //rawEvent
 *      ...
 *    }
 *  }
 *  then state:
 *  {
 *    'activity' : {
 *      'completed': {
 *        taska: {
 *          // raw event
 *        }
 *      },
 *      scheduled: {
 *        taskb: {
 *          //raw event
 *        }
 *      }
 *    }
 *  }
 *  All meta data in the chain of events is merged, so if you are in completed state, it will be the scheduled, started, and completed events all merged
 *  The group that an event is found is the current state of that event
 *
 *  the two exceptions are the 'signals' and 'markers' groups as they only have a single state of events, as well as the byEventId which is just a cache for looking up events that refer to other events
 *
 *  We build up this state somewhat like a state machine, which each event transitioning a task to a new state. This is rebuilt on every decision task (but could be memoized) to allow for statelessness
 *
 * }
*/

import * as _ from 'lodash'
import { SWF } from 'aws-sdk'
// short hand name for states
export const states = {
  SCH: 'scheduled',
  FAS: 'failedToSchedule',
  ST: 'started',
  FA: 'failed',
  CO: 'completed',
  TO: 'timedOut',
  TE: 'terminate',
  TC: 'toCancel',
  CAL: 'canceling',
  CAD: 'canceled',
  CF: 'cancelFailed'
}

// mock logger
let log = {
  error(...args: any[]) {

  }
}
// handlers for each event type that are 'manual', pretty much they either don't act on the state machine or are more complex than the events below
let transitions = {
  WorkflowExecutionStarted(state, event) {
    return {state}
  },
  WorkflowExecutionCancelRequested(state, event) {
    // move scheduled and running to cancel
    var types = ['activity', 'workflow']
    for (var type of types) {
      var forType = state[type]
      for (var id in forType) {
        var group = forType[id]
        if (group.current === states.ST || group.current === states.SCH) {
          group.toCancel = _.merge(group[states.ST], group[states.SCH])
          group.current = 'toCancel'
        }
      }
    }
    return {state}
  },
  WorkflowExecutionCompleted(state, event) {
    return {state, wait: true, notify: true}
  },
  CompleteWorkflowExecutionFailed(state, event) {
    return {state, error: 'completing the workflow failed', notify: true}
  },
  WorkflowExecutionFailed(state, event) {
    return {state, error: 'workflow execution failed', notify: true}
  },
  FailWorkflowExecutionFailed(state, event) {
    return {state, error: 'failed to fail execution', notify: true}
  },
  WorkflowExecutionTimedOut(state, event) {
    return {state, error: 'workflow timed out', notify: true}
  },
  WorkflowExecutionCanceled(state, event) {
    return {state, wait: true}
  },
  CancelWorkflowExecutionFailed(state, event) {
    return {state, error: 'failed to cancel workflow', notify: true}
  },
  WorkflowExecutionTerminated(state, event) {
    return {state, wait: true}
  },
  WorkflowExecutionSignaled(state, event) {
    state.signals[event.workflowExecutionSignaledEventAttributes.signalName] = event
    return {state}
  }
}
// describes the transitions from one state space to another
let describeTransition = {
  DecisionTaskScheduled(state, event) {
    return {type: 'decision', id: event.eventId, to: states.SCH}
  },
  DecisionTaskStarted(state, event) {
    var eventId = event.decisionTaskStartedEventAttributes.scheduledEventId
    return {type: 'decision', id: eventId, to: states.ST, from: states.SCH}
  },
  DecisionTaskCompleted(state, event) {
    var eventId = event.decisionTaskCompletedEventAttributes.scheduledEventId
    return {type: 'decision', id: eventId, to: states.CO, from: states.ST}
  },
  DecisionTaskTimedOut(state, event) {
    var eventId = event.decisionTaskTimedOutEventAttributes.scheduledEventId
    return {type: 'decision', id: eventId, to: states.TO, from: [states.SCH, states.ST]}
  },
  ActivityTaskScheduled(state, event) {
    var activityId = event.activityTaskScheduledEventAttributes.activityId
    return {type: 'activity', id: activityId, to: states.SCH, from: [states.FA, states.TO]}
  },
  ScheduleActivityTaskFailed(state, event) {
    var activityId = event.scheduleActivityTaskFailedEventAttributes.activityId
    return {type: 'activity', id: activityId, to: states.FAS, error: 'failed to schedule activity ' + activityId, notify: true}
  },
  ActivityTaskStarted(state, event) {
    var eventId = event.activityTaskStartedEventAttributes.scheduledEventId
    var activityId = state.byEventId[eventId].activityTaskScheduledEventAttributes.activityId
    return {type: 'activity', id: activityId, to: states.ST, from: states.SCH}
  },
  ActivityTaskCompleted(state, event) {
    var eventId = event.activityTaskCompletedEventAttributes.scheduledEventId
    var activityId = state.byEventId[eventId].activityTaskScheduledEventAttributes.activityId
    function addResult(group, e) {
      var res = e.activityTaskCompletedEventAttributes.result
      try {
        res = JSON.parse(res)
      } catch (e) {
      }
      group.result = res
    }
    return {type: 'activity', id: activityId, to: states.CO, from: states.ST, transform: addResult}
  },
  ActivityTaskFailed(state, event) {
    var eventId = event.activityTaskFailedEventAttributes.scheduledEventId
    var activityId = state.byEventId[eventId].activityTaskScheduledEventAttributes.activityId
    return {type: 'activity', id: activityId, to: states.FA, from: states.ST}
  },
  ActivityTaskTimedOut(state, event) {
    var eventId = event.activityTaskTimedOutEventAttributes.scheduledEventId
    var activityId = state.byEventId[eventId].activityTaskScheduledEventAttributes.activityId
    return {type: 'activity', id: activityId, to: states.TO, from: [states.ST, states.SCH]}
  },
  ActivityTaskCanceled(state, event) {
    var eventId = event.activityTaskCanceledEventAttributes.scheduledEventId
    var activityId = state.byEventId[eventId].activityTaskScheduledEventAttributes.activityId
    return {type: 'activity', id: activityId, to: states.CAD, from: states.CAL}
  },
  ActivityTaskCancelRequested(state, event) {
    var activityId = event.activityTaskCancelRequestedEventAttributes.activityId
    return {type: 'activity', id: activityId, to: states.CAL, from: [states.TC, states.SCH, states.ST]}
  },
  RequestCancelActivityTaskFailed(state, event) {
    var activityId = event.requestCancelActivityTaskFailedEventAttributes.activityId
    return {type: 'activity', id: activityId, to: states.CF, from: states.CAL, error: 'failed to cancel request', notify: true}
  },
  LambdaFunctionScheduled(state, event) {
    var activityId = event.lambdaFunctionScheduledEventAttributes.id
    return {type: 'activity', id: activityId, to: states.SCH, from: [states.FA, states.TO]}
  },
  ScheduleLambdaFunctionFailed(state, event) {
    var activityId = event.scheduleLambdaFunctionFailedEventAttributes.id
    return {type: 'activity', id: activityId, to: states.FAS, error: 'failed to schedule lambda ' + activityId, notify: true}
  },
  LambdaFunctionStarted(state, event) {
    var eventId = event.lambdaFunctionStartedEventAttributes.scheduledEventId
    var activityId = state.byEventId[eventId].lambdaFunctionScheduledEventAttributes.activityId
    return {type: 'activity', id: activityId, to: states.ST, from: states.SCH}
  },
  LambdaFunctionCompleted(state, event) {
    var eventId = event.lambdaFunctionCompletedEventAttributes.scheduledEventId
    var activityId = state.byEventId[eventId].scheduleLambdaFunctionFailedEventAttributes.activityId
    function addResult(group, e) {
      var res = e.lambdaFunctionCompletedEventAttributes.result
      try {
        res = JSON.parse(res)
      } catch (e) {
      }
      group.result = res
    }
    return {type: 'activity', id: activityId, to: states.CO, from: states.ST, transform: addResult}
  },
  LambdaFunctionFailed(state, event) {
    var eventId = event.lambdaFunctionFailedEventAttributes.scheduledEventId
    var activityId = state.byEventId[eventId].activityTaskScheduledEventAttributes.activityId
    return {type: 'activity', id: activityId, to: states.FA, from: states.ST}
  },
  LambdaFunctionTimedOut(state, event) {
    var eventId = event.activityTaskTimedOutEventAttributes.scheduledEventId
    var activityId = state.byEventId[eventId].activityTaskScheduledEventAttributes.activityId
    return {type: 'activity', id: activityId, to: states.TO, from: [states.ST, states.SCH]}
  },
  StartLambdaFunctionFailed(state, event) {
    var eventId = event.activityTaskCanceledEventAttributes.scheduledEventId
    var activityId = state.byEventId[eventId].activityTaskScheduledEventAttributes.activityId
    return {type: 'activity', id: activityId, to: states.FAS, from: states.ST}
  },
  StartChildWorkflowExecutionInitiated(state, event) {
    var workflowId = event.startChildWorkflowExecutionInitiatedEventAttributes.workflowId
    return {type: 'workflow', id: workflowId, to: states.SCH}
  },
  StartChildWorkflowExecutionFailed(state, event) {
    var workflowId = event.startChildWorkflowExecutionFailedEventAttributes.workflowId
    return {type: 'workflow', id: workflowId, to: states.FAS, from: states.SCH, error: 'failed to start child workflow', notify: true}
  },
  ChildWorkflowExecutionStarted(state, event) {
    var workflowId = event.childWorkflowExecutionStartedEventAttributes.workflowExecution.workflowId
    return {type: 'workflow', id: workflowId, to: states.ST, from: states.SCH, states: [states.FA, states.TO]}
  },
  ChildWorkflowExecutionCompleted(state, event) {
    var workflowId = event.childWorkflowExecutionCompletedEventAttributes.workflowExecution.workflowId
    function addResult(group, e) {
      var res = e.childWorkflowExecutionCompletedEventAttributes.result
      try {
        res = JSON.parse(res)
      } catch (e) {
      }
      group.result = res
    }

    return {type: 'workflow', id: workflowId, to: states.CO, from: states.ST, transform: addResult}
  },
  ChildWorkflowExecutionFailed(state, event) {
    var workflowId = event.childWorkflowExecutionFailedEventAttributes.workflowExecution.workflowId
    return {type: 'workflow', id: workflowId, to: states.FA, from: states.ST}
  },
  ChildWorkflowExecutionTimedOut(state, event) {
    var workflowId = event.childWorkflowExecutionTimedOutEventAttributes.workflowExecution.workflowId
    return {type: 'workflow', id: workflowId, to: states.TO, from: [states.SCH, states.ST]}
  },
  ChildWorkflowExecutionCanceled(state, event) {
    var workflowId = event.childWorkflowExecutionCanceledEventAttributes.workflowExecution.workflowId
    return {type: 'workflow', id: workflowId, to: states.CAD, from: [states.SCH, states.ST]}
  },
  ChildWorkflowExecutionTerminated(state, event) {
    var workflowId = event.childWorkflowExecutionTerminatedEventAttributes.workflowExecution.workflowId
    return {type: 'workflow', id: workflowId, to: states.TE, from: [states.SCH, states.ST]}
  },
  MarkerRecorded(state, event) {
    var markerName = event.markerRecordedEventAttributes.markerName
    return {type: 'marker', id: markerName, to: states.CO}
  },
  RecordMarkerFailed(state, event) {
    var markerName = event.recordMarkerFailedEventAttributes.markerName
    return {type: 'marker', id: markerName, to: states.FAS, error: 'failed to create marker', notify: true}
  }
}
export function processEvents(events) {
  var state = {
    activity: {} as {[id: string]: any},
    workflow: {} as {[id: string]: any},
    decision: {} as {[id: string]: any},
    marker: {} as {[id: string]: any},
    byEventId: {} as {[id: string]: any},
    signals: {} as {[id: string]: any},
    completed: [] as any[]
  }
  events.forEach((event) => {
    state.byEventId[event.eventId] = event
    if (describeTransition[event.eventType]) {
      let transition = describeTransition[event.eventType](state, event)
      if (transition.error && transition.notify) {
        log.error(transition.error)
      }
      if (!transition.type || !transition.id || !transition.to) {
        log.error('invalid transition given', transition)
        throw new Error('invalid transition')
      }
      var typeState = state[transition.type] || {}
      var grouped = typeState[transition.id] || {}
      grouped.current = transition.to
      var oldEvent: any = null
      if (Array.isArray(transition.from)) {
        for (var from of transition.from) {
          if (grouped[from]) {
            oldEvent = grouped[from]
            break
          }
          oldEvent = {}
        }
      } else {
        oldEvent = grouped[transition.from] || {}
      }
      grouped[transition.to] = _.merge(_.clone(oldEvent), event)
      // allow the transitions to transform the state to add other properties we may want
      if (transition.transform) {
        transition.transform(grouped, event)
      }
      if (transition.to === states.CO) {
        state.completed.push({type: transition.type, id: transition.id, state: grouped})
      }
      typeState[transition.id] = grouped
      state[transition.type] = typeState
    } else if (transitions[event.eventType]) {
      let transition = transitions[event.eventType](state, event)
      if (transition.error && transition.notify) {
        log.error(transition.error)
      }
      state = transition.state
    } else {
      log.error('unsupported transition')
    }
  })
  return state
}
