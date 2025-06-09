export class TokenRefreshError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "TokenRefreshError"
  }
}

export class TokenValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "TokenValidationError"
  }
}

export class TokenEncryptionError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "TokenEncryptionError"
  }
}

export class TokenDecryptionError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "TokenDecryptionError"
  }
}
