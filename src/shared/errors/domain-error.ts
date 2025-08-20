/**
 * Base domain error class following classify → capture → contain → communicate → correct pattern
 */
export abstract class DomainError extends Error {
  abstract readonly code: string
  abstract readonly type: ErrorType
  readonly timestamp: Date
  readonly context?: Record<string, any>

  constructor(message: string, context?: Record<string, any>) {
    super(message)
    this.name = this.constructor.name
    this.timestamp = new Date()
    this.context = context
  }

  abstract classify(): ErrorClassification
  abstract getSeverity(): ErrorSeverity
  abstract getRetryStrategy(): RetryStrategy
}

export enum ErrorType {
  VALIDATION = 'validation',
  AUTHORIZATION = 'authorization',
  RATE_LIMIT = 'rate_limit',
  PROVIDER_ERROR = 'provider_error',
  NETWORK = 'network',
  INTERNAL = 'internal'
}

export enum ErrorSeverity {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  CRITICAL = 'critical'
}

export interface ErrorClassification {
  type: ErrorType
  severity: ErrorSeverity
  userFacing: boolean
  retryable: boolean
}

export interface RetryStrategy {
  shouldRetry: boolean
  maxAttempts: number
  backoffMs: number
  backoffMultiplier: number
}