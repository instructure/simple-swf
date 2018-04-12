import { SWF } from 'aws-sdk'
export type SWFTask =  SWF.DecisionTask | SWF.ActivityTask
export interface CodedError extends Error {
  code?: string
}
export interface WorkflowInfo {
  workflowId: string,
  runId: string
}

export enum StopReasons {
  ProcessExit,
  WorkflowCancel,
  HeartbeatCancel,
  UnknownResource
}
export interface TaskStatus {
  status: string,
  info?: any,
  progress?: number,
  env?: Object
}

export interface TaskInput {
  env?: Object,
  originWorkflow: string,
  input: any,
  control?: any
}

export interface ActivityFailed {
  error: Error,
  details: TaskStatus
}
export interface ActivityCanceled {
  reason: StopReasons,
  details: TaskStatus | null
}
export type EntityTypes = 'workflow' | 'activity' | 'decision' | 'domain' | 'marker' | 'timer'
export const UnknownResourceFault = 'UnknownResourceFault'
export const TypeExistsFault = 'TypeAlreadyExistsFault'
export const DomainExistsFaults = 'DomainAlreadyExistsFault'
