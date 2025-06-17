import { getBaseUrl } from "@/lib/utils/getBaseUrl"

export class TeamsOAuthService {
  private static getClientCredentials() {
    const clientId = process.env.NEXT_PUBLIC_TEAMS_CLIENT_ID
    const clientSecret = process.env.TEAMS_CLIENT_SECRET

    if (!clientId || !clientSecret) {
      throw new Error("Missing Teams OAuth configuration")
    }

    return { clientId, clientSecret }
  }

  static generateAuthUrl(baseUrl: string, reconnect = false, integrationId?: string, userId?: string): string {
    const { clientId } = this.getClientCredentials()
    const redirectUri = `${getBaseUrl()}/api/integrations/teams/callback`

    // Microsoft Graph scopes - use full URLs for Graph API scopes
    const scopes = [
      "openid",
      "profile",
      "email",
      "offline_access",
      "https://graph.microsoft.com/User.Read",
      "https://graph.microsoft.com/Team.ReadBasic.All",
      "https://graph.microsoft.com/Channel.ReadBasic.All",
      "https://graph.microsoft.com/Chat.ReadWrite",
      "https://graph.microsoft.com/ChannelMessage.Send",
    ]

    const state = btoa(
      JSON.stringify({
        provider: "teams",
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
    return `${getBaseUrl()}/api/integrations/teams/callback`
  }

  static async handleCallback(code: string, state: string): Promise<{ access_token: string; refresh_token: string; token_type: string; expires_in: number; scope: string; id_token: string; userData: any }> {
    const { clientId, clientSecret } = this.getClientCredentials()
    const redirectUri = this.getRedirectUri()

    const response = await fetch(`https://login.microsoftonline.com/common/oauth2/v2.0/token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        code,
        redirect_uri,
        grant_type: 'authorization_code',
      }),
    })

    const data = await response.json()

    if (!data.access_token || !data.refresh_token || !data.token_type || !data.expires_in || !data.scope || !data.id_token) {
      throw new Error("Missing required token data")
    }

    const userResponse = await fetch(`https://graph.microsoft.com/v1.0/me`, {
      headers: {
        Authorization: `Bearer ${data.access_token}`,
      },
    })

    const userData = await userResponse.json()

    const integrationData = {
      user_id: state.split(",")[1],
      provider: "microsoft",
      provider_user_id: userData.id,
      access_token: data.access_token,
      refresh_token: data.refresh_token,
      token_type: data.token_type,
      expires_at: data.expires_in
        ? new Date(Date.now() + data.expires_in * 1000).toISOString()
        : null,
      scopes: data.scope ? data.scope.split(" ") : [],
      metadata: {
        email: userData.email,
        name: userData.displayName,
        picture: userData.userPrincipalName,
        provider: "microsoft",
        service: "teams"
      },
      status: "connected",
      is_active: true,
      consecutive_failures: 0,
      last_token_refresh: new Date().toISOString(),
      last_refreshed_at: new Date().toISOString(),
      last_used_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    }

    return {
      access_token: data.access_token,
      refresh_token: data.refresh_token,
      token_type: data.token_type,
      expires_in: data.expires_in,
      scope: data.scope,
      id_token: data.id_token,
      userData: integrationData
    }
  }
}
