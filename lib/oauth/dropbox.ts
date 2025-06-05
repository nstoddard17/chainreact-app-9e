import { getOAuthRedirectUri, upsertIntegration, parseOAuthState } from "./utils"

interface DropboxOAuthResult {
  success: boolean
  redirectUrl: string
  error?: string
}

export class DropboxOAuthService {
  private static getClientCredentials() {
    const clientId = process.env.NEXT_PUBLIC_DROPBOX_CLIENT_ID
    const clientSecret = process.env.DROPBOX_CLIENT_SECRET

    if (!clientId || !clientSecret) {
      throw new Error("Missing Dropbox OAuth configuration")
    }

    return { clientId, clientSecret }
  }

  static async validateToken(accessToken: string): Promise<{ valid: boolean; grantedScopes: string[] }> {
    try {
      const response = await fetch("https://api.dropboxapi.com/2/users/get_current_account", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
      })

      return {
        valid: response.ok,
        grantedScopes: [], // Dropbox doesn't return scopes in this endpoint
      }
    } catch (error) {
      console.error("Error validating Dropbox token:", error)
      return { valid: false, grantedScopes: [] }
    }
  }

  static async validateExistingIntegration(integration: any): Promise<boolean> {
    try {
      if (integration.access_token) {
        const validation = await this.validateToken(integration.access_token)
        return validation.valid
      }
      return false
    } catch (error) {
      console.error("Dropbox validation error:", error)
      return false
    }
  }

  static async handleCallback(code: string, state: string, supabase: any, userId: string): Promise<DropboxOAuthResult> {
    try {
      const stateData = parseOAuthState(state)
      const { provider } = stateData

      if (provider !== "dropbox") {
        throw new Error("Invalid provider in state")
      }

      const { clientId, clientSecret } = this.getClientCredentials()
      const redirectUri = getOAuthRedirectUri("dropbox")

      console.log("Dropbox OAuth callback - using redirect URI:", redirectUri)

      const tokenResponse = await fetch("https://api.dropboxapi.com/oauth2/token", {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          client_id: clientId,
          client_secret: clientSecret,
          grant_type: "authorization_code",
          code,
          redirect_uri: redirectUri,
        }),
      })

      if (!tokenResponse.ok) {
        const errorData = await tokenResponse.text()
        console.error("Dropbox token exchange failed:", errorData)
        throw new Error(`Token exchange failed: ${errorData}`)
      }

      const tokenData = await tokenResponse.json()
      const { access_token, refresh_token, expires_in } = tokenData

      // Test the token by getting user info
      const userResponse = await fetch("https://api.dropboxapi.com/2/users/get_current_account", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${access_token}`,
          "Content-Type": "application/json",
        },
      })

      if (!userResponse.ok) {
        const errorData = await userResponse.text()
        throw new Error(`Failed to get user info: ${errorData}`)
      }

      const userData = await userResponse.json()

      const integrationData = {
        user_id: userId,
        provider: "dropbox",
        provider_user_id: userData.account_id,
        access_token,
        refresh_token,
        expires_at: expires_in ? new Date(Date.now() + expires_in * 1000).toISOString() : null,
        status: "connected" as const,
        scopes: ["files.content.write", "files.content.read"], // Default Dropbox scopes
        metadata: {
          name: userData.name?.display_name,
          email: userData.email,
          connected_at: new Date().toISOString(),
          account_id: userData.account_id,
        },
      }

      // Use upsert to avoid duplicate key constraint violations
      await upsertIntegration(supabase, integrationData)

      const baseUrl = new URL(redirectUri).origin
      return {
        success: true,
        redirectUrl: `${baseUrl}/integrations?success=dropbox_connected&provider=dropbox`,
      }
    } catch (error: any) {
      console.error("Dropbox OAuth callback error:", error)
      const baseUrl = getOAuthRedirectUri("dropbox").split("/api")[0]
      return {
        success: false,
        redirectUrl: `${baseUrl}/integrations?error=callback_failed&provider=dropbox&message=${encodeURIComponent(error.message)}`,
        error: error.message,
      }
    }
  }
}
