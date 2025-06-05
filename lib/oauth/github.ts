import { OAuthService } from "./oauthService"

interface GitHubOAuthResult {
  success: boolean
  redirectUrl: string
  error?: string
}

export class GitHubOAuthService {
  private static getClientCredentials() {
    const clientId = process.env.NEXT_PUBLIC_GITHUB_CLIENT_ID
    const clientSecret = process.env.GITHUB_CLIENT_SECRET

    if (!clientId || !clientSecret) {
      throw new Error("Missing GitHub OAuth configuration")
    }

    return { clientId, clientSecret }
  }

  static generateAuthUrl(baseUrl: string, reconnect = false, integrationId?: string): string {
    const { clientId } = this.getClientCredentials()
    const redirectUri = "https://chainreact.app/api/integrations/github/callback"

    const scopes = ["user:email", "read:user", "repo", "workflow", "write:repo_hook", "read:org"]

    const state = btoa(
      JSON.stringify({
        provider: "github",
        reconnect,
        integrationId,
        requireFullScopes: true,
        timestamp: Date.now(),
      }),
    )

    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      scope: scopes.join(" "),
      state,
    })

    return `https://github.com/login/oauth/authorize?${params.toString()}`
  }

  static getRedirectUri(baseUrl: string): string {
    return "https://chainreact.app/api/integrations/github/callback"
  }

  static async handleCallback(
    code: string,
    state: string,
    baseUrl: string,
    supabase: any,
    userId: string,
  ): Promise<GitHubOAuthResult> {
    try {
      const stateData = JSON.parse(atob(state))
      const { provider, reconnect, integrationId, requireFullScopes } = stateData

      if (provider !== "github") {
        throw new Error("Invalid provider in state")
      }

      const { clientId, clientSecret } = this.getClientCredentials()

      const tokenResponse = await fetch("https://github.com/login/oauth/access_token", {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          client_id: clientId,
          client_secret: clientSecret,
          code,
        }),
      })

      if (!tokenResponse.ok) {
        const errorData = await tokenResponse.text()
        throw new Error(`Token exchange failed: ${errorData}`)
      }

      const tokenData = await tokenResponse.json()
      const { access_token } = tokenData

      if (!access_token) {
        throw new Error("No access token received from GitHub")
      }

      // Validate scopes if required
      if (requireFullScopes) {
        console.log("Validating GitHub scopes...")
        const validation = await OAuthService.validateToken("github", access_token)

        if (!validation.valid) {
          console.error("GitHub scope validation failed:", validation)
          return {
            success: false,
            redirectUrl: `${baseUrl}/integrations?error=insufficient_scopes&provider=github&message=${encodeURIComponent(
              `Your connection is missing required permissions: ${validation.missingScopes.join(", ")}. Please reconnect and accept all scopes.`,
            )}`,
            error: "Insufficient scopes",
          }
        }
        console.log("GitHub scopes validated successfully:", validation.grantedScopes)
      }

      const userResponse = await fetch("https://api.github.com/user", {
        headers: {
          Authorization: `Bearer ${access_token}`,
          Accept: "application/vnd.github.v3+json",
        },
      })

      if (!userResponse.ok) {
        const errorData = await userResponse.text()
        throw new Error(`Failed to get user info: ${errorData}`)
      }

      const userData = await userResponse.json()
      const scopesHeader = userResponse.headers.get("X-OAuth-Scopes")
      const grantedScopes = scopesHeader ? scopesHeader.split(", ").map((s) => s.trim()) : []

      const integrationData = {
        user_id: userId,
        provider: "github",
        provider_user_id: userData.id.toString(),
        access_token,
        status: "connected" as const,
        scopes: grantedScopes,
        metadata: {
          username: userData.login,
          user_name: userData.name,
          user_email: userData.email,
          avatar_url: userData.avatar_url,
          connected_at: new Date().toISOString(),
          scopes_validated: requireFullScopes,
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

        if (error) throw error
      } else {
        const { error } = await supabase.from("integrations").insert(integrationData)
        if (error) throw error
      }

      return {
        success: true,
        redirectUrl: `${baseUrl}/integrations?success=github_connected&provider=github&scopes_validated=${requireFullScopes}`,
      }
    } catch (error: any) {
      return {
        success: false,
        redirectUrl: `${baseUrl}/integrations?error=callback_failed&provider=github&message=${encodeURIComponent(error.message)}`,
        error: error.message,
      }
    }
  }
}
