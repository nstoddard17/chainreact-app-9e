import { generateOAuthState } from "@/lib/oauth/utils"

export class YouTubeOAuthService {
  static getClientCredentials() {
    // Use Google credentials since YouTube is part of Google APIs
    const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET

    if (!clientId || !clientSecret) {
      throw new Error("Missing Google OAuth credentials for YouTube")
    }

    return { clientId, clientSecret }
  }

  static getRedirectUri() {
    return "/api/integrations/youtube/callback"
  }

  static generateAuthUrl(baseUrl: string, reconnect = false, integrationId?: string, userId?: string): string {
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
  }

  static async exchangeCodeForTokens(code: string, redirectUri: string) {
    const { clientId, clientSecret } = this.getClientCredentials()

    const response = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        code,
        grant_type: "authorization_code",
        redirect_uri: redirectUri,
      }),
    })

    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`Token exchange failed: ${response.status} ${response.statusText} - ${errorText}`)
    }

    return response.json()
  }

  static async getUserInfo(accessToken: string) {
    try {
      // Try to get YouTube channel info first
      const channelResponse = await fetch("https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true", {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      })

      if (channelResponse.ok) {
        const channelData = await channelResponse.json()
        const channel = channelData.items?.[0]

        if (channel) {
          return {
            id: channel.id,
            name: channel.snippet?.title,
            email: null, // YouTube API doesn't provide email directly
            avatar: channel.snippet?.thumbnails?.default?.url,
            metadata: {
              channel_id: channel.id,
              channel_title: channel.snippet?.title,
              channel_description: channel.snippet?.description,
              subscriber_count: channel.statistics?.subscriberCount,
              video_count: channel.statistics?.videoCount,
            },
          }
        }
      }

      // Fallback to Google profile if YouTube channel not available
      const profileResponse = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      })

      if (profileResponse.ok) {
        const profileData = await profileResponse.json()
        return {
          id: profileData.id,
          name: profileData.name,
          email: profileData.email,
          avatar: profileData.picture,
          metadata: {
            google_id: profileData.id,
            verified_email: profileData.verified_email,
          },
        }
      }

      throw new Error("Failed to get user info from both YouTube and Google APIs")
    } catch (error) {
      console.error("Error getting YouTube user info:", error)
      throw error
    }
  }

  static async refreshAccessToken(refreshToken: string) {
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
      throw new Error(`Token refresh failed: ${response.status} ${response.statusText} - ${errorText}`)
    }

    return response.json()
  }
}

// Export both class and object for backward compatibility
export const YouTubeOAuthService_Object = {
  generateAuthUrl: YouTubeOAuthService.generateAuthUrl.bind(YouTubeOAuthService),
  getRedirectUri: YouTubeOAuthService.getRedirectUri.bind(YouTubeOAuthService),
}
