import { type NextRequest, NextResponse } from "next/server"
import { GoogleOAuthService } from "@/lib/oauth/google"
import { SlackOAuthService } from "@/lib/oauth/slack"
import { GitHubOAuthService } from "@/lib/oauth/github"
import { DiscordOAuthService } from "@/lib/oauth/discord"
import { TrelloOAuthService } from "@/lib/oauth/trello"
import { createClient } from "@supabase/supabase-js"

export async function POST(request: NextRequest) {
  try {
    const { provider, userId } = await request.json()

    if (!provider) {
      return NextResponse.json({ error: "Provider is required" }, { status: 400 })
    }

    // Get user ID from token if not provided
    let actualUserId = userId
    if (!actualUserId) {
      const authHeader = request.headers.get("authorization")
      if (authHeader?.startsWith("Bearer ")) {
        const token = authHeader.substring(7)
        const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_ANON_KEY!)
        const { data } = await supabase.auth.getUser(token)
        actualUserId = data?.user?.id
      }
    }

    if (!actualUserId) {
      return NextResponse.json({ error: "User authentication required" }, { status: 401 })
    }

    let authUrl: string

    switch (provider.toLowerCase()) {
      case "google":
        authUrl = GoogleOAuthService.generateAuthUrl("https://chainreact.app", false, undefined, actualUserId)
        break
      case "slack":
        authUrl = SlackOAuthService.generateAuthUrl("https://chainreact.app", false, undefined, actualUserId)
        break
      case "github":
        authUrl = GitHubOAuthService.generateAuthUrl("https://chainreact.app", false, undefined, actualUserId)
        break
      case "discord":
        authUrl = DiscordOAuthService.generateAuthUrl("https://chainreact.app", false, undefined, actualUserId)
        break
      case "trello":
        authUrl = TrelloOAuthService.generateAuthUrl("https://chainreact.app", false, undefined, actualUserId)
        break
      default:
        return NextResponse.json({ error: `Provider ${provider} not yet supported` }, { status: 400 })
    }

    return NextResponse.json({ authUrl })
  } catch (error: any) {
    console.error("Error generating auth URL:", error)
    return NextResponse.json({ error: error.message || "Failed to generate auth URL" }, { status: 500 })
  }
}
