import { getBaseUrl } from "@/lib/utils/getBaseUrl"
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
    return `${getBaseUrl()}/api/integrations/slack/callback`
  }

  static generateAuthUrl(baseUrl: string, reconnect = false, integrationId?: string, userId?: string): string {
    const { clientId } = this.getClientCredentials()
    const redirectUri = this.getRedirectUri()

    // Bot scopes - these are valid Slack API v2 scopes
    const botScopes = [
      "channels:read",
      "channels:history",
      "chat:write",
      "groups:read",
      "im:read",
      "mpim:read",
      "reactions:write",
      "team:read",
      "users:read",
      "users:read.email",
    ]

    // User scopes - these are for the installing user
    const userScopes = ["identity.basic", "identity.email", "identity.team"]

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
      scope: botScopes.join(","), // Bot scopes go in 'scope'
      user_scope: userScopes.join(","), // User scopes go in 'user_scope'
      redirect_uri: redirectUri,
      state,
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
    // Use auth.test instead of users.identity for bot tokens
    const response = await fetch("https://slack.com/api/auth.test", {
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
    // Slack returns both bot and user scopes
    const botScopes = tokenResponse.scope ? tokenResponse.scope.split(",") : []
    const userScopes = tokenResponse.authed_user?.scope ? tokenResponse.authed_user.scope.split(",") : []
    return [...botScopes, ...userScopes]
  }

  static getRequiredScopes(): string[] {
    return ["chat:write", "channels:read", "users:read", "files:write"]
  }
}
