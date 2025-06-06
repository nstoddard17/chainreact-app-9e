import { type NextRequest, NextResponse } from "next/server"
import { GoogleOAuthService } from "@/lib/oauth/google"
import { SlackOAuthService } from "@/lib/oauth/slack"
import { GitHubOAuthService } from "@/lib/oauth/github"
import { DiscordOAuthService } from "@/lib/oauth/discord"
import { TrelloOAuthService } from "@/lib/oauth/trello"
// Import other OAuth services as needed

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const body = await request.json()
    const { provider, userId, reconnect = false, integrationId } = body

    if (!provider) {
      return NextResponse.json({ error: "Provider is required" }, { status: 400 })
    }

    if (!userId) {
      return NextResponse.json({ error: "User ID is required" }, { status: 400 })
    }

    let authUrl: string

    // Generate the appropriate OAuth URL based on the provider
    switch (provider.toLowerCase()) {
      case "google":
        authUrl = GoogleOAuthService.generateAuthUrl("https://chainreact.app", reconnect, integrationId, userId)
        break
      case "slack":
        authUrl = SlackOAuthService.generateAuthUrl("https://chainreact.app", reconnect, integrationId, userId)
        break
      case "github":
        authUrl = GitHubOAuthService.generateAuthUrl("https://chainreact.app", reconnect, integrationId, userId)
        break
      case "discord":
        authUrl = DiscordOAuthService.generateAuthUrl("https://chainreact.app", reconnect, integrationId, userId)
        break
      case "trello":
        authUrl = TrelloOAuthService.generateAuthUrl("https://chainreact.app", reconnect, integrationId, userId)
        break
      // Add cases for other providers
      default:
        return NextResponse.json({ error: `Unsupported provider: ${provider}` }, { status: 400 })
    }

    return NextResponse.json({ authUrl })
  } catch (error: any) {
    console.error("Error generating auth URL:", error)
    return NextResponse.json({ error: error.message || "Failed to generate authentication URL" }, { status: 500 })
  }
}
