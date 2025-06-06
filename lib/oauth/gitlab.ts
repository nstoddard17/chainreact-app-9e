import { createServerComponentClient } from "@supabase/auth-helpers-nextjs"
import { cookies } from "next/headers"

interface GitLabOAuthResult {
  success: boolean
  redirectUrl: string
  error?: string
}

export class GitLabOAuthService {
  private static getClientCredentials() {
    const clientId = process.env.NEXT_PUBLIC_GITLAB_CLIENT_ID
    const clientSecret = process.env.GITLAB_CLIENT_SECRET

    if (!clientId || !clientSecret) {
      throw new Error("Missing GitLab OAuth configuration")
    }

    return { clientId, clientSecret }
  }

  static generateAuthUrl(baseUrl: string, reconnect = false, integrationId?: string, userId?: string): string {
    const clientId = process.env.NEXT_PUBLIC_GITLAB_CLIENT_ID
    if (!clientId) {
      throw new Error("Missing NEXT_PUBLIC_GITLAB_CLIENT_ID environment variable")
    }

    const redirectUri = `${baseUrl}/api/integrations/gitlab/callback`

    // Updated scopes to use valid GitLab scopes
    const scopes = ["read_user", "read_api", "read_repository", "write_repository"]

    const state = btoa(
      JSON.stringify({
        provider: "gitlab",
        reconnect,
        integrationId,
        userId,
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

    return `https://gitlab.com/oauth/authorize?${params.toString()}`
  }

  static getRedirectUri(baseUrl: string): string {
    return `${baseUrl}/api/integrations/gitlab/callback`
  }

  static async handleCallback(code: string, state: string, baseUrl: string): Promise<GitLabOAuthResult> {
    try {
      let stateData: any = {}
      try {
        stateData = JSON.parse(atob(state))
      } catch (e) {
        console.error("Failed to parse state:", e)
        throw new Error("Invalid state parameter")
      }

      const { provider, reconnect, integrationId, userId } = stateData

      if (provider !== "gitlab") {
        throw new Error("Invalid provider in state")
      }

      if (!userId) {
        console.error("Missing user ID in state:", stateData)
        throw new Error("GitLab: Missing user ID in state")
      }

      const { clientId, clientSecret } = this.getClientCredentials()
      const redirectUri = this.getRedirectUri(baseUrl)

      const tokenResponse = await fetch("https://gitlab.com/oauth/token", {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
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
        const errorData = await tokenResponse.text()
        console.error("GitLab token exchange failed:", errorData)
        throw new Error(`Token exchange failed: ${errorData}`)
      }

      const tokenData = await tokenResponse.json()
      const { access_token, refresh_token, expires_in } = tokenData

      const userResponse = await fetch("https://gitlab.com/api/v4/user", {
        headers: {
          Authorization: `Bearer ${access_token}`,
        },
      })

      if (!userResponse.ok) {
        const errorData = await userResponse.text()
        console.error("Failed to get GitLab user info:", errorData)
        throw new Error(`Failed to get user info: ${errorData}`)
      }

      const userData = await userResponse.json()

      const supabase = createServerComponentClient({ cookies })

      const integrationData = {
        user_id: userId,
        provider: "gitlab",
        provider_user_id: userData.id.toString(),
        access_token,
        refresh_token,
        expires_at: expires_in ? new Date(Date.now() + expires_in * 1000).toISOString() : null,
        status: "connected" as const,
        scopes: ["read_user", "read_api", "read_repository", "write_repository"],
        metadata: {
          username: userData.username,
          user_name: userData.name,
          user_email: userData.email,
          avatar_url: userData.avatar_url,
          connected_at: new Date().toISOString(),
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
          console.error("Error updating GitLab integration:", error)
          throw error
        }
      } else {
        const { error } = await supabase.from("integrations").insert(integrationData)
        if (error) {
          console.error("Error inserting GitLab integration:", error)
          throw error
        }
      }

      return {
        success: true,
        redirectUrl: `${baseUrl}/integrations?success=gitlab_connected`,
      }
    } catch (error: any) {
      console.error("GitLab OAuth error:", error)
      return {
        success: false,
        redirectUrl: `${baseUrl}/integrations?error=callback_failed&provider=gitlab&message=${encodeURIComponent(error.message)}`,
        error: error.message,
      }
    }
  }
}

// Export alias for compatibility
export const GitLabOAuth = GitLabOAuthService
