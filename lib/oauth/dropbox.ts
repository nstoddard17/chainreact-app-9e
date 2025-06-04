import { createServerComponentClient } from "@supabase/auth-helpers-nextjs"
import { cookies } from "next/headers"

interface DropboxOAuthResult {
  success: boolean
  redirectUrl: string
  error?: string
}

export class DropboxOAuthService {
  private static getClientCredentials() {
    const clientId = process.env.NEXT_PUBLIC_DROPBOX_CLIENT_ID
    const clientSecret = process.env.DROPBOX_CLIENT_SECRET

    if (!clientId || !clientSecret) {
      throw new Error("Missing Dropbox OAuth configuration")
    }

    return { clientId, clientSecret }
  }

  static async handleCallback(code: string, state: string, baseUrl: string): Promise<DropboxOAuthResult> {
    try {
      // Decode state to get provider info
      const stateData = JSON.parse(atob(state))
      const { provider, reconnect, integrationId } = stateData

      if (provider !== "dropbox") {
        throw new Error("Invalid provider in state")
      }

      // Get credentials securely
      const { clientId, clientSecret } = this.getClientCredentials()

      // Exchange code for access token
      const tokenResponse = await fetch("https://api.dropboxapi.com/oauth2/token", {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          code,
          grant_type: "authorization_code",
          client_id: clientId,
          client_secret: clientSecret,
          redirect_uri: "https://chainreact.app/api/integrations/dropbox/callback",
        }),
      })

      if (!tokenResponse.ok) {
        const errorData = await tokenResponse.text()
        throw new Error(`Token exchange failed: ${errorData}`)
      }

      const tokenData = await tokenResponse.json()
      const { access_token, refresh_token, expires_in, account_id } = tokenData

      // Get user info from Dropbox
      const userResponse = await fetch("https://api.dropboxapi.com/2/users/get_current_account", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${access_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({}),
      })

      if (!userResponse.ok) {
        const errorData = await userResponse.text()
        throw new Error(`Failed to get user info: ${errorData}`)
      }

      const userData = await userResponse.json()

      // Store integration in Supabase
      const supabase = createServerComponentClient({ cookies })
      const { data: sessionData, error: sessionError } = await supabase.auth.getSession()

      if (sessionError || !sessionData?.session) {
        throw new Error("No active user session found")
      }

      const integrationData = {
        user_id: sessionData.session.user.id,
        provider: "dropbox",
        provider_user_id: userData.account_id,
        access_token,
        refresh_token,
        expires_at: expires_in ? new Date(Date.now() + expires_in * 1000).toISOString() : null,
        status: "connected" as const,
        scopes: ["files.content.write", "files.content.read"],
        metadata: {
          account_id: userData.account_id,
          user_name: userData.name?.display_name,
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

        if (error) {
          throw error
        }
      } else {
        const { error } = await supabase.from("integrations").insert(integrationData)
        if (error) {
          throw error
        }
      }

      return {
        success: true,
        redirectUrl: `${baseUrl}/integrations?success=dropbox_connected`,
      }
    } catch (error: any) {
      return {
        success: false,
        redirectUrl: `${baseUrl}/integrations?error=callback_failed&provider=dropbox&message=${encodeURIComponent(error.message)}`,
        error: error.message,
      }
    }
  }
}
