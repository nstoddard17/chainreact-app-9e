/// <reference types="node" />
import { getBaseUrl } from "@/lib/utils/getBaseUrl"
import {
  getOAuthRedirectUri,
  OAuthScopes,
  generateOAuthState,
  parseOAuthState,
  validateOAuthState,
} from "./utils"
import { type SupabaseClient } from "@supabase/supabase-js"

interface TwitterOAuthResult {
  success: boolean
  redirectUrl: string
  error?: string
}

export class TwitterOAuthService {
  private static readonly clientId = process.env.NEXT_PUBLIC_TWITTER_CLIENT_ID
  private static readonly clientSecret = process.env.TWITTER_CLIENT_SECRET
  private static readonly apiUrl = "https://api.twitter.com/2"

  static async generateAuthUrl(userId: string, baseUrl?: string): Promise<string> {
    if (!this.clientId) {
      throw new Error("NEXT_PUBLIC_TWITTER_CLIENT_ID must be defined")
    }

    const state = generateOAuthState("twitter", userId)
    const redirectUri = this.getRedirectUri(baseUrl)

    const params = new URLSearchParams({
      response_type: "code",
      client_id: this.clientId,
      redirect_uri: redirectUri,
      state,
      scope: OAuthScopes.TWITTER.join(" "),
      code_challenge_method: "S256",
      code_challenge: await this.generateCodeChallenge(),
    })

    return `https://twitter.com/i/oauth2/authorize?${params.toString()}`
  }

  static getRedirectUri(baseUrl?: string): string {
    const origin = baseUrl || getBaseUrl()
    return getOAuthRedirectUri(origin, "twitter")
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
        throw new Error("NEXT_PUBLIC_TWITTER_CLIENT_ID and TWITTER_CLIENT_SECRET must be defined")
      }

      // Parse and validate state
      const stateData = parseOAuthState(state)
      validateOAuthState(stateData, "twitter")

      const redirectUri = this.getRedirectUri(baseUrl)

      // Exchange code for token
      const tokenResponse = await fetch("https://api.twitter.com/2/oauth2/token", {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Authorization: `Basic ${Buffer.from(`${this.clientId}:${this.clientSecret}`).toString("base64")}`,
        },
        body: new URLSearchParams({
          grant_type: "authorization_code",
          code,
          redirect_uri: redirectUri,
          code_verifier: await this.getCodeVerifier(),
        }),
      })

      if (!tokenResponse.ok) {
        const error = await tokenResponse.text()
        throw new Error(`Failed to exchange code for token: ${error}`)
      }

      const tokenData = await tokenResponse.json()

      // Get user info
      const userResponse = await fetch(`${this.apiUrl}/users/me`, {
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
        provider: "twitter",
        provider_user_id: userData.data.id,
        access_token: tokenData.access_token,
        refresh_token: tokenData.refresh_token,
        token_expires_at: new Date(Date.now() + tokenData.expires_in * 1000).toISOString(),
        scopes: OAuthScopes.TWITTER,
        provider_user_data: userData.data,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })

      if (upsertError) {
        throw new Error(`Failed to store integration data: ${upsertError.message}`)
      }

      return { success: true }
    } catch (error: any) {
      console.error("Twitter OAuth callback error:", error)
      return { success: false, error: error.message }
    }
  }

  static async refreshToken(
    refreshToken: string,
    baseUrl?: string
  ): Promise<{ access_token: string; refresh_token: string; expires_in: number }> {
    if (!this.clientId || !this.clientSecret) {
      throw new Error("NEXT_PUBLIC_TWITTER_CLIENT_ID and TWITTER_CLIENT_SECRET must be defined")
    }

    const redirectUri = this.getRedirectUri(baseUrl)

    const response = await fetch("https://api.twitter.com/2/oauth2/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: `Basic ${Buffer.from(`${this.clientId}:${this.clientSecret}`).toString("base64")}`,
      },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: refreshToken,
        redirect_uri: redirectUri,
      }),
    })

    if (!response.ok) {
      const error = await response.text()
      throw new Error(`Failed to refresh token: ${error}`)
    }

    return response.json()
  }

  private static async generateCodeChallenge(): Promise<string> {
    const verifier = await this.getCodeVerifier()
    const encoder = new TextEncoder()
    const data = encoder.encode(verifier)
    const hash = await crypto.subtle.digest("SHA-256", data)
    return btoa(String.fromCharCode(...new Uint8Array(hash)))
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "")
  }

  private static async getCodeVerifier(): Promise<string> {
    const array = new Uint8Array(32)
    crypto.getRandomValues(array)
    return btoa(String.fromCharCode(...array))
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "")
  }
}
