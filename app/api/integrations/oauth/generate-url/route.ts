import { type NextRequest, NextResponse } from "next/server"
import { createServerComponentClient } from "@supabase/auth-helpers-nextjs"
import { cookies } from "next/headers"
import { getBaseUrl } from "@/lib/utils/getBaseUrl"

// OAuth service imports
import { GoogleOAuthService } from "@/lib/oauth/google"
import { SlackOAuthService } from "@/lib/oauth/slack"
import { TwitterOAuthService } from "@/lib/oauth/twitter"

export async function POST(request: NextRequest) {
  try {
    const { provider } = await request.json()

    if (!provider) {
      return NextResponse.json({ success: false, error: "Provider is required" }, { status: 400 })
    }

    console.log(`🔗 Generating OAuth URL for provider: ${provider}`)

    // Get base URL consistently
    const baseUrl = getBaseUrl()
    console.log(`🌐 Using base URL: ${baseUrl}`)

    // Create Supabase client with cookies
    const supabase = createServerComponentClient({ cookies })

    // Use getUser() instead of getSession() for secure authentication
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser()

    if (userError) {
      console.error("User authentication error:", userError)
      return NextResponse.json(
        {
          success: false,
          error: "Authentication error",
          details: userError.message,
        },
        { status: 401 },
      )
    }

    if (!user?.id) {
      console.error("No authenticated user found")
      return NextResponse.json(
        {
          success: false,
          error: "User not authenticated. Please log in to continue.",
        },
        { status: 401 },
      )
    }

    const userId = user.id
    console.log(`✅ User authenticated: ${userId}`)

    let authUrl: string

    // Generate OAuth URL based on provider
    try {
      switch (provider.toLowerCase()) {
        case "google":
        case "gmail":
        case "google-calendar":
        case "google-drive":
        case "google-sheets":
        case "google-docs":
        case "youtube":
          authUrl = GoogleOAuthService.generateAuthUrl(baseUrl, false, undefined, userId)
          break

        case "slack":
          authUrl = SlackOAuthService.generateAuthUrl(baseUrl, false, undefined, userId)
          break

        case "twitter":
          authUrl = await TwitterOAuthService.generateAuthUrl(baseUrl, false, undefined, userId)
          break

        case "github":
          authUrl = generateGitHubAuthUrl(userId, baseUrl)
          break

        case "discord":
          authUrl = generateDiscordAuthUrl(userId, baseUrl)
          break

        case "linkedin":
          authUrl = generateLinkedInAuthUrl(userId, baseUrl)
          break

        case "facebook":
          authUrl = generateFacebookAuthUrl(userId, baseUrl)
          break

        case "instagram":
          authUrl = generateInstagramAuthUrl(userId, baseUrl)
          break

        case "tiktok":
          authUrl = generateTikTokAuthUrl(userId, baseUrl)
          break

        case "notion":
          authUrl = generateNotionAuthUrl(userId, baseUrl)
          break

        case "trello":
          authUrl = generateTrelloAuthUrl(userId, baseUrl)
          break

        case "dropbox":
          authUrl = generateDropboxAuthUrl(userId, baseUrl)
          break

        case "hubspot":
          authUrl = generateHubSpotAuthUrl(userId, baseUrl)
          break

        case "airtable":
          authUrl = generateAirtableAuthUrl(userId, baseUrl)
          break

        case "mailchimp":
          authUrl = generateMailchimpAuthUrl(userId, baseUrl)
          break

        case "shopify":
          authUrl = generateShopifyAuthUrl(userId, baseUrl)
          break

        case "stripe":
          authUrl = generateStripeAuthUrl(userId, baseUrl)
          break

        case "paypal":
          authUrl = generatePayPalAuthUrl(userId, baseUrl)
          break

        case "teams":
          authUrl = generateTeamsAuthUrl(userId, baseUrl)
          break

        case "onedrive":
          authUrl = generateOneDriveAuthUrl(userId, baseUrl)
          break

        case "gitlab":
          authUrl = generateGitLabAuthUrl(userId, baseUrl)
          break

        case "docker":
          authUrl = generateDockerAuthUrl(userId, baseUrl)
          break

        default:
          console.error(`Unsupported provider: ${provider}`)
          return NextResponse.json({ success: false, error: `Unsupported provider: ${provider}` }, { status: 400 })
      }

      console.log(`✅ Generated OAuth URL for ${provider}`)

      return NextResponse.json({
        success: true,
        authUrl,
        provider,
        userId,
      })
    } catch (providerError: any) {
      console.error(`Error generating OAuth URL for ${provider}:`, providerError)

      let errorMessage = `Failed to generate authorization URL for ${provider}`

      if (providerError.message.includes("client ID not configured")) {
        errorMessage = `${provider} integration is not configured. Please contact support.`
      }

      return NextResponse.json(
        {
          success: false,
          error: errorMessage,
          details: providerError.message,
        },
        { status: 500 },
      )
    }
  } catch (error: any) {
    console.error("Error in OAuth URL generation:", error)
    return NextResponse.json(
      {
        success: false,
        error: "Internal server error",
        details: error.message,
      },
      { status: 500 },
    )
  }
}

