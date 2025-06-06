import { BaseOAuthService } from "./BaseOAuthService"

export class SlackOAuthService extends BaseOAuthService {
  private static getClientCredentials() {
    const clientId = process.env.NEXT_PUBLIC_SLACK_CLIENT_ID
    const clientSecret = process.env.SLACK_CLIENT_SECRET

    if (!clientId) {
      throw new Error("Missing NEXT_PUBLIC_SLACK_CLIENT_ID environment variable")
    }
    if (!clientSecret) {
      throw new Error("Missing SLACK_CLIENT_SECRET environment variable")
    }

    return { clientId, clientSecret }
  }

  static getRedirectUri(): string {
    return "https://chainreact.app/api/integrations/slack/callback"
  }

  static generateAuthUrl(baseUrl: string, reconnect = false, integrationId?: string, userId?: string): string {
    const { clientId } = this.getClientCredentials()
    const redirectUri = this.getRedirectUri()

    // Enhanced scopes for better workflow functionality
    const scopes = [
      "chat:write",
      "chat:write.public",
      "channels:read",
      "channels:join",
      "channels:manage",
      "groups:read",
      "im:read",
      "users:read",
      "users:read.email",
      "team:read",
      "files:write",
      "files:read",
      "reactions:write",
      "reactions:read",
      "pins:write",
      "pins:read",
      "bookmarks:read",
      "bookmarks:write",
      "workflow.steps:execute",
    ]

    const state = btoa(
      JSON.stringify({
        provider: "slack",
        userId,
        reconnect,
        integrationId,
        timestamp: Date.now(),
      }),
    )

    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      scope: scopes.join(","),
      state,
      user_scope: "identity.basic,identity.email,identity.team",
    })

    if (reconnect) {
      params.append("force", "true")
    }

    return `https://slack.com/oauth/v2/authorize?${params.toString()}`
  }

  static async exchangeCodeForToken(code: string, redirectUri: string): Promise<any> {
    const credentials = this.getClientCredentials()

    const response = await fetch("https://slack.com/api/oauth.v2.access", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        code,
        client_id: credentials.clientId,
        client_secret: credentials.clientSecret,
        redirect_uri: redirectUri,
      }),
    })

    if (!response.ok) {
      const errorData = await response.text()
      throw new Error(`Slack token exchange failed: ${errorData}`)
    }

    const data = await response.json()
    if (!data.ok) {
      throw new Error(`Slack API error: ${data.error}`)
    }

    return data
  }

  static async validateTokenAndGetUserInfo(accessToken: string): Promise<any> {
    const response = await fetch("https://slack.com/api/users.identity", {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    })

    if (!response.ok) {
      throw new Error(`Failed to get Slack user info: ${response.statusText}`)
    }

    const data = await response.json()
    if (!data.ok) {
      throw new Error(`Slack API error: ${data.error}`)
    }

    return data
  }

  static parseScopes(tokenResponse: any): string[] {
    return tokenResponse.authed_user?.scope ? tokenResponse.authed_user.scope.split(",") : []
  }

  static getRequiredScopes(): string[] {
    return [
      "chat:write",
      "chat:write.public",
      "channels:read",
      "channels:join",
      "users:read",
      "team:read",
      "files:write",
      "reactions:write",
    ]
  }
}
