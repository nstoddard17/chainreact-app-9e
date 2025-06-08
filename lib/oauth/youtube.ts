import { generateOAuthState } from "@/lib/oauth/utils"

export const YouTubeOAuthService = {
  getClientCredentials() {
    // Try YouTube-specific credentials first, fall back to Google credentials
    const clientId = process.env.NEXT_PUBLIC_YOUTUBE_CLIENT_ID || process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID
    const clientSecret = process.env.YOUTUBE_CLIENT_SECRET || process.env.GOOGLE_CLIENT_SECRET

    if (!clientId || !clientSecret) {
      throw new Error("Missing YouTube/Google OAuth credentials")
    }

    return { clientId, clientSecret }
  },

  getRedirectUri() {
    return "/api/integrations/youtube/callback"
  },

  generateAuthUrl(baseUrl: string, reconnect = false, integrationId?: string, userId?: string): string {
    if (!userId) {
      throw new Error("User ID is required for YouTube OAuth")
    }

    const { clientId } = this.getClientCredentials()
    const redirectUri = `${baseUrl}${this.getRedirectUri()}`

    // YouTube-specific scopes
    const scopes = [
      "https://www.googleapis.com/auth/youtube.readonly",
      "https://www.googleapis.com/auth/userinfo.profile",
      "https://www.googleapis.com/auth/userinfo.email",
      //"https://www.googleapis.com/auth/youtube.upload",
      //"https://www.googleapis.com/auth/youtube",
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
    console.log("Generated YouTube auth URL (first 100 chars):", authUrl.substring(0, 100) + "...")

    return authUrl
  },
}
