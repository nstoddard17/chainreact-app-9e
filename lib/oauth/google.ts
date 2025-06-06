import { BaseOAuthService } from "./BaseOAuthService"
import { parseOAuthState, createAdminSupabaseClient, upsertIntegration, validateScopes } from "./utils"

export class GoogleOAuthService extends BaseOAuthService {
  private static getClientCredentials() {
    const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET

    if (!clientId) {
      throw new Error("Missing NEXT_PUBLIC_GOOGLE_CLIENT_ID environment variable")
    }
    if (!clientSecret) {
      throw new Error("Missing GOOGLE_CLIENT_SECRET environment variable")
    }

    return { clientId, clientSecret }
  }

  static getRedirectUri(): string {
    // Hardcoded redirect URI
    return "https://chainreact.app/api/integrations/google/callback"
  }

  static generateAuthUrl(baseUrl: string, reconnect = false, integrationId?: string, userId?: string): string {
    const { clientId } = this.getClientCredentials()
    const redirectUri = this.getRedirectUri()

    // Define required scopes
    const scopes = [
      "https://www.googleapis.com/auth/userinfo.email",
      "https://www.googleapis.com/auth/userinfo.profile",
      "https://www.googleapis.com/auth/calendar",
      "https://www.googleapis.com/auth/calendar.events",
      "https://www.googleapis.com/auth/drive",
      "https://www.googleapis.com/auth/drive.file",
      "https://www.googleapis.com/auth/spreadsheets",
      "https://www.googleapis.com/auth/gmail.send",
      "https://www.googleapis.com/auth/gmail.modify",
    ]

    const state = btoa(
      JSON.stringify({
        provider: "google",
        userId: userId, // Ensure userId is included
        reconnect,
        integrationId,
        timestamp: Date.now(),
      }),
    )

    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: "code",
      scope: scopes.join(" "),
      access_type: "offline",
      prompt: reconnect ? "consent" : "select_account",
      state,
    })

    return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`
  }

  static async exchangeCodeForToken(
    code: string,
    redirectUri: string,
    clientId?: string,
    clientSecret?: string,
  ): Promise<any> {
    const credentials = this.getClientCredentials()

    const response = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        code,
        client_id: credentials.clientId,
        client_secret: credentials.clientSecret,
        redirect_uri: redirectUri,
        grant_type: "authorization_code",
      }),
    })

    if (!response.ok) {
      const errorData = await response.text()
      throw new Error(`Google token exchange failed: ${errorData}`)
    }

    return response.json()
  }

  static async validateTokenAndGetUserInfo(accessToken: string): Promise<any> {
    const response = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    })

    if (!response.ok) {
      throw new Error(`Failed to get Google user info: ${response.statusText}`)
    }

    return response.json()
  }

  static parseScopes(tokenResponse: any): string[] {
    return tokenResponse.scope ? tokenResponse.scope.split(" ") : []
  }

  static getRequiredScopes(): string[] {
    return [
      "https://www.googleapis.com/auth/userinfo.email",
      "https://www.googleapis.com/auth/userinfo.profile",
      "https://www.googleapis.com/auth/calendar",
      "https://www.googleapis.com/auth/calendar.events",
      "https://www.googleapis.com/auth/drive",
      "https://www.googleapis.com/auth/drive.file",
      "https://www.googleapis.com/auth/spreadsheets",
      "https://www.googleapis.com/auth/gmail.send",
      "https://www.googleapis.com/auth/gmail.modify",
    ]
  }

  static async handleCallback(
    provider: string,
    code: string,
    state: string,
    expectedUserId?: string,
  ): Promise<{ success: boolean; redirectUrl: string; error?: string }> {
    try {
      console.log(`Processing Google OAuth callback for provider: ${provider}`)

      // Parse state
      const stateData = parseOAuthState(state)
      const { userId, reconnect, integrationId } = stateData

      // Verify user ID matches if provided
      if (expectedUserId && userId !== expectedUserId) {
        console.error(`User ID mismatch: expected ${expectedUserId}, got ${userId}`)
        return {
          success: false,
          redirectUrl: `https://chainreact.app/integrations?error=user_mismatch&provider=${provider}`,
          error: "User ID mismatch",
        }
      }

      if (!userId) {
        console.error("Missing user ID in state")
        return {
          success: false,
          redirectUrl: `https://chainreact.app/integrations?error=missing_user_id&provider=${provider}`,
          error: "Missing user ID in state",
        }
      }

      // Exchange code for token
      const redirectUri = this.getRedirectUri()
      const tokenResponse = await this.exchangeCodeForToken(code, redirectUri)

      if (!tokenResponse.access_token) {
        throw new Error("No access token received from Google")
      }

      // Get user info
      const userInfo = await this.validateTokenAndGetUserInfo(tokenResponse.access_token)

      // Parse scopes
      const grantedScopes = this.parseScopes(tokenResponse)
      const requiredScopes = this.getRequiredScopes()

      // Create admin Supabase client
      const supabase = createAdminSupabaseClient()
      if (!supabase) {
        throw new Error("Failed to create Supabase admin client")
      }

      // Prepare integration data
      const integrationData = {
        user_id: userId,
        provider: provider,
        provider_user_id: userInfo.id,
        status: "connected" as const,
        scopes: grantedScopes,
        access_token: tokenResponse.access_token,
        refresh_token: tokenResponse.refresh_token,
        expires_at: tokenResponse.expires_in
          ? new Date(Date.now() + tokenResponse.expires_in * 1000).toISOString()
          : null,
        metadata: {
          user_info: userInfo,
          token_type: tokenResponse.token_type,
          granted_scopes: grantedScopes,
          required_scopes: requiredScopes,
          scope_validation: validateScopes(requiredScopes, grantedScopes),
          connected_at: new Date().toISOString(),
          reconnect: reconnect || false,
        },
      }

      // Save integration
      await upsertIntegration(supabase, integrationData)

      console.log(`Google OAuth callback completed successfully for user ${userId}`)

      return {
        success: true,
        redirectUrl: `https://chainreact.app/integrations?success=true&provider=${provider}&reconnect=${reconnect || false}`,
      }
    } catch (error: any) {
      console.error("Google OAuth callback error:", error)
      return {
        success: false,
        redirectUrl: `https://chainreact.app/integrations?error=callback_failed&provider=${provider}&message=${encodeURIComponent(error.message)}`,
        error: error.message,
      }
    }
  }
}
