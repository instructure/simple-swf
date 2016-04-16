import * as os from 'os'
import * as shortId from 'shortid'

export function buildIdentity(prefix: string): string {
  return [prefix, os.hostname(), process.pid, shortId.generate()].join('-')
}
