/**
 * Error Classification Service for OAuth Token Refresh
 *
 * Classifies OAuth errors to determine the appropriate recovery strategy.
 * Helps distinguish between:
 * - Transient errors (retry automatically)
 * - Permanent errors (require user action)
 */

import { logger } from "@/lib/utils/logger"

export type ErrorCode =
  | "invalid_grant"
  | "revoked"
  | "scope_changed"
  | "rate_limited"
  | "network_error"
  | "server_error"
  | "unauthorized"
  | "forbidden"
  | "unknown"

export type UserActionType = "reconnect" | "reauthorize_scopes" | null

export interface ClassifiedError {
  /** Standardized error code */
  code: ErrorCode
  /** Whether the error can be resolved by retrying */
  isRecoverable: boolean
  /** Whether user intervention is required */
  requiresUserAction: boolean
  /** Type of user action needed, if any */
  userActionType: UserActionType
  /** Suggested retry delay in seconds (for recoverable errors) */
  retryAfterSeconds?: number
  /** Human-readable error message */
  message: string
  /** Original error details for logging */
  details?: Record<string, unknown>
}

// Provider-specific error patterns
const PROVIDER_ERROR_PATTERNS: Record<
  string,
  {
    invalidGrant: string[]
    revoked: string[]
    scopeChanged: string[]
    rateLimited: string[]
  }
> = {
  google: {
    invalidGrant: ["invalid_grant", "Token has been expired or revoked"],
    revoked: ["revoked", "access_denied", "unauthorized_client"],
    scopeChanged: ["insufficient_scope", "scope_changed"],
    rateLimited: ["rate_limit_exceeded", "quota_exceeded", "userRateLimitExceeded"],
  },
  microsoft: {
    invalidGrant: [
      "invalid_grant",
      "AADSTS700084", // Refresh token expired
      "AADSTS65001", // User hasn't consented
      "AADSTS50076", // MFA required
    ],
    revoked: ["AADSTS50173", "AADSTS700082"], // Refresh token revoked
    scopeChanged: ["AADSTS65001", "consent_required"],
    rateLimited: ["AADSTS500011", "throttled"],
  },
  slack: {
    invalidGrant: ["invalid_grant", "token_expired"],
    revoked: ["token_revoked", "invalid_auth", "account_inactive"],
    scopeChanged: ["missing_scope"],
    rateLimited: ["ratelimited"],
  },
  discord: {
    invalidGrant: ["invalid_grant"],
    revoked: ["invalid_token", "unauthorized"],
    scopeChanged: [],
    rateLimited: ["rate_limit"],
  },
  github: {
    invalidGrant: ["bad_refresh_token", "expired_token"],
    revoked: ["bad_verification_code", "incorrect_client_credentials"],
    scopeChanged: [],
    rateLimited: ["rate_limit"],
  },
  notion: {
    invalidGrant: ["invalid_grant", "unauthorized"],
    revoked: ["unauthorized", "forbidden"],
    scopeChanged: [],
    rateLimited: ["rate_limited"],
  },
  hubspot: {
    invalidGrant: ["invalid_grant", "BAD_REFRESH_TOKEN"],
    revoked: ["INVALID_REFRESH_TOKEN"],
    scopeChanged: ["MISSING_SCOPES"],
    rateLimited: ["MAX_REACHED"],
  },
  airtable: {
    invalidGrant: ["INVALID_GRANT"],
    revoked: ["INVALID_TOKEN"],
    scopeChanged: ["INSUFFICIENT_PERMISSIONS"],
    rateLimited: ["RATE_LIMIT_REACHED"],
  },
}

/**
 * Classify an OAuth error based on provider, status code, and error response
 *
 * @param provider - The OAuth provider (google, slack, microsoft, etc.)
 * @param statusCode - HTTP status code from the error response
 * @param errorResponse - The error response body (parsed JSON or string)
 * @returns ClassifiedError with recovery strategy
 */
