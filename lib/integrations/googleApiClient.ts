import { withAutoRefresh } from "./autoTokenRefresh"

/**
 * Google API client with automatic token refresh
 */
export class GoogleApiClient {
  constructor(private userId: string) {}

  /**
   * Get user profile information
   */
  async getUserInfo() {
    return withAutoRefresh(this.userId, "google", async (accessToken) => {
      const response = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      })

      if (!response.ok) {
        throw new Error(`Failed to get user info: ${response.status} ${response.statusText}`)
      }

      return response.json()
    })
  }

  /**
   * List Google Drive files
   */
  async listDriveFiles(pageSize = 10) {
    return withAutoRefresh(this.userId, "google", async (accessToken) => {
      const response = await fetch(`https://www.googleapis.com/drive/v3/files?pageSize=${pageSize}`, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      })

      if (!response.ok) {
        throw new Error(`Failed to list Drive files: ${response.status} ${response.statusText}`)
      }

      return response.json()
    })
  }

  /**
   * Send Gmail message
   */
  async sendEmail(to: string, subject: string, body: string) {
    return withAutoRefresh(this.userId, "google", async (accessToken) => {
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
    })
  }

  /**
   * List Google Calendar events
   */
  async listCalendarEvents(calendarId = "primary", maxResults = 10) {
    return withAutoRefresh(this.userId, "google", async (accessToken) => {
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
    })
  }
}
