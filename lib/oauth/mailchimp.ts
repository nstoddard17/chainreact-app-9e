import { createServerComponentClient } from "@supabase/auth-helpers-nextjs"
import { cookies } from "next/headers"

interface MailchimpOAuthResult {
  success: boolean
  redirectUrl: string
  error?: string
}

export class MailchimpOAuthService {
  private static getClientCredentials() {
    const clientId = process.env.NEXT_PUBLIC_MAILCHIMP_CLIENT_ID
    const clientSecret = process.env.MAILCHIMP_CLIENT_SECRET

    if (!clientId || !clientSecret) {
      throw new Error("Missing Mailchimp OAuth configuration")
    }

    return { clientId, clientSecret }
  }

  // Updated to use Mailchimp's actual available scopes
  static getRequiredScopes() {
    // Mailchimp doesn't use granular scopes like other providers
    // The main scope is just access to the account
    return []
  }

  // Validate scopes against required scopes
  static validateScopes(grantedScopes: string[]): { valid: boolean; missing: string[] } {
    // For Mailchimp, we don't validate specific scopes since they don't use them
    return {
      valid: true,
      missing: [],
    }
  }

  // Validate token by making an API call
  static async validateToken(accessToken: string, metadata: any): Promise<boolean> {
    try {
      // Mailchimp requires the datacenter (dc) in the API URL
      const dc = metadata?.dc || "us1"
      const response = await fetch(`https://${dc}.api.mailchimp.com/3.0/`, {
        headers: {
          Authorization: `OAuth ${accessToken}`,
        },
      })
      return response.ok
    } catch (error) {
      console.error("Mailchimp token validation error:", error)
      return false
    }
  }

  static generateAuthUrl(baseUrl: string, reconnect = false, integrationId?: string): string {
    const { clientId } = this.getClientCredentials()
    const redirectUri = "https://chainreact.app/api/integrations/mailchimp/callback"

    const state = btoa(
      JSON.stringify({
        provider: "mailchimp",
        reconnect,
        integrationId,
        timestamp: Date.now(),
      }),
    )

    const params = new URLSearchParams({
      response_type: "code",
      client_id: clientId,
      redirect_uri: redirectUri,
      state,
      // Mailchimp doesn't use scopes in the authorization URL
    })

    return `https://login.mailchimp.com/oauth2/authorize?${params.toString()}`
  }

  static getRedirectUri(baseUrl: string): string {
    return "https://chainreact.app/api/integrations/mailchimp/callback"
  }

  static async handleCallback(code: string, state: string, baseUrl: string): Promise<MailchimpOAuthResult> {
    try {
      const stateData = JSON.parse(atob(state))
      const { provider, reconnect, integrationId } = stateData

      if (provider !== "mailchimp") {
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

      const tokenResponse = await fetch("https://login.mailchimp.com/oauth2/token", {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          grant_type: "authorization_code",
          client_id: clientId,
          client_secret: clientSecret,
          redirect_uri: "https://chainreact.app/api/integrations/mailchimp/callback",
          code,
        }),
      })

      if (!tokenResponse.ok) {
        const errorData = await tokenResponse.text()
        console.error("Mailchimp token exchange failed:", errorData)
        throw new Error(`Token exchange failed: ${errorData}`)
      }

      const tokenData = await tokenResponse.json()
      const { access_token, expires_in } = tokenData

      console.log("Mailchimp token data:", { hasToken: !!access_token, expires_in })

      const userResponse = await fetch("https://login.mailchimp.com/oauth2/metadata", {
        headers: {
          Authorization: `OAuth ${access_token}`,
        },
      })

      if (!userResponse.ok) {
        const errorText = await userResponse.text()
        console.error("Mailchimp user info failed:", errorText)
        throw new Error("Failed to get user info")
      }

      const userData = await userResponse.json()
      console.log("Mailchimp user data:", userData)

      // Mailchimp doesn't return scopes in the token response, so we assume basic access
      const grantedScopes = ["basic_access"]

      // Validate token by making an API call
      const isTokenValid = await this.validateToken(access_token, userData)
      if (!isTokenValid) {
        return {
          success: false,
          redirectUrl: `${baseUrl}/integrations?error=invalid_token&provider=mailchimp`,
        }
      }

      const supabase = createServerComponentClient({ cookies })
      const { data: sessionData, error: sessionError } = await supabase.auth.getSession()

      if (sessionError || !sessionData?.session) {
        throw new Error("No active user session found")
      }

      const integrationData = {
        user_id: sessionData.session.user.id,
        provider: "mailchimp",
        provider_user_id: userData.user_id.toString(),
        access_token,
        expires_at: expires_in ? new Date(Date.now() + expires_in * 1000).toISOString() : null,
        status: "connected" as const,
        scopes: grantedScopes,
        metadata: {
          dc: userData.dc,
          api_endpoint: userData.api_endpoint,
          account_name: userData.accountname,
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
        redirectUrl: `${baseUrl}/integrations?success=mailchimp_connected`,
      }
    } catch (error: any) {
      console.error("Mailchimp OAuth callback error:", error)
      return {
        success: false,
        redirectUrl: `${baseUrl}/integrations?error=callback_failed&provider=mailchimp&message=${encodeURIComponent(error.message)}`,
        error: error.message,
      }
    }
  }
}
