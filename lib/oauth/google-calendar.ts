import { getBaseUrl } from "@/lib/utils/getBaseUrl"
import {
  getOAuthRedirectUri,
  OAuthScopes,
  generateOAuthState,
  parseOAuthState,
  validateOAuthState,
} from "./utils"
import { createClient } from "@supabase/supabase-js"

export class GoogleCalendarOAuthService {
  static readonly clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID
  static readonly clientSecret = process.env.GOOGLE_CLIENT_SECRET
  static readonly apiUrl = "https://www.googleapis.com/calendar/v3"

  static generateAuthUrl(baseUrl: string, reconnect = false, integrationId?: string, userId?: string): string {
    const { clientId } = this.getClientCredentials()
    const redirectUri = this.getRedirectUri(baseUrl)
    const state = btoa(
      JSON.stringify({
        provider: "google-calendar",
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
      scope: OAuthScopes.GOOGLE_CALENDAR.join(" "),
      state,
    })
    return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`
  }

  static getRedirectUri(origin: string): string {
    return getOAuthRedirectUri(origin, "google")
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
      validateOAuthState(stateData, "google_calendar")

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

      // Get calendar list
      const calendarResponse = await fetch(`${this.apiUrl}/users/me/calendarList`, {
        headers: {
          Authorization: `Bearer ${access_token}`,
        },
      })

      if (!calendarResponse.ok) {
        throw new Error("Failed to get calendar list")
      }

      const calendarData = await calendarResponse.json()
      const primaryCalendar = calendarData.items?.find((cal: any) => cal.primary)

      if (!primaryCalendar) {
        throw new Error("No primary calendar found")
      }

      const now = new Date().toISOString()

      // Check if integration exists
      const { data: existingIntegration } = await supabase
        .from("integrations")
        .select("id")
        .eq("user_id", userId)
        .eq("provider", "google_calendar")
        .maybeSingle()

      const integrationData = {
        user_id: userId,
        provider: "google_calendar",
        provider_user_id: primaryCalendar.id,
        access_token,
        refresh_token,
        expires_at: expires_in ? new Date(Date.now() + expires_in * 1000).toISOString() : null,
        status: "connected",
        scopes: tokenData.scope ? tokenData.scope.split(" ") : [],
        metadata: {
          calendar_id: primaryCalendar.id,
          calendar_name: primaryCalendar.summary,
          timezone: primaryCalendar.timeZone,
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
      console.error("Google Calendar OAuth error:", error)
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

  static getClientCredentials() {
    if (!this.clientId || !this.clientSecret) {
      throw new Error("Missing Google client credentials")
    }
    return { clientId: this.clientId, clientSecret: this.clientSecret }
  }
}