export function classifyOAuthError(
  provider: string,
  statusCode: number,
  errorResponse: unknown
): ClassifiedError {
  // Normalize the provider name
  const normalizedProvider = normalizeProvider(provider)

  // Extract error string from response
  const errorString = extractErrorString(errorResponse)
  const errorCode = extractErrorCode(errorResponse)

  logger.debug(`[ErrorClassification] Classifying error for ${provider}`, {
    statusCode,
    errorCode,
    errorString: errorString.substring(0, 200),
  })

  // Check for rate limiting first (usually recoverable)
  if (isRateLimited(normalizedProvider, statusCode, errorString, errorCode)) {
    const retryAfter = extractRetryAfter(errorResponse)
    return {
      code: "rate_limited",
      isRecoverable: true,
      requiresUserAction: false,
      userActionType: null,
      retryAfterSeconds: retryAfter || 60,
      message: "Rate limit exceeded. Will retry automatically.",
      details: { provider, statusCode, errorCode },
    }
  }

  // Check for network/server errors (transient, retry)
  if (statusCode >= 500 || statusCode === 0) {
    return {
      code: "server_error",
      isRecoverable: true,
      requiresUserAction: false,
      userActionType: null,
      retryAfterSeconds: 30,
      message: "Server error. Will retry automatically.",
      details: { provider, statusCode, errorCode },
    }
  }

  // Check for scope changes (requires reauthorization)
  if (isScopeChanged(normalizedProvider, errorString, errorCode)) {
    return {
      code: "scope_changed",
      isRecoverable: false,
      requiresUserAction: true,
      userActionType: "reauthorize_scopes",
      message: "Permission scopes have changed. Please reconnect to grant new permissions.",
      details: { provider, statusCode, errorCode },
    }
  }

  // Check for revoked tokens (requires reconnection)
  if (isRevoked(normalizedProvider, statusCode, errorString, errorCode)) {
    return {
      code: "revoked",
      isRecoverable: false,
      requiresUserAction: true,
      userActionType: "reconnect",
      message: "Access has been revoked. Please reconnect your account.",
      details: { provider, statusCode, errorCode },
    }
  }

  // Check for invalid grant (requires reconnection)
  if (isInvalidGrant(normalizedProvider, statusCode, errorString, errorCode)) {
    return {
      code: "invalid_grant",
      isRecoverable: false,
      requiresUserAction: true,
      userActionType: "reconnect",
      message: "Authentication expired. Please reconnect your account.",
      details: { provider, statusCode, errorCode },
    }
  }

  // Check for 401 Unauthorized
  if (statusCode === 401) {
    return {
      code: "unauthorized",
      isRecoverable: false,
      requiresUserAction: true,
      userActionType: "reconnect",
      message: "Authentication failed. Please reconnect your account.",
      details: { provider, statusCode, errorCode },
    }
  }

  // Check for 403 Forbidden
  if (statusCode === 403) {
    return {
      code: "forbidden",
      isRecoverable: false,
      requiresUserAction: true,
      userActionType: "reconnect",
      message: "Access forbidden. Please reconnect your account with proper permissions.",
      details: { provider, statusCode, errorCode },
    }
  }

  // Network error (no status code, e.g., fetch failed)
  if (isNetworkError(errorResponse)) {
    return {
      code: "network_error",
      isRecoverable: true,
      requiresUserAction: false,
      userActionType: null,
      retryAfterSeconds: 15,
      message: "Network error. Will retry automatically.",
      details: { provider, errorString },
    }
  }

  // Unknown error - default to requiring user action for safety
  return {
    code: "unknown",
    isRecoverable: false,
    requiresUserAction: true,
    userActionType: "reconnect",
    message: "An unexpected error occurred. Please reconnect your account.",
    details: { provider, statusCode, errorCode, errorString },
  }
}

/**
 * Normalize provider name to match patterns
 */
function normalizeProvider(provider: string): string {
  const providerMappings: Record<string, string> = {
    gmail: "google",
    "google-calendar": "google",
    "google-drive": "google",
    "google-sheets": "google",
    "google-docs": "google",
    "google-analytics": "google",
    youtube: "google",
    outlook: "microsoft",
    onedrive: "microsoft",
    "microsoft-teams": "microsoft",
    onenote: "microsoft",
    excel: "microsoft",
  }

  return providerMappings[provider] || provider
}

/**
 * Extract error string from various response formats
 */
function extractErrorString(errorResponse: unknown): string {
  if (typeof errorResponse === "string") {
    return errorResponse.toLowerCase()
  }

  if (errorResponse && typeof errorResponse === "object") {
    const obj = errorResponse as Record<string, unknown>

    // Common error message locations
    const possibleFields = [
      "error",
      "error_description",
      "message",
      "error_message",
      "errorMessage",
      "detail",
      "errors",
    ]

    for (const field of possibleFields) {
      if (typeof obj[field] === "string") {
        return obj[field].toLowerCase()
      }
      if (obj[field] && typeof obj[field] === "object") {
        const nested = obj[field] as Record<string, unknown>
        if (typeof nested.message === "string") {
          return nested.message.toLowerCase()
        }
      }
    }

    // Stringify for pattern matching
    try {
      return JSON.stringify(errorResponse).toLowerCase()
    } catch {
      return ""
    }
  }

  return ""
}

/**
 * Extract standardized error code from response
 */
function extractErrorCode(errorResponse: unknown): string {
  if (errorResponse && typeof errorResponse === "object") {
    const obj = errorResponse as Record<string, unknown>

    if (typeof obj.error === "string") {
      return obj.error
    }

    if (typeof obj.code === "string") {
      return obj.code
    }

    if (typeof obj.error_code === "string") {
      return obj.error_code
    }

    if (obj.error && typeof obj.error === "object") {
      const nested = obj.error as Record<string, unknown>
      if (typeof nested.code === "string") {
        return nested.code
      }
    }
  }

  return ""
}

/**
 * Extract Retry-After value from response
 */
