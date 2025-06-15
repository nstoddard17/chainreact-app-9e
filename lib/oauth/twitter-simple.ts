import { getBaseUrl } from "@/lib/utils/getBaseUrl"

interface TwitterAuthConfig {
  clientId: string
  clientSecret: string
  redirectUri: string
  scopes: string[]
}

interface TwitterOAuthResult {
  success: boolean
  redirectUrl: string
  error?: string
  details?: any
}

export class SimpleTwitterOAuth {
  private static getConfig(): TwitterAuthConfig {
    const clientId = process.env.NEXT_PUBLIC_TWITTER_CLIENT_ID
    const clientSecret = process.env.TWITTER_CLIENT_SECRET
    const baseUrl = getBaseUrl()

    if (!clientId || !clientSecret) {
      throw new Error("Twitter OAuth credentials not configured")
    }

    return {
      clientId,
      clientSecret,
      redirectUri: `${baseUrl}/api/integrations/twitter/callback`,
      scopes: ["tweet.read", "users.read", "offline.access"], // Simplified scopes
    }
  }

  static generateAuthUrl(userId: string): string {
    try {
      const config = this.getConfig()

      console.log("🐦 Twitter OAuth Config:", {
        clientId: config.clientId.substring(0, 10) + "...",
        redirectUri: config.redirectUri,
        scopes: config.scopes,
      })

      // Simple state without PKCE for testing
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
      })

      const authUrl = `https://twitter.com/i/oauth2/authorize?${params.toString()}`

      console.log("🐦 Generated Twitter Auth URL:", {
        url: authUrl.substring(0, 100) + "...",
        params: Object.fromEntries(params),
      })

      return authUrl
    } catch (error: any) {
      console.error("🐦 Error generating Twitter auth URL:", error)
      throw error
    }
  }

  static async handleCallback(code: string, state: string, supabase: any): Promise<TwitterOAuthResult> {
    try {
      console.log("🐦 Twitter callback started:", {
        hasCode: !!code,
        codeLength: code?.length,
        hasState: !!state,
      })

      if (!code || !state) {
        throw new Error("Missing authorization code or state")
      }

      // Parse state
      let stateData
      try {
        stateData = JSON.parse(atob(state))
      } catch (e) {
        throw new Error("Invalid state parameter")
      }

      const { userId } = stateData
      if (!userId) {
        throw new Error("Missing user ID in state")
      }

      const config = this.getConfig()

      console.log("🐦 Exchanging code for token:", {
        clientId: config.clientId.substring(0, 10) + "...",
        redirectUri: config.redirectUri,
        hasCode: !!code,
      })

      // Exchange code for token
      const tokenResponse = await fetch("https://api.twitter.com/2/oauth2/token", {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Authorization: `Basic ${Buffer.from(`${config.clientId}:${config.clientSecret}`).toString("base64")}`,
        },
        body: new URLSearchParams({
          grant_type: "authorization_code",
          code,
          redirect_uri: config.redirectUri,
          client_id: config.clientId,
        }),
      })

      console.log("🐦 Token response:", {
        status: tokenResponse.status,
        statusText: tokenResponse.statusText,
        ok: tokenResponse.ok,
      })

      if (!tokenResponse.ok) {
        const errorText = await tokenResponse.text()
        console.error("🐦 Token exchange failed:", {
          status: tokenResponse.status,
          error: errorText,
        })
        throw new Error(`Token exchange failed: ${errorText}`)
      }

      const tokenData = await tokenResponse.json()
      console.log("🐦 Token data received:", {
        hasAccessToken: !!tokenData.access_token,
        hasRefreshToken: !!tokenData.refresh_token,
        scope: tokenData.scope,
      })

      // Get user info
      const userResponse = await fetch("https://api.twitter.com/2/users/me", {
        headers: {
          Authorization: `Bearer ${tokenData.access_token}`,
        },
      })

      if (!userResponse.ok) {
        const errorText = await userResponse.text()
        console.error("🐦 User info failed:", errorText)
        throw new Error(`Failed to get user info: ${errorText}`)
      }

      const userData = await userResponse.json()
      const twitterUser = userData.data

      console.log("🐦 Twitter user:", {
        id: twitterUser.id,
        username: twitterUser.username,
        name: twitterUser.name,
      })

      // Save integration
      const integrationData = {
        user_id: userId,
        provider: "twitter",
        provider_user_id: twitterUser.id,
        access_token: tokenData.access_token,
        refresh_token: tokenData.refresh_token,
        expires_at: tokenData.expires_in ? new Date(Date.now() + tokenData.expires_in * 1000).toISOString() : null,
        status: "connected" as const,
        scopes: tokenData.scope ? tokenData.scope.split(" ") : [],
        metadata: {
          username: twitterUser.username,
          user_name: twitterUser.name,
          connected_at: new Date().toISOString(),
        },
      }

      // Check for existing integration
      const { data: existing } = await supabase
        .from("integrations")
        .select("id")
        .eq("user_id", userId)
        .eq("provider", "twitter")
        .maybeSingle()

      if (existing) {
        const { error } = await supabase
          .from("integrations")
          .update({ ...integrationData, updated_at: new Date().toISOString() })
          .eq("id", existing.id)

        if (error) throw error
      } else {
        const { error } = await supabase
          .from("integrations")
          .insert({ ...integrationData, created_at: new Date().toISOString() })

        if (error) throw error
      }

      const baseUrl = getBaseUrl()
      return {
        success: true,
        redirectUrl: `${baseUrl}/integrations?success=twitter&t=${Date.now()}`,
      }
    } catch (error: any) {
      console.error("🐦 Twitter callback error:", error)
      const baseUrl = getBaseUrl()
      return {
        success: false,
        redirectUrl: `${baseUrl}/integrations?error=${encodeURIComponent(error.message)}&provider=twitter`,
        error: error.message,
      }
    }
  }
}

// Export for compatibility with existing imports
export const TwitterOAuthService = SimpleTwitterOAuth
