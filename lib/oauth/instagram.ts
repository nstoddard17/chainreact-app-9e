import { createServerComponentClient } from "@supabase/auth-helpers-nextjs"
import { cookies } from "next/headers"

interface InstagramOAuthResult {
  success: boolean
  redirectUrl: string
  error?: string
}

export class InstagramOAuthService {
  private static getClientCredentials() {
    const clientId = process.env.NEXT_PUBLIC_FACEBOOK_CLIENT_ID
    const clientSecret = process.env.FACEBOOK_CLIENT_SECRET

    if (!clientId || !clientSecret) {
      throw new Error("Missing Instagram OAuth configuration")
    }

    return { clientId, clientSecret }
  }

  // Define required scopes for Instagram
  static getRequiredScopes() {
    return ["instagram_basic", "instagram_content_publish", "pages_show_list", "pages_read_engagement"]
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
      const response = await fetch(`https://graph.instagram.com/me?access_token=${accessToken}`)
      return response.ok
    } catch (error) {
      console.error("Instagram token validation error:", error)
      return false
    }
  }

  static async handleCallback(code: string, state: string, baseUrl: string): Promise<InstagramOAuthResult> {
    try {
      const stateData = JSON.parse(atob(state))
      const { provider, reconnect, integrationId } = stateData

      if (provider !== "instagram") {
        throw new Error("Invalid provider in state")
      }

      const { clientId, clientSecret } = this.getClientCredentials()

      // Clear any existing tokens before requesting new ones
      if (reconnect && integrationId) {
        const supabase = createServerComponentClient({ cookies })
        const { error: clearError } = await supabase
          .from("integrations")
          .update({
            access_token: null,
            refresh_token: null,
            status: "reconnecting",
          })
          .eq("id", integrationId)

        if (clearError) {
          console.error("Error clearing existing tokens:", clearError)
        }
      }

      const tokenResponse = await fetch("https://graph.facebook.com/v18.0/oauth/access_token", {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          client_id: clientId,
          client_secret: clientSecret,
          redirect_uri: "https://chainreact.app/api/integrations/instagram/callback",
          code,
        }),
      })

      if (!tokenResponse.ok) {
        const errorData = await tokenResponse.text()
        throw new Error(`Token exchange failed: ${errorData}`)
      }

      const tokenData = await tokenResponse.json()
      const { access_token, expires_in } = tokenData

      // Get granted scopes from a debug token call
      const debugTokenResponse = await fetch(
        `https://graph.facebook.com/debug_token?input_token=${access_token}&access_token=${access_token}`,
      )

      let grantedScopes: string[] = []
      if (debugTokenResponse.ok) {
        const debugData = await debugTokenResponse.json()
        grantedScopes = debugData.data?.scopes || []
      } else {
        // Fallback to default scopes if we can't get them from the debug token
        grantedScopes = ["instagram_basic", "instagram_content_publish"]
      }

      // Validate scopes
      const scopeValidation = this.validateScopes(grantedScopes)

      if (!scopeValidation.valid) {
        return {
          success: false,
          redirectUrl: `${baseUrl}/integrations?error=insufficient_scopes&provider=instagram&missing=${scopeValidation.missing.join(",")}`,
        }
      }

      // Validate token by making an API call
      const isTokenValid = await this.validateToken(access_token)
      if (!isTokenValid) {
        return {
          success: false,
          redirectUrl: `${baseUrl}/integrations?error=invalid_token&provider=instagram`,
        }
      }

      const userResponse = await fetch(`https://graph.instagram.com/me?fields=id,username&access_token=${access_token}`)

      if (!userResponse.ok) {
        const errorData = await userResponse.text()
        throw new Error(`Failed to get user info: ${errorData}`)
      }

      const userData = await userResponse.json()

      const supabase = createServerComponentClient({ cookies })
      const { data: sessionData, error: sessionError } = await supabase.auth.getSession()

      if (sessionError || !sessionData?.session) {
        throw new Error("No active user session found")
      }

      const integrationData = {
        user_id: sessionData.session.user.id,
        provider: "instagram",
        provider_user_id: userData.id,
        access_token,
        expires_at: expires_in ? new Date(Date.now() + expires_in * 1000).toISOString() : null,
        status: "connected" as const,
        scopes: grantedScopes,
        metadata: {
          username: userData.username,
          connected_at: new Date().toISOString(),
        },
      }

      if (reconnect && integrationId) {
        const { error } = await supabase
          .from("integrations")
          .update({
            ...integrationData,
            updated_at: new Date().toISOString(),
          })
          .eq("id", integrationId)

        if (error) throw error
      } else {
        const { error } = await supabase.from("integrations").insert(integrationData)
        if (error) throw error
      }

      return {
        success: true,
        redirectUrl: `${baseUrl}/integrations?success=instagram_connected`,
      }
    } catch (error: any) {
      return {
        success: false,
        redirectUrl: `${baseUrl}/integrations?error=callback_failed&provider=instagram&message=${encodeURIComponent(error.message)}`,
        error: error.message,
      }
    }
  }
}
