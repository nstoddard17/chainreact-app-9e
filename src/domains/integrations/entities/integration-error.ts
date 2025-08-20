import { DomainError, ErrorType, ErrorClassification, ErrorSeverity, RetryStrategy } from '../../../shared/errors/domain-error'

// Re-export types for easier access
export { ErrorType, ErrorSeverity } from '../../../shared/errors/domain-error'

export class IntegrationError extends DomainError {
  readonly code: string
  readonly type: ErrorType
  readonly providerId: string
  readonly integrationId?: string

  constructor(
    code: string,
    message: string,
    providerId: string,
    type: ErrorType = ErrorType.PROVIDER_ERROR,
    integrationId?: string,
    context?: Record<string, any>
  ) {
    super(message, context)
    this.code = code
    this.type = type
    this.providerId = providerId
    this.integrationId = integrationId
  }

  classify(): ErrorClassification {
    switch (this.type) {
      case ErrorType.AUTHORIZATION:
        return {
          type: this.type,
          severity: ErrorSeverity.HIGH,
          userFacing: true,
          retryable: false
        }
      case ErrorType.RATE_LIMIT:
        return {
          type: this.type,
          severity: ErrorSeverity.MEDIUM,
          userFacing: false,
          retryable: true
        }
      case ErrorType.NETWORK:
        return {
          type: this.type,
          severity: ErrorSeverity.MEDIUM,
          userFacing: false,
          retryable: true
        }
      default:
        return {
          type: this.type,
          severity: ErrorSeverity.HIGH,
          userFacing: true,
          retryable: false
        }
    }
  }

  getSeverity(): ErrorSeverity {
    return this.classify().severity
  }

  getRetryStrategy(): RetryStrategy {
    const classification = this.classify()
    
    if (!classification.retryable) {
      return {
        shouldRetry: false,
        maxAttempts: 0,
        backoffMs: 0,
        backoffMultiplier: 1
      }
    }

    // Rate limit errors need longer backoff
    if (this.type === ErrorType.RATE_LIMIT) {
      return {
        shouldRetry: true,
        maxAttempts: 3,
        backoffMs: 5000,
        backoffMultiplier: 2
      }
    }

    // Network errors retry quickly
    return {
      shouldRetry: true,
      maxAttempts: 3,
      backoffMs: 1000,
      backoffMultiplier: 1.5
    }
  }
}

export class WorkflowError extends DomainError {
  readonly code: string
  readonly type: ErrorType
  readonly workflowId: string
  readonly nodeId?: string

  constructor(
    code: string,
    message: string,
    workflowId: string,
    type: ErrorType = ErrorType.INTERNAL,
    nodeId?: string,
    context?: Record<string, any>
  ) {
    super(message, context)
    this.code = code
    this.type = type
    this.workflowId = workflowId
    this.nodeId = nodeId
  }

  classify(): ErrorClassification {
    return {
      type: this.type,
      severity: ErrorSeverity.HIGH,
      userFacing: true,
      retryable: this.type === ErrorType.NETWORK
    }
  }

  getSeverity(): ErrorSeverity {
    return this.classify().severity
  }

  getRetryStrategy(): RetryStrategy {
    const classification = this.classify()
    return {
      shouldRetry: classification.retryable,
      maxAttempts: 2,
      backoffMs: 2000,
      backoffMultiplier: 2
    }
  }
}