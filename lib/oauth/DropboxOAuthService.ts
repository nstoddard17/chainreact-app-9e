import { BaseOAuthService, type OAuthResult } from "./BaseOAuthService"
import { getRequiredScopes } from "./utils"

export class DropboxOAuthService extends BaseOAuthService {
  static async exchangeCodeForToken(
    code: string,
    redirectUri: string,
    clientId: string,
    clientSecret: string,
  ): Promise<any> {
    const response = await fetch("https://api.dropboxapi.com/oauth2/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        code,
        grant_type: "authorization_code",
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
      }),
    })

    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`Token exchange failed: ${errorText}`)
    }

    return await response.json()
  }

  static async validateTokenAndGetUserInfo(accessToken: string): Promise<any> {
    const response = await fetch("https://api.dropboxapi.com/2/users/get_current_account", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    })

    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`Failed to get user info: ${errorText}`)
    }

    return await response.json()
  }

  static parseScopes(tokenResponse: any): string[] {
    // Dropbox doesn't return scopes in the token response
    // We'll use the default required scopes
    return getRequiredScopes("dropbox")
  }

  static getRequiredScopes(): string[] {
    return getRequiredScopes("dropbox")
  }

  static async handleCallback(code: string, state: string, userId: string): Promise<OAuthResult> {
    return super.handleCallback("dropbox", code, state, userId)
  }
}
