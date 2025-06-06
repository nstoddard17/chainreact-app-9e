import { generateOAuthState, parseOAuthState, upsertIntegration, createAdminSupabaseClient } from "./utils"

interface FacebookOAuthResult {
  success: boolean
  redirectUrl: string
  error?: string
}

export class FacebookOAuthService {
  private static getClientCredentials() {
    const clientId = process.env.NEXT_PUBLIC_FACEBOOK_CLIENT_ID
    const clientSecret = process.env.FACEBOOK_CLIENT_SECRET

    if (!clientId || !clientSecret) {
      throw new Error("Missing Facebook OAuth configuration")
    }

    return { clientId, clientSecret }
  }

  // Define required scopes for Facebook
  static getRequiredScopes() {
    return ["public_profile", "email", "pages_show_list", "pages_manage_posts", "pages_read_engagement"]
  }

  // Validate scopes against required scopes
  static validateScopes(grantedScopes: string[]): { valid: boolean; missing: string[] } {
    const requiredScopes = this.getRequiredScopes()
    const missing = requiredScopes.filter((scope) => !grantedScopes.includes(scope))
    return {
      valid: missing.length === 0,
      missing,
    }
  }

  // Validate token by making an API call
  static async validateToken(accessToken: string): Promise<boolean> {
    try {
      const response = await fetch(`https://graph.facebook.com/me?access_token=${accessToken}`)
      return response.ok
    } catch (error) {
      console.error("Facebook token validation error:", error)
      return false
    }
  }

  static generateAuthUrl(baseUrl: string, reconnect = false, integrationId?: string, userId?: string): string {
    const { clientId } = this.getClientCredentials()
    const redirectUri = `${baseUrl}/api/integrations/facebook/callback`

    const scopes = [
      "public_profile",
      "email",
      "pages_show_list",
      "pages_manage_posts",
      "pages_read_engagement",
      "pages_manage_metadata",
    ]

    // Generate proper OAuth state with user ID
    const state = generateOAuthState("facebook", userId || "anonymous", {
      reconnect,
      integrationId,
    })

    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      scope: scopes.join(","),
      response_type: "code",
      state,
    })

    return `https://www.facebook.com/v18.0/dialog/oauth?${params.toString()}`
  }

  static getRedirectUri(baseUrl: string): string {
    return `${baseUrl}/api/integrations/facebook/callback`
  }

  static async handleCallback(code: string, state: string, baseUrl: string): Promise<FacebookOAuthResult> {
    try {
      // Parse state properly using the utility function
      const stateData = parseOAuthState(state)
      const { provider, userId, reconnect, integrationId } = stateData

      if (provider !== "facebook") {
        throw new Error("Invalid provider in state")
      }

      const { clientId, clientSecret } = this.getClientCredentials()
      const redirectUri = `${baseUrl}/api/integrations/facebook/callback`

      // Exchange code for token
      const tokenResponse = await fetch("https://graph.facebook.com/v18.0/oauth/access_token", {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          client_id: clientId,
          client_secret: clientSecret,
          redirect_uri: redirectUri,
          code,
        }),
      })

      if (!tokenResponse.ok) {
        const errorData = await tokenResponse.text()
        console.error("Facebook token exchange failed:", errorData)
        throw new Error(`Token exchange failed: ${errorData}`)
      }

      const tokenData = await tokenResponse.json()
      const { access_token, expires_in } = tokenData

      if (!access_token) {
        throw new Error("No access token received from Facebook")
      }

      // Get user info first to get the user ID
      const userResponse = await fetch(
        `https://graph.facebook.com/me?fields=id,name,email&access_token=${access_token}`,
      )

      if (!userResponse.ok) {
        const errorData = await userResponse.text()
        throw new Error(`Failed to get user info: ${errorData}`)
      }

      const userData = await userResponse.json()

      // Get granted scopes from permissions endpoint
      const permissionsResponse = await fetch(
        `https://graph.facebook.com/${userData.id}/permissions?access_token=${access_token}`,
      )

      let grantedScopes: string[] = []
      if (permissionsResponse.ok) {
        const permissionsData = await permissionsResponse.json()
        grantedScopes =
          permissionsData.data?.filter((perm: any) => perm.status === "granted")?.map((perm: any) => perm.permission) ||
          []
      } else {
        // Fallback to basic scopes if we can't get permissions
        grantedScopes = ["public_profile", "email"]
      }

      console.log("Facebook granted scopes:", grantedScopes)

      // Validate token by making an API call
      const isTokenValid = await this.validateToken(access_token)
      if (!isTokenValid) {
        return {
          success: false,
          redirectUrl: `${baseUrl}/integrations?error=invalid_token&provider=facebook`,
        }
      }

      // Get Supabase admin client
      const supabase = createAdminSupabaseClient()
      if (!supabase) {
        throw new Error("Failed to create Supabase admin client")
      }

      // Get the actual user ID from the session if available
      const effectiveUserId = userId

      // If we don't have a user ID from state, this is an error
      if (!effectiveUserId || effectiveUserId === "anonymous") {
        throw new Error("No valid user ID found in OAuth state")
      }

      // Prepare integration data
      const integrationData = {
        user_id: effectiveUserId,
        provider: "facebook",
        provider_user_id: userData.id,
        access_token,
        expires_at: expires_in ? new Date(Date.now() + expires_in * 1000).toISOString() : null,
        status: "connected" as const,
        scopes: grantedScopes,
        metadata: {
          user_name: userData.name,
          user_email: userData.email,
          connected_at: new Date().toISOString(),
          facebook_user_id: userData.id,
        },
      }

      // Use the utility function to upsert the integration
      await upsertIntegration(supabase, integrationData)

      console.log(`Successfully connected Facebook integration for user ${effectiveUserId}`)

      return {
        success: true,
        redirectUrl: `${baseUrl}/integrations?success=facebook_connected&provider=facebook`,
      }
    } catch (error: any) {
      console.error("Facebook OAuth error:", error)
      return {
        success: false,
        redirectUrl: `${baseUrl}/integrations?error=callback_failed&provider=facebook&message=${encodeURIComponent(error.message)}`,
        error: error.message,
      }
    }
  }
}
