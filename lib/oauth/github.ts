import { getBaseUrl } from "@/lib/utils/getBaseUrl"
import { BaseOAuthService, OAuthResult } from "./BaseOAuthService"
import { createClient } from "@supabase/supabase-js"

interface GitHubOAuthResult {
  success: boolean
  redirectUrl: string
  error?: string
}

export class GitHubOAuthService extends BaseOAuthService {
  private static getClientCredentials() {
    const clientId = process.env.NEXT_PUBLIC_GITHUB_CLIENT_ID
    const clientSecret = process.env.GITHUB_CLIENT_SECRET

    if (!clientId || !clientSecret) {
      throw new Error("Missing GitHub OAuth configuration")
    }

    return { clientId, clientSecret }
  }

  static getRedirectUri(): string {
    return `${getBaseUrl()}/api/integrations/github/callback`
  }

  protected static getAuthorizationEndpoint(): string {
    return "https://github.com/login/oauth/authorize"
  }

  static getRequiredScopes(): string[] {
    return [
      "user:email",
      "read:user",
      "repo",
      "workflow",
      "write:repo_hook",
      "read:org"
    ]
  }

  static async exchangeCodeForToken(
    code: string,
    redirectUri: string,
    clientId: string,
    clientSecret: string,
    codeVerifier?: string,
  ): Promise<any> {
    const response = await fetch("https://github.com/login/oauth/access_token", {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        code,
        redirect_uri: redirectUri,
        ...(codeVerifier && { code_verifier: codeVerifier }),
      }),
    })

    if (!response.ok) {
      const errorData = await response.text()
      throw new Error(`Token exchange failed: ${errorData}`)
    }

    return response.json()
  }

  static async validateTokenAndGetUserInfo(accessToken: string): Promise<any> {
    const response = await fetch("https://api.github.com/user", {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/vnd.github.v3+json",
      },
    })

    if (!response.ok) {
      const errorData = await response.text()
      throw new Error(`Failed to get user info: ${errorData}`)
    }

    const userData = await response.json()
    const scopesHeader = response.headers.get("X-OAuth-Scopes")
    const grantedScopes = scopesHeader ? scopesHeader.split(", ").map((s) => s.trim()) : []

    return {
      ...userData,
      granted_scopes: grantedScopes,
    }
  }

  static parseScopes(tokenResponse: any): string[] {
    return tokenResponse.scope ? tokenResponse.scope.split(" ") : []
  }

  static async generateAuthUrl(
    provider: string,
    baseUrl: string,
    reconnect = false,
    integrationId?: string,
    userId?: string,
  ): Promise<string> {
    const authUrl = await super.generateAuthUrl(provider, baseUrl, reconnect, integrationId, userId)
    
    // Add GitHub-specific parameters
    const url = new URL(authUrl)
    url.searchParams.append("allow_signup", "true")
    url.searchParams.append("t", Date.now().toString()) // Cache-busting

    // Create a URL that will revoke existing authorization and then redirect to OAuth
    return `${baseUrl}/api/integrations/github/revoke-and-auth?oauth_url=${encodeURIComponent(url.toString())}`
  }

  static async handleCallback(
    provider: string,
    code: string,
    state: string,
    userId: string,
  ): Promise<OAuthResult> {
    try {
      // Create Supabase client
      const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
      )

      // Parse state
      let stateData
      try {
        stateData = JSON.parse(atob(state))
      } catch (error) {
        console.error("Failed to parse state:", error)
        throw new Error("Invalid state format")
      }

      const { reconnect, integrationId, requireFullScopes } = stateData

      if (provider !== "github") {
        throw new Error("Invalid provider in state")
      }

      // Get client credentials
      const clientId = process.env.NEXT_PUBLIC_GITHUB_CLIENT_ID
      const clientSecret = process.env.GITHUB_CLIENT_SECRET

      if (!clientId || !clientSecret) {
        throw new Error("Missing GitHub OAuth configuration")
      }

      // Exchange code for token
      const tokenResponse = await this.exchangeCodeForToken(
        code,
        this.getRedirectUri(),
        clientId,
        clientSecret,
        stateData.codeVerifier
      )

      const { access_token } = tokenResponse

      if (!access_token) {
        throw new Error("No access token received from GitHub")
      }

      // Get user info
      const userData = await this.validateTokenAndGetUserInfo(access_token)

      // Prepare integration data
      const integrationData = {
        user_id: userId,
        provider: "github",
        provider_user_id: userData.id.toString(),
        access_token,
        status: "connected" as const,
        scopes: this.parseScopes(tokenResponse),
        metadata: {
          username: userData.login,
          user_name: userData.name,
          user_email: userData.email,
          avatar_url: userData.avatar_url,
          connected_at: new Date().toISOString(),
          scopes_validated: requireFullScopes,
        },
      }

      // Update or insert integration
      if (reconnect && integrationId) {
        const { error } = await supabase
          .from("integrations")
          .update({
            ...integrationData,
            updated_at: new Date().toISOString(),
          })
          .eq("id", integrationId)

        if (error) throw error
      } else {
        const { error } = await supabase.from("integrations").insert(integrationData)
        if (error) throw error
      }

      return {
        success: true,
        redirectUrl: `${getBaseUrl()}/integrations?success=github_connected&provider=github`,
      }
    } catch (error: any) {
      console.error("GitHub OAuth callback error:", error)
      return {
        success: false,
        redirectUrl: `${getBaseUrl()}/integrations?error=callback_failed&provider=github&message=${encodeURIComponent(error.message)}`,
        error: error.message,
      }
    }
  }
}
