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
    console.log("OneDrive generateAuthUrl called with:", { baseUrl, reconnect, integrationId, userId })

    const { clientId } = this.getClientCredentials()
    const redirectUri = `${getBaseUrl()}/api/integrations/onedrive/callback`

    console.log("OneDrive OAuth config:", { clientId: clientId?.substring(0, 8) + "...", redirectUri })

    // Microsoft Graph scopes - be very explicit about what we need
    const scopes = [
      "openid",
      "profile",
      "email",
      "offline_access",
      "https://graph.microsoft.com/User.Read",
      "https://graph.microsoft.com/Files.ReadWrite.All",
      "https://graph.microsoft.com/Sites.ReadWrite.All",
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

    console.log("OneDrive state data:", { provider: "onedrive", userId, reconnect, integrationId })

    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: "code",
      scope: scopes.join(" "),
      response_mode: "query",
      prompt: "admin_consent", // Changed from "consent" to "admin_consent"
      state,
    })

    const authUrl = `https://login.microsoftonline.com/common/oauth2/v2.0/authorize?${params.toString()}`
    console.log("Generated OneDrive authUrl:", authUrl)
    console.log("OneDrive scopes being requested:", scopes.join(" "))

    return authUrl
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

      // Use the correct /me endpoint
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
          email: userData.userPrincipalName || userData.mail,
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

export async function generateAuthUrl(state: string): Promise<string> {
  console.log("Generating OneDrive auth URL with state:", state)

  const service = new OneDriveOAuthService()
  const authUrl = service.generateAuthUrl(state)

  console.log("Generated OneDrive auth URL:", authUrl)
  return authUrl
}

export async function handleCallback(code: string): Promise<any> {
  const clientId = process.env.NEXT_PUBLIC_ONEDRIVE_CLIENT_ID
  const clientSecret = process.env.ONEDRIVE_CLIENT_SECRET
  const redirectUri = `${getBaseUrl()}/api/integrations/onedrive/callback`

  const tokenResponse = await fetch("https://login.microsoftonline.com/common/oauth2/v2.0/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      client_id: clientId!,
      client_secret: clientSecret!,
      code,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }),
  })

  const tokenData = await tokenResponse.json()
  console.log("OneDrive token data:", {
    hasAccessToken: !!tokenData.access_token,
    hasRefreshToken: !!tokenData.refresh_token,
    scope: tokenData.scope,
    tokenType: tokenData.token_type,
  })

  return tokenData
}
