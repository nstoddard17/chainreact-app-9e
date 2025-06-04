import { createServerComponentClient } from "@supabase/auth-helpers-nextjs"
import { cookies } from "next/headers"

interface TikTokOAuthResult {
  success: boolean
  redirectUrl: string
  error?: string
}

export class TikTokOAuthService {
  private static getClientCredentials() {
    const clientId = process.env.NEXT_PUBLIC_TIKTOK_CLIENT_ID
    const clientSecret = process.env.TIKTOK_CLIENT_SECRET

    if (!clientId || !clientSecret) {
      throw new Error("Missing TikTok OAuth configuration")
    }

    return { clientId, clientSecret }
  }

  // Define required scopes for TikTok
  static getRequiredScopes() {
    return ["user.info.basic", "video.upload", "video.list", "comment.list", "comment.create"]
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
  static async validateToken(accessToken: string, openId: string): Promise<boolean> {
    try {
      const response = await fetch("https://open-api.tiktok.com/user/info/", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          access_token: accessToken,
          open_id: openId,
          fields: ["open_id", "union_id", "avatar_url", "display_name"],
        }),
      })
      return response.ok
    } catch (error) {
      console.error("TikTok token validation error:", error)
      return false
    }
  }

  static async handleCallback(code: string, state: string, baseUrl: string): Promise<TikTokOAuthResult> {
    try {
      const stateData = JSON.parse(atob(state))
      const { provider, reconnect, integrationId } = stateData

      if (provider !== "tiktok") {
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

      const tokenResponse = await fetch("https://open-api.tiktok.com/oauth/access_token/", {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          client_key: clientId,
          client_secret: clientSecret,
          code,
          grant_type: "authorization_code",
          redirect_uri: "https://chainreact.app/api/integrations/tiktok/callback",
        }),
      })

      if (!tokenResponse.ok) {
        const errorData = await tokenResponse.text()
        throw new Error(`Token exchange failed: ${errorData}`)
      }

      const tokenData = await tokenResponse.json()
      const { access_token, expires_in, open_id, scope } = tokenData.data

      // Get granted scopes from the token data
      const grantedScopes = scope ? scope.split(",") : ["user.info.basic", "video.upload"]

      // Validate scopes
      const scopeValidation = this.validateScopes(grantedScopes)

      if (!scopeValidation.valid) {
        return {
          success: false,
          redirectUrl: `${baseUrl}/integrations?error=insufficient_scopes&provider=tiktok&missing=${scopeValidation.missing.join(",")}`,
        }
      }

      // Validate token by making an API call
      const isTokenValid = await this.validateToken(access_token, open_id)
      if (!isTokenValid) {
        return {
          success: false,
          redirectUrl: `${baseUrl}/integrations?error=invalid_token&provider=tiktok`,
        }
      }

      const userResponse = await fetch("https://open-api.tiktok.com/user/info/", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${access_token}`,
        },
        body: JSON.stringify({
          access_token,
          open_id,
          fields: ["open_id", "union_id", "avatar_url", "display_name"],
        }),
      })

      if (!userResponse.ok) {
        const errorData = await userResponse.text()
        throw new Error(`Failed to get user info: ${errorData}`)
      }

      const userData = await userResponse.json()
      const user = userData.data.user

      const supabase = createServerComponentClient({ cookies })
      const { data: sessionData, error: sessionError } = await supabase.auth.getSession()

      if (sessionError || !sessionData?.session) {
        throw new Error("No active user session found")
      }

      const integrationData = {
        user_id: sessionData.session.user.id,
        provider: "tiktok",
        provider_user_id: user.open_id,
        access_token,
        expires_at: expires_in ? new Date(Date.now() + expires_in * 1000).toISOString() : null,
        status: "connected" as const,
        scopes: grantedScopes,
        metadata: {
          open_id: user.open_id,
          union_id: user.union_id,
          display_name: user.display_name,
          avatar_url: user.avatar_url,
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
        redirectUrl: `${baseUrl}/integrations?success=tiktok_connected`,
      }
    } catch (error: any) {
      return {
        success: false,
        redirectUrl: `${baseUrl}/integrations?error=callback_failed&provider=tiktok&message=${encodeURIComponent(error.message)}`,
        error: error.message,
      }
    }
  }
}
