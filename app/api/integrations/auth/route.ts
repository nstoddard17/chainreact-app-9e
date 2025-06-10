import { type NextRequest, NextResponse } from "next/server"
import { getBaseUrl } from "@/lib/utils"

export async function GET(request: NextRequest): Promise<NextResponse> {
  const { searchParams } = new URL(request.url)
  const type = searchParams.get("type")
  const reconnect = searchParams.get("reconnect") === "true"
  const integrationId = searchParams.get("integrationId") as string
  const userId = searchParams.get("userId") as string

  if (!type) {
    return NextResponse.json({ error: "Missing type parameter" }, { status: 400 })
  }

  try {
    let authUrl = ""
    const baseUrl = getBaseUrl()

    switch (type) {
      case "google":
        const { GoogleOAuthService } = await import("@/lib/oauth/google")
        authUrl = GoogleOAuthService.generateAuthUrl(baseUrl, reconnect, integrationId, userId)
        break
      case "microsoft":
      case "teams":
        const { MicrosoftOAuthService } = await import("@/lib/oauth/microsoft")
        authUrl = MicrosoftOAuthService.generateAuthUrl(baseUrl, reconnect, integrationId, userId)
        break
      case "slack":
        const { SlackOAuthService } = await import("@/lib/oauth/slack")
        authUrl = SlackOAuthService.generateAuthUrl(baseUrl, reconnect, integrationId, userId)
        break
      case "linear":
        const { LinearOAuthService } = await import("@/lib/oauth/linear")
        authUrl = LinearOAuthService.generateAuthUrl(baseUrl, reconnect, integrationId, userId)
        break
      case "github":
        const { GitHubOAuthService } = await import("@/lib/oauth/github")
        authUrl = GitHubOAuthService.generateAuthUrl(baseUrl, reconnect, integrationId, userId)
        break
      case "discord":
        const { DiscordOAuthService } = await import("@/lib/oauth/discord")
        authUrl = DiscordOAuthService.generateAuthUrl(baseUrl, reconnect, integrationId, userId)
        break
      case "dropbox":
        const { DropboxOAuthService } = await import("@/lib/oauth/dropbox")
        authUrl = DropboxOAuthService.generateAuthUrl(baseUrl, reconnect, integrationId, userId)
        break
      default:
        return NextResponse.json({ error: `Unsupported OAuth provider: ${type}` }, { status: 400 })
    }

    return NextResponse.redirect(authUrl)
  } catch (error: any) {
    console.error(`OAuth error for ${type}:`, error)
    return NextResponse.json(
      {
        error: `Failed to generate OAuth URL for ${type}: ${error.message}`,
      },
      { status: 500 },
    )
  }
}
