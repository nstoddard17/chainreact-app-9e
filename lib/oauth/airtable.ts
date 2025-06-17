import { getBaseUrl } from "@/lib/utils/getBaseUrl"
import {
  getOAuthRedirectUri,
  OAuthScopes,
  generateOAuthState,
  parseOAuthState,
  validateOAuthState,
} from "./utils"
import { createClient } from "@supabase/supabase-js"

interface AirtableTokenResponse {
  access_token: string
  refresh_token?: string
  expires_in?: number
  token_type: string
  scope?: string
}

interface AirtableUserInfo {
  id: string
  name: string
  email: string
}

interface AirtableOAuthResult {
  success: boolean
  error?: string
  redirectUrl: string
}

export class AirtableOAuthService {
  static readonly clientId = process.env.NEXT_PUBLIC_AIRTABLE_CLIENT_ID
  static readonly clientSecret = process.env.AIRTABLE_CLIENT_SECRET
  static readonly apiUrl = "https://api.airtable.com"

  static generateAuthUrl(userId: string, origin: string): string {
    if (!this.clientId) {
      throw new Error("Missing Airtable client ID")
    }

    const state = generateOAuthState(userId, "airtable")
    const redirectUri = this.getRedirectUri(origin)

    const params = new URLSearchParams({
      response_type: "code",
      client_id: this.clientId,
      redirect_uri: redirectUri,
      state,
      scope: OAuthScopes.AIRTABLE.join(" "),
    })

    return `https://airtable.com/oauth2/v1/authorize?${params.toString()}`
  }

  static getRedirectUri(origin: string): string {
    return getOAuthRedirectUri(origin, "airtable")
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
        throw new Error("Missing Airtable client credentials")
      }

      // Parse and validate state
      const stateData = parseOAuthState(state)
      validateOAuthState(stateData, "airtable")

      // Exchange code for token
      const tokenResponse = await fetch("https://airtable.com/oauth2/v1/token", {
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

      // Get user info from Airtable
      const userResponse = await fetch(`${this.apiUrl}/v0/meta/whoami`, {
        headers: {
          Authorization: `Bearer ${access_token}`,
        },
      })

      if (!userResponse.ok) {
        throw new Error("Failed to get user info from Airtable")
      }

      const userData = await userResponse.json()

      const now = new Date().toISOString()

      // Check if integration exists
      const { data: existingIntegration } = await supabase
        .from("integrations")
        .select("id")
        .eq("user_id", userId)
        .eq("provider", "airtable")
        .maybeSingle()

      const integrationData = {
        user_id: userId,
        provider: "airtable",
        provider_user_id: userData.id,
        access_token,
        refresh_token,
        expires_at: expires_in ? new Date(Date.now() + expires_in * 1000).toISOString() : null,
        status: "connected",
        scopes: tokenData.scope ? tokenData.scope.split(" ") : [],
        metadata: {
          email: userData.email,
          name: userData.name,
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
      console.error("Airtable OAuth error:", error)
      return { success: false, error: error.message }
    }
  }

  static async refreshToken(
    refreshToken: string
  ): Promise<{ access_token: string; expires_in: number }> {
    if (!this.clientId || !this.clientSecret) {
      throw new Error("Missing Airtable client credentials")
    }

    const response = await fetch("https://airtable.com/oauth2/v1/token", {
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
