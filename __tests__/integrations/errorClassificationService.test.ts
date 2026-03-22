jest.mock("@/lib/utils/logger", () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
  },
}))

import {
  classifyOAuthError,
  getUserActionMessage,
  shouldRetryImmediately,
  calculateUserActionDeadline,
  type ClassifiedError,
} from "@/lib/integrations/errorClassificationService"

describe("classifyOAuthError", () => {
  // ── Rate Limiting ────────────────────────────────────────────────
  describe("rate limiting", () => {
    it("classifies 429 as rate_limited for any provider", () => {
      const result = classifyOAuthError("google", 429, { error: "too many requests" })
      expect(result.code).toBe("rate_limited")
      expect(result.isRecoverable).toBe(true)
      expect(result.requiresUserAction).toBe(false)
    })

    it("extracts retry_after value", () => {
      const result = classifyOAuthError("slack", 429, { retry_after: 30 })
      expect(result.code).toBe("rate_limited")
      expect(result.retryAfterSeconds).toBe(30)
    })

    it("extracts Retry-After header format", () => {
      const result = classifyOAuthError("slack", 429, { "Retry-After": 45 })
      expect(result.retryAfterSeconds).toBe(45)
    })

    it("extracts retryAfter camelCase", () => {
      const result = classifyOAuthError("google", 429, { retryAfter: 20 })
      expect(result.retryAfterSeconds).toBe(20)
    })

    it("defaults retry to 60s when not provided", () => {
      const result = classifyOAuthError("google", 429, {})
      expect(result.retryAfterSeconds).toBe(60)
    })

    it.each([
      ["google", "quota_exceeded"],
      ["google", "userRateLimitExceeded"],
      ["microsoft", "throttled"],
      ["slack", "ratelimited"],
      ["hubspot", "MAX_REACHED"],
      ["airtable", "RATE_LIMIT_REACHED"],
    ])("classifies %s provider-specific rate limit pattern: %s", (provider, errorMsg) => {
      const result = classifyOAuthError(provider, 200, { error: errorMsg })
      expect(result.code).toBe("rate_limited")
      expect(result.isRecoverable).toBe(true)
    })
  })

  // ── Server Errors ────────────────────────────────────────────────
  describe("server errors", () => {
    it.each([500, 502, 503, 504])("classifies status %d as server_error", (status) => {
      const result = classifyOAuthError("google", status, { error: "internal" })
      expect(result.code).toBe("server_error")
      expect(result.isRecoverable).toBe(true)
      expect(result.requiresUserAction).toBe(false)
      expect(result.retryAfterSeconds).toBe(30)
    })

    it("classifies status 0 as server_error", () => {
      const result = classifyOAuthError("slack", 0, {})
      expect(result.code).toBe("server_error")
      expect(result.isRecoverable).toBe(true)
    })
  })

  // ── Invalid Grant ────────────────────────────────────────────────
  describe("invalid grant", () => {
    it("classifies generic invalid_grant error code", () => {
      const result = classifyOAuthError("google", 400, { error: "invalid_grant" })
      expect(result.code).toBe("invalid_grant")
      expect(result.isRecoverable).toBe(false)
      expect(result.requiresUserAction).toBe(true)
      expect(result.userActionType).toBe("reconnect")
    })

    it.each([
      // Note: "Token has been expired or revoked" matches revoked pattern first (contains "revoked")
      // so it's tested in the revoked section instead
      ["microsoft", "AADSTS700084"],
      ["microsoft", "AADSTS50076"],
      ["slack", "token_expired"],
      ["github", "bad_refresh_token"],
      ["github", "expired_token"],
      ["hubspot", "BAD_REFRESH_TOKEN"],
      ["airtable", "INVALID_GRANT"],
    ])("classifies %s invalid grant pattern: %s", (provider, errorMsg) => {
      const result = classifyOAuthError(provider, 400, { error: errorMsg })
      expect(result.code).toBe("invalid_grant")
      expect(result.requiresUserAction).toBe(true)
    })
  })

  // ── Revoked Tokens ───────────────────────────────────────────────
  describe("revoked tokens", () => {
    it.each([
      ["google", "access_denied"],
      ["google", "unauthorized_client"],
      ["microsoft", "AADSTS50173"],
      ["microsoft", "AADSTS700082"],
      ["slack", "token_revoked"],
      ["slack", "account_inactive"],
      ["discord", "invalid_token"],
      ["github", "incorrect_client_credentials"],
      ["hubspot", "INVALID_REFRESH_TOKEN"],
      ["airtable", "INVALID_TOKEN"],
    ])("classifies %s revoked pattern: %s", (provider, errorMsg) => {
      const result = classifyOAuthError(provider, 400, { error: errorMsg })
      expect(result.code).toBe("revoked")
      expect(result.isRecoverable).toBe(false)
      expect(result.requiresUserAction).toBe(true)
      expect(result.userActionType).toBe("reconnect")
    })
  })

  // ── Scope Changes ───────────────────────────────────────────────
  describe("scope changes", () => {
    it.each([
      ["google", "insufficient_scope"],
      ["microsoft", "consent_required"],
      ["slack", "missing_scope"],
      ["hubspot", "MISSING_SCOPES"],
      ["airtable", "INSUFFICIENT_PERMISSIONS"],
    ])("classifies %s scope change pattern: %s", (provider, errorMsg) => {
      const result = classifyOAuthError(provider, 403, { error: errorMsg })
      expect(result.code).toBe("scope_changed")
      expect(result.isRecoverable).toBe(false)
      expect(result.requiresUserAction).toBe(true)
      expect(result.userActionType).toBe("reauthorize_scopes")
    })
  })

  // ── Provider Name Normalization ──────────────────────────────────
  describe("provider normalization", () => {
    it("maps gmail to google patterns", () => {
      const result = classifyOAuthError("gmail", 400, { error: "invalid_grant" })
      expect(result.code).toBe("invalid_grant")
    })

    it("maps outlook to microsoft patterns", () => {
      const result = classifyOAuthError("outlook", 400, { error: "AADSTS700084" })
      expect(result.code).toBe("invalid_grant")
    })

    it("maps google-calendar to google patterns", () => {
      const result = classifyOAuthError("google-calendar", 400, { error: "invalid_grant" })
      expect(result.code).toBe("invalid_grant")
    })

    it("maps microsoft-teams to microsoft patterns", () => {
      const result = classifyOAuthError("microsoft-teams", 400, { error: "AADSTS700084" })
      expect(result.code).toBe("invalid_grant")
    })
  })

  // ── 401 / 403 ────────────────────────────────────────────────────
  describe("HTTP status codes", () => {
    it("classifies 401 as unauthorized", () => {
      const result = classifyOAuthError("google", 401, { error: "something" })
      expect(result.code).toBe("unauthorized")
      expect(result.requiresUserAction).toBe(true)
      expect(result.userActionType).toBe("reconnect")
    })

    it("classifies 403 as forbidden", () => {
      const result = classifyOAuthError("google", 403, { error: "something_unrecognized" })
      expect(result.code).toBe("forbidden")
      expect(result.requiresUserAction).toBe(true)
    })
  })

  // ── Network Errors ───────────────────────────────────────────────
  describe("network errors", () => {
    it("classifies FetchError as network_error", () => {
      const result = classifyOAuthError("google", 200, { name: "FetchError", message: "failed" })
      expect(result.code).toBe("network_error")
      expect(result.isRecoverable).toBe(true)
      expect(result.retryAfterSeconds).toBe(15)
    })

    it("classifies AbortError as network_error", () => {
      const result = classifyOAuthError("slack", 200, { name: "AbortError", message: "aborted" })
      expect(result.code).toBe("network_error")
    })

    it.each(["ECONNREFUSED", "ENOTFOUND", "ETIMEDOUT", "fetch failed"])(
      "classifies message containing '%s' as network_error",
      (msg) => {
        const result = classifyOAuthError("google", 200, { message: msg })
        expect(result.code).toBe("network_error")
        expect(result.isRecoverable).toBe(true)
      }
    )
  })

  // ── Unknown Errors ───────────────────────────────────────────────
  describe("unknown errors", () => {
    it("defaults to unknown for unrecognized errors", () => {
      const result = classifyOAuthError("google", 418, { error: "i_am_a_teapot" })
      expect(result.code).toBe("unknown")
      expect(result.requiresUserAction).toBe(true)
      expect(result.userActionType).toBe("reconnect")
    })
  })

  // ── Error String Extraction ──────────────────────────────────────
  describe("error string extraction", () => {
    it("handles string error response", () => {
      const result = classifyOAuthError("google", 400, "invalid_grant")
      expect(result.code).toBe("invalid_grant")
    })

    it("extracts from error_description field", () => {
      // "Token has been expired or revoked" contains "revoked" which matches revoked pattern
      // before invalid_grant because scope check runs before revoked check, and revoked before invalid_grant
      const result = classifyOAuthError("google", 400, {
        error_description: "Token has been expired or revoked",
      })
      expect(result.code).toBe("revoked")
    })

    it("extracts from nested error.message", () => {
      const result = classifyOAuthError("google", 400, {
        error: { message: "invalid_grant" },
      })
      expect(result.code).toBe("invalid_grant")
    })
  })
})

