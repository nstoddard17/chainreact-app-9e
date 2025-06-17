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
  private static clientId: string | undefined = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID
  private static clientSecret: string | undefined = process.env.GOOGLE_CLIENT_SECRET
  static readonly apiUrl = "https://www.googleapis.com/sheets/v4"

  static generateAuthUrl(baseUrl: string, reconnect = false, integrationId?: string, userId?: string): string {
    const { clientId } = this.getClientCredentials()
    const redirectUri = this.getRedirectUri(baseUrl)
    const state = btoa(
      JSON.stringify({
        provider: "google_sheets",
        userId,
        reconnect,
        integrationId,
        timestamp: Date.now(),
      }),
    )
    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: "code",
      scope: OAuthScopes.GOOGLE_SHEETS.join(" "),
      state,
    })
    return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`
  }

  static getRedirectUri(origin: string): string {
    const redirectUri = getOAuthRedirectUri(origin, "google_sheets")
    console.log("Google Sheets Redirect URI:", {
      origin,
      baseUrl: getBaseUrl(),
      redirectUri,
    })
    return redirectUri
  }

  static getClientCredentials() {
    if (!this.clientId || !this.clientSecret) {
      throw new Error("Missing Google client credentials")
    }
    return { clientId: this.clientId, clientSecret: this.clientSecret }
  }

  static async handleCallback(
    code: string,
    state: string,
    supabase: ReturnType<typeof createClient>,
    userId: string,
    origin: string
  ): Promise<{ success: boolean; error?: string }> {
    try {
      if (!this.clientId || !this.clientSecret) {
        throw new Error("Missing Google client credentials")
      }

      // Parse and validate state
      const stateData = parseOAuthState(state)
      validateOAuthState(stateData, "google_sheets")

      // Exchange code for token
      const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          client_id: this.clientId,
          client_secret: this.clientSecret,
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

      // Get user info from Google
      const userResponse = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
        headers: {
          Authorization: `Bearer ${access_token}`,
        },
      })

      if (!userResponse.ok) {
        throw new Error("Failed to get user info from Google")
      }

      const userData = await userResponse.json()

      const now = new Date().toISOString()

      // Check if integration exists
      const { data: existingIntegration } = await supabase
        .from("integrations")
        .select("id")
        .eq("user_id", userId)
        .eq("provider", "google_sheets")
        .maybeSingle()

      const integrationData = {
        user_id: userId,
        provider: "google_sheets",
        provider_user_id: userData.id,
        access_token,
        refresh_token,
        expires_at: expires_in ? new Date(Date.now() + expires_in * 1000).toISOString() : null,
        status: "connected",
        scopes: tokenData.scope ? tokenData.scope.split(" ") : [],
        metadata: {
          email: userData.email,
          name: userData.name,
          picture: userData.picture,
          verified_email: userData.verified_email,
          connected_at: now,
        },
        updated_at: now,
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
          created_at: now,
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
    refreshToken: string
  ): Promise<{ access_token: string; refresh_token: string; expires_in: number }> {
    if (!this.clientId || !this.clientSecret) {
      throw new Error("Missing Google client credentials")
    }

    const response = await fetch("https://oauth2.googleapis.com/token", {
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
      throw new Error("Failed to refresh token")
    }

    return response.json()
  }
}
