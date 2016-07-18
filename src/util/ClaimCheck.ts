
export interface CheckFormat {
  _claimCheck: boolean,
  key: string
}
export abstract class ClaimCheck {
  abstract buildCheck(input: string, cb: {(Error, string)})
  abstract retriveCheck(input: CheckFormat, cb: {(Error, string)})

  isClaimCheck(input: any): input is CheckFormat {
    if (typeof input === 'string') {
      try {
        input = JSON.parse(input)
      } catch (e) {
        return false
      }
    }
    return input && input._claimCheck && input.key
  }
}
