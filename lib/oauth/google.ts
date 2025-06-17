import { generateOAuthState } from "./utils"

export class GoogleOAuthService {
  private static getClientCredentials() {
    const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET

    if (!clientId) {
      throw new Error("Missing NEXT_PUBLIC_GOOGLE_CLIENT_ID environment variable")
    }
    if (!clientSecret) {
      throw new Error("Missing GOOGLE_CLIENT_SECRET environment variable")
    }

    return { clientId, clientSecret }
  }

  static getRedirectUri(): string {
    const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"
    return `${baseUrl}/api/integrations/google/callback`
  }

  static generateAuthUrl(baseUrl: string, reconnect = false, integrationId?: string, userId?: string): string {
    const { clientId } = this.getClientCredentials()
    const redirectUri = this.getRedirectUri()

    // Basic scopes that are more likely to be approved
    const scopes = [
      "https://www.googleapis.com/auth/userinfo.email",
      "https://www.googleapis.com/auth/userinfo.profile",
      "openid",
    ]

    const state = userId ? generateOAuthState("google", userId, { reconnect, integrationId }) : ""

    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: "code",
      scope: scopes.join(" "),
      access_type: "offline",
      prompt: "consent",
      include_granted_scopes: "true",
      ...(state && { state }),
    })

    return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`
  }

  static async exchangeCodeForTokens(code: string): Promise<any> {
    const { clientId, clientSecret } = this.getClientCredentials()
    const redirectUri = this.getRedirectUri()

    const response = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        code,
        grant_type: "authorization_code",
        redirect_uri: redirectUri,
      }),
    })

    if (!response.ok) {
      const error = await response.text()
      throw new Error(`Google token exchange failed: ${error}`)
    }

    const tokenData = await response.json()

    if (!tokenData.refresh_token) {
      console.warn("Google did not provide a refresh token. User may need to revoke and re-authorize.")
    }

    return tokenData
  }

  static async getUserInfo(accessToken: string): Promise<any> {
    const response = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    })

    if (!response.ok) {
      throw new Error(`Failed to get Google user info: ${response.statusText}`)
    }

    return response.json()
  }
}
