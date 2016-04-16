import { SWF } from "aws-sdk"
import * as _ from 'lodash'

import { ConfigGroup, ConfigDefaultUnit, SWFConfig, ConfigOverride } from '../SWFConfig'
import { CodedError, DomainExistsFaults } from '../interaces'

export class Domain {
  name: string
  description: string
  swfClient: SWF
  config: SWFConfig
  constructor(name: string, config: SWFConfig, swfClient?: SWF) {
    this.name = name
    this.config = config
    this.swfClient = swfClient || new SWF()
  }
  ensureDomain(opts: ConfigOverride, cb: {(Error, boolean)}) {
    let defaults = this.config.populateDefaults({entity: 'domain', api: 'registerDomain'}, opts)
    let retention = defaults[this.config.getMappingName('executionRetentionPeriodInDays', {entity: 'domain', api: 'registerDomain'})]
    let params: SWF.RegisterDomainInput = {
      name: this.name,
      workflowExecutionRetentionPeriodInDays: retention,
    }
    this.swfClient.registerDomain(_.defaults<SWF.RegisterDomainInput>(params, defaults), (err: CodedError) => {
      if (err && err.code !== DomainExistsFaults) return cb(err, false)
      if (err) return cb(null, false)
      cb(null, true)
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
