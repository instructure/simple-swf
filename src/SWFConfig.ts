// a holder for all the different config options with sane defaults
import { Domain } from './entities/Domain'
import { Workflow } from './entities/Workflow'
import { Decider } from './entities/Decider'
import { ActivityType } from './entities/ActivityType'
import { EntityTypes } from './interaces'
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
  entity: EntityTypes,
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
export interface ConfigGroups {
  [entity: string]: ConfigGroup
}
export interface ConfigOverrides {
  domain?: ConfigOverride,
  activity?: ConfigOverride,
  decision?: ConfigOverride,
  workflow?: ConfigOverride
}

export class SWFConfig {
  defaults: ConfigGroups
  constructor(overrideConfig?: ConfigOverrides) {
    overrideConfig = overrideConfig || {}
    let domainConfig = this.applyOverrideConfig(Domain.getDefaultConfig(), overrideConfig.domain || {})
    let workflowConfig = this.applyOverrideConfig(Workflow.getDefaultConfig(), overrideConfig.workflow || {})
    let activityConfig = this.applyOverrideConfig(ActivityType.getDefaultConfig(), overrideConfig.activity || {})
    let deciderConfig = this.applyOverrideConfig(Decider.getDefaultConfig(), overrideConfig.decision || {})
    this.defaults = {
      domain: domainConfig,
      workflow: workflowConfig,
      activity: activityConfig,
      decider: deciderConfig
    }
  }
  getValueUnit(unit: string | number): ConfigDefaultUnit {
    if (typeof unit === 'string') return ConfigDefaultUnit.String
    if (typeof unit === 'number') return ConfigDefaultUnit.Number
    return ConfigDefaultUnit.String
  }
  applyOverrideConfig(defaultConfig: ConfigGroup, overrides: ConfigOverride = {}): ConfigGroup {
    _.each(overrides, (override, keyName) => {
      let emptyMapping: MappingValue[] = []
      let defaultUnit = this.getValueUnit(override)
      if (!defaultConfig[keyName]) {
        defaultConfig[keyName] = {
          description: 'Unkown',
          mappings: emptyMapping,
          value: override,
          unit: defaultUnit
        }
      } else {
        defaultConfig[keyName].value = override
      }
    })
    return defaultConfig
  }
  getParamsForApi(forApi: MappingUse): ConfigGroup {
    if (!this.defaults[forApi.entity]) return {}
    let mappedGroup = _.mapValues(this.defaults[forApi.entity], (configVal: ConfigValue) => {
      let newConfigVal = _.clone(configVal)
      newConfigVal.mappings = configVal.mappings.filter((mapping) => {
        return this.isCorrectMapping(forApi, mapping)
      })
      return newConfigVal
    })
    let configGroup: ConfigGroup = {}
    for (let keyName in mappedGroup) {
      if (mappedGroup[keyName].mappings.length) {
        configGroup[keyName] = mappedGroup[keyName]
      }
    }
    return configGroup
  }
  getValueForParam(entity: EntityTypes, paramName: string): number | string {
    if (!this.defaults[entity]) return null
    return this.defaults[entity][paramName].value
  }
  isCorrectMapping(forApi: MappingUse, mapping: MappingValue): boolean {
    return forApi.api === mapping.api && forApi.attribute === mapping.attribute
  }
  getMappingName(paramName: string, forApi: MappingUse): string {
    if (!this.defaults[forApi.entity] || !this.defaults[forApi.entity][paramName]) return null
    let mapping = _.find(this.defaults[forApi.entity][paramName].mappings, (mapping) => {
      return this.isCorrectMapping(forApi, mapping)
    })
    if (!mapping) return null
    return mapping.name
  }
  populateDefaults(forApi: MappingUse, opts: ConfigOverride = {}): { [keyName: string]: any } {
    let configVals = this.getParamsForApi(forApi)
    let mappedValues = _.mapValues(configVals, (configVal, keyName) => {
      let val = opts[keyName] || configVal.value
      if (!configVal.format && val == null) return null
      if (!configVal.format) return val.toString()
      return configVal.format(val)
    })
    let defaults = {}
    for (let keyName in configVals) {
      if (!mappedValues[keyName]) continue
      defaults[configVals[keyName].mappings[0].name] = mappedValues[keyName]
    }
    return defaults
  }
}
