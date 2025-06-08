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

    // Microsoft Graph scopes - include User.Read for profile access
    const scopes = [
      "openid",
      "profile",
      "email",
      "offline_access",
      "User.Read",
      "Team.ReadBasic.All",
      "Channel.ReadBasic.All",
      "Chat.ReadWrite",
      "ChatMessage.Send",
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
}
