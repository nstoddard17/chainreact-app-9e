import { BaseOAuthService, OAuthResult } from "./BaseOAuthService"
import { createClient } from "@supabase/supabase-js"
import { getBaseUrl } from "@/lib/utils/getBaseUrl"

export class GitLabOAuthService extends BaseOAuthService {
  protected static getAuthorizationEndpoint(provider: string): string {
    return "https://gitlab.com/oauth/authorize"
  }

  static getRequiredScopes(): string[] {
    return ["read_user", "read_api", "read_repository", "write_repository"]
  }

  static async exchangeCodeForToken(
    code: string,
    redirectUri: string,
    clientId: string,
    clientSecret: string,
    codeVerifier?: string,
  ): Promise<any> {
    const response = await fetch("https://gitlab.com/oauth/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
      },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        code,
        grant_type: "authorization_code",
        redirect_uri: redirectUri,
        ...(codeVerifier && { code_verifier: codeVerifier }),
      }),
    })

    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`Token exchange failed: ${errorText}`)
    }

    return response.json()
  }

  static async validateTokenAndGetUserInfo(accessToken: string): Promise<any> {
    const response = await fetch("https://gitlab.com/api/v4/user", {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/json",
      },
    })

    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`Failed to get user info: ${errorText}`)
    }

    return response.json()
  }

  static parseScopes(tokenResponse: any): string[] {
    return tokenResponse.scope ? tokenResponse.scope.split(" ") : this.getRequiredScopes()
  }

  // Override the base class method to handle GitLab-specific callback
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

      if (provider !== "gitlab") {
        throw new Error("Invalid provider in state")
      }

      // Get client credentials
      const clientId = process.env.NEXT_PUBLIC_GITLAB_CLIENT_ID
      const clientSecret = process.env.GITLAB_CLIENT_SECRET

      if (!clientId || !clientSecret) {
        throw new Error("Missing GitLab OAuth configuration")
      }

      // Exchange code for token
      const tokenResponse = await this.exchangeCodeForToken(
        code,
        this.getRedirectUri(provider),
        clientId,
        clientSecret,
        stateData.codeVerifier
      )

      const { access_token, refresh_token, expires_in } = tokenResponse

      if (!access_token) {
        throw new Error("No access token received from GitLab")
      }

      // Get user info
      const userData = await this.validateTokenAndGetUserInfo(access_token)

      // Prepare integration data
      const integrationData = {
        user_id: userId,
        provider: "gitlab",
        provider_user_id: userData.id.toString(),
        access_token,
        refresh_token,
        expires_at: expires_in ? new Date(Date.now() + expires_in * 1000).toISOString() : null,
        status: "connected" as const,
        scopes: this.parseScopes(tokenResponse),
        metadata: {
          username: userData.username,
          name: userData.name,
          email: userData.email,
          avatar_url: userData.avatar_url,
          web_url: userData.web_url,
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
        redirectUrl: `${getBaseUrl()}/integrations?success=gitlab_connected&provider=gitlab`,
      }
    } catch (error: any) {
      console.error("GitLab OAuth callback error:", error)
      return {
        success: false,
        redirectUrl: `${getBaseUrl()}/integrations?error=callback_failed&provider=gitlab&message=${encodeURIComponent(error.message)}`,
        error: error.message,
      }
    }
  }

  static generateAuthUrl(baseUrl: string, reconnect = false, integrationId?: string, userId?: string): string {
    try {
      const { clientId } = this.getClientCredentials()
      const redirectUri = `${baseUrl}/api/integrations/gitlab/callback`

      // GitLab OAuth scopes
      const scopes = ["read_user", "read_api", "read_repository", "write_repository"]

      const state = btoa(
        JSON.stringify({
          provider: "gitlab",
          userId,
          reconnect,
          integrationId,
          timestamp: Date.now(),
        }),
      )

      const params = new URLSearchParams({
        client_id: clientId,
        redirect_uri: redirectUri,
        response_type: "code",
        scope: scopes.join(" "),
        state,
      })

      const authUrl = `https://gitlab.com/oauth/authorize?${params.toString()}`
      console.log("GitLab Auth URL generated:", authUrl)

      return authUrl
    } catch (error: any) {
      console.error("Error generating GitLab auth URL:", error)
      throw new Error(`Failed to generate GitLab auth URL: ${error.message}`)
    }
  }

  static getRedirectUri(baseUrl?: string): string {
    const base = baseUrl || getBaseUrl()
    return `${base}/api/integrations/gitlab/callback`
  }

  static async refreshToken(refreshToken: string): Promise<any> {
    try {
      const { clientId, clientSecret } = this.getClientCredentials()

      const response = await fetch("https://gitlab.com/oauth/token", {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Accept: "application/json",
        },
        body: new URLSearchParams({
          client_id: clientId,
          client_secret: clientSecret,
          refresh_token: refreshToken,
          grant_type: "refresh_token",
        }),
      })

      if (!response.ok) {
        const errorText = await response.text()
        console.error("GitLab token refresh failed:", errorText)
        throw new Error(`Token refresh failed: ${response.status} ${response.statusText}`)
      }

      return await response.json()
    } catch (error: any) {
      console.error("Error refreshing GitLab token:", error)
      throw error
    }
  }
}
