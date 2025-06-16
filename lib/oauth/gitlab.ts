import { getBaseUrl } from "@/lib/utils/getBaseUrl"

export class GitLabOAuthService {
  private static getClientCredentials() {
    const clientId = process.env.NEXT_PUBLIC_GITLAB_CLIENT_ID
    const clientSecret = process.env.GITLAB_CLIENT_SECRET

    if (!clientId || !clientSecret) {
      throw new Error(
        "Missing GitLab OAuth configuration. Please ensure NEXT_PUBLIC_GITLAB_CLIENT_ID and GITLAB_CLIENT_SECRET are set.",
      )
    }

    return { clientId, clientSecret }
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

  static async handleCallback(
    code: string,
    state: string,
    supabase: any,
    userId: string,
    baseUrl: string,
  ): Promise<{ success: boolean; redirectUrl: string; error?: string }> {
    try {
      console.log("GitLab callback started:", { code: code.substring(0, 10) + "...", userId })

      // Parse and validate state
      let stateData: any = {}
      try {
        stateData = JSON.parse(atob(state))
      } catch (e) {
        console.error("Failed to parse GitLab state:", e)
        throw new Error("Invalid state parameter")
      }

      const { provider, reconnect, integrationId } = stateData

      if (provider !== "gitlab") {
        throw new Error("Invalid provider in state")
      }

      const { clientId, clientSecret } = this.getClientCredentials()
      const redirectUri = this.getRedirectUri(baseUrl)

      console.log("Exchanging code for token with GitLab...")

      // Exchange code for token
      const tokenResponse = await fetch("https://gitlab.com/oauth/token", {
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
        }),
      })

      if (!tokenResponse.ok) {
        const errorText = await tokenResponse.text()
        console.error("GitLab token exchange failed:", {
          status: tokenResponse.status,
          statusText: tokenResponse.statusText,
          error: errorText,
        })
        throw new Error(`Token exchange failed: ${tokenResponse.status} ${tokenResponse.statusText}`)
      }

      const tokenData = await tokenResponse.json()
      console.log("GitLab token exchange successful")

      const { access_token, refresh_token, expires_in, scope } = tokenData

      if (!access_token) {
        throw new Error("No access token received from GitLab")
      }

      // Get user info
      console.log("Fetching GitLab user info...")
      const userResponse = await fetch("https://gitlab.com/api/v4/user", {
        headers: {
          Authorization: `Bearer ${access_token}`,
          Accept: "application/json",
        },
      })

      if (!userResponse.ok) {
        const errorText = await userResponse.text()
        console.error("GitLab user info failed:", {
          status: userResponse.status,
          statusText: userResponse.statusText,
          error: errorText,
        })
        throw new Error(`Failed to get user info: ${userResponse.status} ${userResponse.statusText}`)
      }

      const userData = await userResponse.json()
      console.log("GitLab user info retrieved:", { id: userData.id, username: userData.username })

      const now = new Date().toISOString()

      const integrationData = {
        user_id: userId,
        provider: "gitlab",
        provider_user_id: userData.id.toString(),
        access_token,
        refresh_token,
        expires_at: expires_in ? new Date(Date.now() + expires_in * 1000).toISOString() : null,
        status: "connected" as const,
        scopes: scope ? scope.split(" ") : ["read_user", "read_api", "read_repository", "write_repository"],
        metadata: {
          username: userData.username,
          name: userData.name,
          email: userData.email,
          avatar_url: userData.avatar_url,
          web_url: userData.web_url,
          connected_at: now,
        },
        updated_at: now,
      }

      // Check if integration exists
      console.log("Checking for existing GitLab integration...")
      const { data: existingIntegration } = await supabase
        .from("integrations")
        .select("id")
        .eq("user_id", userId)
        .eq("provider", "gitlab")
        .maybeSingle()

      if (existingIntegration) {
        console.log("Updating existing GitLab integration:", existingIntegration.id)
        const { error } = await supabase.from("integrations").update(integrationData).eq("id", existingIntegration.id)

        if (error) {
          console.error("Error updating GitLab integration:", error)
          throw new Error(`Database update failed: ${error.message}`)
        }
      } else {
        console.log("Creating new GitLab integration")
        const { error } = await supabase.from("integrations").insert({
          ...integrationData,
          created_at: now,
        })

        if (error) {
          console.error("Error inserting GitLab integration:", error)
          throw new Error(`Database insert failed: ${error.message}`)
        }
      }

      console.log("GitLab integration saved successfully")

      // Add a delay to ensure database operations complete
      await new Promise((resolve) => setTimeout(resolve, 1000))

      return {
        success: true,
        redirectUrl: `${baseUrl}/integrations?success=true&provider=gitlab&t=${Date.now()}`,
      }
    } catch (error: any) {
      console.error("GitLab OAuth callback error:", error)
      return {
        success: false,
        redirectUrl: `${baseUrl}/integrations?error=callback_failed&provider=gitlab&message=${encodeURIComponent(error.message)}`,
        error: error.message,
      }
    }
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
