import { getBaseUrl } from "@/lib/utils/getBaseUrl"
import { BaseOAuthService } from "./BaseOAuthService"
import { saveIntegrationToDatabase, generateSuccessRedirect } from "./callbackHandler"
import { validateAndUpdateIntegrationScopes } from "../integrations/scopeValidation"

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

  static getRedirectUri(baseUrl?: string): string {
    const base = baseUrl || getBaseUrl()
    return `${base}/api/integrations/teams/callback`
  }

  static generateAuthUrl(baseUrl: string, reconnect = false, integrationId?: string, userId?: string): string {
    try {
      const { clientId } = this.getClientCredentials()
      const redirectUri = this.getRedirectUri(baseUrl)

      console.log("Teams OAuth - Generating auth URL with:", {
        baseUrl,
        redirectUri,
        clientIdExists: !!clientId,
        clientIdLength: clientId?.length,
        userId: userId?.substring(0, 8) + "...",
      })

      // Request scopes that Microsoft actually supports for Teams
      const scopes = [
        "openid",
        "profile",
        "email",
        "offline_access",
        "https://graph.microsoft.com/User.Read",
        "https://graph.microsoft.com/Chat.ReadWrite",
        "https://graph.microsoft.com/ChannelMessage.Send",
        "https://graph.microsoft.com/Team.ReadBasic.All",
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

      const authUrl = `https://login.microsoftonline.com/common/oauth2/v2.0/authorize?${params.toString()}`
      console.log("Teams OAuth - Generated auth URL:", authUrl.substring(0, 100) + "...")

      return authUrl
    } catch (error) {
      console.error("Teams OAuth - Error generating auth URL:", error)
      throw error
    }
  }

  static async handleCallback(
    code: string,
    state: string,
    supabase: any,
    userId: string,
  ): Promise<{ success: boolean; redirectUrl: string; error?: string }> {
    try {
      console.log("Teams OAuth - Handling callback with code and state:", {
        codeExists: !!code,
        codeLength: code?.length,
        stateExists: !!state,
        stateLength: state?.length,
      })

      let stateData: any
      try {
        stateData = JSON.parse(atob(state))
        console.log("Teams OAuth - Parsed state data:", {
          provider: stateData.provider,
          hasUserId: !!stateData.userId,
          timestamp: stateData.timestamp,
        })
      } catch (stateError) {
        console.error("Teams OAuth - Failed to parse state:", stateError)
        throw new Error("Invalid state parameter")
      }

      const { provider, reconnect, integrationId } = stateData

      if (provider !== "teams") {
        throw new Error("Invalid provider in state")
      }

      const { clientId, clientSecret } = this.getClientCredentials()
      const redirectUri = this.getRedirectUri()

      console.log("Teams OAuth - Exchanging code for token...")

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

      console.log("Teams OAuth - Token response status:", tokenResponse.status)

      if (!tokenResponse.ok) {
        const errorText = await tokenResponse.text()
        console.error("Teams OAuth - Token exchange failed:", errorText)
        throw new Error(`Token exchange failed: ${errorText}`)
      }

      const tokenData = await tokenResponse.json()
      console.log("Teams OAuth - Token received:", {
        hasAccessToken: !!tokenData.access_token,
        hasRefreshToken: !!tokenData.refresh_token,
        expiresIn: tokenData.expires_in,
        hasScope: !!tokenData.scope,
      })

      const { access_token, refresh_token, expires_in, scope } = tokenData

      // Validate the access token format
      if (!access_token || typeof access_token !== "string") {
        throw new Error("Invalid access token received from Microsoft")
      }

      console.log("Teams OAuth - Fetching user info...")
      const userResponse = await fetch("https://graph.microsoft.com/v1.0/me", {
        headers: {
          Authorization: `Bearer ${access_token}`,
        },
      })

      if (!userResponse.ok) {
        const errorText = await userResponse.text()
        console.error("Teams OAuth - User info failed:", errorText)
        throw new Error(`Failed to get user info: ${userResponse.statusText}`)
      }

      const userData = await userResponse.json()
      console.log("Teams OAuth - User data received:", {
        displayName: userData.displayName,
        id: userData.id,
        email: userData.userPrincipalName || userData.mail,
      })

      // Parse and store the granted scopes - handle Microsoft's scope format
      let grantedScopes: string[] = []
      if (scope) {
        // Microsoft returns scopes separated by spaces, sometimes with extra formatting
        grantedScopes = scope
          .split(/\s+/) // Split on any whitespace
          .map((s: string) => s.trim())
          .filter((s: string) => s.length > 0)
          .filter((s: string) => !s.includes("http")) // Remove any URL-like scopes that might be malformed

        console.log("Teams OAuth - Parsed scopes:", grantedScopes)
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
        granted_scopes: grantedScopes,
        metadata: {
          display_name: userData.displayName,
          email: userData.userPrincipalName || userData.mail,
          connected_at: new Date().toISOString(),
          scopes: grantedScopes,
          raw_scope_string: scope,
          token_type: tokenData.token_type || "Bearer",
          requested_scopes: [
            "openid",
            "profile",
            "email",
            "offline_access",
            "https://graph.microsoft.com/User.Read",
            "https://graph.microsoft.com/Chat.ReadWrite",
            "https://graph.microsoft.com/ChannelMessage.Send",
            "https://graph.microsoft.com/Team.ReadBasic.All",
          ],
        },
      }

      console.log("Teams OAuth - Saving integration data...")
      const savedIntegrationId = await saveIntegrationToDatabase(integrationData)
      console.log("Teams OAuth - Integration saved with ID:", savedIntegrationId)

      try {
        await validateAndUpdateIntegrationScopes(savedIntegrationId, grantedScopes)
      } catch (err) {
        console.error("Teams OAuth - Scope validation failed:", err)
      }

      const successRedirect = generateSuccessRedirect("teams")
      console.log("Teams OAuth - Redirecting to:", successRedirect)

      return {
        success: true,
        redirectUrl: successRedirect,
      }
    } catch (error: any) {
      console.error("Teams OAuth - Callback error:", error)
      return {
        success: false,
        redirectUrl: `${getBaseUrl()}/integrations?error=callback_failed&provider=teams&message=${encodeURIComponent(error.message)}`,
        error: error.message,
      }
    }
  }
}
