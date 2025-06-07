import { generateOAuthState } from "@/lib/oauth/state"

export class YouTubeOAuthService {
  static getClientCredentials() {
    const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET

    if (!clientId || !clientSecret) {
      throw new Error("Missing YouTube/Google OAuth configuration")
    }

    return { clientId, clientSecret }
  }

  static getRedirectUri(baseUrl: string) {
    return `${baseUrl}/api/integrations/youtube/callback`
  }

  static generateAuthUrl(baseUrl: string, reconnect = false, integrationId?: string, userId?: string): string {
    if (!userId) {
      throw new Error("User ID is required for YouTube OAuth")
    }

    const { clientId } = this.getClientCredentials()
    const redirectUri = this.getRedirectUri(baseUrl)

    // YouTube-specific scopes (using Google OAuth)
    const scopes = [
      "https://www.googleapis.com/auth/youtube.readonly",
      "https://www.googleapis.com/auth/userinfo.profile",
      "https://www.googleapis.com/auth/userinfo.email",
      "https://www.googleapis.com/auth/youtube.upload",
    ]

    const state = generateOAuthState("youtube", userId, { reconnect, integrationId })

    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: "code",
      scope: scopes.join(" "),
      access_type: "offline",
      prompt: reconnect ? "consent" : "select_account",
      state,
    })

    const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`
    console.log("Generated YouTube auth URL:", authUrl.substring(0, 100) + "...")

    return authUrl
  }

  static async getToken(code: string, baseUrl: string) {
    const { clientId, clientSecret } = this.getClientCredentials()
    const redirectUri = this.getRedirectUri(baseUrl)

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

// Keep the old export for backward compatibility
export const YoutubeOAuth = YouTubeOAuthService
