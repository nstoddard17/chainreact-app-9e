import { type NextRequest, NextResponse } from "next/server"
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs"
import { cookies } from "next/headers"
import type { Database } from "@/types/supabase"

export async function POST(request: NextRequest) {
  try {
    const supabase = createRouteHandlerClient<Database>({ cookies })
    const { provider, userId } = await request.json()

    console.log("Generate auth URL request:", { provider, userId })

    if (!provider) {
      return NextResponse.json({ error: "Provider is required" }, { status: 400 })
    }

    // Get the current user if userId not provided
    let currentUserId = userId
    if (!currentUserId) {
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser()

      if (userError || !user) {
        console.error("User authentication error:", userError)
        return NextResponse.json({ error: "Authentication required" }, { status: 401 })
      }
      currentUserId = user.id
    }

    console.log("Using user ID:", currentUserId)

    const baseUrl = new URL(request.url).origin

    let authUrl: string

    switch (provider) {
      case "google":
        const googleClientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID
        if (!googleClientId) {
          return NextResponse.json({ error: "Google OAuth not configured" }, { status: 503 })
        }

        const googleScopes = [
          "openid",
          "profile",
          "email",
          "https://www.googleapis.com/auth/calendar",
          "https://www.googleapis.com/auth/spreadsheets",
          "https://www.googleapis.com/auth/documents",
          "https://www.googleapis.com/auth/gmail.modify",
          "https://www.googleapis.com/auth/youtube",
        ]

        const googleState = btoa(JSON.stringify({ provider: "google", userId: currentUserId }))

        authUrl = `https://accounts.google.com/o/oauth2/v2/auth?${new URLSearchParams({
          client_id: googleClientId,
          redirect_uri: `${baseUrl}/api/integrations/google/callback`,
          response_type: "code",
          scope: googleScopes.join(" "),
          access_type: "offline",
          prompt: "consent",
          state: googleState,
        }).toString()}`
        break

      case "slack":
        const slackClientId = process.env.NEXT_PUBLIC_SLACK_CLIENT_ID
        if (!slackClientId) {
          return NextResponse.json({ error: "Slack OAuth not configured" }, { status: 503 })
        }

        const slackScopes = ["chat:write", "channels:read", "users:read", "files:write"]
        const slackState = btoa(JSON.stringify({ provider: "slack", userId: currentUserId }))

        authUrl = `https://slack.com/oauth/v2/authorize?${new URLSearchParams({
          client_id: slackClientId,
          scope: slackScopes.join(","),
          redirect_uri: `${baseUrl}/api/integrations/slack/callback`,
          state: slackState,
        }).toString()}`
        break

      case "github":
        const githubClientId = process.env.NEXT_PUBLIC_GITHUB_CLIENT_ID
        if (!githubClientId) {
          return NextResponse.json({ error: "GitHub OAuth not configured" }, { status: 503 })
        }

        const githubScopes = ["user:email", "repo", "workflow"]
        const githubState = btoa(JSON.stringify({ provider: "github", userId: currentUserId }))

        authUrl = `https://github.com/login/oauth/authorize?${new URLSearchParams({
          client_id: githubClientId,
          scope: githubScopes.join(" "),
          redirect_uri: `${baseUrl}/api/integrations/github/callback`,
          state: githubState,
        }).toString()}`
        break

      case "discord":
        const discordClientId = process.env.NEXT_PUBLIC_DISCORD_CLIENT_ID
        if (!discordClientId) {
          return NextResponse.json({ error: "Discord OAuth not configured" }, { status: 503 })
        }

        const discordScopes = ["identify", "guilds", "guilds.join", "messages.read"]
        const discordState = btoa(JSON.stringify({ provider: "discord", userId: currentUserId }))

        authUrl = `https://discord.com/api/oauth2/authorize?${new URLSearchParams({
          client_id: discordClientId,
          redirect_uri: `${baseUrl}/api/integrations/discord/callback`,
          response_type: "code",
          scope: discordScopes.join(" "),
          state: discordState,
        }).toString()}`
        break

      case "twitter":
        const twitterClientId = process.env.NEXT_PUBLIC_TWITTER_CLIENT_ID
        if (!twitterClientId) {
          return NextResponse.json({ error: "X (Twitter) OAuth not configured" }, { status: 503 })
        }

        try {
          const { TwitterOAuthService } = await import("@/lib/oauth/twitter")
          authUrl = TwitterOAuthService.generateAuthUrl(baseUrl, false, undefined, currentUserId)
        } catch (error: any) {
          console.error("Twitter auth URL generation error:", error)
          return NextResponse.json({ error: error.message }, { status: 500 })
        }
        break

      case "teams":
        const teamsClientId = process.env.NEXT_PUBLIC_TEAMS_CLIENT_ID
        if (!teamsClientId) {
          return NextResponse.json({ error: "Microsoft Teams OAuth not configured" }, { status: 503 })
        }

        const teamsScopes = ["openid", "profile", "email", "offline_access", "User.Read", "Chat.ReadWrite"]
        const teamsState = btoa(JSON.stringify({ provider: "teams", userId: currentUserId }))

        authUrl = `https://login.microsoftonline.com/common/oauth2/v2.0/authorize?${new URLSearchParams({
          client_id: teamsClientId,
          response_type: "code",
          redirect_uri: `${baseUrl}/api/integrations/teams/callback`,
          scope: teamsScopes.join(" "),
          state: teamsState,
        }).toString()}`
        break

      case "facebook":
        const facebookClientId = process.env.NEXT_PUBLIC_FACEBOOK_CLIENT_ID
        if (!facebookClientId) {
          return NextResponse.json({ error: "Facebook OAuth not configured" }, { status: 503 })
        }

        const facebookScopes = ["public_profile", "email", "pages_show_list", "pages_manage_posts"]
        const facebookState = btoa(JSON.stringify({ provider: "facebook", userId: currentUserId }))

        authUrl = `https://www.facebook.com/v18.0/dialog/oauth?${new URLSearchParams({
          client_id: facebookClientId,
          redirect_uri: `${baseUrl}/api/integrations/facebook/callback`,
          scope: facebookScopes.join(","),
          state: facebookState,
        }).toString()}`
        break

      default:
        return NextResponse.json({ error: `Provider ${provider} not supported yet` }, { status: 400 })
    }

    console.log("Generated auth URL for", provider)
    return NextResponse.json({ authUrl })
  } catch (error: any) {
    console.error("Error generating auth URL:", error)
    return NextResponse.json({ error: error.message || "Failed to generate auth URL" }, { status: 500 })
  }
}
