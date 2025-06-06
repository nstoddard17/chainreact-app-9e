import { type NextRequest, NextResponse } from "next/server"
import { GoogleOAuthService } from "@/lib/oauth/google"
import { SlackOAuthService } from "@/lib/oauth/slack"
import { GitHubOAuthService } from "@/lib/oauth/github"
import { DiscordOAuthService } from "@/lib/oauth/discord"
import { TrelloOAuthService } from "@/lib/oauth/trello"
import { TeamsOAuthService } from "@/lib/oauth/teams"
import { NotionOAuthService } from "@/lib/oauth/notion"
import { AirtableOAuthService } from "@/lib/oauth/airtable"
import { DropboxOAuthService } from "@/lib/oauth/dropbox"
import { HubSpotOAuthService } from "@/lib/oauth/hubspot"
import { LinkedInOAuthService } from "@/lib/oauth/linkedin"
import { FacebookOAuthService } from "@/lib/oauth/facebook"
import { InstagramOAuthService } from "@/lib/oauth/instagram"
import { TwitterOAuthService } from "@/lib/oauth/twitter"
import { TikTokOAuthService } from "@/lib/oauth/tiktok"
import { YouTubeOAuthService } from "@/lib/oauth/youtube"
import { MailchimpOAuthService } from "@/lib/oauth/mailchimp"
import { ShopifyOAuthService } from "@/lib/oauth/shopify"
import { StripeOAuthService } from "@/lib/oauth/stripe"
import { PayPalOAuthService } from "@/lib/oauth/paypal"
import { GitLabOAuthService } from "@/lib/oauth/gitlab"
import { OneDriveOAuthService } from "@/lib/oauth/onedrive"

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

    try {
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
        case "teams":
          authUrl = TeamsOAuthService.generateAuthUrl("https://chainreact.app", false, undefined, userId)
          break
        case "notion":
          authUrl = NotionOAuthService.generateAuthUrl("https://chainreact.app", false, undefined, userId)
          break
        case "airtable":
          authUrl = AirtableOAuthService.generateAuthUrl("https://chainreact.app", false, undefined, userId)
          break
        case "dropbox":
          authUrl = DropboxOAuthService.generateAuthUrl("https://chainreact.app", false, undefined, userId)
          break
        case "hubspot":
          authUrl = HubSpotOAuthService.generateAuthUrl("https://chainreact.app", false, undefined, userId)
          break
        case "linkedin":
          authUrl = LinkedInOAuthService.generateAuthUrl("https://chainreact.app", false, undefined, userId)
          break
        case "facebook":
          authUrl = FacebookOAuthService.generateAuthUrl("https://chainreact.app", false, undefined, userId)
          break
        case "instagram":
          authUrl = InstagramOAuthService.generateAuthUrl("https://chainreact.app", false, undefined, userId)
          break
        case "twitter":
          authUrl = TwitterOAuthService.generateAuthUrl("https://chainreact.app", false, undefined, userId)
          break
        case "tiktok":
          authUrl = TikTokOAuthService.generateAuthUrl("https://chainreact.app", false, undefined, userId)
          break
        case "youtube":
          authUrl = YouTubeOAuthService.generateAuthUrl("https://chainreact.app", false, undefined, userId)
          break
        case "mailchimp":
          authUrl = MailchimpOAuthService.generateAuthUrl("https://chainreact.app", false, undefined, userId)
          break
        case "shopify":
          authUrl = ShopifyOAuthService.generateAuthUrl("https://chainreact.app", false, undefined, userId)
          break
        case "stripe":
          authUrl = StripeOAuthService.generateAuthUrl("https://chainreact.app", false, undefined, userId)
          break
        case "paypal":
          authUrl = PayPalOAuthService.generateAuthUrl("https://chainreact.app", false, undefined, userId)
          break
        case "gitlab":
          authUrl = GitLabOAuthService.generateAuthUrl("https://chainreact.app", false, undefined, userId)
          break
        case "onedrive":
          authUrl = OneDriveOAuthService.generateAuthUrl("https://chainreact.app", false, undefined, userId)
          break
        case "docker":
          // Docker is marked as coming soon, return a friendly message
          return NextResponse.json({ error: "Docker Hub integration is coming soon" }, { status: 400 })
        default:
          return NextResponse.json({ error: `Provider ${provider} not yet supported` }, { status: 400 })
      }
    } catch (configError: any) {
      console.error(`Configuration error for ${provider}:`, configError)

      // Check if it's a configuration error
      if (configError.message.includes("Missing") && configError.message.includes("OAuth configuration")) {
        return NextResponse.json(
          {
            error: `${provider} integration is not configured. Please contact support to enable this integration.`,
            details: configError.message,
          },
          { status: 503 },
        ) // Service Unavailable
      }

      // Re-throw other errors
      throw configError
    }

    console.log("Generated auth URL successfully")
    return NextResponse.json({ authUrl })
  } catch (error: any) {
    console.error("Error generating auth URL:", error)
    return NextResponse.json({ error: error.message || "Failed to generate auth URL" }, { status: 500 })
  }
}
