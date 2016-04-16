import { S3 } from 'aws-sdk'
import * as crypto from 'crypto'
import * as path from 'path'

import { ClaimCheck, CheckFormat } from './ClaimCheck'

export interface S3CheckFormat extends CheckFormat {
  url: string
}
export class S3ClaimCheck extends ClaimCheck {
  bucketName: string
  prefix: string
  s3Client: S3
  constructor(bucketName: string, prefix: string, s3Client: S3 = new S3()) {
    super()
    this.bucketName = bucketName
    this.prefix = prefix
    this.s3Client = s3Client
  }

  buildCheck(input: string, cb: {(Error, string)}) {
    let hashed = crypto.createHash('sha1').update(input).digest('hex')
    let key = path.join(this.prefix, hashed)
    let url = `s3://${this.bucketName}/${key}`
    this.s3Client.putObject({Bucket: this.bucketName, Key: key, Body: input}, (err, resp) => {
      if (err) return cb(err, null)
      let check: S3CheckFormat = {
        _claimCheck: true, key, url
      }
      cb(null, JSON.stringify(check))
    })
  }
  retriveCheck(input: CheckFormat, cb: {(Error, any)}) {
    this.s3Client.getObject({Bucket: this.bucketName, Key: path.join(this.prefix, input.key)}, (err, res) => {
      if (err) return cb(err, null)
      let body = res.Body
      if (Buffer.isBuffer(body)) {
        body = body.toString('utf8')
      }
      cb(null, body)
    })
  }


}
