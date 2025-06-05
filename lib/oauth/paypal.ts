import { createServerComponentClient } from "@supabase/auth-helpers-nextjs"
import { cookies } from "next/headers"

interface PayPalOAuthResult {
  success: boolean
  redirectUrl: string
  error?: string
}

export class PayPalOAuthService {
  private static getClientCredentials() {
    const clientId = process.env.NEXT_PUBLIC_PAYPAL_CLIENT_ID
    const clientSecret = process.env.PAYPAL_CLIENT_SECRET

    if (!clientId || !clientSecret) {
      throw new Error("Missing PayPal OAuth configuration")
    }

    return { clientId, clientSecret }
  }

  // Define required scopes for PayPal
  static getRequiredScopes() {
    return [
      "https://uri.paypal.com/services/payments/payment",
      "https://uri.paypal.com/services/payments/refund",
      "https://uri.paypal.com/services/payments/orders/read",
      "email",
      "openid",
      "profile",
    ]
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
      const response = await fetch("https://api.paypal.com/v1/identity/oauth2/userinfo?schema=paypalv1.1", {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      })
      return response.ok
    } catch (error) {
      console.error("PayPal token validation error:", error)
      return false
    }
  }

  static generateAuthUrl(baseUrl: string, reconnect = false, integrationId?: string): string {
    const { clientId } = this.getClientCredentials()
    const redirectUri = "https://chainreact.app/api/integrations/paypal/callback"

    const scopes = [
      "https://uri.paypal.com/services/payments/payment",
      "https://uri.paypal.com/services/payments/refund",
      "https://uri.paypal.com/services/payments/orders/read",
      "email",
      "openid",
      "profile",
    ]

    const state = btoa(
      JSON.stringify({
        provider: "paypal",
        reconnect,
        integrationId,
        timestamp: Date.now(),
      }),
    )

    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      scope: scopes.join(" "),
      response_type: "code",
      state,
    })

    return `https://www.paypal.com/signin/authorize?${params.toString()}`
  }

  static getRedirectUri(baseUrl: string): string {
    return "https://chainreact.app/api/integrations/paypal/callback"
  }

  static async handleCallback(code: string, state: string, baseUrl: string): Promise<PayPalOAuthResult> {
    try {
      const stateData = JSON.parse(atob(state))
      const { provider, reconnect, integrationId } = stateData

      if (provider !== "paypal") {
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

      const tokenResponse = await fetch("https://api.paypal.com/v1/oauth2/token", {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Authorization: "Basic " + Buffer.from(clientId + ":" + clientSecret).toString("base64"),
        },
        body: new URLSearchParams({
          grant_type: "authorization_code",
          code,
          redirect_uri: "https://chainreact.app/api/integrations/paypal/callback",
        }),
      })

      if (!tokenResponse.ok) {
        const errorData = await tokenResponse.text()
        throw new Error(`Token exchange failed: ${errorData}`)
      }

      const tokenData = await tokenResponse.json()
      const { access_token, refresh_token, expires_in, scope } = tokenData

      // Get granted scopes from the token data
      const grantedScopes = scope ? scope.split(" ") : []

      // Validate scopes
      const scopeValidation = this.validateScopes(grantedScopes)

      if (!scopeValidation.valid) {
        return {
          success: false,
          redirectUrl: `${baseUrl}/integrations?error=insufficient_scopes&provider=paypal&missing=${scopeValidation.missing.join(",")}`,
        }
      }

      // Validate token by making an API call
      const isTokenValid = await this.validateToken(access_token)
      if (!isTokenValid) {
        return {
          success: false,
          redirectUrl: `${baseUrl}/integrations?error=invalid_token&provider=paypal`,
        }
      }

      const userResponse = await fetch("https://api.paypal.com/v1/identity/oauth2/userinfo?schema=paypalv1.1", {
        headers: {
          Authorization: `Bearer ${access_token}`,
        },
      })

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
        provider: "paypal",
        provider_user_id: userData.user_id,
        access_token,
        refresh_token,
        expires_at: expires_in ? new Date(Date.now() + expires_in * 1000).toISOString() : null,
        status: "connected" as const,
        scopes: grantedScopes,
        metadata: {
          user_name: userData.name,
          user_email: userData.email,
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
        redirectUrl: `${baseUrl}/integrations?success=paypal_connected`,
      }
    } catch (error: any) {
      return {
        success: false,
        redirectUrl: `${baseUrl}/integrations?error=callback_failed&provider=paypal&message=${encodeURIComponent(error.message)}`,
        error: error.message,
      }
    }
  }
}