function extractRetryAfter(errorResponse: unknown): number | undefined {
  if (errorResponse && typeof errorResponse === "object") {
    const obj = errorResponse as Record<string, unknown>

    if (typeof obj.retry_after === "number") {
      return obj.retry_after
    }

    if (typeof obj.retryAfter === "number") {
      return obj.retryAfter
    }

    // Slack format
    if (typeof obj["Retry-After"] === "number") {
      return obj["Retry-After"]
    }
  }

  return undefined
}

/**
 * Check if error indicates rate limiting
 */
function isRateLimited(
  provider: string,
  statusCode: number,
  errorString: string,
  errorCode: string
): boolean {
  // 429 is the standard rate limit status
  if (statusCode === 429) {
    return true
  }

  const patterns = PROVIDER_ERROR_PATTERNS[provider]?.rateLimited || []
  return patterns.some(
    (p) =>
      errorString.includes(p.toLowerCase()) || errorCode.toLowerCase().includes(p.toLowerCase())
  )
}

/**
 * Check if error indicates invalid grant
 */
function isInvalidGrant(
  provider: string,
  statusCode: number,
  errorString: string,
  errorCode: string
): boolean {
  // Common pattern across providers
  if (errorCode === "invalid_grant" || errorString.includes("invalid_grant")) {
    return true
  }

  const patterns = PROVIDER_ERROR_PATTERNS[provider]?.invalidGrant || []
  return patterns.some(
    (p) =>
      errorString.includes(p.toLowerCase()) || errorCode.toLowerCase().includes(p.toLowerCase())
  )
}

/**
 * Check if error indicates token was revoked
 */
function isRevoked(
  provider: string,
  statusCode: number,
  errorString: string,
  errorCode: string
): boolean {
  const patterns = PROVIDER_ERROR_PATTERNS[provider]?.revoked || []
  return patterns.some(
    (p) =>
      errorString.includes(p.toLowerCase()) || errorCode.toLowerCase().includes(p.toLowerCase())
  )
}

/**
 * Check if error indicates scope change
 */
function isScopeChanged(provider: string, errorString: string, errorCode: string): boolean {
  const patterns = PROVIDER_ERROR_PATTERNS[provider]?.scopeChanged || []
  return patterns.some(
    (p) =>
      errorString.includes(p.toLowerCase()) || errorCode.toLowerCase().includes(p.toLowerCase())
  )
}

/**
 * Check if error is a network error
 */
function isNetworkError(errorResponse: unknown): boolean {
  if (errorResponse && typeof errorResponse === "object") {
    const obj = errorResponse as Record<string, unknown>

    if (obj.name === "FetchError" || obj.name === "AbortError") {
      return true
    }

    if (typeof obj.message === "string") {
      const msg = obj.message.toLowerCase()
      return (
        msg.includes("network") ||
        msg.includes("econnrefused") ||
        msg.includes("enotfound") ||
        msg.includes("etimedout") ||
        msg.includes("fetch failed")
      )
    }
  }

  return false
}

/**
 * Get recommended user action message for a classified error
 */
export function getUserActionMessage(error: ClassifiedError, provider: string): string {
  const providerName = getProviderDisplayName(provider)

  switch (error.userActionType) {
    case "reconnect":
      return `Your ${providerName} connection needs to be refreshed. Please reconnect your account.`
    case "reauthorize_scopes":
      return `${providerName} requires additional permissions. Please reconnect to grant the updated permissions.`
    default:
      return error.message
  }
}

/**
 * Get display name for a provider
 */
function getProviderDisplayName(provider: string): string {
  const displayNames: Record<string, string> = {
    google: "Google",
    gmail: "Gmail",
    "google-calendar": "Google Calendar",
    "google-drive": "Google Drive",
    "google-sheets": "Google Sheets",
    "google-docs": "Google Docs",
    microsoft: "Microsoft",
    outlook: "Outlook",
    onedrive: "OneDrive",
    "microsoft-teams": "Microsoft Teams",
    slack: "Slack",
    discord: "Discord",
    github: "GitHub",
    notion: "Notion",
    hubspot: "HubSpot",
    airtable: "Airtable",
    trello: "Trello",
    stripe: "Stripe",
  }

  return displayNames[provider] || provider.charAt(0).toUpperCase() + provider.slice(1)
}

/**
 * Check if an error should trigger immediate retry
 */
export function shouldRetryImmediately(error: ClassifiedError): boolean {
  return error.isRecoverable && (error.retryAfterSeconds || 0) < 5
}

/**
 * Calculate deadline for user action based on error severity
 */
export function calculateUserActionDeadline(error: ClassifiedError): Date {
  const now = new Date()

  // More severe errors get shorter deadlines
  switch (error.code) {
    case "revoked":
    case "invalid_grant":
      // 7 days for critical auth errors
      return new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)
    case "scope_changed":
      // 14 days for scope changes (less urgent)
      return new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000)
    default:
      // 7 days default
      return new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)
  }
}
