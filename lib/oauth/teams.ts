import { BaseOAuthService, OAuthResult } from "./BaseOAuthService"
import { createClient } from "@supabase/supabase-js"
import { getBaseUrl } from "@/lib/utils/getBaseUrl"

export class TeamsOAuthService extends BaseOAuthService {
  protected static getAuthorizationEndpoint(provider: string): string {
    return "https://login.microsoftonline.com/common/oauth2/v2.0/authorize"
  }

  static getRequiredScopes(): string[] {
    return [
      "User.Read",
      "Chat.Read",
      "Chat.ReadWrite",
      "Channel.ReadBasic.All",
      "ChannelMessage.Read.All",
      "ChannelMessage.Send",
      "Team.ReadBasic.All",
      "offline_access"
    ]
  }

  static async exchangeCodeForToken(
    code: string,
    redirectUri: string,
    clientId: string,
    clientSecret: string,
    codeVerifier?: string,
  ): Promise<any> {
    const response = await fetch("https://login.microsoftonline.com/common/oauth2/v2.0/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        code,
        redirect_uri: redirectUri,
        grant_type: "authorization_code",
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
    const response = await fetch("https://graph.microsoft.com/v1.0/me", {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    })

    if (!response.ok) {
      const errorData = await response.text()
      throw new Error(`Failed to get user info: ${errorData}`)
    }

    return response.json()
  }

  static parseScopes(tokenResponse: any): string[] {
    return tokenResponse.scope ? tokenResponse.scope.split(" ") : []
  }

  // Override the base class method to handle Microsoft-specific auth URL generation
  static async generateAuthUrl(
    provider: string,
    baseUrl: string,
    reconnect = false,
    integrationId?: string,
    userId?: string,
  ): Promise<string> {
    const authUrl = await super.generateAuthUrl(provider, baseUrl, reconnect, integrationId, userId)
    
    // Add Microsoft-specific parameters
    const url = new URL(authUrl)
    url.searchParams.append("response_mode", "query")
    url.searchParams.append("prompt", "consent")

    return url.toString()
  }

  // Override the base class method to handle Microsoft-specific callback
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

      if (provider !== "teams") {
        throw new Error("Invalid provider in state")
      }

      // Get client credentials
      const clientId = process.env.NEXT_PUBLIC_TEAMS_CLIENT_ID
      const clientSecret = process.env.TEAMS_CLIENT_SECRET

      if (!clientId || !clientSecret) {
        throw new Error("Missing Microsoft Teams OAuth configuration")
      }

      // Exchange code for token
      const tokenResponse = await this.exchangeCodeForToken(
        code,
        this.getRedirectUri(provider),
        clientId,
        clientSecret,
        stateData.codeVerifier
      )

      const { access_token, refresh_token } = tokenResponse

      if (!access_token) {
        throw new Error("No access token received from Microsoft Teams")
      }

      // Get user info
      const userData = await this.validateTokenAndGetUserInfo(access_token)

      // Prepare integration data
      const integrationData = {
        user_id: userId,
        provider: "teams",
        provider_user_id: userData.id,
        access_token,
        refresh_token,
        status: "connected" as const,
        scopes: this.parseScopes(tokenResponse),
        metadata: {
          email: userData.mail,
          name: userData.displayName,
          picture: userData.photo,
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
        redirectUrl: `${getBaseUrl()}/integrations?success=teams_connected&provider=teams`,
      }
    } catch (error: any) {
      console.error("Microsoft Teams OAuth callback error:", error)
      return {
        success: false,
        redirectUrl: `${getBaseUrl()}/integrations?error=callback_failed&provider=teams&message=${encodeURIComponent(error.message)}`,
        error: error.message,
      }
    }
  }

  static getRedirectUri(provider: string): string {
    return `${getBaseUrl()}/api/integrations/teams/callback`
  }
}
