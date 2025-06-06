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

    const scopes = [
    "openid",
    "profile",
    "email",
    "offline_access",
    "User.Read",
    "Chat.ReadWrite",
    "ChannelMessage.Send",
    "OnlineMeetings.ReadWrite",
    "Calendars.ReadWrite",
    "Team.ReadBasic.All",
    "Team.ReadWrite.All",
    "ChannelSettings.ReadWrite.All",
    "Group.ReadWrite.All",
    "Directory.Read.All",
    "TeamsAppInstallation.ReadWriteSelfForTeam"
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
        throw new Error(`Token exchange failed: ${errorData}`)
      }

      const tokenData = await tokenResponse.json()
      const { access_token, refresh_token, expires_in, scope } = tokenData

      const userResponse = await fetch("https://graph.microsoft.com/v1.0/me", {
        headers: {
          Authorization: `Bearer ${access_token}`,
        },
      })

      if (!userResponse.ok) {
        throw new Error(`Failed to get user info: ${userResponse.statusText}`)
      }

      const userData = await userResponse.json()

      const integrationData = {
        user_id: userId,
        provider: "teams",
        provider_user_id: userData.id,
        access_token,
        refresh_token,
        expires_at: expires_in ? new Date(Date.now() + expires_in * 1000).toISOString() : null,
        status: "connected" as const,
        scopes: scope ? scope.split(" ") : [],
        metadata: {
          display_name: userData.displayName,
          email: userData.userPrincipalName,
          connected_at: new Date().toISOString(),
        },
      }

      await saveIntegrationToDatabase(integrationData)

      return {
        success: true,
        redirectUrl: generateSuccessRedirect("teams"),
      }
    } catch (error: any) {
      return {
        success: false,
        redirectUrl: `https://chainreact.app/integrations?error=callback_failed&provider=teams&message=${encodeURIComponent(error.message)}`,
        error: error.message,
      }
    }
  }
}
