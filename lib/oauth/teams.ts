import { BaseOAuthService } from "./BaseOAuthService"

export class TeamsOAuthService extends BaseOAuthService {
  static getRedirectUri(baseUrl: string): string {
    // Hardcoded redirect URI
    return "https://chainreact.app/api/integrations/teams/callback"
  }

  static generateAuthUrl(baseUrl: string, reconnect = false, integrationId?: string): string {
    const clientId = process.env.NEXT_PUBLIC_TEAMS_CLIENT_ID
    if (!clientId) {
      throw new Error("Missing Microsoft Teams OAuth client ID")
    }

    const redirectUri = this.getRedirectUri(baseUrl)

    // Define required scopes
    const scopes = [
      "openid",
      "profile",
      "email",
      "offline_access",
      "User.Read",
      "ChannelMessage.Send",
      "Chat.ReadWrite",
      "Team.ReadBasic.All",
    ]

    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: "code",
      scope: scopes.join(" "),
      response_mode: "query",
    })

    if (reconnect) {
      params.append("prompt", "consent")
    }

    return `https://login.microsoftonline.com/common/oauth2/v2.0/authorize?${params.toString()}`
  }

  static async exchangeCodeForToken(
    code: string,
    redirectUri: string,
    clientId: string,
    clientSecret: string,
  ): Promise<any> {
    const response = await fetch("https://login.microsoftonline.com/common/oauth2/v2.0/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: "authorization_code",
      }),
    })

    if (!response.ok) {
      const errorData = await response.text()
      throw new Error(`Microsoft Teams token exchange failed: ${errorData}`)
    }

    return response.json()
  }

  static async validateTokenAndGetUserInfo(accessToken: string): Promise<any> {
    const response = await fetch("https://graph.microsoft.com/v1.0/me", {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    })

    if (!response.ok) {
      throw new Error(`Failed to get Microsoft Teams user info: ${response.statusText}`)
    }

    return response.json()
  }

  static parseScopes(tokenResponse: any): string[] {
    return tokenResponse.scope ? tokenResponse.scope.split(" ") : []
  }

  static getRequiredScopes(): string[] {
    return ["openid", "profile", "email", "offline_access", "User.Read"]
  }
}
