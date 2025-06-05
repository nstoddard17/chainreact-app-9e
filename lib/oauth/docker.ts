import { createServerComponentClient } from "@supabase/auth-helpers-nextjs"
import { cookies } from "next/headers"

interface DockerOAuthResult {
  success: boolean
  redirectUrl: string
  error?: string
}

export class DockerOAuthService {
  private static getClientCredentials() {
    const clientId = process.env.NEXT_PUBLIC_DOCKER_CLIENT_ID
    const clientSecret = process.env.DOCKER_CLIENT_SECRET

    if (!clientId || !clientSecret) {
      throw new Error("Missing Docker OAuth configuration")
    }

    return { clientId, clientSecret }
  }

  static generateAuthUrl(baseUrl: string, reconnect = false, integrationId?: string): string {
    const clientId = process.env.NEXT_PUBLIC_DOCKER_CLIENT_ID
    if (!clientId) {
      throw new Error("Missing NEXT_PUBLIC_DOCKER_CLIENT_ID environment variable")
    }

    const redirectUri = "https://chainreact.app/api/integrations/docker/callback"

    const scopes = ["repo:admin", "repo:write", "repo:read"]

    const state = btoa(
      JSON.stringify({
        provider: "docker",
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

    return `https://hub.docker.com/oauth/authorize?${params.toString()}`
  }

  static getRedirectUri(baseUrl: string): string {
    return "https://chainreact.app/api/integrations/docker/callback"
  }

  static async handleCallback(code: string, state: string, baseUrl: string): Promise<DockerOAuthResult> {
    try {
      const stateData = JSON.parse(atob(state))
      const { provider, reconnect, integrationId } = stateData

      if (provider !== "docker") {
        throw new Error("Invalid provider in state")
      }

      const { clientId, clientSecret } = this.getClientCredentials()

      const tokenResponse = await fetch("https://hub.docker.com/v2/oauth2/token/", {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          grant_type: "authorization_code",
          client_id: clientId,
          client_secret: clientSecret,
          redirect_uri: "https://chainreact.app/api/integrations/docker/callback",
          code,
        }),
      })

      if (!tokenResponse.ok) {
        const errorData = await tokenResponse.text()
        throw new Error(`Token exchange failed: ${errorData}`)
      }

      const tokenData = await tokenResponse.json()
      const { access_token, refresh_token, expires_in } = tokenData

      const userResponse = await fetch("https://hub.docker.com/v2/user/", {
        headers: {
          Authorization: `Bearer ${access_token}`,
        },
      })

      if (!userResponse.ok) {
        const errorData = await userResponse.text()
        throw new Error(`Failed to get user info: ${errorData}`)
      }

      const userData = await userResponse.json()

      const supabase = createServerComponentClient({ cookies })
      const { data: sessionData, error: sessionError } = await supabase.auth.getSession()

      if (sessionError || !sessionData?.session) {
        throw new Error("No active user session found")
      }

      const integrationData = {
        user_id: sessionData.session.user.id,
        provider: "docker",
        provider_user_id: userData.id.toString(),
        access_token,
        refresh_token,
        expires_at: expires_in ? new Date(Date.now() + expires_in * 1000).toISOString() : null,
        status: "connected" as const,
        scopes: ["repo:read", "repo:write"],
        metadata: {
          username: userData.username,
          user_name: userData.full_name,
          user_email: userData.email,
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

        if (error) throw error
      } else {
        const { error } = await supabase.from("integrations").insert(integrationData)
        if (error) throw error
      }

      return {
        success: true,
        redirectUrl: `${baseUrl}/integrations?success=docker_connected`,
      }
    } catch (error: any) {
      return {
        success: false,
        redirectUrl: `${baseUrl}/integrations?error=callback_failed&provider=docker&message=${encodeURIComponent(error.message)}`,
        error: error.message,
      }
    }
  }
}

// Export alias for compatibility
export const DockerOAuth = DockerOAuthService
