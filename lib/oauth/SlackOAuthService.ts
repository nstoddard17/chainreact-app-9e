import { BaseOAuthService, type OAuthResult } from "./BaseOAuthService"
import { getRequiredScopes } from "./utils"

export class SlackOAuthService extends BaseOAuthService {
  static async exchangeCodeForToken(
    code: string,
    redirectUri: string,
    clientId: string,
    clientSecret: string,
  ): Promise<any> {
    const response = await fetch("https://slack.com/api/oauth.v2.access", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        code,
        redirect_uri: redirectUri,
      }),
    })

    if (!response.ok) {
      throw new Error(`Token exchange failed: ${response.statusText}`)
    }

    const data = await response.json()
    if (!data.ok) {
      throw new Error(data.error || "Token exchange failed")
    }

    return data
  }

  static async validateTokenAndGetUserInfo(accessToken: string): Promise<any> {
    const response = await fetch("https://slack.com/api/auth.test", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
    })

    const data = await response.json()
    if (!data.ok) {
      throw new Error(`Token validation failed: ${data.error}`)
    }

    return {
      id: data.user_id,
      name: data.user,
      team_id: data.team_id,
      team_name: data.team,
    }
  }

  static parseScopes(tokenResponse: any): string[] {
    return tokenResponse.scope ? tokenResponse.scope.split(",") : []
  }

  static getRequiredScopes(): string[] {
    return getRequiredScopes("slack")
  }

  static async handleCallback(code: string, state: string, userId: string): Promise<OAuthResult> {
    return super.handleCallback("slack", code, state, userId)
  }
}
