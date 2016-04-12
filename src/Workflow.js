var aws = require('aws-sdk')
class Workflow {
  constructor(domain, swfClient) {
    this.domain = domain
    this.swfClient = swfClient || new aws.SWF()
  }
  ensureDomain(cb) {
    this.swfClient.
  }
}
