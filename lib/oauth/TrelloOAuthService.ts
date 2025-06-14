import { getBaseUrl } from "@/lib/utils/getBaseUrl"

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
    return `${getBaseUrl()}/integrations/trello-auth`
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

  static async exchangeCodeForToken(code: string, redirectUri: string) {
    const { clientId, clientSecret } = this.getClientCredentials()

    try {
      const response = await fetch("https://trello.com/1/OAuthGetAccessToken", {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          key: clientId,
          secret: clientSecret,
          token: code,
        }),
      })

      if (!response.ok) {
        throw new Error(`Trello token exchange failed: ${response.statusText}`)
      }

      const data = await response.text()
      const params = new URLSearchParams(data)

      return {
        access_token: params.get("oauth_token"),
        token_secret: params.get("oauth_token_secret"),
      }
    } catch (error) {
      console.error("Trello token exchange error:", error)
      throw error
    }
  }

  static async getUserInfo(accessToken: string, tokenSecret: string) {
    try {
      const response = await fetch(
        `https://api.trello.com/1/members/me?key=${this.getClientCredentials().clientId}&token=${accessToken}`,
      )

      if (!response.ok) {
        throw new Error(`Trello user info fetch failed: ${response.statusText}`)
      }

      const userData = await response.json()

      return {
        id: userData.id,
        username: userData.username,
        fullName: userData.fullName,
        email: userData.email,
        avatarUrl: userData.avatarUrl,
      }
    } catch (error) {
      console.error("Trello user info error:", error)
      throw error
    }
  }
}
