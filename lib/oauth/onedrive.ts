import { getBaseUrl } from "@/lib/utils/getBaseUrl"
export class OneDriveOAuthService {
  private static getClientCredentials() {
    const clientId = process.env.NEXT_PUBLIC_ONEDRIVE_CLIENT_ID
    const clientSecret = process.env.ONEDRIVE_CLIENT_SECRET

    if (!clientId || !clientSecret) {
      throw new Error("Missing OneDrive OAuth configuration")
    }

    return { clientId, clientSecret }
  }

  static generateAuthUrl(baseUrl: string, reconnect = false, integrationId?: string, userId?: string): string {
    const { clientId } = this.getClientCredentials()
    const redirectUri = `${getBaseUrl()}/api/integrations/onedrive/callback`

    // Microsoft Graph scopes - include User.Read for profile access
    const scopes = [
      "https://graph.microsoft.com/User.Read",
      "https://graph.microsoft.com/Files.ReadWrite.All",
      "https://graph.microsoft.com/Sites.ReadWrite.All",
      "offline_access",
    ]

    const state = btoa(
      JSON.stringify({
        provider: "onedrive",
        userId,
        reconnect,
        integrationId,
        timestamp: Date.now(),
      }),
    )

    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: "code",
      scope: scopes.join(" "),
      response_mode: "query",
      prompt: "consent", // Force consent screen
      state,
    })

    return `https://login.microsoftonline.com/common/oauth2/v2.0/authorize?${params.toString()}`
  }

  static getRedirectUri(): string {
    return `${getBaseUrl()}/api/integrations/onedrive/callback`
  }

  static async handleCallback(
    code: string,
    state: string,
    supabase: any,
    userId: string,
  ): Promise<{ success: boolean; redirectUrl: string; error?: string }> {
    try {
      const stateData = JSON.parse(atob(state))
      const { provider, reconnect, integrationId } = stateData

      if (provider !== "onedrive") {
        throw new Error("Invalid provider in state")
      }

      const { clientId, clientSecret } = this.getClientCredentials()

      const tokenResponse = await fetch("https://login.microsoftonline.com/common/oauth2/v2.0/token", {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          code,
          client_id: clientId,
          client_secret: clientSecret,
          redirect_uri: `${getBaseUrl()}/api/integrations/onedrive/callback`,
          grant_type: "authorization_code",
        }),
      })

      if (!tokenResponse.ok) {
        const errorData = await tokenResponse.text()
        throw new Error(`Token exchange failed: ${errorData}`)
      }

      const tokenData = await tokenResponse.json()
      const { access_token, refresh_token, expires_in, scope } = tokenData

      const userResponse = await fetch("https://graph.microsoft.com/v1.0/me", {
        headers: {
          Authorization: `Bearer ${access_token}`,
        },
      })

      if (!userResponse.ok) {
        throw new Error(`Failed to get user info: ${userResponse.statusText}`)
      }

      const userData = await userResponse.json()

      const integrationData = {
        user_id: userId,
        provider: "onedrive",
        provider_user_id: userData.id,
        access_token,
        refresh_token,
        expires_at: expires_in ? new Date(Date.now() + expires_in * 1000).toISOString() : null,
        status: "connected" as const,
        scopes: scope ? scope.split(" ") : [],
        metadata: {
          display_name: userData.displayName,
          email: userData.userPrincipalName,
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
        redirectUrl: `${getBaseUrl()}/integrations?success=onedrive_connected`,
      }
    } catch (error: any) {
      return {
        success: false,
        redirectUrl: `${getBaseUrl()}/integrations?error=callback_failed&provider=onedrive&message=${encodeURIComponent(error.message)}`,
        error: error.message,
      }
    }
  }
}
