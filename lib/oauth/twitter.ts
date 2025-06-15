import { getBaseUrl } from "@/lib/utils/getBaseUrl"

interface TwitterOAuthConfig {
  clientId: string
  clientSecret: string
  redirectUri: string
  scopes: string[]
}

interface TwitterTokenResponse {
  access_token: string
  refresh_token?: string
  expires_in?: number
  scope?: string
  token_type: string
}

interface TwitterUser {
  id: string
  username: string
  name: string
  profile_image_url?: string
  verified?: boolean
  public_metrics?: {
    followers_count: number
    following_count: number
    tweet_count: number
  }
}

export class TwitterOAuthService {
  private static getConfig(): TwitterOAuthConfig {
    const clientId = process.env.NEXT_PUBLIC_TWITTER_CLIENT_ID
    const clientSecret = process.env.TWITTER_CLIENT_SECRET

    if (!clientId || !clientSecret) {
      throw new Error("Twitter OAuth credentials not configured. Please check environment variables.")
    }

    return {
      clientId,
      clientSecret,
      redirectUri: `${getBaseUrl()}/api/integrations/twitter/callback`,
      scopes: ["tweet.read", "tweet.write", "users.read", "follows.read", "follows.write", "offline.access"],
    }
  }

  static generateAuthUrl(userId: string): string {
    try {
      const config = this.getConfig()

      console.log("🐦 Generating Twitter OAuth URL:", {
        clientId: config.clientId.substring(0, 10) + "...",
        redirectUri: config.redirectUri,
        scopes: config.scopes,
      })

      // Generate secure state parameter
      const state = btoa(
        JSON.stringify({
          provider: "twitter",
          userId,
          timestamp: Date.now(),
          nonce: Math.random().toString(36).substring(2, 15),
        }),
      )

      const params = new URLSearchParams({
        response_type: "code",
        client_id: config.clientId,
        redirect_uri: config.redirectUri,
        scope: config.scopes.join(" "),
        state,
        code_challenge: "challenge", // Simple PKCE for now
        code_challenge_method: "plain",
      })

      const authUrl = `https://twitter.com/i/oauth2/authorize?${params.toString()}`

      console.log("🐦 Generated auth URL:", authUrl.substring(0, 100) + "...")
      return authUrl
    } catch (error: any) {
      console.error("🐦 Error generating Twitter auth URL:", error)
      throw new Error(`Failed to generate Twitter authorization URL: ${error.message}`)
    }
  }

  static async exchangeCodeForTokens(code: string, redirectUri: string): Promise<TwitterTokenResponse> {
    try {
      const config = this.getConfig()

      console.log("🐦 Exchanging code for tokens:", {
        hasCode: !!code,
        redirectUri,
        clientId: config.clientId.substring(0, 10) + "...",
      })

      const response = await fetch("https://api.twitter.com/2/oauth2/token", {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Authorization: `Basic ${Buffer.from(`${config.clientId}:${config.clientSecret}`).toString("base64")}`,
        },
        body: new URLSearchParams({
          grant_type: "authorization_code",
          code,
          redirect_uri: redirectUri,
          client_id: config.clientId,
          code_verifier: "challenge", // Match the challenge from auth URL
        }),
      })

      if (!response.ok) {
        const errorText = await response.text()
        console.error("🐦 Token exchange failed:", {
          status: response.status,
          statusText: response.statusText,
          error: errorText,
        })
        throw new Error(`Twitter token exchange failed: ${response.status} ${errorText}`)
      }

      const tokenData = await response.json()
      console.log("🐦 Token exchange successful:", {
        hasAccessToken: !!tokenData.access_token,
        hasRefreshToken: !!tokenData.refresh_token,
        expiresIn: tokenData.expires_in,
        scope: tokenData.scope,
      })

      return tokenData
    } catch (error: any) {
      console.error("🐦 Token exchange error:", error)
      throw error
    }
  }

  static async getUserInfo(accessToken: string): Promise<TwitterUser> {
    try {
      console.log("🐦 Fetching Twitter user info...")

      const response = await fetch(
        "https://api.twitter.com/2/users/me?user.fields=profile_image_url,verified,public_metrics",
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        },
      )

      if (!response.ok) {
        const errorText = await response.text()
        console.error("🐦 User info fetch failed:", {
          status: response.status,
          statusText: response.statusText,
          error: errorText,
        })
        throw new Error(`Failed to fetch Twitter user info: ${response.status} ${errorText}`)
      }

      const userData = await response.json()
      const user = userData.data

      if (!user || !user.id) {
        throw new Error("Invalid user data received from Twitter")
      }

      console.log("🐦 Twitter user info retrieved:", {
        id: user.id,
        username: user.username,
        name: user.name,
        verified: user.verified,
      })

      return user
    } catch (error: any) {
      console.error("🐦 User info error:", error)
      throw error
    }
  }

  static async refreshToken(refreshToken: string): Promise<TwitterTokenResponse> {
    try {
      const config = this.getConfig()

      console.log("🐦 Refreshing Twitter token...")

      const response = await fetch("https://api.twitter.com/2/oauth2/token", {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Authorization: `Basic ${Buffer.from(`${config.clientId}:${config.clientSecret}`).toString("base64")}`,
        },
        body: new URLSearchParams({
          grant_type: "refresh_token",
          refresh_token: refreshToken,
          client_id: config.clientId,
        }),
      })

      if (!response.ok) {
        const errorText = await response.text()
        console.error("🐦 Token refresh failed:", {
          status: response.status,
          error: errorText,
        })
        throw new Error(`Twitter token refresh failed: ${response.status} ${errorText}`)
      }

      const tokenData = await response.json()
      console.log("🐦 Token refresh successful")

      return tokenData
    } catch (error: any) {
      console.error("🐦 Token refresh error:", error)
      throw error
    }
  }
}
