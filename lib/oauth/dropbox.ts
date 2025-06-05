import { BaseOAuthService } from "./BaseOAuthService"

export class DropboxOAuthService extends BaseOAuthService {
  static getRedirectUri(baseUrl: string): string {
    // Hardcoded redirect URI
    return "https://chainreact.app/api/integrations/dropbox/callback"
  }

  static generateAuthUrl(baseUrl: string, reconnect = false, integrationId?: string): string {
    const clientId = process.env.NEXT_PUBLIC_DROPBOX_CLIENT_ID
    if (!clientId) {
      throw new Error("Missing Dropbox OAuth client ID")
    }

    const redirectUri = this.getRedirectUri(baseUrl)

    // Define required scopes
    const scopes = ["files.content.write", "files.content.read"]

    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: "code",
      token_access_type: "offline",
      scope: scopes.join(" "),
    })

    if (reconnect) {
      params.append("force_reapprove", "true")
    }

    return `https://www.dropbox.com/oauth2/authorize?${params.toString()}`
  }

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
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: "authorization_code",
      }),
    })

    if (!response.ok) {
      const errorData = await response.text()
      throw new Error(`Dropbox token exchange failed: ${errorData}`)
    }

    return response.json()
  }

  static async validateTokenAndGetUserInfo(accessToken: string): Promise<any> {
    const response = await fetch("https://api.dropboxapi.com/2/users/get_current_account", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: "null",
    })

    if (!response.ok) {
      throw new Error(`Failed to get Dropbox user info: ${response.statusText}`)
    }

    return response.json()
  }

  static parseScopes(tokenResponse: any): string[] {
    // Dropbox doesn't return scopes in the token response
    // We'll need to rely on what was requested
    return ["files.content.write", "files.content.read"]
  }

  static getRequiredScopes(): string[] {
    return ["files.content.write", "files.content.read"]
  }
}
