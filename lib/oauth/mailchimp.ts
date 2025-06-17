import { getBaseUrl } from "@/lib/utils/getBaseUrl"
import { getOAuthRedirectUri, generateOAuthState, parseOAuthState, validateOAuthState, OAuthScopes } from "./utils"
import { createClient } from "@supabase/supabase-js"

export class MailchimpOAuthService {
  static clientId = process.env.NEXT_PUBLIC_MAILCHIMP_CLIENT_ID
  static clientSecret = process.env.MAILCHIMP_CLIENT_SECRET
  static apiUrl = "https://login.mailchimp.com/oauth2"

  static generateAuthUrl(userId: string): string {
    if (!this.clientId) {
      throw new Error("Missing Mailchimp client ID")
    }

    const state = generateOAuthState(userId, "mailchimp")
    const redirectUri = getOAuthRedirectUri("mailchimp")

    const params = new URLSearchParams({
      response_type: "code",
      client_id: this.clientId,
      redirect_uri: redirectUri,
      state,
    })

    return `${this.apiUrl}/authorize?${params.toString()}`
  }

  static async handleCallback(
    code: string,
    state: string,
    supabase: ReturnType<typeof createClient>,
    userId: string
  ): Promise<{ success: boolean; error?: string; redirectUrl?: string }> {
    try {
      if (!this.clientId || !this.clientSecret) {
        throw new Error("Missing Mailchimp OAuth configuration")
      }

      // Parse and validate state
      const stateData = parseOAuthState(state)
      validateOAuthState(stateData, "mailchimp")

      const redirectUri = getOAuthRedirectUri("mailchimp")

      // Exchange code for token
      const tokenResponse = await fetch(`${this.apiUrl}/token`, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          grant_type: "authorization_code",
          client_id: this.clientId,
          client_secret: this.clientSecret,
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
      const metadataResponse = await fetch("https://login.mailchimp.com/oauth2/metadata", {
        headers: {
          Authorization: `OAuth ${tokenData.access_token}`,
        },
      })

      if (!metadataResponse.ok) {
        const error = await metadataResponse.text()
        throw new Error(`Failed to get user info: ${error}`)
      }

      const metadata = await metadataResponse.json()

      // Check if integration exists
      const { data: existingIntegration } = await supabase
        .from("integrations")
        .select("id")
        .eq("user_id", userId)
        .eq("provider", "mailchimp")
        .maybeSingle()

      const now = new Date().toISOString()
      const integrationData = {
        user_id: userId,
        provider: "mailchimp",
        provider_user_id: metadata.user_id,
        access_token: tokenData.access_token,
        refresh_token: tokenData.refresh_token,
        expires_at: tokenData.expires_in ? new Date(Date.now() + tokenData.expires_in * 1000).toISOString() : null,
        status: "connected",
        scopes: [], // Mailchimp does not return scopes
        metadata: {
          dc: metadata.dc,
          login_email: metadata.login_email,
          account_name: metadata.accountname,
          connected_at: now,
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
        redirectUrl: `${getBaseUrl()}/integrations?success=mailchimp_connected`,
      }
    } catch (error: any) {
      console.error("Mailchimp OAuth callback error:", error)
      return {
        success: false,
        error: error.message,
        redirectUrl: `${getBaseUrl()}/integrations?error=callback_failed&provider=mailchimp&message=${encodeURIComponent(
          error.message
        )}`,
      }
    }
  }

  static async refreshToken(
    refreshToken: string
  ): Promise<{ access_token: string; refresh_token: string; expires_in: number }> {
    if (!this.clientId || !this.clientSecret) {
      throw new Error("Missing Mailchimp OAuth configuration")
    }

    const response = await fetch(`${this.apiUrl}/token`, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        client_id: this.clientId,
        client_secret: this.clientSecret,
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