describe("shouldRetryImmediately", () => {
  it("returns true for recoverable error with short retry", () => {
    const error: ClassifiedError = {
      code: "network_error",
      isRecoverable: true,
      requiresUserAction: false,
      userActionType: null,
      retryAfterSeconds: 3,
      message: "Network error",
    }
    expect(shouldRetryImmediately(error)).toBe(true)
  })

  it("returns false for recoverable error with long retry", () => {
    const error: ClassifiedError = {
      code: "rate_limited",
      isRecoverable: true,
      requiresUserAction: false,
      userActionType: null,
      retryAfterSeconds: 60,
      message: "Rate limited",
    }
    expect(shouldRetryImmediately(error)).toBe(false)
  })

  it("returns false for non-recoverable error", () => {
    const error: ClassifiedError = {
      code: "revoked",
      isRecoverable: false,
      requiresUserAction: true,
      userActionType: "reconnect",
      message: "Revoked",
    }
    expect(shouldRetryImmediately(error)).toBe(false)
  })
})

describe("calculateUserActionDeadline", () => {
  it("returns 7 days for revoked errors", () => {
    const error: ClassifiedError = {
      code: "revoked",
      isRecoverable: false,
      requiresUserAction: true,
      userActionType: "reconnect",
      message: "Revoked",
    }
    const deadline = calculateUserActionDeadline(error)
    const diffDays = (deadline.getTime() - Date.now()) / (1000 * 60 * 60 * 24)
    expect(diffDays).toBeCloseTo(7, 0)
  })

  it("returns 7 days for invalid_grant errors", () => {
    const error: ClassifiedError = {
      code: "invalid_grant",
      isRecoverable: false,
      requiresUserAction: true,
      userActionType: "reconnect",
      message: "Invalid grant",
    }
    const deadline = calculateUserActionDeadline(error)
    const diffDays = (deadline.getTime() - Date.now()) / (1000 * 60 * 60 * 24)
    expect(diffDays).toBeCloseTo(7, 0)
  })

  it("returns 14 days for scope_changed errors", () => {
    const error: ClassifiedError = {
      code: "scope_changed",
      isRecoverable: false,
      requiresUserAction: true,
      userActionType: "reauthorize_scopes",
      message: "Scope changed",
    }
    const deadline = calculateUserActionDeadline(error)
    const diffDays = (deadline.getTime() - Date.now()) / (1000 * 60 * 60 * 24)
    expect(diffDays).toBeCloseTo(14, 0)
  })
})

describe("getUserActionMessage", () => {
  it("returns reconnect message", () => {
    const error: ClassifiedError = {
      code: "revoked",
      isRecoverable: false,
      requiresUserAction: true,
      userActionType: "reconnect",
      message: "Revoked",
    }
    const msg = getUserActionMessage(error, "gmail")
    expect(msg).toContain("Gmail")
    expect(msg).toContain("reconnect")
  })

  it("returns reauthorize message for scope changes", () => {
    const error: ClassifiedError = {
      code: "scope_changed",
      isRecoverable: false,
      requiresUserAction: true,
      userActionType: "reauthorize_scopes",
      message: "Scope changed",
    }
    const msg = getUserActionMessage(error, "slack")
    expect(msg).toContain("Slack")
    expect(msg).toContain("permissions")
  })

  it("falls back to error message for null action type", () => {
    const error: ClassifiedError = {
      code: "rate_limited",
      isRecoverable: true,
      requiresUserAction: false,
      userActionType: null,
      message: "Rate limited",
    }
    const msg = getUserActionMessage(error, "google")
    expect(msg).toBe("Rate limited")
  })
})
