import { getBaseUrl } from "@/lib/utils/getBaseUrl"
import { getOAuthRedirectUri } from "./utils"

export class TrelloOAuthService {
  private static getClientCredentials() {
    const clientId = process.env.NEXT_PUBLIC_TRELLO_CLIENT_ID
    const clientSecret = process.env.TRELLO_CLIENT_SECRET

    if (!clientId || !clientSecret) {
      throw new Error("Missing Trello OAuth configuration")
    }

    return { clientId, clientSecret }
  }

  static getRedirectUri(): string {
    return getOAuthRedirectUri(getBaseUrl(), "trello")
  }

  static generateAuthUrl(baseUrl: string, reconnect = false, integrationId?: string, userId?: string): string {
    const { clientId } = this.getClientCredentials()
    const redirectUri = this.getRedirectUri()

    // Trello OAuth 1.0a doesn't handle state parameter reliably
    // We'll get the user ID from the authenticated session instead
    const params = new URLSearchParams({
      key: clientId,
      return_url: redirectUri,
      scope: "read,write",
      expiration: "never",
      name: "ChainReact",
      response_type: "token",
    })

    return `https://trello.com/1/authorize?${params.toString()}`
  }

  static async handleCallback(code: string, userId: string): Promise<void> {
    const { clientId, clientSecret } = this.getClientCredentials()
    const redirectUri = this.getRedirectUri()

    const tokenResponse = await fetch(`https://trello.com/1/oauth/token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        code: code,
        return_url: redirectUri,
        scope: "read,write",
        expiration: "never",
        name: "ChainReact",
        response_type: "token"
      })
    })

    const tokenData = await tokenResponse.json()

    if (!tokenData.access_token || !tokenData.refresh_token || !tokenData.token_type || !tokenData.expires_in) {
      throw new Error("Missing token data from Trello OAuth callback")
    }

    const userResponse = await fetch(`https://api.trello.com/1/members/me`, {
      headers: {
        'Authorization': `Bearer ${tokenData.access_token}`
      }
    })

    const userData = await userResponse.json()

    if (!userData.id || !userData.email || !userData.name || !userData.picture) {
      throw new Error("Missing user data from Trello API")
    }

    const access_token = tokenData.access_token
    const refresh_token = tokenData.refresh_token
    const token_type = tokenData.token_type
    const expires_at = tokenData.expires_in
      ? new Date(Date.now() + tokenData.expires_in * 1000).toISOString()
      : null
    const scopes = tokenData.scope ? tokenData.scope.split(" ") : []
    const metadata = {
      email: userData.email,
      name: userData.name,
      picture: userData.picture,
      provider: "trello"
    }
    const status = "connected"
    const is_active = true
    const consecutive_failures = 0
    const last_token_refresh = new Date().toISOString()
    const last_refreshed_at = new Date().toISOString()
    const last_used_at = new Date().toISOString()
    const updated_at = new Date().toISOString()

    const integrationData = {
      user_id: userId,
      provider: "trello",
      provider_user_id: userData.id,
      access_token,
      refresh_token,
      token_type,
      expires_at,
      scopes,
      metadata,
      status,
      is_active,
      consecutive_failures,
      last_token_refresh,
      last_refreshed_at,
      last_used_at,
      updated_at
    }

    // Handle integration data storage
  }
}
