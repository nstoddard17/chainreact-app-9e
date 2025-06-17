import { getBaseUrl } from "@/lib/utils/getBaseUrl"
import {
  getOAuthRedirectUri,
  OAuthScopes,
  generateOAuthState,
  parseOAuthState,
  validateOAuthState,
} from "./utils"
import { type SupabaseClient } from "@supabase/supabase-js"

export class DropboxOAuthService {
  private static readonly clientId = process.env.NEXT_PUBLIC_DROPBOX_CLIENT_ID
  private static readonly clientSecret = process.env.DROPBOX_CLIENT_SECRET
  private static readonly apiUrl = "https://api.dropboxapi.com/2"

  static async generateAuthUrl(userId: string, baseUrl?: string): Promise<string> {
    if (!this.clientId) {
      throw new Error("NEXT_PUBLIC_DROPBOX_CLIENT_ID must be defined")
    }

    const state = generateOAuthState("dropbox", userId)
    const redirectUri = getOAuthRedirectUri("dropbox", baseUrl)

    const params = new URLSearchParams({
      response_type: "code",
      client_id: this.clientId,
      redirect_uri: redirectUri,
      state,
      token_access_type: "offline",
      scope: OAuthScopes.DROPBOX.join(" "),
    })

    return `https://www.dropbox.com/oauth2/authorize?${params.toString()}`
  }

  static getRedirectUri(baseUrl?: string): string {
    return getOAuthRedirectUri("dropbox", baseUrl)
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
        throw new Error("NEXT_PUBLIC_DROPBOX_CLIENT_ID and DROPBOX_CLIENT_SECRET must be defined")
      }

      // Parse and validate state
      const stateData = parseOAuthState(state)
      validateOAuthState(stateData, "dropbox")

      const redirectUri = this.getRedirectUri(baseUrl)

      // Exchange code for token
      const tokenResponse = await fetch("https://api.dropboxapi.com/oauth2/token", {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          code,
          grant_type: "authorization_code",
          client_id: this.clientId,
          client_secret: this.clientSecret,
          redirect_uri: redirectUri,
        }),
      })

      if (!tokenResponse.ok) {
        const error = await tokenResponse.text()
        throw new Error(`Failed to exchange code for token: ${error}`)
      }

      const tokenData = await tokenResponse.json()

      // Get user info
      const userResponse = await fetch(`${this.apiUrl}/users/get_current_account`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${tokenData.access_token}`,
          "Content-Type": "application/json",
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
        provider: "dropbox",
        provider_user_id: userData.account_id,
        access_token: tokenData.access_token,
        refresh_token: tokenData.refresh_token,
        token_expires_at: new Date(Date.now() + tokenData.expires_in * 1000).toISOString(),
        scopes: OAuthScopes.DROPBOX,
        provider_user_data: userData,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })

      if (upsertError) {
        throw new Error(`Failed to store integration data: ${upsertError.message}`)
      }

      return { success: true }
    } catch (error: any) {
      console.error("Dropbox OAuth callback error:", error)
      return { success: false, error: error.message }
    }
  }

  static async refreshToken(
    refreshToken: string
  ): Promise<{ access_token: string; refresh_token: string; expires_in: number }> {
    if (!this.clientId || !this.clientSecret) {
      throw new Error("NEXT_PUBLIC_DROPBOX_CLIENT_ID and DROPBOX_CLIENT_SECRET must be defined")
    }

    const response = await fetch("https://api.dropboxapi.com/oauth2/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: refreshToken,
        client_id: this.clientId,
        client_secret: this.clientSecret,
      }),
    })

    if (!response.ok) {
      const error = await response.text()
      throw new Error(`Failed to refresh token: ${error}`)
    }

    return response.json()
  }
}
