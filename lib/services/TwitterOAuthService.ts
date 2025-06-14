import { BaseOAuthService } from "../oauth/BaseOAuthService"

export interface TwitterTokens {
  access_token: string
  refresh_token?: string
  expires_in?: number
  token_type: string
  scope?: string
}

export interface TwitterUser {
  id: string
  username: string
  name: string
  profile_image_url?: string
  email?: string
  verified?: boolean
  public_metrics?: {
    followers_count: number
    following_count: number
    tweet_count: number
  }
}

export class TwitterOAuthService extends BaseOAuthService {
  protected baseUrl = "https://api.twitter.com"
  protected authUrl = "https://twitter.com/i/oauth2/authorize"
  protected tokenUrl = "https://api.twitter.com/2/oauth2/token"

  constructor() {
    super("twitter")
  }

  getAuthUrl(state: string, redirectUri: string): string {
    const clientId = process.env.NEXT_PUBLIC_TWITTER_CLIENT_ID
    if (!clientId) {
      throw new Error("Twitter client ID not configured")
    }

    const params = new URLSearchParams({
      response_type: "code",
      client_id: clientId,
      redirect_uri: redirectUri,
      scope: "tweet.read users.read offline.access",
      state,
      code_challenge: "challenge",
      code_challenge_method: "plain",
    })

    return `${this.authUrl}?${params.toString()}`
  }

  async exchangeCodeForTokens(code: string, redirectUri: string, codeVerifier?: string): Promise<TwitterTokens> {
    const clientId = process.env.NEXT_PUBLIC_TWITTER_CLIENT_ID
    const clientSecret = process.env.TWITTER_CLIENT_SECRET

    if (!clientId || !clientSecret) {
      throw new Error("Twitter OAuth credentials not configured")
    }

    const response = await fetch(this.tokenUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`,
      },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        redirect_uri: redirectUri,
        code_verifier: codeVerifier || "challenge",
      }),
    })

    if (!response.ok) {
      const error = await response.text()
      throw new Error(`Twitter token exchange failed: ${error}`)
    }

    return response.json()
  }

  async refreshToken(refreshToken: string): Promise<TwitterTokens> {
    const clientId = process.env.NEXT_PUBLIC_TWITTER_CLIENT_ID
    const clientSecret = process.env.TWITTER_CLIENT_SECRET

    if (!clientId || !clientSecret) {
      throw new Error("Twitter OAuth credentials not configured")
    }

    const response = await fetch(this.tokenUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`,
      },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: refreshToken,
      }),
    })

    if (!response.ok) {
      const error = await response.text()
      throw new Error(`Twitter token refresh failed: ${error}`)
    }

    return response.json()
  }

  async getUserInfo(accessToken: string): Promise<TwitterUser> {
    const response = await fetch(
      `${this.baseUrl}/2/users/me?user.fields=id,username,name,profile_image_url,verified,public_metrics`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      },
    )

    if (!response.ok) {
      const error = await response.text()
      throw new Error(`Failed to fetch Twitter user info: ${error}`)
    }

    const data = await response.json()
    return data.data
  }

  async revokeToken(token: string): Promise<void> {
    const clientId = process.env.NEXT_PUBLIC_TWITTER_CLIENT_ID
    const clientSecret = process.env.TWITTER_CLIENT_SECRET

    if (!clientId || !clientSecret) {
      throw new Error("Twitter OAuth credentials not configured")
    }

    const response = await fetch(`${this.baseUrl}/2/oauth2/revoke`, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`,
      },
      body: new URLSearchParams({
        token,
        token_type_hint: "access_token",
      }),
    })

    if (!response.ok) {
      const error = await response.text()
      throw new Error(`Twitter token revocation failed: ${error}`)
    }
  }

  validateScopes(grantedScopes: string[]): boolean {
    const requiredScopes = ["tweet.read", "users.read"]
    return requiredScopes.every((scope) => grantedScopes.includes(scope))
  }
}
