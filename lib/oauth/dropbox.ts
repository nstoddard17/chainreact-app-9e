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

  static async validateToken(
    accessToken: string,
  ): Promise<{ valid: boolean; grantedScopes: string[]; missingScopes: string[] }> {
    try {
      // Test the token by making an API call to get_current_account
      const response = await fetch("https://api.dropboxapi.com/2/users/get_current_account", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      })

      if (!response.ok) {
        return { valid: false, grantedScopes: [], missingScopes: [] }
      }

      // Dropbox doesn't provide a way to get scopes from the token directly
      // We'll need to rely on what was stored during the OAuth flow
      return { valid: true, grantedScopes: [], missingScopes: [] }
    } catch (error) {
      console.error("Error validating Dropbox token:", error)
      return { valid: false, grantedScopes: [], missingScopes: [] }
    }
  }

  static async handleCallback(
    code: string,
    state: string,
    baseUrl: string,
    supabase: any,
    userId: string,
  ): Promise<DropboxOAuthResult> {
    try {
      // Decode state to get provider info
      const stateData = JSON.parse(atob(state))
      const { provider, reconnect, integrationId, requireFullScopes } = stateData

      if (provider !== "dropbox") {
        throw new Error("Invalid provider in state")
      }

      // Get credentials securely
      const { clientId, clientSecret } = this.getClientCredentials()

      // Exchange code for access token
      const tokenResponse = await fetch("https://api.dropboxapi.com/oauth2/token", {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          code,
          grant_type: "authorization_code",
          client_id: clientId,
          client_secret: clientSecret,
          redirect_uri: `${baseUrl}/api/integrations/dropbox/callback`,
        }),
      })

      if (!tokenResponse.ok) {
        const errorData = await tokenResponse.text()
        throw new Error(`Token exchange failed: ${errorData}`)
      }

      const tokenData = await tokenResponse.json()
      const { access_token, refresh_token, expires_in, account_id } = tokenData

      // Validate token by making an API call
      let validationResult = { valid: false, grantedScopes: [], missingScopes: [] }

      try {
        validationResult = await this.validateToken(access_token)

        if (!validationResult.valid) {
          console.error("Dropbox token validation failed")
          return {
            success: false,
            redirectUrl: `${baseUrl}/integrations?error=token_validation&provider=dropbox&message=${encodeURIComponent(
              "Failed to validate Dropbox token. Please try reconnecting.",
            )}`,
            error: "Token validation failed",
          }
        }
      } catch (error) {
        console.error("Error during Dropbox token validation:", error)
        // Continue with the flow even if validation fails
      }

      // Get user info from Dropbox
      const userResponse = await fetch("https://api.dropboxapi.com/2/users/get_current_account", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${access_token}`,
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
        scopes: ["files.content.write", "files.content.read", "sharing.write"],
        metadata: {
          account_id: userData.account_id,
          user_name: userData.name?.display_name,
          user_email: userData.email,
          connected_at: new Date().toISOString(),
          scopes_validated: true,
        },
      }

      if (reconnect && integrationId) {
        const { error } = await supabase
          .from("integrations")
          .update({
            ...integrationData,
            updated_at: new Date().toISOString(),
          })
          .eq("id", integrationId)

        if (error) {
          throw error
        }
      } else {
        const { error } = await supabase.from("integrations").insert(integrationData)
        if (error) {
          throw error
        }
      }

      return {
        success: true,
        redirectUrl: `${baseUrl}/integrations?success=dropbox_connected&provider=dropbox&scopes_validated=true`,
      }
    } catch (error: any) {
      return {
        success: false,
        redirectUrl: `${baseUrl}/integrations?error=callback_failed&provider=dropbox&message=${encodeURIComponent(error.message)}`,
        error: error.message,
      }
    }
  }
}
