import { getBaseUrl } from "@/lib/utils/getBaseUrl"
import {
  OAuthScopes,
  getOAuthRedirectUri,
  generateOAuthState,
  parseOAuthState,
  validateOAuthState,
} from "./utils"
import { createClient } from "@supabase/supabase-js"

export class GoogleSheetsOAuthService {
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

  static getRedirectUri(origin: string): string {
    return getOAuthRedirectUri(origin, "google-sheets")
  }

  static generateAuthUrl(userId: string, origin: string): string {
    const { clientId } = this.getClientCredentials()
    const redirectUri = this.getRedirectUri(origin)

    const state = generateOAuthState(userId, "google")

    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: "code",
      scope: OAuthScopes.GOOGLE_SHEETS.join(" "),
      access_type: "offline",
      prompt: "consent",
      state,
    })

    return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`
  }

  static async handleCallback(
    code: string,
    state: string,
    supabase: ReturnType<typeof createClient>,
    userId: string,
    origin: string
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const { clientId, clientSecret } = this.getClientCredentials()

      // Parse and validate state
      const stateData = parseOAuthState(state)
      validateOAuthState(stateData, "google")

      // Exchange code for token
      const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          client_id: clientId,
          client_secret: clientSecret,
          code,
          grant_type: "authorization_code",
          redirect_uri: this.getRedirectUri(origin),
        }),
      })

      if (!tokenResponse.ok) {
        const errorText = await tokenResponse.text()
        throw new Error(`Token exchange failed: ${errorText}`)
      }

      const tokenData = await tokenResponse.json()
      const { access_token, refresh_token, expires_in } = tokenData

      // Get user info
      const userResponse = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
        headers: {
          Authorization: `Bearer ${access_token}`,
        },
      })

      if (!userResponse.ok) {
        throw new Error("Failed to get user info")
      }

      const userData = await userResponse.json()

      // Check for existing integration
      const { data: existingIntegration } = await supabase
        .from("integrations")
        .select("id")
        .eq("user_id", userId)
        .eq("provider", "google-sheets")
        .maybeSingle()

      const integrationData = {
        user_id: userId,
        provider: "google",
        provider_user_id: userData.sub,
        access_token,
        refresh_token,
        token_type: "Bearer",
        expires_at: new Date(Date.now() + expires_in * 1000).toISOString(),
        scopes: OAuthScopes.GOOGLE_SHEETS,
        metadata: {
          email: userData.email,
          name: userData.name,
          picture: userData.picture,
          provider: "google",
          service: "sheets"
        },
        status: "connected",
        is_active: true,
        consecutive_failures: 0,
        last_token_refresh: new Date().toISOString(),
        last_refreshed_at: new Date().toISOString(),
        last_used_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }

      if (existingIntegration) {
        const { error } = await supabase
          .from("integrations")
          .update(integrationData)
          .eq("id", existingIntegration.id)

        if (error) {
          throw new Error(`Failed to update integration: ${error.message}`)
        }
      } else {
        const { error } = await supabase.from("integrations").insert({
          ...integrationData,
          created_at: new Date().toISOString(),
        })

        if (error) {
          throw new Error(`Failed to insert integration: ${error.message}`)
        }
      }

      return { success: true }
    } catch (error: any) {
      console.error("Google Sheets OAuth error:", error)
      return { success: false, error: error.message }
    }
  }

  static async refreshToken(
    refreshToken: string,
    origin: string
  ): Promise<{ access_token: string; refresh_token: string; expires_in: number }> {
    const { clientId, clientSecret } = this.getClientCredentials()

    const response = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: refreshToken,
        grant_type: "refresh_token",
      }),
    })

    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`Failed to refresh token: ${errorText}`)
    }

    return response.json()
  }
}
