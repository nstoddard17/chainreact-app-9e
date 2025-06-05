import { adminSupabase, upsertIntegration, validateScopes, getRequiredScopes } from "./utils"

export interface OAuthResult {
  success: boolean
  redirectUrl: string
  error?: string
}

export class BaseOAuthService {
  /**
   * Exchange authorization code for access token
   * To be implemented by provider-specific services
   */
  static async exchangeCodeForToken(
    code: string,
    redirectUri: string,
    clientId: string,
    clientSecret: string,
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
  static async handleCallback(
    provider: string,
    code: string,
    state: string,
    redirectUri: string,
    userId: string,
  ): Promise<OAuthResult> {
    try {
      // Get client credentials
      const clientId = process.env[`NEXT_PUBLIC_${provider.toUpperCase()}_CLIENT_ID`]
      const clientSecret = process.env[`${provider.toUpperCase()}_CLIENT_SECRET`]

      if (!clientId || !clientSecret) {
        throw new Error(`Missing ${provider} OAuth configuration`)
      }

      // Exchange code for token
      const tokenResponse = await this.exchangeCodeForToken(code, redirectUri, clientId, clientSecret)

      // Parse scopes from token response
      const grantedScopes = this.parseScopes(tokenResponse)

      // Validate required scopes
      const requiredScopes = getRequiredScopes(provider)
      const scopeValidation = validateScopes(requiredScopes, grantedScopes)

      if (!scopeValidation.valid) {
        console.error(`${provider} scope validation failed:`, {
          required: requiredScopes,
          granted: grantedScopes,
          missing: scopeValidation.missingScopes,
        })

        const baseUrl = new URL(redirectUri).origin
        return {
          success: false,
          redirectUrl: `${baseUrl}/integrations?error=insufficient_scopes&provider=${provider}&message=${encodeURIComponent(
            `Missing required permissions: ${scopeValidation.missingScopes.join(", ")}. Please reconnect and accept all permissions.`,
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
      await upsertIntegration(adminSupabase, integrationData)

      const baseUrl = new URL(redirectUri).origin
      return {
        success: true,
        redirectUrl: `${baseUrl}/integrations?success=${provider}_connected&provider=${provider}`,
      }
    } catch (error: any) {
      console.error(`${provider} OAuth callback error:`, error)
      const baseUrl = new URL(redirectUri).origin
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
