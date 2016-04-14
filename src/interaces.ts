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
  HeartbeatCancel
}
export interface ActivityStatus {
  status: string,
  info?: any,
  progress?: number
}
export interface ActivityFailed {
  error: Error,
  details: ActivityStatus
}
export interface ActivityCancelled {
  reason: StopReasons,
  details: ActivityStatus
}

export const UnknownResourceFault = 'UnknownResourceFault'
export const TypeExistsFault = 'TypeAlreadyExistsFault'
export const DomainExistsFaults = 'DomainAlreadyExistsFault'
