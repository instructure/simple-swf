// a holder for all the different config options with sane defaults
import { Domain } from './entities/Domain'
import { Workflow } from './entities/Workflow'
import { Decider } from './entities/Decider'
import { ActivityType } from './entities/ActivityType'
import * as _ from 'lodash'

export enum ConfigDefaultUnit {
  Second,
  Day,
  Enum,
  String,
  Number
}
export interface MappingValue {
  api: string,
  attribute?: string,
  name: string
}
export interface MappingUse {
  api: string,
  attribute?: string,
}
export interface ConfigValue {
  description: string,
  mappings: MappingValue[],
  value: number | string,
  unit: ConfigDefaultUnit,
  possible?: { [index: number]: string },
  format?(input: any): any
}
export interface ConfigOverride {
  [configKeyName: string]: number | string,
}
export interface ConfigGroup {
  [configKeyName: string]: ConfigValue
}
export interface ConfigOverrides {
  domain: ConfigOverride,
  activity: ConfigOverride,
  decision: ConfigOverride,
  workflow: ConfigOverride
}

export class SWFConfig {
  mergedDefaults: ConfigGroup
  constructor(overrideConfig: ConfigOverrides) {
    let domainConfig = this.applyOverrideConfig(Domain.getDefaultConfig(), overrideConfig.domain)
    let workflowConfig = this.applyOverrideConfig(Workflow.getDefaultConfig(), overrideConfig.workflow)
    let activityConfig = this.applyOverrideConfig(ActivityType.getDefaultConfig(), overrideConfig.activity)
    let deciderConfig = this.applyOverrideConfig(Decider.getDefaultConfig(), overrideConfig.decision)
    this.mergedDefaults = _.merge(domainConfig, workflowConfig, activityConfig, deciderConfig)
  }
  applyOverrideConfig(defaultConfig: ConfigGroup, overrides: ConfigOverride = {}): ConfigGroup {
    _.map(overrides, (override, keyName) => {
      defaultConfig[keyName].value = override
    })
    return defaultConfig
  }
  getParamsForApi(forApi: MappingUse): ConfigGroup {
    return _.mapValues(this.mergedDefaults, (configVal: ConfigValue) => {
      configVal.mappings = configVal.mappings.filter((mapping) => {
        return this.isCorrectMapping(forApi, mapping)
      })
      return configVal
    })
  }
  getValueForParam(paramName: string): number | string {
    return this.mergedDefaults[paramName].value
  }
  isCorrectMapping(forApi: MappingUse, mapping: MappingValue): boolean {
    return forApi.api === mapping.api && forApi.attribute === mapping.attribute
  }
  getMappingName(paramName: string, forApi: MappingUse): string {
    let mapping = _.find(this.mergedDefaults[paramName].mappings, (mapping) => {
      return this.isCorrectMapping(forApi, mapping)
    })
    if (!mapping) return null
    return mapping.name
  }
  populateDefaults(forApi: MappingUse, opts?: ConfigOverride): { [keyName: string]: any } {
    let configVals = this.getParamsForApi(forApi)
    return _.mapValues(configVals, (configVal, keyName) => {
      let val = opts[keyName].toString() || configVal.value.toString()
      if (!configVal.format) return val.toString()
      return configVal.format(val)
    })
  }
}
