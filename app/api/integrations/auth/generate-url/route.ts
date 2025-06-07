import { type NextRequest, NextResponse } from "next/server"
import { SlackOAuthService } from "@/lib/oauth/slack"
import { DiscordOAuthService } from "@/lib/oauth/discord"
import { TrelloOAuthService } from "@/lib/oauth/trello"
import { DropboxOAuthService } from "@/lib/oauth/dropbox"
import { TwitterOAuthService } from "@/lib/oauth/twitter"
import { LinkedInOAuthService } from "@/lib/oauth/linkedin"
import { getAbsoluteBaseUrl } from "@/lib/oauth/utils"

export async function POST(request: NextRequest) {
  try {
    const { provider, userId, reconnect = false, integrationId } = await request.json()

    console.log("Generate auth URL request:", {
      provider,
      userId,
      reconnect,
      integrationId,
    })

    if (!provider || !userId) {
      return NextResponse.json({ error: "Provider and userId are required" }, { status: 400 })
    }

    const baseUrl = getAbsoluteBaseUrl(request)
    console.log("Base URL for OAuth:", baseUrl)

    let authUrl: string

    try {
      switch (provider.toLowerCase()) {
        case "twitter":
          authUrl = TwitterOAuthService.generateAuthUrl(baseUrl, reconnect, integrationId, userId)
          break
        case "slack":
          authUrl = SlackOAuthService.generateAuthUrl(baseUrl, reconnect, integrationId, userId)
          break
        case "discord":
          authUrl = DiscordOAuthService.generateAuthUrl(baseUrl, reconnect, integrationId, userId)
          break
        case "dropbox":
          authUrl = DropboxOAuthService.generateAuthUrl(baseUrl, reconnect, integrationId, userId)
          break
        case "linkedin":
          authUrl = LinkedInOAuthService.generateAuthUrl(baseUrl, reconnect, integrationId, userId)
          break
        case "gmail":
          const gmailScopes = [
            "https://www.googleapis.com/auth/userinfo.email",
            "https://www.googleapis.com/auth/userinfo.profile",
            "https://www.googleapis.com/auth/gmail.send",
            "https://www.googleapis.com/auth/gmail.modify",
            "https://www.googleapis.com/auth/gmail.readonly",
          ]
          const gmailState = btoa(
            JSON.stringify({
              provider: "gmail",
              userId,
              reconnect,
              integrationId,
              timestamp: Date.now(),
            }),
          )
          const gmailParams = new URLSearchParams({
            client_id: process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID!,
            redirect_uri: `${baseUrl}/api/integrations/gmail/callback`,
            response_type: "code",
            scope: gmailScopes.join(" "),
            access_type: "offline",
            prompt: "consent",
            state: gmailState,
          })
          authUrl = `https://accounts.google.com/o/oauth2/v2/auth?${gmailParams.toString()}`
          break
        case "google-drive":
          const driveScopes = [
            "https://www.googleapis.com/auth/userinfo.email",
            "https://www.googleapis.com/auth/userinfo.profile",
            "https://www.googleapis.com/auth/drive",
            "https://www.googleapis.com/auth/drive.file",
          ]
          const driveState = btoa(
            JSON.stringify({
              provider: "google-drive",
              userId,
              reconnect,
              integrationId,
              timestamp: Date.now(),
            }),
          )
          const driveParams = new URLSearchParams({
            client_id: process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID!,
            redirect_uri: `${baseUrl}/api/integrations/google-drive/callback`,
            response_type: "code",
            scope: driveScopes.join(" "),
            access_type: "offline",
            prompt: "consent",
            state: driveState,
          })
          authUrl = `https://accounts.google.com/o/oauth2/v2/auth?${driveParams.toString()}`
          break
        case "google-calendar":
          const calendarScopes = [
            "https://www.googleapis.com/auth/userinfo.email",
            "https://www.googleapis.com/auth/userinfo.profile",
            "https://www.googleapis.com/auth/calendar",
            "https://www.googleapis.com/auth/calendar.events",
          ]
          const calendarState = btoa(
            JSON.stringify({
              provider: "google-calendar",
              userId,
              reconnect,
              integrationId,
              timestamp: Date.now(),
            }),
          )
          const calendarParams = new URLSearchParams({
            client_id: process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID!,
            redirect_uri: `${baseUrl}/api/integrations/google-calendar/callback`,
            response_type: "code",
            scope: calendarScopes.join(" "),
            access_type: "offline",
            prompt: "consent",
            state: calendarState,
          })
          authUrl = `https://accounts.google.com/o/oauth2/v2/auth?${calendarParams.toString()}`
          break
        case "google-sheets":
          const sheetsScopes = [
            "https://www.googleapis.com/auth/userinfo.email",
            "https://www.googleapis.com/auth/userinfo.profile",
            "https://www.googleapis.com/auth/spreadsheets",
          ]
          const sheetsState = btoa(
            JSON.stringify({
              provider: "google-sheets",
              userId,
              reconnect,
              integrationId,
              timestamp: Date.now(),
            }),
          )
          const sheetsParams = new URLSearchParams({
            client_id: process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID!,
            redirect_uri: `${baseUrl}/api/integrations/google-sheets/callback`,
            response_type: "code",
            scope: sheetsScopes.join(" "),
            access_type: "offline",
            prompt: "consent",
            state: sheetsState,
          })
          authUrl = `https://accounts.google.com/o/oauth2/v2/auth?${sheetsParams.toString()}`
          break
        case "google-docs":
          const docsScopes = [
            "https://www.googleapis.com/auth/userinfo.email",
            "https://www.googleapis.com/auth/userinfo.profile",
            "https://www.googleapis.com/auth/documents",
            "https://www.googleapis.com/auth/drive.file",
          ]
          const docsState = btoa(
            JSON.stringify({
              provider: "google-docs",
              userId,
              reconnect,
              integrationId,
              timestamp: Date.now(),
            }),
          )
          const docsParams = new URLSearchParams({
            client_id: process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID!,
            redirect_uri: `${baseUrl}/api/integrations/google-docs/callback`,
            response_type: "code",
            scope: docsScopes.join(" "),
            access_type: "offline",
            prompt: "consent",
            state: docsState,
          })
          authUrl = `https://accounts.google.com/o/oauth2/v2/auth?${docsParams.toString()}`
          break
        case "google":
          // Keep the old google case for backward compatibility, but redirect to gmail
          const legacyGoogleScopes = [
            "https://www.googleapis.com/auth/userinfo.email",
            "https://www.googleapis.com/auth/userinfo.profile",
            "https://www.googleapis.com/auth/calendar",
            "https://www.googleapis.com/auth/drive.file",
            "https://www.googleapis.com/auth/spreadsheets",
            "https://www.googleapis.com/auth/documents",
            "https://www.googleapis.com/auth/gmail.send",
            "https://www.googleapis.com/auth/youtube.readonly",
          ]
          const legacyGoogleState = btoa(
            JSON.stringify({
              provider: "google",
              userId,
              reconnect,
              integrationId,
              timestamp: Date.now(),
            }),
          )
          const legacyGoogleParams = new URLSearchParams({
            client_id: process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID!,
            redirect_uri: `${baseUrl}/api/integrations/google/callback`,
            response_type: "code",
            scope: legacyGoogleScopes.join(" "),
            access_type: "offline",
            prompt: "consent",
            state: legacyGoogleState,
          })
          authUrl = `https://accounts.google.com/o/oauth2/v2/auth?${legacyGoogleParams.toString()}`
          break
        case "github":
          const githubState = btoa(
            JSON.stringify({
              provider: "github",
              userId,
              reconnect,
              integrationId,
              timestamp: Date.now(),
            }),
          )
          const githubParams = new URLSearchParams({
            client_id: process.env.NEXT_PUBLIC_GITHUB_CLIENT_ID!,
            redirect_uri: `${baseUrl}/api/integrations/github/callback`,
            scope: "repo user",
            state: githubState,
          })
          authUrl = `https://github.com/login/oauth/authorize?${githubParams.toString()}`
          break
        case "teams":
          const teamsState = btoa(
            JSON.stringify({
              provider: "teams",
              userId,
              reconnect,
              integrationId,
              timestamp: Date.now(),
            }),
          )
          const teamsParams = new URLSearchParams({
            client_id: process.env.NEXT_PUBLIC_TEAMS_CLIENT_ID!,
            response_type: "code",
            redirect_uri: `${baseUrl}/api/integrations/teams/callback`,
            scope:
              "openid profile email offline_access https://graph.microsoft.com/User.Read https://graph.microsoft.com/Chat.ReadWrite https://graph.microsoft.com/ChannelMessage.Send https://graph.microsoft.com/Team.ReadBasic.All",
            prompt: "consent", // Force consent screen
            state: teamsState,
          })
          authUrl = `https://login.microsoftonline.com/common/oauth2/v2.0/authorize?${teamsParams.toString()}`
          break
        case "trello":
          authUrl = TrelloOAuthService.generateAuthUrl(baseUrl, reconnect, integrationId, userId)
          break
        case "notion":
          const notionState = btoa(
            JSON.stringify({
              provider: "notion",
              userId,
              reconnect,
              integrationId,
              timestamp: Date.now(),
            }),
          )
          const notionParams = new URLSearchParams({
            client_id: process.env.NEXT_PUBLIC_NOTION_CLIENT_ID!,
            response_type: "code",
            owner: "user",
            redirect_uri: `${baseUrl}/api/integrations/notion/callback`,
            state: notionState,
          })
          authUrl = `https://api.notion.com/v1/oauth/authorize?${notionParams.toString()}`
          break
        case "airtable":
          const airtableState = btoa(
            JSON.stringify({
              provider: "airtable",
              userId,
              reconnect,
              integrationId,
              timestamp: Date.now(),
            }),
          )
          const airtableParams = new URLSearchParams({
            client_id: process.env.NEXT_PUBLIC_AIRTABLE_CLIENT_ID!,
            redirect_uri: `${baseUrl}/api/integrations/airtable/callback`,
            response_type: "code",
            scope: "data.records:read data.records:write",
            state: airtableState,
          })
          authUrl = `https://airtable.com/oauth2/v1/authorize?${airtableParams.toString()}`
          break
        case "hubspot":
          const hubspotState = btoa(
            JSON.stringify({
              provider: "hubspot",
              userId,
              reconnect,
              integrationId,
              timestamp: Date.now(),
            }),
          )
          const hubspotParams = new URLSearchParams({
            client_id: process.env.NEXT_PUBLIC_HUBSPOT_CLIENT_ID!,
            redirect_uri: `${baseUrl}/api/integrations/hubspot/callback`,
            scope: "crm.objects.contacts.read crm.objects.deals.read",
            state: hubspotState,
          })
          authUrl = `https://app.hubspot.com/oauth/authorize?${hubspotParams.toString()}`
          break
        case "facebook":
          const facebookState = btoa(
            JSON.stringify({
              provider: "facebook",
              userId,
              reconnect,
              integrationId,
              timestamp: Date.now(),
            }),
          )
          const facebookParams = new URLSearchParams({
            client_id: process.env.NEXT_PUBLIC_FACEBOOK_CLIENT_ID!,
            redirect_uri: `${baseUrl}/api/integrations/facebook/callback`,
            scope: "public_profile,email,pages_show_list,pages_manage_posts,pages_read_engagement",
            response_type: "code",
            state: facebookState,
          })
          authUrl = `https://www.facebook.com/v18.0/dialog/oauth?${facebookParams.toString()}`
          break
        case "instagram":
          const instagramState = btoa(
            JSON.stringify({
              provider: "instagram",
              userId,
              reconnect,
              integrationId,
              timestamp: Date.now(),
            }),
          )
          const instagramParams = new URLSearchParams({
            client_id: process.env.NEXT_PUBLIC_INSTAGRAM_CLIENT_ID!,
            redirect_uri: `${baseUrl}/api/integrations/instagram/callback`,
            scope: "user_profile,user_media",
            response_type: "code",
            state: instagramState,
          })
          authUrl = `https://api.instagram.com/oauth/authorize?${instagramParams.toString()}`
          break
        case "youtube":
          const youtubeScopes = [
            "https://www.googleapis.com/auth/youtube.readonly",
            "https://www.googleapis.com/auth/youtube.upload",
          ]
          const youtubeState = btoa(
            JSON.stringify({
              provider: "youtube",
              userId,
              reconnect,
              integrationId,
              timestamp: Date.now(),
            }),
          )
          const youtubeParams = new URLSearchParams({
            client_id: process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID!,
            redirect_uri: `${baseUrl}/api/integrations/youtube/callback`,
            response_type: "code",
            scope: youtubeScopes.join(" "),
            access_type: "offline",
            prompt: "consent",
            state: youtubeState,
          })
          authUrl = `https://accounts.google.com/o/oauth2/v2/auth?${youtubeParams.toString()}`
          break
        case "tiktok":
          const tiktokState = btoa(
            JSON.stringify({
              provider: "tiktok",
              userId,
              reconnect,
              integrationId,
              timestamp: Date.now(),
            }),
          )
          const tiktokParams = new URLSearchParams({
            client_key: process.env.NEXT_PUBLIC_TIKTOK_CLIENT_ID!,
            scope: "user.info.basic,video.upload",
            response_type: "code",
            redirect_uri: `${baseUrl}/api/integrations/tiktok/callback`,
            state: tiktokState,
          })
          authUrl = `https://www.tiktok.com/auth/authorize/?${tiktokParams.toString()}`
          break
        case "mailchimp":
          const mailchimpState = btoa(
            JSON.stringify({
              provider: "mailchimp",
              userId,
              reconnect,
              integrationId,
              timestamp: Date.now(),
            }),
          )
          const mailchimpParams = new URLSearchParams({
            response_type: "code",
            client_id: process.env.NEXT_PUBLIC_MAILCHIMP_CLIENT_ID!,
            redirect_uri: `${baseUrl}/api/integrations/mailchimp/callback`,
            state: mailchimpState,
          })
          authUrl = `https://login.mailchimp.com/oauth2/authorize?${mailchimpParams.toString()}`
          break
        case "shopify":
          const shopifyState = btoa(
            JSON.stringify({
              provider: "shopify",
              userId,
              reconnect,
              integrationId,
              timestamp: Date.now(),
            }),
          )
          const shopifyParams = new URLSearchParams({
            client_id: process.env.NEXT_PUBLIC_SHOPIFY_CLIENT_ID!,
            scope: "read_products,write_products,read_orders",
            redirect_uri: `${baseUrl}/api/integrations/shopify/callback`,
            state: shopifyState,
          })
          authUrl = `https://myshopify.com/admin/oauth/authorize?${shopifyParams.toString()}`
          break
        case "stripe":
          const stripeState = btoa(
            JSON.stringify({
              provider: "stripe",
              userId,
              reconnect,
              integrationId,
              timestamp: Date.now(),
            }),
          )
          const stripeParams = new URLSearchParams({
            response_type: "code",
            client_id: process.env.NEXT_PUBLIC_STRIPE_CLIENT_ID!,
            scope: "read_write",
            redirect_uri: `${baseUrl}/api/integrations/stripe/callback`,
            state: stripeState,
          })
          authUrl = `https://connect.stripe.com/oauth/authorize?${stripeParams.toString()}`
          break
        case "paypal":
          const paypalState = btoa(
            JSON.stringify({
              provider: "paypal",
              userId,
              reconnect,
              integrationId,
              timestamp: Date.now(),
            }),
          )
          const paypalParams = new URLSearchParams({
            client_id: process.env.NEXT_PUBLIC_PAYPAL_CLIENT_ID!,
            response_type: "code",
            scope: "openid profile email",
            redirect_uri: `${baseUrl}/api/integrations/paypal/callback`,
            state: paypalState,
          })
          authUrl = `https://www.paypal.com/signin/authorize?${paypalParams.toString()}`
          break
        case "gitlab":
          const gitlabState = btoa(
            JSON.stringify({
              provider: "gitlab",
              userId,
              reconnect,
              integrationId,
              timestamp: Date.now(),
            }),
          )
          const gitlabParams = new URLSearchParams({
            client_id: process.env.NEXT_PUBLIC_GITLAB_CLIENT_ID!,
            redirect_uri: `${baseUrl}/api/integrations/gitlab/callback`,
            response_type: "code",
            scope: "api read_user read_repository",
            state: gitlabState,
          })
          authUrl = `https://gitlab.com/oauth/authorize?${gitlabParams.toString()}`
          break
        case "docker":
          const dockerState = btoa(
            JSON.stringify({
              provider: "docker",
              userId,
              reconnect,
              integrationId,
              timestamp: Date.now(),
            }),
          )
          const dockerParams = new URLSearchParams({
            client_id: process.env.NEXT_PUBLIC_DOCKER_CLIENT_ID!,
            redirect_uri: `${baseUrl}/api/integrations/docker/callback`,
            response_type: "code",
            scope: "repo:read repo:write",
            state: dockerState,
          })
          authUrl = `https://hub.docker.com/oauth/authorize?${dockerParams.toString()}`
          break
        case "onedrive":
          const onedriveState = btoa(
            JSON.stringify({
              provider: "onedrive",
              userId,
              reconnect,
              integrationId,
              timestamp: Date.now(),
            }),
          )
          const onedriveParams = new URLSearchParams({
            client_id: process.env.NEXT_PUBLIC_ONEDRIVE_CLIENT_ID!,
            response_type: "code",
            redirect_uri: `${baseUrl}/api/integrations/onedrive/callback`,
            scope:
              "https://graph.microsoft.com/User.Read https://graph.microsoft.com/Files.ReadWrite.All https://graph.microsoft.com/Sites.ReadWrite.All offline_access",
            prompt: "consent", // Force consent screen
            state: onedriveState,
          })
          authUrl = `https://login.microsoftonline.com/common/oauth2/v2.0/authorize?${onedriveParams.toString()}`
          break
        default:
          return NextResponse.json({ error: `Unsupported provider: ${provider}` }, { status: 400 })
      }

      console.log("Generated auth URL for", provider, ":", authUrl.substring(0, 100) + "...")

      return NextResponse.json({ authUrl })
    } catch (serviceError: any) {
      console.error(`Error generating ${provider} auth URL:`, serviceError)

      // Check if it's a configuration error
      if (serviceError.message?.includes("Missing") && serviceError.message?.includes("OAuth configuration")) {
        return NextResponse.json(
          {
            error: `${provider} integration is not configured. Please contact support.`,
            details: serviceError.message,
          },
          { status: 503 },
        )
      }

      return NextResponse.json(
        {
          error: `Failed to generate ${provider} auth URL`,
          details: serviceError.message,
        },
        { status: 500 },
      )
    }
  } catch (error: any) {
    console.error("Error in generate-url route:", error)
    return NextResponse.json(
      {
        error: "Internal server error",
        details: error.message,
      },
      { status: 500 },
    )
  }
}
