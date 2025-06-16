import { createAdminSupabaseClient, upsertIntegration, validateScopes, getRequiredScopes } from "./utils"
import { getBaseUrl } from "@/lib/utils/getBaseUrl"
import { Buffer } from "node:buffer"

export interface OAuthResult {
  success: boolean
  redirectUrl: string
  error?: string
}

export class BaseOAuthService {
  /**
   * Get hardcoded redirect URI for a provider
   */
  static getRedirectUri(provider: string): string {
    const baseUrl = getBaseUrl()
    // Ensure baseUrl doesn't end with a slash
    const cleanBaseUrl = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl
    return `${cleanBaseUrl}/api/integrations/${provider}/callback`
  }

  /**
   * Generate PKCE code verifier
   */
  protected static generateCodeVerifier(): string {
    const array = new Uint8Array(32)
    if (typeof crypto !== "undefined" && crypto.getRandomValues) {
      crypto.getRandomValues(array)
    } else {
      // Fallback for server-side
      for (let i = 0; i < array.length; i++) {
        array[i] = Math.floor(Math.random() * 256)
      }
    }
    return btoa(String.fromCharCode.apply(null, Array.from(array)))
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=/g, "")
  }

  /**
   * Generate PKCE code challenge
   */
  protected static async generateCodeChallenge(verifier: string): Promise<string> {
    if (typeof crypto !== "undefined" && crypto.subtle) {
      const encoder = new TextEncoder()
      const data = encoder.encode(verifier)
      const digest = await crypto.subtle.digest("SHA-256", data)
      return btoa(String.fromCharCode.apply(null, Array.from(new Uint8Array(digest))))
        .replace(/\+/g, "-")
        .replace(/\//g, "_")
        .replace(/=/g, "")
    } else {
      // Fallback - use plain verifier (not recommended for production)
      return verifier
    }
  }

  /**
   * Generate authorization URL with PKCE
   */
  static async generateAuthUrl(
    provider: string,
    baseUrl: string,
    reconnect = false,
    integrationId?: string,
    userId?: string,
  ): Promise<string> {
    const clientId = process.env[`NEXT_PUBLIC_${provider.toUpperCase()}_CLIENT_ID`]
    if (!clientId) {
      throw new Error(`Missing ${provider} OAuth configuration`)
    }

    // Ensure baseUrl doesn't end with a slash
    const cleanBaseUrl = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl
    const redirectUri = `${cleanBaseUrl}/api/integrations/${provider}/callback`

    console.log(`Generating ${provider} auth URL:`, {
      baseUrl: cleanBaseUrl,
      redirectUri,
      hasUserId: !!userId
    })

    // Generate PKCE parameters
    const codeVerifier = this.generateCodeVerifier()
    const codeChallenge = await this.generateCodeChallenge(codeVerifier)

    // Get required scopes
    const scopes = this.getRequiredScopes()

    // Store the code verifier in state
    const stateData = {
      provider,
      reconnect,
      integrationId,
      userId,
      requireFullScopes: true,
      timestamp: Date.now(),
      codeVerifier, // Store verifier in state for later use
    }

    // Ensure the state is properly encoded
    const state = btoa(JSON.stringify(stateData))

    const params = new URLSearchParams({
      response_type: "code",
      client_id: clientId,
      redirect_uri: redirectUri,
      scope: scopes.join(" "),
      state,
      code_challenge: codeChallenge,
      code_challenge_method: "S256",
    })

    const authUrl = `${this.getAuthorizationEndpoint(provider)}?${params.toString()}`
    console.log(`Generated ${provider} auth URL:`, authUrl)
    return authUrl
  }

  /**
   * Get authorization endpoint for provider
   * To be implemented by provider-specific services
   */
  protected static getAuthorizationEndpoint(provider: string): string {
    throw new Error("Not implemented")
  }

  /**
   * Exchange authorization code for access token
   * To be implemented by provider-specific services
   */
  static async exchangeCodeForToken(
    code: string,
    redirectUri: string,
    clientId: string,
    clientSecret: string,
    codeVerifier?: string,
  ): Promise<any> {
    throw new Error("Not implemented")
  }

  /**
   * Validate token and get user info
   * To be implemented by provider-specific services
   */
  static async validateTokenAndGetUserInfo(accessToken: string): Promise<any> {
    throw new Error("Not implemented")
  }

  /**
   * Get required scopes for this provider
   * To be implemented by provider-specific services
   */
  static getRequiredScopes(): string[] {
    throw new Error("Not implemented")
  }

  /**
   * Parse scopes from token response
   * To be implemented by provider-specific services
   */
  static parseScopes(tokenResponse: any): string[] {
    throw new Error("Not implemented")
  }

  /**
   * Handle OAuth callback
   * Common implementation for all providers
   */
  static async handleCallback(provider: string, code: string, state: string, userId: string): Promise<OAuthResult> {
    try {
      // Parse state
      let stateData
      try {
        stateData = JSON.parse(atob(state))
      } catch (error) {
        console.error("Failed to parse state:", error)
        throw new Error("Invalid state format")
      }

      const { codeVerifier } = stateData

      if (!codeVerifier) {
        console.error("Missing code verifier in state:", stateData)
        throw new Error("Missing code verifier in state")
      }

      // Get client credentials
      const clientId = process.env[`NEXT_PUBLIC_${provider.toUpperCase()}_CLIENT_ID`]
      const clientSecret = process.env[`${provider.toUpperCase()}_CLIENT_SECRET`]

      if (!clientId || !clientSecret) {
        throw new Error(`Missing ${provider} OAuth configuration`)
      }

      // Use redirect URI derived from base URL
      const redirectUri = this.getRedirectUri(provider)
      const baseUrl = getBaseUrl()

      console.log(`Processing ${provider} callback:`, {
        hasCode: !!code,
        hasState: !!state,
        hasCodeVerifier: !!codeVerifier,
        baseUrl,
        redirectUri
      })

      // Exchange code for token
      const tokenResponse = await this.exchangeCodeForToken(code, redirectUri, clientId, clientSecret, codeVerifier)

      // Parse scopes from token response
      const grantedScopes = this.parseScopes(tokenResponse)

      // Validate required scopes
      const requiredScopes = getRequiredScopes(provider)
      const scopeValidation = validateScopes(requiredScopes, grantedScopes)

      if (!scopeValidation.valid) {
        console.error(`${provider} scope validation failed:`, {
          required: requiredScopes,
          granted: grantedScopes,
          missing: scopeValidation.missing,
        })

        return {
          success: false,
          redirectUrl: `${baseUrl}/integrations?error=insufficient_scopes&provider=${provider}&message=${encodeURIComponent(
            `Missing required permissions: ${scopeValidation.missing.join(", ")}. Please reconnect and accept all permissions.`,
          )}`,
          error: "Insufficient scopes",
        }
      }

      // Validate token and get user info
      const userInfo = await this.validateTokenAndGetUserInfo(tokenResponse.access_token)

      // Prepare integration data
      const integrationData = {
        user_id: userId,
        provider,
        provider_user_id: userInfo.id || userInfo.account_id || userInfo.user_id || "unknown",
        status: "connected",
        scopes: grantedScopes,
        access_token: tokenResponse.access_token,
        refresh_token: tokenResponse.refresh_token,
        expires_at: tokenResponse.expires_in
          ? new Date(Date.now() + tokenResponse.expires_in * 1000).toISOString()
          : null,
        metadata: {
          user_info: userInfo,
          connected_at: new Date().toISOString(),
          scopes_validated: true,
          granted_scopes: grantedScopes,
          required_scopes: requiredScopes,
          token_response: {
            token_type: tokenResponse.token_type,
            scope: tokenResponse.scope,
          },
        },
      }

      // Upsert integration data
      const adminSupabase = createAdminSupabaseClient()
      if (adminSupabase) {
        await upsertIntegration(adminSupabase, integrationData)
      }

      return {
        success: true,
        redirectUrl: `${baseUrl}/integrations?success=${provider}_connected&provider=${provider}`,
      }
    } catch (error: any) {
      console.error(`${provider} OAuth callback error:`, error)
      return {
        success: false,
        redirectUrl: `${baseUrl}/integrations?error=callback_failed&provider=${provider}&message=${encodeURIComponent(
          error.message,
        )}`,
        error: error.message,
      }
    }
  }
}
