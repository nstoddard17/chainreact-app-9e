import { getBaseUrl } from "@/lib/utils/getBaseUrl"
import {
  getOAuthRedirectUri,
  OAuthScopes,
  generateOAuthState,
  parseOAuthState,
  validateOAuthState,
} from "./utils"
import { type SupabaseClient } from "@supabase/supabase-js"

export class OneDriveOAuthService {
  private static readonly clientId = process.env.NEXT_PUBLIC_ONEDRIVE_CLIENT_ID
  private static readonly clientSecret = process.env.ONEDRIVE_CLIENT_SECRET
  private static readonly apiUrl = "https://graph.microsoft.com/v1.0"

  static async generateAuthUrl(userId: string, baseUrl?: string): Promise<string> {
    if (!this.clientId) {
      throw new Error("NEXT_PUBLIC_ONEDRIVE_CLIENT_ID must be defined")
    }

    const state = generateOAuthState("onedrive", userId)
    const redirectUri = getOAuthRedirectUri("onedrive", baseUrl)

    const params = new URLSearchParams({
      client_id: this.clientId,
      response_type: "code",
      redirect_uri: redirectUri,
      response_mode: "query",
      scope: OAuthScopes.ONEDRIVE.join(" "),
      state,
    })

    return `https://login.microsoftonline.com/common/oauth2/v2.0/authorize?${params.toString()}`
  }

  static getRedirectUri(baseUrl?: string): string {
    return getOAuthRedirectUri("onedrive", baseUrl)
  }

  static async handleCallback(
    code: string,
    state: string,
    supabase: SupabaseClient,
    userId: string,
    baseUrl?: string
  ): Promise<{ success: boolean; error?: string }> {
    try {
      if (!this.clientId || !this.clientSecret) {
        throw new Error("NEXT_PUBLIC_ONEDRIVE_CLIENT_ID and ONEDRIVE_CLIENT_SECRET must be defined")
      }

      // Parse and validate state
      const stateData = parseOAuthState(state)
      validateOAuthState(stateData, "onedrive")

      const redirectUri = this.getRedirectUri(baseUrl)

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

      // Store integration data
      const { error: upsertError } = await supabase.from("integrations").upsert({
        user_id: userId,
        provider: "onedrive",
        provider_user_id: userData.id,
        access_token: tokenData.access_token,
        refresh_token: tokenData.refresh_token,
        token_expires_at: new Date(Date.now() + tokenData.expires_in * 1000).toISOString(),
        scopes: OAuthScopes.ONEDRIVE,
        provider_user_data: userData,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })

      if (upsertError) {
        throw new Error(`Failed to store integration data: ${upsertError.message}`)
      }

      return { success: true }
    } catch (error: any) {
      console.error("OneDrive OAuth callback error:", error)
      return { success: false, error: error.message }
    }
  }

  static async refreshToken(
    refreshToken: string,
    baseUrl?: string
  ): Promise<{ access_token: string; refresh_token: string; expires_in: number }> {
    if (!this.clientId || !this.clientSecret) {
      throw new Error("NEXT_PUBLIC_ONEDRIVE_CLIENT_ID and ONEDRIVE_CLIENT_SECRET must be defined")
    }

    const redirectUri = this.getRedirectUri(baseUrl)

    const response = await fetch("https://login.microsoftonline.com/common/oauth2/v2.0/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        client_id: this.clientId,
        client_secret: this.clientSecret,
        refresh_token: refreshToken,
        redirect_uri: redirectUri,
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
