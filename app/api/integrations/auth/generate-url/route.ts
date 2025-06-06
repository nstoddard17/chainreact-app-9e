import { type NextRequest, NextResponse } from "next/server"
import { GoogleOAuthService } from "@/lib/oauth/google"
import { SlackOAuthService } from "@/lib/oauth/slack"
import { GitHubOAuthService } from "@/lib/oauth/github"
import { DiscordOAuthService } from "@/lib/oauth/discord"
import { TrelloOAuthService } from "@/lib/oauth/trello"

export async function POST(request: NextRequest) {
  try {
    const { provider, userId } = await request.json()

    console.log("Generate URL request:", { provider, userId })

    if (!provider) {
      return NextResponse.json({ error: "Provider is required" }, { status: 400 })
    }

    if (!userId) {
      return NextResponse.json({ error: "User ID is required" }, { status: 400 })
    }

    let authUrl: string

    switch (provider.toLowerCase()) {
      case "google":
        authUrl = GoogleOAuthService.generateAuthUrl("https://chainreact.app", false, undefined, userId)
        break
      case "slack":
        authUrl = SlackOAuthService.generateAuthUrl("https://chainreact.app", false, undefined, userId)
        break
      case "github":
        authUrl = GitHubOAuthService.generateAuthUrl("https://chainreact.app", false, undefined, userId)
        break
      case "discord":
        authUrl = DiscordOAuthService.generateAuthUrl("https://chainreact.app", false, undefined, userId)
        break
      case "trello":
        authUrl = TrelloOAuthService.generateAuthUrl("https://chainreact.app", false, undefined, userId)
        break
      default:
        return NextResponse.json({ error: `Provider ${provider} not yet supported` }, { status: 400 })
    }

    console.log("Generated auth URL successfully")
    return NextResponse.json({ authUrl })
  } catch (error: any) {
    console.error("Error generating auth URL:", error)
    return NextResponse.json({ error: error.message || "Failed to generate auth URL" }, { status: 500 })
  }
}
