// Mock server-only module (blocks client imports in Next.js)
jest.mock("server-only", () => ({}))

jest.mock("@/lib/utils/logger", () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
  },
}))

// Mock dependencies of tokenRefreshService that import server-only modules
jest.mock("@/lib/secrets", () => ({
  getSecret: jest.fn(),
}))

jest.mock("@/lib/integrations/oauthConfig", () => ({
  getOAuthConfig: jest.fn(),
  getOAuthClientCredentials: jest.fn(),
}))

jest.mock("@/lib/security/encryption", () => ({
  decrypt: jest.fn(),
}))

jest.mock("@/lib/utils/getBaseUrl", () => ({
  getBaseUrl: jest.fn(() => "http://localhost:3000"),
}))

jest.mock("node-fetch", () => jest.fn())

import { shouldRefreshToken } from "@/lib/integrations/tokenRefreshService"
import type { Integration } from "@/types/integration"

const makeIntegration = (overrides: Partial<Integration> = {}): Integration =>
  ({
    id: "test-id",
    user_id: "user-1",
    provider: "google",
    status: "connected",
    access_token: "token",
    refresh_token: "refresh",
    expires_at: null,
    refresh_token_expires_at: null,
    ...overrides,
  } as Integration)

describe("shouldRefreshToken", () => {
  it("returns true when no expiration is set", () => {
    const integration = makeIntegration({ expires_at: null })
    const result = shouldRefreshToken(integration, {})
    expect(result.shouldRefresh).toBe(true)
    expect(result.reason).toContain("No access token expiration set")
  })

  it("returns true when token expires within default threshold (30 min)", () => {
    const soonExpiry = new Date(Date.now() + 15 * 60 * 1000).toISOString() // 15 min from now
    const integration = makeIntegration({ expires_at: soonExpiry })
    const result = shouldRefreshToken(integration, {})
    expect(result.shouldRefresh).toBe(true)
    expect(result.reason).toContain("Access token expires in")
  })

  it("returns false when token has plenty of time", () => {
    const farExpiry = new Date(Date.now() + 120 * 60 * 1000).toISOString() // 2 hours from now
    const integration = makeIntegration({ expires_at: farExpiry })
    const result = shouldRefreshToken(integration, {})
    expect(result.shouldRefresh).toBe(false)
    expect(result.reason).toBe("Tokens are still valid")
  })

  it("uses custom accessTokenExpiryThreshold", () => {
    // 45 min from now - within 60 min custom threshold
    const expiry = new Date(Date.now() + 45 * 60 * 1000).toISOString()
    const integration = makeIntegration({ expires_at: expiry })
    const result = shouldRefreshToken(integration, {
      accessTokenExpiryThreshold: 60,
    })
    expect(result.shouldRefresh).toBe(true)
  })

  it("returns true when refresh token is expiring", () => {
    const accessExpiry = new Date(Date.now() + 120 * 60 * 1000).toISOString() // access ok
    const refreshExpiry = new Date(Date.now() + 30 * 60 * 1000).toISOString() // 30 min
    const integration = makeIntegration({
      expires_at: accessExpiry,
      refresh_token_expires_at: refreshExpiry,
    })
    const result = shouldRefreshToken(integration, {})
    expect(result.shouldRefresh).toBe(true)
    expect(result.reason).toContain("Refresh token expires in")
  })

  it("returns false when both tokens are valid", () => {
    const accessExpiry = new Date(Date.now() + 120 * 60 * 1000).toISOString()
    const refreshExpiry = new Date(Date.now() + 240 * 60 * 1000).toISOString()
    const integration = makeIntegration({
      expires_at: accessExpiry,
      refresh_token_expires_at: refreshExpiry,
    })
    const result = shouldRefreshToken(integration, {})
    expect(result.shouldRefresh).toBe(false)
  })

  it("returns true when token is already expired", () => {
    const pastExpiry = new Date(Date.now() - 60 * 1000).toISOString() // 1 min ago
    const integration = makeIntegration({ expires_at: pastExpiry })
    const result = shouldRefreshToken(integration, {})
    expect(result.shouldRefresh).toBe(true)
    expect(result.reason).toContain("0 minutes")
  })

  it("uses custom refreshTokenExpiryThreshold", () => {
    const accessExpiry = new Date(Date.now() + 120 * 60 * 1000).toISOString()
    // 100 min from now - within 120 min custom threshold
    const refreshExpiry = new Date(Date.now() + 100 * 60 * 1000).toISOString()
    const integration = makeIntegration({
      expires_at: accessExpiry,
      refresh_token_expires_at: refreshExpiry,
    })
    const result = shouldRefreshToken(integration, {
      refreshTokenExpiryThreshold: 120,
    })
    expect(result.shouldRefresh).toBe(true)
  })
})
