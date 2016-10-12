import { SWF } from 'aws-sdk'

import { Domain } from './Domain'
export class ActivityTypeInfo {
  name: string
  version: string
  domainScope: {[domainName: string]: {
    status?: SWF.RegistrationStatus
    description?: string
    creationDate?: Date
    deprecationDate?: Date
  }}
  constructor(name: string, version: string) {
    this.name = name
    this.version = version
    this.domainScope = {}
  }
  describeActivityType(domain: Domain, cb: {(err?: Error | null, data?: any)}) {
    domain.swfClient.describeActivityType(
      {domain: domain.name, activityType: {name: this.name, version: this.version}},
      cb
    )
  }
  deprecateActivityType(domain: Domain, cb: {(err?: Error)}) {
    domain.swfClient.deprecateActivityType(
      {domain: domain.name, activityType: {name: this.name, version: this.version}},
      cb
    )
  }
}
