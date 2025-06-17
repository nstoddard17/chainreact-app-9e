import { getBaseUrl } from "@/lib/utils/getBaseUrl"
import { getOAuthRedirectUri, generateOAuthState, parseOAuthState, validateOAuthState, OAuthScopes } from "./utils"
import { createClient } from "@supabase/supabase-js"

export class PayPalOAuthService {
  static clientId = process.env.NEXT_PUBLIC_PAYPAL_CLIENT_ID
  static clientSecret = process.env.PAYPAL_CLIENT_SECRET
  static apiUrl = "https://api.paypal.com"

  static generateAuthUrl(userId: string): string {
    if (!this.clientId) {
      throw new Error("Missing PayPal client ID")
    }

    const state = generateOAuthState(userId, "paypal")
    const redirectUri = getOAuthRedirectUri("paypal")

    const params = new URLSearchParams({
      client_id: this.clientId,
      response_type: "code",
      scope: OAuthScopes.PAYPAL.join(" "),
      redirect_uri: redirectUri,
      state,
    })

    return `https://www.paypal.com/signin/authorize?${params.toString()}`
  }

  static async handleCallback(
    code: string,
    state: string,
    supabase: ReturnType<typeof createClient>,
    userId: string
  ): Promise<{ success: boolean; error?: string; redirectUrl?: string }> {
    try {
      if (!this.clientId || !this.clientSecret) {
        throw new Error("Missing PayPal OAuth configuration")
      }

      // Parse and validate state
      const stateData = parseOAuthState(state)
      validateOAuthState(stateData, "paypal")

      const redirectUri = getOAuthRedirectUri("paypal")

      // Exchange code for token
      const tokenResponse = await fetch(`${this.apiUrl}/v1/oauth2/token`, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "Authorization": `Basic ${Buffer.from(`${this.clientId}:${this.clientSecret}`).toString("base64")}`,
        },
        body: new URLSearchParams({
          grant_type: "authorization_code",
          code,
          redirect_uri: redirectUri,
        }),
      })

      if (!tokenResponse.ok) {
        const error = await tokenResponse.text()
        throw new Error(`Failed to exchange code for token: ${error}`)
      }

      const tokenData = await tokenResponse.json()

      // Get user info
      const userResponse = await fetch(`${this.apiUrl}/v1/identity/oauth2/userinfo?schema=paypalv1.1`, {
        headers: {
          Authorization: `Bearer ${tokenData.access_token}`,
        },
      })

      if (!userResponse.ok) {
        const error = await userResponse.text()
        throw new Error(`Failed to get user info: ${error}`)
      }

      const userData = await userResponse.json()

      // Check if integration exists
      const { data: existingIntegration } = await supabase
        .from("integrations")
        .select("id")
        .eq("user_id", userId)
        .eq("provider", "paypal")
        .maybeSingle()

      const now = new Date().toISOString()
      const integrationData = {
        user_id: userId,
        provider: "paypal",
        provider_user_id: userData.user_id,
        access_token: tokenData.access_token,
        refresh_token: tokenData.refresh_token,
        token_type: tokenData.token_type,
        expires_at: tokenData.expires_in
          ? new Date(Date.now() + tokenData.expires_in * 1000).toISOString()
          : null,
        scopes: tokenData.scope,
        metadata: {
          email: userData.email,
          name: userData.name,
          picture: userData.picture,
          provider: "paypal"
        },
        updated_at: now,
      }

      if (existingIntegration) {
        const { error } = await supabase
          .from("integrations")
          .update(integrationData)
          .eq("id", existingIntegration.id)

        if (error) throw error
      } else {
        const { error } = await supabase.from("integrations").insert({
          ...integrationData,
          created_at: now,
        })

        if (error) throw error
      }

      return {
        success: true,
        redirectUrl: `${getBaseUrl()}/integrations?success=paypal_connected`,
      }
    } catch (error: any) {
      console.error("PayPal OAuth callback error:", error)
      return {
        success: false,
        error: error.message,
        redirectUrl: `${getBaseUrl()}/integrations?error=callback_failed&provider=paypal&message=${encodeURIComponent(
          error.message
        )}`,
      }
    }
  }

  static async refreshToken(
    refreshToken: string
  ): Promise<{ access_token: string; refresh_token: string; expires_in: number }> {
    if (!this.clientId || !this.clientSecret) {
      throw new Error("Missing PayPal OAuth configuration")
    }

    const response = await fetch(`${this.apiUrl}/v1/oauth2/token`, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "Authorization": `Basic ${Buffer.from(`${this.clientId}:${this.clientSecret}`).toString("base64")}`,
      },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: refreshToken,
      }),
    })

    if (!response.ok) {
      const error = await response.text()
      throw new Error(`Failed to refresh token: ${error}`)
    }

    return response.json()
  }
}
