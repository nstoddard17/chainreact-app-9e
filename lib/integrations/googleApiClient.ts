import { TokenRefreshService } from "./tokenRefreshService"
import { createAdminClient } from "@/lib/supabase/admin"

/**
 * Google API client with automatic token refresh
 */
export class GoogleApiClient {
  constructor(private userId: string) {}

  /**
   * Get a valid access token with automatic refresh
   */
  private async getValidAccessToken(): Promise<string> {
    const supabase = createAdminClient()
    
    // Get the user's Google integration
    const { data: integration, error } = await supabase
      .from("integrations")
      .select("*")
      .eq("user_id", this.userId)
      .eq("provider", "google")
      .single()

    if (error || !integration) {
      throw new Error("Google integration not found")
    }

    // Check if token needs refresh
    const shouldRefresh = TokenRefreshService.shouldRefreshToken(integration, {
      accessTokenExpiryThreshold: 5 // Refresh if expiring within 5 minutes
    })

    if (shouldRefresh.shouldRefresh && integration.refresh_token) {
      const refreshResult = await TokenRefreshService.refreshTokenForProvider(
        integration.provider,
        integration.refresh_token,
        integration
      )

      if (refreshResult.success && refreshResult.accessToken) {
        return refreshResult.accessToken
      } else {
        throw new Error("Failed to refresh Google token")
      }
    }

    return integration.access_token
  }

  /**
   * Get user profile information
   */
  async getUserInfo() {
    const accessToken = await this.getValidAccessToken()
    
    const response = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    })

    if (!response.ok) {
      throw new Error(`Failed to get user info: ${response.status} ${response.statusText}`)
    }

    return response.json()
  }

  /**
   * List Google Drive files
   */
  async listDriveFiles(pageSize = 10) {
    const accessToken = await this.getValidAccessToken()
    
    const response = await fetch(`https://www.googleapis.com/drive/v3/files?pageSize=${pageSize}`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    })

    if (!response.ok) {
      throw new Error(`Failed to list Drive files: ${response.status} ${response.statusText}`)
    }

    return response.json()
  }

  /**
   * Send Gmail message
   */
  async sendEmail(to: string, subject: string, body: string) {
    const accessToken = await this.getValidAccessToken()
    
    const email = [`To: ${to}`, `Subject: ${subject}`, "", body].join("\n")
    const encodedEmail = Buffer.from(email).toString("base64url")

    const response = await fetch("https://www.googleapis.com/gmail/v1/users/me/messages/send", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        raw: encodedEmail,
      }),
    })

    if (!response.ok) {
      throw new Error(`Failed to send email: ${response.status} ${response.statusText}`)
    }

    return response.json()
  }

  /**
   * List Google Calendar events
   */
  async listCalendarEvents(calendarId = "primary", maxResults = 10) {
    const accessToken = await this.getValidAccessToken()
    
    const response = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/${calendarId}/events?maxResults=${maxResults}`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      },
    )

    if (!response.ok) {
      throw new Error(`Failed to list calendar events: ${response.status} ${response.statusText}`)
    }

    return response.json()
  }
}
