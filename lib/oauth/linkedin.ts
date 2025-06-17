import { getBaseUrl } from "@/lib/utils/getBaseUrl"
import {
  getOAuthRedirectUri,
  OAuthScopes,
  generateOAuthState,
  parseOAuthState,
  validateOAuthState,
} from "./utils"
import { type SupabaseClient } from "@supabase/supabase-js"

export class LinkedInOAuthService {
  private static readonly clientId = process.env.NEXT_PUBLIC_LINKEDIN_CLIENT_ID
  private static readonly clientSecret = process.env.LINKEDIN_CLIENT_SECRET
  private static readonly apiUrl = "https://api.linkedin.com/v2"

  static async generateAuthUrl(userId: string, baseUrl?: string): Promise<string> {
    if (!this.clientId) {
      throw new Error("NEXT_PUBLIC_LINKEDIN_CLIENT_ID must be defined")
    }

    const state = generateOAuthState("linkedin", userId)
    const redirectUri = this.getRedirectUri(baseUrl)

    const params = new URLSearchParams({
      response_type: "code",
      client_id: this.clientId,
      redirect_uri: redirectUri,
      state,
      scope: OAuthScopes.LINKEDIN.join(" "),
    })

    return `https://www.linkedin.com/oauth/v2/authorization?${params.toString()}`
  }

  static getRedirectUri(baseUrl?: string): string {
    const origin = baseUrl || getBaseUrl()
    return getOAuthRedirectUri(origin, "linkedin")
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
        throw new Error("NEXT_PUBLIC_LINKEDIN_CLIENT_ID and LINKEDIN_CLIENT_SECRET must be defined")
      }

      // Parse and validate state
      const stateData = parseOAuthState(state)
      validateOAuthState(stateData, "linkedin")

      const redirectUri = this.getRedirectUri(baseUrl)

      // Exchange code for token
      const tokenResponse = await fetch("https://www.linkedin.com/oauth/v2/accessToken", {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          grant_type: "authorization_code",
          code,
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
        provider: "linkedin",
        provider_user_id: userData.id,
        access_token: tokenData.access_token,
        refresh_token: tokenData.refresh_token,
        token_expires_at: new Date(Date.now() + tokenData.expires_in * 1000).toISOString(),
        scopes: OAuthScopes.LINKEDIN,
        provider_user_data: userData,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })

      if (upsertError) {
        throw new Error(`Failed to store integration data: ${upsertError.message}`)
      }

      return { success: true }
    } catch (error: any) {
      console.error("LinkedIn OAuth callback error:", error)
      return { success: false, error: error.message }
    }
  }

  static async refreshToken(
    refreshToken: string,
    baseUrl?: string
  ): Promise<{ access_token: string; refresh_token: string; expires_in: number }> {
    if (!this.clientId || !this.clientSecret) {
      throw new Error("NEXT_PUBLIC_LINKEDIN_CLIENT_ID and LINKEDIN_CLIENT_SECRET must be defined")
    }

    const redirectUri = this.getRedirectUri(baseUrl)

    const response = await fetch("https://www.linkedin.com/oauth/v2/accessToken", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: refreshToken,
        client_id: this.clientId,
        client_secret: this.clientSecret,
        redirect_uri: redirectUri,
      }),
    })

    if (!response.ok) {
      const error = await response.text()
      throw new Error(`Failed to refresh token: ${error}`)
    }

    return response.json()
  }
}
