import * as sinon from 'sinon'
import * as _ from 'lodash'

export interface ClassStub<T> extends Sinon.SinonStub {
  stubMethod(name: string): Sinon.SinonStub
}
export interface ClassMock<T> extends Sinon.SinonMock {
  object: T
}

export class SinonHelper implements Sinon.SinonSandbox {
  clock: Sinon.SinonFakeTimers
  requests: Sinon.SinonFakeXMLHttpRequest
  server: Sinon.SinonFakeServer
  spy: Sinon.SinonSpyStatic
  stub: Sinon.SinonStub
  mock: Sinon.SinonMockStatic
  useFakeTimers: Sinon.SinonFakeTimersStatic
  useFakeXMLHttpRequest: Sinon.SinonFakeXMLHttpRequestStatic
  useFakeServer: () => Sinon.SinonFakeServer
  restore: () => void
  stubClass<T>(instanceClass: Function): T & ClassStub<T> {
    let stubbed = this.stub(_.clone(instanceClass.prototype)) as T & ClassStub<T>
    if (typeof stubbed.stubMethod === 'function') throw new Error('have function named stubMethod, conflicts!')
    stubbed.stubMethod = function(name: string): Sinon.SinonStub {
      return stubbed[name] as Sinon.SinonStub
    }
    return stubbed
  }
  mockClass<T>(instanceClass: Function): ClassMock<T> {
    let TmpCons = () => {}
    TmpCons.prototype = instanceClass.prototype
    let inst = new TmpCons
    let mocked = this.mock(inst) as ClassMock<T>
    mocked.object = inst
    return mocked
  }
}

function newContext(): SinonHelper {
  let sandbox = sinon.sandbox.create()
  let helper = new SinonHelper
  helper = _.extend(helper, sandbox) as SinonHelper

  after(function() {
    sandbox.restore()
  })

  return helper
}

export default newContext
