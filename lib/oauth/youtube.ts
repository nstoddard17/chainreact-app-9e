import { createServerComponentClient } from "@supabase/auth-helpers-nextjs"
import { cookies } from "next/headers"

interface YouTubeOAuthResult {
  success: boolean
  redirectUrl: string
  error?: string
}

export class YouTubeOAuthService {
  private static getClientCredentials() {
    const clientId = process.env.NEXT_PUBLIC_YOUTUBE_CLIENT_ID
    const clientSecret = process.env.YOUTUBE_CLIENT_SECRET

    if (!clientId || !clientSecret) {
      throw new Error("Missing YouTube OAuth configuration")
    }

    return { clientId, clientSecret }
  }

  static generateAuthUrl(baseUrl: string, reconnect = false, integrationId?: string, userId?: string): string {
    const clientId = process.env.NEXT_PUBLIC_YOUTUBE_CLIENT_ID
    if (!clientId) {
      throw new Error("Missing NEXT_PUBLIC_YOUTUBE_CLIENT_ID environment variable")
    }

    // Use the exact redirect URI that should be registered in Google Cloud Console
    const redirectUri = "https://chainreact.app/api/integrations/youtube/callback"

    // Use YouTube-specific scopes that are more likely to be approved
    const scopes = [
      "https://www.googleapis.com/auth/youtube.readonly",
      "https://www.googleapis.com/auth/userinfo.profile",
      "https://www.googleapis.com/auth/userinfo.email",
    ]

    const state = btoa(
      JSON.stringify({
        provider: "youtube",
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
      access_type: "offline",
      prompt: reconnect ? "consent" : "select_account",
      state,
      include_granted_scopes: "true", // This helps with incremental authorization
    })

    return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`
  }

  static getRedirectUri(baseUrl: string): string {
    // Always return the production URL that should be registered in Google Cloud Console
    return "https://chainreact.app/api/integrations/youtube/callback"
  }

  static async handleCallback(code: string, state: string, baseUrl: string): Promise<YouTubeOAuthResult> {
    try {
      const stateData = JSON.parse(atob(state))
      const { provider, reconnect, integrationId } = stateData

      if (provider !== "youtube") {
        throw new Error("Invalid provider in state")
      }

      const { clientId, clientSecret } = this.getClientCredentials()

      const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          client_id: clientId,
          client_secret: clientSecret,
          code,
          grant_type: "authorization_code",
          redirect_uri: "https://chainreact.app/api/integrations/youtube/callback", // Use exact same URI
        }),
      })

      if (!tokenResponse.ok) {
        const errorData = await tokenResponse.text()
        throw new Error(`Token exchange failed: ${errorData}`)
      }

      const tokenData = await tokenResponse.json()
      const { access_token, refresh_token, expires_in } = tokenData

      // Try YouTube API first, then fall back to basic Google profile
      let userData
      let channelId
      let channelTitle

      try {
        const userResponse = await fetch("https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true", {
          headers: {
            Authorization: `Bearer ${access_token}`,
          },
        })

        if (userResponse.ok) {
          userData = await userResponse.json()
          const channel = userData.items?.[0]
          channelId = channel?.id
          channelTitle = channel?.snippet?.title
        }
      } catch (e) {
        console.warn("YouTube API not accessible, using basic profile")
      }

      // Fall back to basic Google profile if YouTube API fails
      if (!channelId) {
        try {
          const profileResponse = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
            headers: {
              Authorization: `Bearer ${access_token}`,
            },
          })

          if (profileResponse.ok) {
            const profileData = await profileResponse.json()
            channelId = profileData.id
            channelTitle = profileData.name || "YouTube User"
          }
        } catch (e) {
          console.error("Error fetching Google profile:", e)
          channelId = `youtube_${Date.now()}`
          channelTitle = "YouTube User"
        }
      }

      const supabase = createServerComponentClient({ cookies })
      const { data: sessionData, error: sessionError } = await supabase.auth.getSession()

      if (sessionError || !sessionData?.session) {
        throw new Error("No active user session found")
      }

      const integrationData = {
        user_id: sessionData.session.user.id,
        provider: "youtube",
        provider_user_id: channelId,
        access_token,
        refresh_token,
        expires_at: expires_in ? new Date(Date.now() + expires_in * 1000).toISOString() : null,
        status: "connected" as const,
        scopes: tokenData.scope ? tokenData.scope.split(" ") : ["https://www.googleapis.com/auth/youtube.readonly"],
        metadata: {
          channel_id: channelId,
          channel_title: channelTitle,
          connected_at: new Date().toISOString(),
          token_type: tokenData.token_type || "Bearer",
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
        redirectUrl: `${baseUrl}/integrations?success=youtube_connected`,
      }
    } catch (error: any) {
      return {
        success: false,
        redirectUrl: `${baseUrl}/integrations?error=callback_failed&provider=youtube&message=${encodeURIComponent(error.message)}`,
        error: error.message,
      }
    }
  }
}

export const YoutubeOAuth = YouTubeOAuthService