// Helper functions to generate OAuth URLs for each provider
function generateGitHubAuthUrl(userId: string, baseUrl: string): string {
  const clientId = process.env.NEXT_PUBLIC_GITHUB_CLIENT_ID
  if (!clientId) throw new Error("GitHub client ID not configured")

  const state = btoa(JSON.stringify({ provider: "github", userId, timestamp: Date.now() }))
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: `${baseUrl}/api/integrations/github/callback`,
    scope: "repo user read:org",
    state,
  })

  return `https://github.com/login/oauth/authorize?${params.toString()}`
}

function generateDiscordAuthUrl(userId: string, baseUrl: string): string {
  const clientId = process.env.NEXT_PUBLIC_DISCORD_CLIENT_ID
  if (!clientId) throw new Error("Discord client ID not configured")

  const state = btoa(JSON.stringify({ provider: "discord", userId, timestamp: Date.now() }))
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: `${baseUrl}/api/integrations/discord/callback`,
    response_type: "code",
    scope: "identify guilds",
    state,
  })

  return `https://discord.com/api/oauth2/authorize?${params.toString()}`
}

function generateLinkedInAuthUrl(userId: string, baseUrl: string): string {
  const clientId = process.env.NEXT_PUBLIC_LINKEDIN_CLIENT_ID
  if (!clientId) throw new Error("LinkedIn client ID not configured")

  const state = btoa(JSON.stringify({ provider: "linkedin", userId, timestamp: Date.now() }))
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: `${baseUrl}/api/integrations/linkedin/callback`,
    response_type: "code",
    scope: "r_liteprofile w_member_social",
    state,
  })

  return `https://www.linkedin.com/oauth/v2/authorization?${params.toString()}`
}

function generateFacebookAuthUrl(userId: string, baseUrl: string): string {
  const clientId = process.env.NEXT_PUBLIC_FACEBOOK_CLIENT_ID
  if (!clientId) throw new Error("Facebook client ID not configured")

  const state = btoa(JSON.stringify({ provider: "facebook", userId, timestamp: Date.now() }))
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: `${baseUrl}/api/integrations/facebook/callback`,
    response_type: "code",
    scope: "public_profile pages_manage_posts",
    state,
  })

  return `https://www.facebook.com/v18.0/dialog/oauth?${params.toString()}`
}

function generateInstagramAuthUrl(userId: string, baseUrl: string): string {
  const clientId = process.env.NEXT_PUBLIC_INSTAGRAM_CLIENT_ID
  if (!clientId) throw new Error("Instagram client ID not configured")

  const state = btoa(JSON.stringify({ provider: "instagram", userId, timestamp: Date.now() }))
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: `${baseUrl}/api/integrations/instagram/callback`,
    response_type: "code",
    scope: "user_profile user_media",
    state,
  })

  return `https://api.instagram.com/oauth/authorize?${params.toString()}`
}

