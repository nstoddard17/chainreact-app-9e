import { generateOAuthState } from "@/lib/oauth/utils"

export class YouTubeOAuthService {
  private static getClientCredentials() {
    // Use Google credentials since YouTube is part of Google APIs
    const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET

    if (!clientId || !clientSecret) {
      throw new Error("Missing Google OAuth credentials for YouTube")
    }

    return { clientId, clientSecret }
  }

  static generateAuthUrl(baseUrl: string, reconnect = false, integrationId?: string, userId?: string): string {
    if (!userId) {
      throw new Error("User ID is required for YouTube OAuth")
    }

    const { clientId } = this.getClientCredentials()
    const redirectUri = `${baseUrl}/api/integrations/youtube/callback`

    // YouTube-specific scopes
    const scopes = [
      "https://www.googleapis.com/auth/youtube.readonly",
      "https://www.googleapis.com/auth/userinfo.profile",
      "https://www.googleapis.com/auth/userinfo.email",
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

    return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`
  }

  static getRedirectUri(): string {
    return "/api/integrations/youtube/callback"
  }
}

// Export object for compatibility with index.ts
export const YouTubeOAuthService_Object = {
  generateAuthUrl: YouTubeOAuthService.generateAuthUrl.bind(YouTubeOAuthService),
  getRedirectUri: YouTubeOAuthService.getRedirectUri.bind(YouTubeOAuthService),
}
