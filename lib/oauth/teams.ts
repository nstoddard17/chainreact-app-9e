import { BaseOAuthService } from "./BaseOAuthService"
import { saveIntegrationToDatabase, generateSuccessRedirect } from "./callbackHandler"

export class TeamsOAuthService extends BaseOAuthService {
  private static getClientCredentials() {
    const clientId = process.env.NEXT_PUBLIC_TEAMS_CLIENT_ID
    const clientSecret = process.env.TEAMS_CLIENT_SECRET

    if (!clientId) {
      throw new Error("Missing NEXT_PUBLIC_TEAMS_CLIENT_ID environment variable")
    }
    if (!clientSecret) {
      throw new Error("Missing TEAMS_CLIENT_SECRET environment variable")
    }

    return { clientId, clientSecret }
  }

  static getRedirectUri(): string {
    return "https://chainreact.app/api/integrations/teams/callback"
  }

  static generateAuthUrl(baseUrl: string, reconnect = false, integrationId?: string, userId?: string): string {
    const { clientId } = this.getClientCredentials()
    const redirectUri = this.getRedirectUri()

    // Request scopes that Microsoft actually supports for Teams
    const scopes = [
      "openid",
      "profile",
      "email",
      "offline_access",
      "User.Read",
      "Chat.ReadWrite",
      "ChannelMessage.Send",
      "Team.ReadBasic.All",
    ]

    const state = btoa(
      JSON.stringify({
        provider: "teams",
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
      response_mode: "query",
      state,
      prompt: "consent", // Always show consent screen
    })

    return `https://login.microsoftonline.com/common/oauth2/v2.0/authorize?${params.toString()}`
  }

  static async handleCallback(
    code: string,
    state: string,
    supabase: any,
    userId: string,
  ): Promise<{ success: boolean; redirectUrl: string; error?: string }> {
    try {
      const stateData = JSON.parse(atob(state))
      const { provider, reconnect, integrationId } = stateData

      if (provider !== "teams") {
        throw new Error("Invalid provider in state")
      }

      const { clientId, clientSecret } = this.getClientCredentials()
      const redirectUri = this.getRedirectUri()

      console.log("Teams: Exchanging code for token...")

      const tokenResponse = await fetch("https://login.microsoftonline.com/common/oauth2/v2.0/token", {
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

      if (!tokenResponse.ok) {
        const errorData = await tokenResponse.text()
        console.error("Teams token exchange failed:", errorData)
        throw new Error(`Token exchange failed: ${errorData}`)
      }

      const tokenData = await tokenResponse.json()
      const { access_token, refresh_token, expires_in, scope } = tokenData

      console.log("Teams: Token received, scope:", scope)

      const userResponse = await fetch("https://graph.microsoft.com/v1.0/me", {
        headers: {
          Authorization: `Bearer ${access_token}`,
        },
      })

      if (!userResponse.ok) {
        const errorText = await userResponse.text()
        console.error("Teams user info failed:", errorText)
        throw new Error(`Failed to get user info: ${userResponse.statusText}`)
      }

      const userData = await userResponse.json()
      console.log("Teams: User data received:", userData.displayName)

      // Parse and store the granted scopes - handle Microsoft's scope format
      let grantedScopes: string[] = []
      if (scope) {
        // Microsoft returns scopes separated by spaces, sometimes with extra formatting
        grantedScopes = scope
          .split(/\s+/) // Split on any whitespace
          .map((s) => s.trim())
          .filter((s) => s.length > 0)
          .filter((s) => !s.includes("http")) // Remove any URL-like scopes that might be malformed

        console.log("Teams: Raw scope string:", scope)
        console.log("Teams: Parsed scopes:", grantedScopes)
      }

      const integrationData = {
        user_id: userId,
        provider: "teams",
        provider_user_id: userData.id,
        access_token,
        refresh_token,
        expires_at: expires_in ? new Date(Date.now() + expires_in * 1000).toISOString() : null,
        status: "connected" as const,
        scopes: grantedScopes,
        metadata: {
          display_name: userData.displayName,
          email: userData.userPrincipalName || userData.mail,
          connected_at: new Date().toISOString(),
          scopes: grantedScopes, // Store scopes in metadata as well
          raw_scope_string: scope, // Store the raw scope string for debugging
          requested_scopes: [
            "openid",
            "profile",
            "email",
            "offline_access",
            "User.Read",
            "Chat.ReadWrite",
            "ChannelMessage.Send",
            "Team.ReadBasic.All",
          ],
        },
      }

      console.log("Teams: Saving integration data with scopes:", grantedScopes)
      await saveIntegrationToDatabase(integrationData)

      return {
        success: true,
        redirectUrl: generateSuccessRedirect("teams"),
      }
    } catch (error: any) {
      console.error("Teams OAuth callback error:", error)
      return {
        success: false,
        redirectUrl: `https://chainreact.app/integrations?error=callback_failed&provider=teams&message=${encodeURIComponent(error.message)}`,
        error: error.message,
      }
    }
  }
}