function generateTikTokAuthUrl(userId: string, baseUrl: string): string {
  const clientId = process.env.NEXT_PUBLIC_TIKTOK_CLIENT_ID
  if (!clientId) throw new Error("TikTok client ID not configured")

  const state = btoa(JSON.stringify({ provider: "tiktok", userId, timestamp: Date.now() }))
  const params = new URLSearchParams({
    client_key: clientId,
    redirect_uri: `${baseUrl}/api/integrations/tiktok/callback`,
    response_type: "code",
    scope: "user.info.basic video.list",
    state,
  })

  return `https://www.tiktok.com/auth/authorize/?${params.toString()}`
}

function generateNotionAuthUrl(userId: string, baseUrl: string): string {
  const clientId = process.env.NEXT_PUBLIC_NOTION_CLIENT_ID
  if (!clientId) throw new Error("Notion client ID not configured")

  const state = btoa(JSON.stringify({ provider: "notion", userId, timestamp: Date.now() }))
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: `${baseUrl}/api/integrations/notion/callback`,
    response_type: "code",
    state,
  })

  return `https://api.notion.com/v1/oauth/authorize?${params.toString()}`
}

function generateTrelloAuthUrl(userId: string, baseUrl: string): string {
  const clientId = process.env.NEXT_PUBLIC_TRELLO_CLIENT_ID
  if (!clientId) throw new Error("Trello client ID not configured")

  const params = new URLSearchParams({
    key: clientId,
    return_url: `${baseUrl}/api/integrations/trello/callback`,
    scope: "read,write,account",
    expiration: "never",
    name: "ChainReact",
    response_type: "token",
  })

  return `https://trello.com/1/authorize?${params.toString()}`
}

function generateDropboxAuthUrl(userId: string, baseUrl: string): string {
  const clientId = process.env.NEXT_PUBLIC_DROPBOX_CLIENT_ID
  if (!clientId) throw new Error("Dropbox client ID not configured")

  const state = btoa(JSON.stringify({ provider: "dropbox", userId, timestamp: Date.now() }))
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: `${baseUrl}/api/integrations/dropbox/callback`,
    response_type: "code",
    state,
  })

  return `https://www.dropbox.com/oauth2/authorize?${params.toString()}`
}

function generateHubSpotAuthUrl(userId: string, baseUrl: string): string {
  const clientId = process.env.NEXT_PUBLIC_HUBSPOT_CLIENT_ID
  if (!clientId) throw new Error("HubSpot client ID not configured")

  const state = btoa(JSON.stringify({ provider: "hubspot", userId, timestamp: Date.now() }))
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: `${baseUrl}/api/integrations/hubspot/callback`,
    scope: "crm.objects.contacts.read crm.objects.deals.read",
    state,
  })

  return `https://app.hubspot.com/oauth/authorize?${params.toString()}`
}

function generateAirtableAuthUrl(userId: string, baseUrl: string): string {
  const clientId = process.env.NEXT_PUBLIC_AIRTABLE_CLIENT_ID
  if (!clientId) throw new Error("Airtable client ID not configured")

  const state = btoa(JSON.stringify({ provider: "airtable", userId, timestamp: Date.now() }))
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: `${baseUrl}/api/integrations/airtable/callback`,
    response_type: "code",
    scope: "data.records:read data.records:write",
    state,
  })

  return `https://airtable.com/oauth2/v1/authorize?${params.toString()}`
}

function generateMailchimpAuthUrl(userId: string, baseUrl: string): string {
  const clientId = process.env.NEXT_PUBLIC_MAILCHIMP_CLIENT_ID
  if (!clientId) throw new Error("Mailchimp client ID not configured")

  const state = btoa(JSON.stringify({ provider: "mailchimp", userId, timestamp: Date.now() }))
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: `${baseUrl}/api/integrations/mailchimp/callback`,
    response_type: "code",
    state,
  })

  return `https://login.mailchimp.com/oauth2/authorize?${params.toString()}`
}

