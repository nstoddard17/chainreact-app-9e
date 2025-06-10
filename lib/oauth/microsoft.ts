export class MicrosoftOAuthService {
  static generateAuthUrl(baseUrl: string, reconnect = false, integrationId?: string, userId?: string): string {
    const clientId = process.env.NEXT_PUBLIC_TEAMS_CLIENT_ID
    if (!clientId) {
      throw new Error("Missing NEXT_PUBLIC_TEAMS_CLIENT_ID environment variable")
    }

    const redirectUri = `${baseUrl}/api/integrations/teams/callback`
    const scopes = [
      "https://graph.microsoft.com/User.Read",
      "https://graph.microsoft.com/Files.ReadWrite",
      "https://graph.microsoft.com/Sites.ReadWrite.All",
    ].join(" ")

    const state = JSON.stringify({
      reconnect,
      integrationId,
      userId,
      timestamp: Date.now(),
    })

    const params = new URLSearchParams({
      client_id: clientId,
      response_type: "code",
      redirect_uri: redirectUri,
      scope: scopes,
      state: encodeURIComponent(state),
      response_mode: "query",
    })

    return `https://login.microsoftonline.com/common/oauth2/v2.0/authorize?${params.toString()}`
  }

  static getRedirectUri(): string {
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000"
    return `${baseUrl}/api/integrations/teams/callback`
  }
}
