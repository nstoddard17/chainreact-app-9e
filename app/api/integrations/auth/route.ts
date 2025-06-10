import { type NextRequest, NextResponse } from "next/server"
import { getBaseUrl } from "@/lib/utils"

export async function GET(request: NextRequest): Promise<NextResponse> {
  const { searchParams } = new URL(request.url)
  const type = searchParams.get("type") as "google" | "microsoft" | "slack" | "linear" | "github"
  const reconnect = searchParams.get("reconnect") === "true"
  const integrationId = searchParams.get("integrationId") as string
  const userId = searchParams.get("userId") as string

  if (!type) {
    return NextResponse.json({ error: "Missing type parameter" }, { status: 400 })
  }

  let authUrl = ""
  const baseUrl = getBaseUrl()

  switch (type) {
    case "google":
      const googleService = await import("@/lib/oauth/google")
      authUrl = googleService.GoogleOAuthService.generateAuthUrl(baseUrl, reconnect, integrationId, userId)
      break
    case "microsoft":
      const microsoftService = await import("@/lib/oauth/microsoft")
      authUrl = microsoftService.MicrosoftOAuthService.generateAuthUrl(baseUrl, reconnect, integrationId, userId)
      break
    case "slack":
      const slackService = await import("@/lib/oauth/slack")
      authUrl = slackService.SlackOAuthService.generateAuthUrl(
        baseUrl,
        reconnect,
        integrationId,
        userId,
        request, // Pass the request object
      )
      break
    case "linear":
      const linearService = await import("@/lib/oauth/linear")
      authUrl = linearService.LinearOAuthService.generateAuthUrl(baseUrl, reconnect, integrationId, userId)
      break
    case "github":
      const githubService = await import("@/lib/oauth/github")
      authUrl = githubService.GithubOAuthService.generateAuthUrl(baseUrl, reconnect, integrationId, userId)
      break
    default:
      return NextResponse.json({ error: "Invalid type" }, { status: 400 })
  }

  return NextResponse.redirect(authUrl)
}
