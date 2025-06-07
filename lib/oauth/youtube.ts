import { generateOAuthState } from "@/lib/oauth/state"

export class YoutubeOAuth {
  static getClientCredentials() {
    const clientId = process.env.YOUTUBE_CLIENT_ID
    const clientSecret = process.env.YOUTUBE_CLIENT_SECRET

    if (!clientId || !clientSecret) {
      throw new Error("Missing YouTube client ID or secret")
    }

    return { clientId, clientSecret }
  }

  static getRedirectUri() {
    const redirectUri = process.env.YOUTUBE_REDIRECT_URI

    if (!redirectUri) {
      throw new Error("Missing YouTube redirect URI")
    }

    return redirectUri
  }

  static generateAuthUrl(baseUrl: string, reconnect = false, integrationId?: string, userId?: string): string {
    const { clientId } = this.getClientCredentials()
    const redirectUri = this.getRedirectUri()

    // YouTube-specific scopes
    const scopes = [
      "https://www.googleapis.com/auth/youtube.readonly",
      "https://www.googleapis.com/auth/userinfo.profile",
      "https://www.googleapis.com/auth/userinfo.email",
      "https://www.googleapis.com/auth/youtube.upload",
    ]

    const state = userId ? generateOAuthState("youtube", userId, { reconnect, integrationId }) : ""

    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: "code",
      scope: scopes.join(" "),
      access_type: "offline",
      prompt: reconnect ? "consent" : "select_account",
      ...(state && { state }),
    })

    return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`
  }

  static async getToken(code: string) {
    const { clientId, clientSecret } = this.getClientCredentials()
    const redirectUri = this.getRedirectUri()

    const params = new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      code: code,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    })

    const response = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: params.toString(),
    })

    const data = await response.json()

    if (!response.ok) {
      console.error("YouTube token exchange error:", data)
      throw new Error(data.error_description || "Failed to exchange code for token")
    }

    return data
  }

  static async refreshToken(refreshToken: string) {
    const { clientId, clientSecret } = this.getClientCredentials()

    const params = new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    })

    const response = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: params.toString(),
    })

    const data = await response.json()

    if (!response.ok) {
      console.error("YouTube token refresh error:", data)
      throw new Error(data.error_description || "Failed to refresh token")
    }

    return data
  }
}
