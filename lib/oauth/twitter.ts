interface TwitterOAuthResult {
  success: boolean
  redirectUrl: string
  error?: string
}

export class TwitterOAuthService {
  private static getClientCredentials() {
    const clientId = process.env.NEXT_PUBLIC_TWITTER_CLIENT_ID
    const clientSecret = process.env.TWITTER_CLIENT_SECRET

    console.log("🐦 Twitter OAuth Credentials Check:", {
      hasClientId: !!clientId,
      clientIdLength: clientId?.length || 0,
      hasClientSecret: !!clientSecret,
      clientSecretLength: clientSecret?.length || 0,
    })

    if (!clientId || !clientSecret) {
      throw new Error(
        "Missing X (Twitter) OAuth configuration. Please check NEXT_PUBLIC_TWITTER_CLIENT_ID and TWITTER_CLIENT_SECRET environment variables.",
      )
    }

    return { clientId, clientSecret }
  }

  private static generateCodeVerifier(): string {
    const array = new Uint8Array(32)
    if (typeof crypto !== "undefined" && crypto.getRandomValues) {
      crypto.getRandomValues(array)
    } else {
      // Fallback for server-side
      for (let i = 0; i < array.length; i++) {
        array[i] = Math.floor(Math.random() * 256)
      }
    }
    return btoa(String.fromCharCode.apply(null, Array.from(array)))
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=/g, "")
  }

  private static async generateCodeChallenge(verifier: string): Promise<string> {
    if (typeof crypto !== "undefined" && crypto.subtle) {
      const encoder = new TextEncoder()
      const data = encoder.encode(verifier)
      const digest = await crypto.subtle.digest("SHA-256", data)
      return btoa(String.fromCharCode.apply(null, Array.from(new Uint8Array(digest))))
        .replace(/\+/g, "-")
        .replace(/\//g, "_")
        .replace(/=/g, "")
    } else {
      // Fallback - use plain verifier (not recommended for production)
      return verifier
    }
  }

  static async generateAuthUrl(
    baseUrl?: string,
    reconnect = false,
    integrationId?: string,
    userId?: string,
  ): Promise<string> {
    try {
      const { clientId } = this.getClientCredentials()

      // Use the provided baseUrl or get it from utility
      const { getBaseUrl } = await import("@/lib/utils/getBaseUrl")
      const actualBaseUrl = baseUrl || getBaseUrl()
      const redirectUri = `${actualBaseUrl}/api/integrations/twitter/callback`

      console.log(`🐦 Twitter OAuth Configuration:`, {
        clientId: clientId.substring(0, 10) + "...",
        baseUrl: actualBaseUrl,
        redirectUri,
        reconnect,
        integrationId,
        userId,
      })

      // Generate PKCE parameters
      const codeVerifier = this.generateCodeVerifier()
      const codeChallenge = await this.generateCodeChallenge(codeVerifier)

      console.log(`🐦 PKCE Parameters:`, {
        codeVerifierLength: codeVerifier.length,
        codeChallengeLength: codeChallenge.length,
      })

      // Updated scopes for Twitter API v2
      const scopes = ["tweet.read", "tweet.write", "users.read", "offline.access"]

      const state = btoa(
        JSON.stringify({
          provider: "twitter",
          reconnect,
          integrationId,
          userId,
          requireFullScopes: true,
          timestamp: Date.now(),
          codeVerifier, // Store verifier in state for later use
          nonce: Math.random().toString(36).substring(2, 15),
        }),
      )

      const params = new URLSearchParams({
        response_type: "code",
        client_id: clientId,
        redirect_uri: redirectUri,
        scope: scopes.join(" "),
        state,
        code_challenge: codeChallenge,
        code_challenge_method: "S256",
      })

      const authUrl = `https://twitter.com/i/oauth2/authorize?${params.toString()}`

      console.log(`🐦 Twitter Auth URL Parameters:`, {
        response_type: "code",
        client_id: clientId.substring(0, 10) + "...",
        redirect_uri: redirectUri,
        scope: scopes.join(" "),
        code_challenge_method: "S256",
        stateLength: state.length,
        fullUrlLength: authUrl.length,
      })

      return authUrl
    } catch (error: any) {
      console.error("🐦 Error generating Twitter auth URL:", error)
      throw new Error(`Failed to generate Twitter authorization URL: ${error.message}`)
    }
  }

  static async handleCallback(
    code: string,
    state: string,
    baseUrl?: string,
    supabase: any,
    userId: string,
  ): Promise<TwitterOAuthResult> {
    try {
      console.log("🐦 Twitter OAuth Callback Started:", {
        hasCode: !!code,
        codeLength: code?.length || 0,
        hasState: !!state,
        stateLength: state?.length || 0,
        userId,
      })

      const stateData = JSON.parse(atob(state))
      const { provider, reconnect, integrationId, requireFullScopes, codeVerifier } = stateData

      console.log("🐦 Parsed State Data:", {
        provider,
        reconnect,
        integrationId,
        requireFullScopes,
        hasCodeVerifier: !!codeVerifier,
      })

      if (provider !== "twitter") {
        throw new Error("Invalid provider in state")
      }

      if (!codeVerifier) {
        throw new Error("Missing code verifier in state")
      }

      const { clientId, clientSecret } = this.getClientCredentials()

      // Use the provided baseUrl or get it from utility
      const { getBaseUrl } = await import("@/lib/utils/getBaseUrl")
      const actualBaseUrl = baseUrl || getBaseUrl()
      const redirectUri = `${actualBaseUrl}/api/integrations/twitter/callback`

      console.log("🐦 Token Exchange Parameters:", {
        clientId: clientId.substring(0, 10) + "...",
        redirectUri,
        hasCode: !!code,
        hasCodeVerifier: !!codeVerifier,
      })

      // Exchange code for token with proper PKCE
      const tokenResponse = await fetch("https://api.twitter.com/2/oauth2/token", {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Authorization: `Basic ${Buffer.from(clientId + ":" + clientSecret).toString("base64")}`,
        },
        body: new URLSearchParams({
          code,
          grant_type: "authorization_code",
          client_id: clientId,
          redirect_uri: redirectUri,
          code_verifier: codeVerifier,
        }),
      })

      console.log("🐦 Token Response Status:", {
        status: tokenResponse.status,
        statusText: tokenResponse.statusText,
        ok: tokenResponse.ok,
      })

      if (!tokenResponse.ok) {
        const errorText = await tokenResponse.text()
        console.error("🐦 Twitter token exchange failed:", {
          status: tokenResponse.status,
          statusText: tokenResponse.statusText,
          error: errorText,
        })
        throw new Error(`Token exchange failed: ${errorText}`)
      }

      const tokenData = await tokenResponse.json()
      const { access_token, refresh_token, expires_in, scope } = tokenData

      console.log("🐦 Token exchange successful:", {
        hasAccessToken: !!access_token,
        hasRefreshToken: !!refresh_token,
        expiresIn: expires_in,
        scope,
      })

      // Validate scopes if required
      if (requireFullScopes) {
        const grantedScopes = scope ? scope.split(" ") : []
        const requiredScopes = ["tweet.read", "tweet.write", "users.read"]
        const missingScopes = requiredScopes.filter((s) => !grantedScopes.includes(s))

        if (missingScopes.length > 0) {
          console.error("🐦 Twitter scope validation failed:", { grantedScopes, missingScopes })
          return {
            success: false,
            redirectUrl: `${actualBaseUrl}/integrations?error=insufficient_scopes&provider=twitter&message=${encodeURIComponent(
              `Your X connection is missing required permissions: ${missingScopes.join(", ")}. Please reconnect and accept all scopes.`,
            )}`,
            error: "Insufficient scopes",
          }
        }
        console.log("🐦 Twitter scopes validated successfully:", grantedScopes)
      }

      // Get user info
      const userResponse = await fetch("https://api.twitter.com/2/users/me", {
        headers: {
          Authorization: `Bearer ${access_token}`,
        },
      })

      if (!userResponse.ok) {
        const errorText = await userResponse.text()
        console.error("🐦 Twitter user info failed:", errorText)
        throw new Error(`Failed to get user info: ${errorText}`)
      }

      const userData = await userResponse.json()
      const user = userData.data

      if (!user || !user.id) {
        throw new Error("Invalid user data received from Twitter")
      }

      console.log("🐦 Twitter user info retrieved:", {
        userId: user.id,
        username: user.username,
        name: user.name,
      })

      const integrationData = {
        user_id: userId,
        provider: "twitter",
        provider_user_id: user.id,
        access_token,
        refresh_token,
        expires_at: expires_in ? new Date(Date.now() + expires_in * 1000).toISOString() : null,
        status: "connected" as const,
        scopes: scope ? scope.split(" ") : [],
        metadata: {
          username: user.username,
          user_name: user.name,
          connected_at: new Date().toISOString(),
          scopes_validated: requireFullScopes,
          user_id: user.id,
        },
      }

      console.log("🐦 Saving Twitter integration data:", {
        ...integrationData,
        access_token: "***",
        refresh_token: "***",
      })

      if (reconnect && integrationId) {
        const { error } = await supabase
          .from("integrations")
          .update({
            ...integrationData,
            updated_at: new Date().toISOString(),
          })
          .eq("id", integrationId)

        if (error) {
          console.error("🐦 Error updating Twitter integration:", error)
          throw error
        }
      } else {
        // Check if integration already exists
        const { data: existingIntegration } = await supabase
          .from("integrations")
          .select("id")
          .eq("user_id", userId)
          .eq("provider", "twitter")
          .maybeSingle()

        if (existingIntegration) {
          // Update existing integration
          const { error } = await supabase
            .from("integrations")
            .update({
              ...integrationData,
              updated_at: new Date().toISOString(),
            })
            .eq("id", existingIntegration.id)

          if (error) {
            console.error("🐦 Error updating existing Twitter integration:", error)
            throw error
          }
        } else {
          // Create new integration
          const { error } = await supabase.from("integrations").insert({
            ...integrationData,
            created_at: new Date().toISOString(),
          })

          if (error) {
            console.error("🐦 Error inserting Twitter integration:", error)
            throw error
          }
        }
      }

      return {
        success: true,
        redirectUrl: `${actualBaseUrl}/integrations?success=twitter_connected&provider=twitter&scopes_validated=${requireFullScopes}&t=${Date.now()}`,
      }
    } catch (error: any) {
      console.error("🐦 Twitter OAuth callback error:", error)
      const { getBaseUrl } = await import("@/lib/utils/getBaseUrl")
      const actualBaseUrl = baseUrl || getBaseUrl()

      return {
        success: false,
        redirectUrl: `${actualBaseUrl}/integrations?error=callback_failed&provider=twitter&message=${encodeURIComponent(error.message)}`,
        error: error.message,
      }
    }
  }
}
