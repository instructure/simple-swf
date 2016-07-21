import { SWF } from 'aws-sdk'
import * as _ from 'lodash'

import { ConfigGroup, ConfigDefaultUnit, SWFConfig, ConfigOverride } from '../SWFConfig'
import { CodedError, DomainExistsFaults } from '../interfaces'

export class Domain {
  name: string
  swfClient: SWF
  config: SWFConfig
  constructor(name: string, config: SWFConfig, swfClient?: SWF) {
    this.name = name
    this.config = config
    this.swfClient = swfClient || new SWF()
  }
  ensureDomain(opts: ConfigOverride, cb: {(err?: Error, success?: boolean)}) {
    let defaults = this.config.populateDefaults({entities: ['domain'], api: 'registerDomain'}, opts)
    let retentionKey = this.config.getMappingName('executionRetentionPeriodInDays', {entities: ['domain'],
     api: 'registerDomain'})
    let retention = defaults[retentionKey!]
    let params: SWF.RegisterDomainInput = {
      name: this.name,
      workflowExecutionRetentionPeriodInDays: retention,
    }
    this.swfClient.registerDomain(_.defaults<SWF.RegisterDomainInput>(params, defaults), (err: CodedError) => {
      if (err && err.code !== DomainExistsFaults) return cb(err, false)
      if (err) return cb(null!, false)
      cb(null!, true)
    })
  }
  static getDefaultConfig(): ConfigGroup {
    return {
      executionRetentionPeriodInDays: {
        description: 'The amount of time to keep the record of the workflow execution.',
        mappings: [{api: 'registerDomain', name: 'workflowExecutionRetentionPeriodInDays'}],
        value: 5,
        unit: ConfigDefaultUnit.Second
      },
      description: {
        description: 'Provides a text description for this domain',
        mappings: [
          {api: 'registerDomain', name: 'description'}
        ],
        value: null,
        unit: ConfigDefaultUnit.String
      },
    }
  }
}
