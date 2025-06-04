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

  static async handleCallback(code: string, state: string, baseUrl: string): Promise<MailchimpOAuthResult> {
    try {
      const stateData = JSON.parse(atob(state))
      const { provider, reconnect, integrationId } = stateData

      if (provider !== "mailchimp") {
        throw new Error("Invalid provider in state")
      }

      const { clientId, clientSecret } = this.getClientCredentials()

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
        throw new Error(`Token exchange failed: ${errorData}`)
      }

      const tokenData = await tokenResponse.json()
      const { access_token, expires_in } = tokenData

      const userResponse = await fetch("https://login.mailchimp.com/oauth2/metadata", {
        headers: {
          Authorization: `OAuth ${access_token}`,
        },
      })

      if (!userResponse.ok) {
        throw new Error("Failed to get user info")
      }

      const userData = await userResponse.json()

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
        expires_at: new Date(Date.now() + expires_in * 1000).toISOString(),
        status: "connected" as const,
        scopes: ["campaigns:read", "lists:write"],
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
      return {
        success: false,
        redirectUrl: `${baseUrl}/integrations?error=callback_failed&provider=mailchimp&message=${encodeURIComponent(error.message)}`,
        error: error.message,
      }
    }
  }
}