function generateShopifyAuthUrl(userId: string, baseUrl: string): string {
  const clientId = process.env.NEXT_PUBLIC_SHOPIFY_CLIENT_ID
  if (!clientId) throw new Error("Shopify client ID not configured")

  const state = btoa(JSON.stringify({ provider: "shopify", userId, timestamp: Date.now() }))
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: `${baseUrl}/api/integrations/shopify/callback`,
    response_type: "code",
    scope: "read_products write_products",
    state,
  })

  return `https://shopify.com/oauth/authorize?${params.toString()}`
}

function generateStripeAuthUrl(userId: string, baseUrl: string): string {
  const clientId = process.env.NEXT_PUBLIC_STRIPE_CLIENT_ID
  if (!clientId) throw new Error("Stripe client ID not configured")

  const state = btoa(JSON.stringify({ provider: "stripe", userId, timestamp: Date.now() }))
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: `${baseUrl}/api/integrations/stripe/callback`,
    response_type: "code",
    scope: "read_write",
    state,
  })

  return `https://connect.stripe.com/oauth/authorize?${params.toString()}`
}

function generatePayPalAuthUrl(userId: string, baseUrl: string): string {
  const clientId = process.env.NEXT_PUBLIC_PAYPAL_CLIENT_ID
  if (!clientId) throw new Error("PayPal client ID not configured")

  const state = btoa(JSON.stringify({ provider: "paypal", userId, timestamp: Date.now() }))
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: `${baseUrl}/api/integrations/paypal/callback`,
    response_type: "code",
    scope: "openid profile email",
    state,
  })

  return `https://www.paypal.com/signin/authorize?${params.toString()}`
}

function generateTeamsAuthUrl(userId: string, baseUrl: string): string {
  const clientId = process.env.NEXT_PUBLIC_TEAMS_CLIENT_ID
  if (!clientId) throw new Error("Teams client ID not configured")

  const state = btoa(JSON.stringify({ provider: "teams", userId, timestamp: Date.now() }))
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: `${baseUrl}/api/integrations/teams/callback`,
    response_type: "code",
    scope: "User.Read Chat.ReadWrite",
    state,
  })

  return `https://login.microsoftonline.com/common/oauth2/v2.0/authorize?${params.toString()}`
}

function generateOneDriveAuthUrl(userId: string, baseUrl: string): string {
  const clientId = process.env.NEXT_PUBLIC_ONEDRIVE_CLIENT_ID
  if (!clientId) throw new Error("OneDrive client ID not configured")

  const state = btoa(JSON.stringify({ provider: "onedrive", userId, timestamp: Date.now() }))
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: `${baseUrl}/api/integrations/onedrive/callback`,
    response_type: "code",
    scope: "Files.ReadWrite.All",
    state,
  })

  return `https://login.microsoftonline.com/common/oauth2/v2.0/authorize?${params.toString()}`
}

function generateGitLabAuthUrl(userId: string, baseUrl: string): string {
  const clientId = process.env.NEXT_PUBLIC_GITLAB_CLIENT_ID
  if (!clientId) throw new Error("GitLab client ID not configured")

  const state = btoa(JSON.stringify({ provider: "gitlab", userId, timestamp: Date.now() }))
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: `${baseUrl}/api/integrations/gitlab/callback`,
    response_type: "code",
    scope: "api read_user",
    state,
  })

  return `https://gitlab.com/oauth/authorize?${params.toString()}`
}

function generateDockerAuthUrl(userId: string, baseUrl: string): string {
  const clientId = process.env.NEXT_PUBLIC_DOCKER_CLIENT_ID
  if (!clientId) throw new Error("Docker client ID not configured")

  const state = btoa(JSON.stringify({ provider: "docker", userId, timestamp: Date.now() }))
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: `${baseUrl}/api/integrations/docker/callback`,
    response_type: "code",
    scope: "repo:admin",
    state,
  })

  return `https://hub.docker.com/oauth/authorize?${params.toString()}`
}
