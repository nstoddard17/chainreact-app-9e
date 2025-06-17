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
}
