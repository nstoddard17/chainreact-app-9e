import { type NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { SlackOAuthService } from "@/lib/oauth/slack"
import { DiscordOAuthService } from "@/lib/oauth/discord"
import { TrelloOAuthService } from "@/lib/oauth/trello"
import { DropboxOAuthService } from "@/lib/oauth/dropbox"
import { TwitterOAuthService } from "@/lib/oauth/twitter"
import { LinkedInOAuthService } from "@/lib/oauth/linkedin"
import { getAbsoluteBaseUrl } from "@/lib/oauth/utils"

export async function POST(request: NextRequest) {
  try {
    const { userId } = await request.json()

    if (!userId) {
      return NextResponse.json({ error: "User ID is required" }, { status: 400 })
    }

    // Get all connected integrations for the user
    const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

    const { data: integrations, error } = await supabase
      .from("integrations")
      .select("*")
      .eq("user_id", userId)
      .eq("status", "connected")

    if (error) {
      console.error("Error fetching integrations:", error)
      return NextResponse.json({ error: "Failed to fetch integrations" }, { status: 500 })
    }

    if (!integrations || integrations.length === 0) {
      return NextResponse.json({
        message: "No connected integrations found",
        reconnectionUrls: [],
      })
    }

    const baseUrl = getAbsoluteBaseUrl(request)
    const reconnectionUrls: Array<{ provider: string; url: string; silent: boolean }> = []

    // Generate silent reconnection URLs for each connected integration
    for (const integration of integrations) {
      try {
        let authUrl: string
        let silent = true

        const state = btoa(
          JSON.stringify({
            provider: integration.provider,
            userId,
            reconnect: true,
            integrationId: integration.id,
            silent: true,
            timestamp: Date.now(),
          }),
        )

        switch (integration.provider.toLowerCase()) {
          case "google":
          case "gmail":
          case "google-drive":
          case "google-calendar":
          case "google-sheets":
          case "google-docs":
            // Google silent refresh
            const googleScopes = getGoogleScopes(integration.provider)
            const googleParams = new URLSearchParams({
              client_id: process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID!,
              redirect_uri: `${baseUrl}/api/integrations/${integration.provider}/callback`,
              response_type: "code",
              scope: googleScopes.join(" "),
              access_type: "offline",
              prompt: "none", // Silent refresh
              state,
              include_granted_scopes: "true",
            })
            authUrl = `https://accounts.google.com/o/oauth2/v2/auth?${googleParams.toString()}`
            break

          case "teams":
          case "onedrive":
            // Microsoft silent refresh
            const msParams = new URLSearchParams({
              client_id: process.env.NEXT_PUBLIC_TEAMS_CLIENT_ID!,
              response_type: "code",
              redirect_uri: `${baseUrl}/api/integrations/${integration.provider}/callback`,
              scope: getMicrosoftScopes(integration.provider).join(" "),
              prompt: "none", // Silent refresh
              state,
            })
            authUrl = `https://login.microsoftonline.com/common/oauth2/v2.0/authorize?${msParams.toString()}`
            break

          case "slack":
            // Slack doesn't support silent refresh, but we can try with minimal prompts
            authUrl = SlackOAuthService.generateAuthUrl(baseUrl, true, integration.id, userId)
            silent = false
            break

          case "discord":
            // Discord doesn't support silent refresh
            authUrl = DiscordOAuthService.generateAuthUrl(baseUrl, true, integration.id, userId)
            silent = false
            break

          case "github":
            // GitHub silent refresh attempt
            const githubParams = new URLSearchParams({
              client_id: process.env.NEXT_PUBLIC_GITHUB_CLIENT_ID!,
              redirect_uri: `${baseUrl}/api/integrations/github/callback`,
              scope: "repo user",
              state,
              allow_signup: "false", // Don't show signup option
            })
            authUrl = `https://github.com/login/oauth/authorize?${githubParams.toString()}`
            silent = false // GitHub doesn't have true silent refresh
            break

          case "dropbox":
            authUrl = DropboxOAuthService.generateAuthUrl(baseUrl, true, integration.id, userId)
            silent = false
            break

          case "linkedin":
            authUrl = LinkedInOAuthService.generateAuthUrl(baseUrl, true, integration.id, userId)
            silent = false
            break

          case "twitter":
            authUrl = TwitterOAuthService.generateAuthUrl(baseUrl, true, integration.id, userId)
            silent = false
            break

          case "trello":
            authUrl = TrelloOAuthService.generateAuthUrl(baseUrl, true, integration.id, userId)
            silent = false
            break

          default:
            console.log(`Skipping unsupported provider: ${integration.provider}`)
            continue
        }

        reconnectionUrls.push({
          provider: integration.provider,
          url: authUrl,
          silent,
        })
      } catch (error) {
        console.error(`Error generating reconnection URL for ${integration.provider}:`, error)
      }
    }

    return NextResponse.json({
      message: `Generated ${reconnectionUrls.length} reconnection URLs`,
      reconnectionUrls,
      totalIntegrations: integrations.length,
    })
  } catch (error: any) {
    console.error("Error in bulk-reconnect route:", error)
    return NextResponse.json(
      {
        error: "Internal server error",
        details: error.message,
      },
      { status: 500 },
    )
  }
}

function getGoogleScopes(provider: string): string[] {
  const baseScopes = [
    "https://www.googleapis.com/auth/userinfo.email",
    "https://www.googleapis.com/auth/userinfo.profile",
  ]

  switch (provider) {
    case "gmail":
      return [
        ...baseScopes,
        "https://www.googleapis.com/auth/gmail.send",
        "https://www.googleapis.com/auth/gmail.modify",
        "https://www.googleapis.com/auth/gmail.readonly",
      ]
    case "google-drive":
      return [...baseScopes, "https://www.googleapis.com/auth/drive", "https://www.googleapis.com/auth/drive.file"]
    case "google-calendar":
      return [
        ...baseScopes,
        "https://www.googleapis.com/auth/calendar",
        "https://www.googleapis.com/auth/calendar.events",
      ]
    case "google-sheets":
      return [...baseScopes, "https://www.googleapis.com/auth/spreadsheets"]
    case "google-docs":
      return [...baseScopes, "https://www.googleapis.com/auth/documents", "https://www.googleapis.com/auth/drive.file"]
    default:
      return [
        ...baseScopes,
        "https://www.googleapis.com/auth/calendar",
        "https://www.googleapis.com/auth/drive.file",
        "https://www.googleapis.com/auth/spreadsheets",
        "https://www.googleapis.com/auth/documents",
        "https://www.googleapis.com/auth/gmail.send",
        "https://www.googleapis.com/auth/youtube.readonly",
      ]
  }
}

function getMicrosoftScopes(provider: string): string[] {
  const baseScopes = ["openid", "profile", "email", "offline_access", "https://graph.microsoft.com/User.Read"]

  switch (provider) {
    case "teams":
      return [
        ...baseScopes,
        "https://graph.microsoft.com/Chat.ReadWrite",
        "https://graph.microsoft.com/ChannelMessage.Send",
        "https://graph.microsoft.com/Team.ReadBasic.All",
      ]
    case "onedrive":
      return [
        ...baseScopes,
        "https://graph.microsoft.com/Files.ReadWrite.All",
        "https://graph.microsoft.com/Sites.ReadWrite.All",
      ]
    default:
      return baseScopes
  }
}
