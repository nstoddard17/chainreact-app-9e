import { getBaseUrl } from "@/lib/utils/getBaseUrl"
import {
  getOAuthRedirectUri,
  OAuthScopes,
  generateOAuthState,
  parseOAuthState,
  validateOAuthState,
} from "./utils"
import { createClient } from "@supabase/supabase-js"

export class FacebookOAuthService {
  static readonly clientId = process.env.NEXT_PUBLIC_FACEBOOK_CLIENT_ID
  static readonly clientSecret = process.env.FACEBOOK_CLIENT_SECRET
  static readonly apiUrl = "https://graph.facebook.com/v18.0"

  static generateAuthUrl(userId: string, origin: string): string {
    if (!this.clientId) {
      throw new Error("Missing Facebook client ID")
    }

    const state = generateOAuthState(userId, "facebook")
    const redirectUri = this.getRedirectUri(origin)

    const params = new URLSearchParams({
      response_type: "code",
      client_id: this.clientId,
      redirect_uri: redirectUri,
      state,
      scope: OAuthScopes.FACEBOOK.join(","),
    })

    return `https://www.facebook.com/v18.0/dialog/oauth?${params.toString()}`
  }

  static getRedirectUri(origin: string): string {
    return getOAuthRedirectUri(origin, "facebook")
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
        throw new Error("Missing Facebook client credentials")
      }

      // Parse and validate state
      const stateData = parseOAuthState(state)
      validateOAuthState(stateData, "facebook")

      // Exchange code for token
      const tokenResponse = await fetch("https://graph.facebook.com/v18.0/oauth/access_token", {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
        },
        body: new URLSearchParams({
          client_id: this.clientId,
          client_secret: this.clientSecret,
          code,
          redirect_uri: this.getRedirectUri(origin),
        }),
      })

      if (!tokenResponse.ok) {
        const errorText = await tokenResponse.text()
        throw new Error(`Token exchange failed: ${errorText}`)
      }

      const tokenData = await tokenResponse.json()
      const { access_token, expires_in } = tokenData

      // Get user info from Facebook
      const userResponse = await fetch(`${this.apiUrl}/me?fields=id,name,email&access_token=${access_token}`)

      if (!userResponse.ok) {
        throw new Error("Failed to get user info from Facebook")
      }

      const userData = await userResponse.json()

      const now = new Date().toISOString()

      // Check if integration exists
      const { data: existingIntegration } = await supabase
        .from("integrations")
        .select("id")
        .eq("user_id", userId)
        .eq("provider", "facebook")
        .maybeSingle()

      const integrationData = {
        user_id: userId,
        provider: "facebook",
        provider_user_id: userData.id,
        access_token,
        expires_at: expires_in ? new Date(Date.now() + expires_in * 1000).toISOString() : null,
        status: "connected",
        scopes: tokenData.scope ? tokenData.scope.split(",") : [],
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
      console.error("Facebook OAuth error:", error)
      return { success: false, error: error.message }
    }
  }

  static async refreshToken(
    accessToken: string
  ): Promise<{ access_token: string; expires_in: number }> {
    if (!this.clientId || !this.clientSecret) {
      throw new Error("Missing Facebook client credentials")
    }

    const response = await fetch("https://graph.facebook.com/v18.0/oauth/access_token", {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
      },
      body: new URLSearchParams({
        grant_type: "fb_exchange_token",
        client_id: this.clientId,
        client_secret: this.clientSecret,
        fb_exchange_token: accessToken,
      }),
    })

    if (!response.ok) {
      throw new Error("Failed to refresh token")
    }

    return response.json()
  }
}
