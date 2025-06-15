import { type NextRequest, NextResponse } from "next/server"
import { createServerSupabaseClient } from "@/lib/supabase-server"
import { generateOAuthState, getOAuthRedirectUri } from "@/lib/oauth/utils"

export async function POST(request: NextRequest) {
  try {
    const { provider } = await request.json()

    if (!provider) {
      return NextResponse.json({ error: "Provider is required" }, { status: 400 })
    }

    // Get user from session
    const supabase = createServerSupabaseClient()
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // Generate consistent redirect URI
    const redirectUri = getOAuthRedirectUri(provider)
    console.log(`Generating OAuth URL for ${provider} with redirect URI: ${redirectUri}`)

    // Generate state parameter
    const state = generateOAuthState({
      provider,
      userId: user.id,
      timestamp: Date.now(),
    })

    let authUrl: string

    switch (provider.toLowerCase()) {
      case "google":
        const googleScopes = [
          "https://www.googleapis.com/auth/userinfo.email",
          "https://www.googleapis.com/auth/userinfo.profile",
          "https://www.googleapis.com/auth/calendar",
          "https://www.googleapis.com/auth/drive.file",
          "https://www.googleapis.com/auth/spreadsheets",
          "https://www.googleapis.com/auth/documents",
          "https://www.googleapis.com/auth/gmail.send",
          "https://www.googleapis.com/auth/youtube.readonly",
        ]
        const googleParams = new URLSearchParams({
          client_id: process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID!,
          redirect_uri: redirectUri,
          response_type: "code",
          scope: googleScopes.join(" "),
          access_type: "offline",
          prompt: "consent",
          state,
          include_granted_scopes: "true",
        })
        authUrl = `https://accounts.google.com/o/oauth2/v2/auth?${googleParams.toString()}`
        break

      case "slack":
        const slackScopes = [
          "channels:read",
          "chat:write",
          "users:read",
          "team:read",
          "files:write",
          "channels:history",
          "groups:history",
          "im:history",
          "mpim:history",
        ]
        const slackParams = new URLSearchParams({
          client_id: process.env.NEXT_PUBLIC_SLACK_CLIENT_ID!,
          scope: slackScopes.join(","),
          redirect_uri: redirectUri,
          state,
          response_type: "code",
        })
        authUrl = `https://slack.com/oauth/v2/authorize?${slackParams.toString()}`
        break

      case "twitter":
        const twitterScopes = [
          "tweet.read",
          "tweet.write",
          "users.read",
          "follows.read",
          "follows.write",
          "offline.access",
        ]
        const twitterParams = new URLSearchParams({
          response_type: "code",
          client_id: process.env.NEXT_PUBLIC_TWITTER_CLIENT_ID!,
          redirect_uri: redirectUri,
          scope: twitterScopes.join(" "),
          state,
          code_challenge: "challenge",
          code_challenge_method: "plain",
        })
        authUrl = `https://twitter.com/i/oauth2/authorize?${twitterParams.toString()}`
        break

      case "github":
        const githubParams = new URLSearchParams({
          client_id: process.env.NEXT_PUBLIC_GITHUB_CLIENT_ID!,
          redirect_uri: redirectUri,
          scope: "repo user workflow",
          state,
          allow_signup: "true",
        })
        authUrl = `https://github.com/login/oauth/authorize?${githubParams.toString()}`
        break

      case "discord":
        const discordScopes = ["identify", "guilds", "guilds.join", "messages.read"]
        const discordParams = new URLSearchParams({
          client_id: process.env.NEXT_PUBLIC_DISCORD_CLIENT_ID!,
          redirect_uri: redirectUri,
          response_type: "code",
          scope: discordScopes.join(" "),
          prompt: "consent",
          state,
        })
        authUrl = `https://discord.com/api/oauth2/authorize?${discordParams.toString()}`
        break

      case "linkedin":
        const linkedinScopes = ["r_liteprofile", "r_emailaddress", "w_member_social"]
        const linkedinParams = new URLSearchParams({
          response_type: "code",
          client_id: process.env.NEXT_PUBLIC_LINKEDIN_CLIENT_ID!,
          redirect_uri: redirectUri,
          scope: linkedinScopes.join(" "),
          state,
        })
        authUrl = `https://www.linkedin.com/oauth/v2/authorization?${linkedinParams.toString()}`
        break

      case "facebook":
        const facebookScopes = ["email", "public_profile", "pages_manage_posts", "pages_read_engagement"]
        const facebookParams = new URLSearchParams({
          client_id: process.env.NEXT_PUBLIC_FACEBOOK_CLIENT_ID!,
          redirect_uri: redirectUri,
          scope: facebookScopes.join(","),
          response_type: "code",
          state,
        })
        authUrl = `https://www.facebook.com/v18.0/dialog/oauth?${facebookParams.toString()}`
        break

      case "dropbox":
        const dropboxParams = new URLSearchParams({
          client_id: process.env.NEXT_PUBLIC_DROPBOX_CLIENT_ID!,
          redirect_uri: redirectUri,
          response_type: "code",
          state,
        })
        authUrl = `https://www.dropbox.com/oauth2/authorize?${dropboxParams.toString()}`
        break

      case "teams":
      case "onedrive":
        const msScopes =
          provider === "teams"
            ? [
                "openid",
                "profile",
                "email",
                "offline_access",
                "https://graph.microsoft.com/User.Read",
                "https://graph.microsoft.com/Chat.ReadWrite",
                "https://graph.microsoft.com/ChannelMessage.Send",
                "https://graph.microsoft.com/Team.ReadBasic.All",
              ]
            : [
                "openid",
                "profile",
                "email",
                "offline_access",
                "https://graph.microsoft.com/User.Read",
                "https://graph.microsoft.com/Files.ReadWrite.All",
                "https://graph.microsoft.com/Sites.ReadWrite.All",
              ]
        const msParams = new URLSearchParams({
          client_id: process.env.NEXT_PUBLIC_TEAMS_CLIENT_ID!,
          response_type: "code",
          redirect_uri: redirectUri,
          scope: msScopes.join(" "),
          prompt: "consent",
          state,
        })
        authUrl = `https://login.microsoftonline.com/common/oauth2/v2.0/authorize?${msParams.toString()}`
        break

      case "hubspot":
        const hubspotScopes = ["contacts", "content", "reports", "social", "automation"]
        const hubspotParams = new URLSearchParams({
          client_id: process.env.NEXT_PUBLIC_HUBSPOT_CLIENT_ID!,
          redirect_uri: redirectUri,
          scope: hubspotScopes.join(" "),
          response_type: "code",
          state,
        })
        authUrl = `https://app.hubspot.com/oauth/authorize?${hubspotParams.toString()}`
        break

      default:
        return NextResponse.json({ error: `Unsupported provider: ${provider}` }, { status: 400 })
    }

    console.log(`Generated OAuth URL for ${provider}: ${authUrl.substring(0, 100)}...`)

    return NextResponse.json({
      authUrl,
      provider,
      redirectUri,
      state,
    })
  } catch (error: any) {
    console.error("Error generating OAuth URL:", error)
    return NextResponse.json(
      {
        error: "Failed to generate OAuth URL",
        details: process.env.NODE_ENV === "development" ? error.message : undefined,
      },
      { status: 500 },
    )
  }
}
