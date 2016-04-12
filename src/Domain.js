var aws = require('aws-sdk')
class Domain {
  constructor(name, description, swfClient) {
    this.name = name
    this.description = description
    this.swfClient = swfClient || new aws.SWF()
  }
  ensureDomain(opts, cb) {
    this.swfClient
  }
}
