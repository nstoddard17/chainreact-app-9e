import { type NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { TwitterOAuthService } from "@/lib/oauth/twitter"
import { SlackOAuthService } from "@/lib/oauth/SlackOAuthService"
import { DiscordOAuthService } from "@/lib/oauth/DiscordOAuthService"
import { DropboxOAuthService } from "@/lib/oauth/DropboxOAuthService"
import { TrelloOAuthService } from "@/lib/oauth/TrelloOAuthService"

export async function POST(request: NextRequest) {
  try {
    const { provider } = await request.json()
    const authHeader = request.headers.get("authorization")

    if (!authHeader?.startsWith("Bearer ")) {
      return NextResponse.json({ error: "Missing or invalid authorization header" }, { status: 401 })
    }

    const token = authHeader.split(" ")[1]

    // Create Supabase client and verify the session
    const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser(token)

    if (userError || !user) {
      return NextResponse.json({ error: "Invalid session" }, { status: 401 })
    }

    const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || `${request.nextUrl.protocol}//${request.nextUrl.host}`

    let authUrl: string

    switch (provider) {
      case "twitter":
        authUrl = await TwitterOAuthService.generateAuthUrl(baseUrl, false, undefined, user.id)
        break
      case "slack":
        authUrl = await SlackOAuthService.generateAuthUrl(baseUrl, false, undefined, user.id)
        break
      case "discord":
        authUrl = await DiscordOAuthService.generateAuthUrl(baseUrl, false, undefined, user.id)
        break
      case "dropbox":
        authUrl = await DropboxOAuthService.generateAuthUrl(baseUrl, false, undefined, user.id)
        break
      case "trello":
        authUrl = await TrelloOAuthService.generateAuthUrl(baseUrl, false, undefined, user.id)
        break
      default:
        // For other providers, use the generic OAuth service
        const { generateOAuthUrl } = await import("@/lib/oauth/oauthService")
        const result = await generateOAuthUrl(provider, user.id, baseUrl)
        if (!result.success) {
          return NextResponse.json({ error: result.error }, { status: 400 })
        }
        authUrl = result.authUrl!
        break
    }

    return NextResponse.json({
      success: true,
      authUrl,
    })
  } catch (error: any) {
    console.error("Error generating OAuth URL:", error)
    return NextResponse.json({ error: error.message || "Failed to generate OAuth URL" }, { status: 500 })
  }
}
