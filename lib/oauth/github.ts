import { getBaseUrl } from "@/lib/utils/getBaseUrl"
import {
  getOAuthRedirectUri,
  OAuthScopes,
  generateOAuthState,
  parseOAuthState,
  validateOAuthState,
} from "./utils"
import { createClient } from "@supabase/supabase-js"

export class GitHubOAuthService {
  static readonly clientId = process.env.NEXT_PUBLIC_GITHUB_CLIENT_ID
  static readonly clientSecret = process.env.GITHUB_CLIENT_SECRET
  static readonly apiUrl = "https://api.github.com"

  static generateAuthUrl(userId: string, origin: string): string {
    if (!this.clientId) {
      throw new Error("Missing GitHub client ID")
    }

    const state = generateOAuthState(userId, "github")
    const redirectUri = this.getRedirectUri(origin)

    const params = new URLSearchParams({
      response_type: "code",
      client_id: this.clientId,
      redirect_uri: redirectUri,
      state,
      scope: OAuthScopes.GITHUB.join(" "),
    })

    return `https://github.com/login/oauth/authorize?${params.toString()}`
  }

  static getRedirectUri(origin: string): string {
    return getOAuthRedirectUri(origin, "github")
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
        throw new Error("Missing GitHub client credentials")
      }

      // Parse and validate state
      const stateData = parseOAuthState(state)
      validateOAuthState(stateData, "github")

      // Exchange code for token
      const tokenResponse = await fetch("https://github.com/login/oauth/access_token", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({
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
      const { access_token, refresh_token, expires_in } = tokenData

      // Get user info from GitHub
      const userResponse = await fetch(`${this.apiUrl}/user`, {
        headers: {
          Authorization: `Bearer ${access_token}`,
          Accept: "application/vnd.github.v3+json",
        },
      })

      if (!userResponse.ok) {
        throw new Error("Failed to get user info from GitHub")
      }

      const userData = await userResponse.json()

      const now = new Date().toISOString()

      // Check if integration exists
      const { data: existingIntegration } = await supabase
        .from("integrations")
        .select("id")
        .eq("user_id", userId)
        .eq("provider", "github")
        .maybeSingle()

      const integrationData = {
        user_id: userId,
        provider: "github",
        provider_user_id: userData.id,
        access_token,
        refresh_token,
        token_type: tokenData.token_type,
        expires_at: expires_in ? new Date(Date.now() + expires_in * 1000).toISOString() : null,
        scopes: tokenData.scope ? tokenData.scope.split(" ") : [],
        metadata: {
          email: userData.email,
          name: userData.name,
          picture: userData.avatar_url,
          provider: "github"
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
          created_at: now,
        })

        if (error) {
          throw new Error(`Failed to insert integration: ${error.message}`)
        }
      }

      return { success: true }
    } catch (error: any) {
      console.error("GitHub OAuth error:", error)
      return { success: false, error: error.message }
    }
  }

  static async refreshToken(
    refreshToken: string
  ): Promise<{ access_token: string; refresh_token: string; expires_in: number }> {
    if (!this.clientId || !this.clientSecret) {
      throw new Error("Missing GitHub client credentials")
    }

    const response = await fetch("https://github.com/login/oauth/access_token", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        client_id: this.clientId,
        client_secret: this.clientSecret,
        refresh_token,
        grant_type: "refresh_token",
      }),
    })

    if (!response.ok) {
      throw new Error("Failed to refresh token")
    }

    return response.json()
  }
}
