import { getBaseUrl } from "@/lib/utils/getBaseUrl"
import {
  getOAuthRedirectUri,
  OAuthScopes,
  generateOAuthState,
  parseOAuthState,
  validateOAuthState,
} from "./utils"
import { createClient } from "@supabase/supabase-js"

export class MicrosoftOAuthService {
  static clientId = process.env.NEXT_PUBLIC_MICROSOFT_CLIENT_ID
  static clientSecret = process.env.MICROSOFT_CLIENT_SECRET
  static apiUrl = "https://graph.microsoft.com/v1.0"

  static generateAuthUrl(userId: string): string {
    if (!this.clientId) {
      throw new Error("Missing Microsoft client ID")
    }

    const state = generateOAuthState(userId, "microsoft")
    const redirectUri = getOAuthRedirectUri("microsoft")

    const params = new URLSearchParams({
      client_id: this.clientId,
      redirect_uri: redirectUri,
      response_type: "code",
      scope: OAuthScopes.MICROSOFT.join(" "),
      state,
    })

    return `https://login.microsoftonline.com/common/oauth2/v2.0/authorize?${params.toString()}`
  }

  static getRedirectUri(baseUrl?: string): string {
    return getOAuthRedirectUri("microsoft", baseUrl)
  }

  static async handleCallback(
    code: string,
    state: string,
    supabase: ReturnType<typeof createClient>,
    userId: string
  ): Promise<{ success: boolean; error?: string; redirectUrl?: string }> {
    try {
      if (!this.clientId || !this.clientSecret) {
        throw new Error("Missing Microsoft OAuth configuration")
      }

      // Parse and validate state
      const stateData = parseOAuthState(state)
      validateOAuthState(stateData, "microsoft")

      const redirectUri = this.getRedirectUri()

      // Exchange code for token
      const tokenResponse = await fetch("https://login.microsoftonline.com/common/oauth2/v2.0/token", {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          client_id: this.clientId,
          client_secret: this.clientSecret,
          code,
          redirect_uri: redirectUri,
          grant_type: "authorization_code",
        }),
      })

      if (!tokenResponse.ok) {
        const error = await tokenResponse.text()
        throw new Error(`Failed to exchange code for token: ${error}`)
      }

      const tokenData = await tokenResponse.json()

      // Get user info
      const userResponse = await fetch(`${this.apiUrl}/me`, {
        headers: {
          Authorization: `Bearer ${tokenData.access_token}`,
        },
      })

      if (!userResponse.ok) {
        const error = await userResponse.text()
        throw new Error(`Failed to get user info: ${error}`)
      }

      const userData = await userResponse.json()

      // Check if integration exists
      const { data: existingIntegration } = await supabase
        .from("integrations")
        .select("id")
        .eq("user_id", userId)
        .eq("provider", "microsoft")
        .maybeSingle()

      const now = new Date().toISOString()
      const integrationData = {
        user_id: userId,
        provider: "microsoft",
        provider_user_id: userData.id,
        access_token: tokenData.access_token,
        refresh_token: tokenData.refresh_token,
        expires_at: tokenData.expires_in ? new Date(Date.now() + tokenData.expires_in * 1000).toISOString() : null,
        status: "connected",
        scopes: tokenData.scope ? tokenData.scope.split(" ") : [],
        metadata: {
          email: userData.mail || userData.userPrincipalName,
          name: userData.displayName,
          connected_at: now,
        },
        updated_at: now,
      }

      if (existingIntegration) {
        const { error } = await supabase
          .from("integrations")
          .update(integrationData)
          .eq("id", existingIntegration.id)

        if (error) throw error
      } else {
        const { error } = await supabase.from("integrations").insert({
          ...integrationData,
          created_at: now,
        })

        if (error) throw error
      }

      return {
        success: true,
        redirectUrl: `${getBaseUrl()}/integrations?success=microsoft_connected`,
      }
    } catch (error: any) {
      console.error("Microsoft OAuth callback error:", error)
      return {
        success: false,
        error: error.message,
        redirectUrl: `${getBaseUrl()}/integrations?error=callback_failed&provider=microsoft&message=${encodeURIComponent(
          error.message
        )}`,
      }
    }
  }

  static async refreshToken(
    refreshToken: string
  ): Promise<{ access_token: string; refresh_token: string; expires_in: number }> {
    if (!this.clientId || !this.clientSecret) {
      throw new Error("Missing Microsoft OAuth configuration")
    }

    const response = await fetch("https://login.microsoftonline.com/common/oauth2/v2.0/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        client_id: this.clientId,
        client_secret: this.clientSecret,
        refresh_token: refreshToken,
        grant_type: "refresh_token",
      }),
    })

    if (!response.ok) {
      const error = await response.text()
      throw new Error(`Failed to refresh token: ${error}`)
    }

    return response.json()
  }
} 