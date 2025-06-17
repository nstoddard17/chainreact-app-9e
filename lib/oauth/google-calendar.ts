import { getBaseUrl } from "@/lib/utils/getBaseUrl"
import {
  getOAuthRedirectUri,
  OAuthScopes,
  generateOAuthState,
  parseOAuthState,
  validateOAuthState,
  type OAuthState,
} from "./utils"
import { createClient } from "@supabase/supabase-js"

export class GoogleCalendarOAuthService {
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
    return getOAuthRedirectUri(origin, "google-calendar")
  }

  static generateAuthUrl(userId: string, origin: string): string {
    try {
      const { clientId } = this.getClientCredentials()
      const redirectUri = this.getRedirectUri(origin)

      const state = generateOAuthState(userId, "google", { origin })

      const params = new URLSearchParams({
        client_id: clientId,
        redirect_uri: redirectUri,
        response_type: "code",
        scope: OAuthScopes.GOOGLE_CALENDAR.join(" "),
        access_type: "offline",
        prompt: "consent",
        state,
      })

      return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`
    } catch (error: any) {
      console.error("Error generating auth URL:", error)
      throw new Error(`Failed to generate auth URL: ${error.message}`)
    }
  }

  static async handleCallback(
    code: string,
    state: OAuthState,
    supabase: ReturnType<typeof createClient>,
    userId: string,
    origin: string
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const { clientId, clientSecret } = this.getClientCredentials()

      // Validate state
      validateOAuthState(state, "google")

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
        console.error("Token exchange failed:", errorText)
        throw new Error(`Token exchange failed: ${errorText}`)
      }

      const tokenData = await tokenResponse.json()
      const { access_token, refresh_token, expires_in } = tokenData

      if (!access_token || !refresh_token || !expires_in) {
        throw new Error("Invalid token response from Google")
      }

      // Get user info
      const userResponse = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
        headers: {
          Authorization: `Bearer ${access_token}`,
        },
      })

      if (!userResponse.ok) {
        const errorText = await userResponse.text()
        console.error("Failed to get user info:", errorText)
        throw new Error("Failed to get user info")
      }

      const userData = await userResponse.json()

      if (!userData.sub || !userData.email) {
        throw new Error("Invalid user data from Google")
      }

      // Check for existing integration
      const { data: existingIntegration, error: queryError } = await supabase
        .from("integrations")
        .select("id")
        .eq("user_id", userId)
        .eq("provider", "google")
        .eq("service", "calendar")
        .maybeSingle()

      if (queryError) {
        console.error("Error querying existing integration:", queryError)
        throw new Error(`Failed to query existing integration: ${queryError.message}`)
      }

      const integrationData = {
        user_id: userId,
        provider: "google",
        provider_user_id: userData.sub,
        access_token,
        refresh_token,
        expires_at: new Date(Date.now() + expires_in * 1000).toISOString(),
        scopes: OAuthScopes.GOOGLE_CALENDAR,
        metadata: {
          email: userData.email,
          name: userData.name,
          picture: userData.picture,
          provider: "google",
          service: "calendar"
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
        const { error: updateError } = await supabase
          .from("integrations")
          .update(integrationData)
          .eq("id", existingIntegration.id)

        if (updateError) {
          console.error("Error updating integration:", updateError)
          throw new Error(`Failed to update integration: ${updateError.message}`)
        }
      } else {
        const { error: insertError } = await supabase.from("integrations").insert({
          ...integrationData,
          created_at: new Date().toISOString(),
        })

        if (insertError) {
          console.error("Error inserting integration:", insertError)
          throw new Error(`Failed to insert integration: ${insertError.message}`)
        }
      }

      return { success: true }
    } catch (error: any) {
      console.error("Google Calendar OAuth error:", error)
      return { success: false, error: error.message }
    }
  }

  static async refreshToken(
    refreshToken: string,
    origin: string
  ): Promise<{ access_token: string; refresh_token: string; expires_in: number }> {
    try {
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
        console.error("Failed to refresh token:", errorText)
        throw new Error(`Failed to refresh token: ${errorText}`)
      }

      const data = await response.json()
      if (!data.access_token || !data.expires_in) {
        throw new Error("Invalid token refresh response from Google")
      }

      return data
    } catch (error: any) {
      console.error("Error refreshing token:", error)
      throw new Error(`Failed to refresh token: ${error.message}`)
    }
  }
}
