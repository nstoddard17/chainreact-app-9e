import { type NextRequest, NextResponse } from "next/server"
import { createServerComponentClient } from "@supabase/auth-helpers-nextjs"
import { cookies } from "next/headers"
import { getOAuthRedirectUri } from "@/lib/utils/getBaseUrl"

// OAuth service imports
import { GoogleOAuthService } from "@/lib/oauth/google"
import { SlackOAuthService } from "@/lib/oauth/slack"
import { SimpleTwitterOAuth } from "@/lib/oauth/twitter-simple"

export async function POST(request: NextRequest) {
  try {
    const { provider } = await request.json()

    if (!provider) {
      return NextResponse.json({ success: false, error: "Provider is required" }, { status: 400 })
    }

    console.log(`🔗 Generating OAuth URL for provider: ${provider}`)

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
        case "twitter":
          authUrl = SimpleTwitterOAuth.generateAuthUrl(userId)
          break

        case "google":
        case "gmail":
        case "google-calendar":
        case "google-drive":
        case "google-sheets":
        case "google-docs":
        case "youtube":
          authUrl = GoogleOAuthService.generateAuthUrl("https://chainreact.app", false, undefined, userId)
          break

        case "slack":
          authUrl = SlackOAuthService.generateAuthUrl("https://chainreact.app", false, undefined, userId)
          break

        case "github":
          authUrl = generateGitHubAuthUrl(userId)
          break

        case "discord":
          authUrl = generateDiscordAuthUrl(userId)
          break

        case "linkedin":
          authUrl = generateLinkedInAuthUrl(userId)
          break

        case "facebook":
          authUrl = generateFacebookAuthUrl(userId)
          break

        case "instagram":
          authUrl = generateInstagramAuthUrl(userId)
          break

        case "tiktok":
          authUrl = generateTikTokAuthUrl(userId)
          break

        case "notion":
          authUrl = generateNotionAuthUrl(userId)
          break

        case "trello":
          authUrl = generateTrelloAuthUrl(userId)
          break

        case "dropbox":
          authUrl = generateDropboxAuthUrl(userId)
          break

        case "hubspot":
          authUrl = generateHubSpotAuthUrl(userId)
          break

        case "airtable":
          authUrl = generateAirtableAuthUrl(userId)
          break

        case "mailchimp":
          authUrl = generateMailchimpAuthUrl(userId)
          break

        case "shopify":
          authUrl = generateShopifyAuthUrl(userId)
          break

        case "stripe":
          authUrl = generateStripeAuthUrl(userId)
          break

        case "paypal":
          authUrl = generatePayPalAuthUrl(userId)
          break

        case "teams":
          authUrl = generateTeamsAuthUrl(userId)
          break

        case "onedrive":
          authUrl = generateOneDriveAuthUrl(userId)
          break

        case "gitlab":
          authUrl = generateGitLabAuthUrl(userId)
          break

        case "docker":
          authUrl = generateDockerAuthUrl(userId)
          break

        default:
          console.error(`Unsupported provider: ${provider}`)
          return NextResponse.json({ success: false, error: `Unsupported provider: ${provider}` }, { status: 400 })
      }

      console.log(`✅ Generated OAuth URL for ${provider}`)
      console.log(`🔗 Redirect URI: ${getOAuthRedirectUri(provider)}`)

      return NextResponse.json({
        success: true,
        authUrl,
        provider,
        userId,
        redirectUri: getOAuthRedirectUri(provider),
      })
    } catch (providerError: any) {
      console.error(`Error generating OAuth URL for ${provider}:`, providerError)

      let errorMessage = `Failed to generate authorization URL for ${provider}`

      if (providerError.message.includes("not configured")) {
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

// Helper functions for other providers - all using consistent redirect URI format
function generateGitHubAuthUrl(userId: string): string {
  const clientId = process.env.NEXT_PUBLIC_GITHUB_CLIENT_ID
  if (!clientId) throw new Error("GitHub client ID not configured")

  const redirectUri = getOAuthRedirectUri("github")
  const state = btoa(JSON.stringify({ provider: "github", userId, timestamp: Date.now() }))

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    scope: "repo user read:org",
    state,
  })

  return `https://github.com/login/oauth/authorize?${params.toString()}`
}

function generateDiscordAuthUrl(userId: string): string {
  const clientId = process.env.NEXT_PUBLIC_DISCORD_CLIENT_ID
  if (!clientId) throw new Error("Discord client ID not configured")

  const redirectUri = getOAuthRedirectUri("discord")
  const state = btoa(JSON.stringify({ provider: "discord", userId, timestamp: Date.now() }))

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: "identify guilds",
    state,
  })

  return `https://discord.com/api/oauth2/authorize?${params.toString()}`
}

function generateLinkedInAuthUrl(userId: string): string {
  const clientId = process.env.NEXT_PUBLIC_LINKEDIN_CLIENT_ID
  if (!clientId) throw new Error("LinkedIn client ID not configured")

  const redirectUri = getOAuthRedirectUri("linkedin")
  const state = btoa(JSON.stringify({ provider: "linkedin", userId, timestamp: Date.now() }))

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: "r_liteprofile w_member_social",
    state,
  })

  return `https://www.linkedin.com/oauth/v2/authorization?${params.toString()}`
}

function generateFacebookAuthUrl(userId: string): string {
  const clientId = process.env.NEXT_PUBLIC_FACEBOOK_CLIENT_ID
  if (!clientId) throw new Error("Facebook client ID not configured")

  const redirectUri = getOAuthRedirectUri("facebook")
  const state = btoa(JSON.stringify({ provider: "facebook", userId, timestamp: Date.now() }))

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: "public_profile pages_manage_posts",
    state,
  })

  return `https://www.facebook.com/v18.0/dialog/oauth?${params.toString()}`
}

function generateInstagramAuthUrl(userId: string): string {
  const clientId = process.env.NEXT_PUBLIC_INSTAGRAM_CLIENT_ID
  if (!clientId) throw new Error("Instagram client ID not configured")

  const redirectUri = getOAuthRedirectUri("instagram")
  const state = btoa(JSON.stringify({ provider: "instagram", userId, timestamp: Date.now() }))

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: "user_profile user_media",
    state,
  })

  return `https://api.instagram.com/oauth/authorize?${params.toString()}`
}

function generateTikTokAuthUrl(userId: string): string {
  const clientId = process.env.NEXT_PUBLIC_TIKTOK_CLIENT_ID
  if (!clientId) throw new Error("TikTok client ID not configured")

  const redirectUri = getOAuthRedirectUri("tiktok")
  const state = btoa(JSON.stringify({ provider: "tiktok", userId, timestamp: Date.now() }))

  const params = new URLSearchParams({
    client_key: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: "user.info.basic video.list",
    state,
  })

  return `https://www.tiktok.com/auth/authorize/?${params.toString()}`
}

function generateNotionAuthUrl(userId: string): string {
  const clientId = process.env.NEXT_PUBLIC_NOTION_CLIENT_ID
  if (!clientId) throw new Error("Notion client ID not configured")

  const redirectUri = getOAuthRedirectUri("notion")
  const state = btoa(JSON.stringify({ provider: "notion", userId, timestamp: Date.now() }))

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    state,
  })

  return `https://api.notion.com/v1/oauth/authorize?${params.toString()}`
}

function generateTrelloAuthUrl(userId: string): string {
  const clientId = process.env.NEXT_PUBLIC_TRELLO_CLIENT_ID
  if (!clientId) throw new Error("Trello client ID not configured")

  const redirectUri = getOAuthRedirectUri("trello")

  const params = new URLSearchParams({
    key: clientId,
    return_url: redirectUri,
    scope: "read,write,account",
    expiration: "never",
    name: "ChainReact",
    response_type: "token",
  })

  return `https://trello.com/1/authorize?${params.toString()}`
}

function generateDropboxAuthUrl(userId: string): string {
  const clientId = process.env.NEXT_PUBLIC_DROPBOX_CLIENT_ID
  if (!clientId) throw new Error("Dropbox client ID not configured")

  const redirectUri = getOAuthRedirectUri("dropbox")
  const state = btoa(JSON.stringify({ provider: "dropbox", userId, timestamp: Date.now() }))

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    state,
  })

  return `https://www.dropbox.com/oauth2/authorize?${params.toString()}`
}

function generateHubSpotAuthUrl(userId: string): string {
  const clientId = process.env.NEXT_PUBLIC_HUBSPOT_CLIENT_ID
  if (!clientId) throw new Error("HubSpot client ID not configured")

  const redirectUri = getOAuthRedirectUri("hubspot")
  const state = btoa(JSON.stringify({ provider: "hubspot", userId, timestamp: Date.now() }))

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    scope: "crm.objects.contacts.read crm.objects.deals.read",
    state,
  })

  return `https://app.hubspot.com/oauth/authorize?${params.toString()}`
}

function generateAirtableAuthUrl(userId: string): string {
  const clientId = process.env.NEXT_PUBLIC_AIRTABLE_CLIENT_ID
  if (!clientId) throw new Error("Airtable client ID not configured")

  const redirectUri = getOAuthRedirectUri("airtable")
  const state = btoa(JSON.stringify({ provider: "airtable", userId, timestamp: Date.now() }))

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: "data.records:read data.records:write",
    state,
  })

  return `https://airtable.com/oauth2/v1/authorize?${params.toString()}`
}

function generateMailchimpAuthUrl(userId: string): string {
  const clientId = process.env.NEXT_PUBLIC_MAILCHIMP_CLIENT_ID
  if (!clientId) throw new Error("Mailchimp client ID not configured")

  const redirectUri = getOAuthRedirectUri("mailchimp")
  const state = btoa(JSON.stringify({ provider: "mailchimp", userId, timestamp: Date.now() }))

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    state,
  })

  return `https://login.mailchimp.com/oauth2/authorize?${params.toString()}`
}

function generateShopifyAuthUrl(userId: string): string {
  const clientId = process.env.NEXT_PUBLIC_SHOPIFY_CLIENT_ID
  if (!clientId) throw new Error("Shopify client ID not configured")

  const redirectUri = getOAuthRedirectUri("shopify")
  const state = btoa(JSON.stringify({ provider: "shopify", userId, timestamp: Date.now() }))

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: "read_products write_products",
    state,
  })

  return `https://shopify.com/oauth/authorize?${params.toString()}`
}

function generateStripeAuthUrl(userId: string): string {
  const clientId = process.env.NEXT_PUBLIC_STRIPE_CLIENT_ID
  if (!clientId) throw new Error("Stripe client ID not configured")

  const redirectUri = getOAuthRedirectUri("stripe")
  const state = btoa(JSON.stringify({ provider: "stripe", userId, timestamp: Date.now() }))

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: "read_write",
    state,
  })

  return `https://connect.stripe.com/oauth/authorize?${params.toString()}`
}

function generatePayPalAuthUrl(userId: string): string {
  const clientId = process.env.NEXT_PUBLIC_PAYPAL_CLIENT_ID
  if (!clientId) throw new Error("PayPal client ID not configured")

  const redirectUri = getOAuthRedirectUri("paypal")
  const state = btoa(JSON.stringify({ provider: "paypal", userId, timestamp: Date.now() }))

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: "openid profile email",
    state,
  })

  return `https://www.paypal.com/signin/authorize?${params.toString()}`
}

function generateTeamsAuthUrl(userId: string): string {
  const clientId = process.env.NEXT_PUBLIC_TEAMS_CLIENT_ID
  if (!clientId) throw new Error("Teams client ID not configured")

  const redirectUri = getOAuthRedirectUri("teams")
  const state = btoa(JSON.stringify({ provider: "teams", userId, timestamp: Date.now() }))

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: "User.Read Chat.ReadWrite",
    state,
  })

  return `https://login.microsoftonline.com/common/oauth2/v2.0/authorize?${params.toString()}`
}

function generateOneDriveAuthUrl(userId: string): string {
  const clientId = process.env.NEXT_PUBLIC_ONEDRIVE_CLIENT_ID
  if (!clientId) throw new Error("OneDrive client ID not configured")

  const redirectUri = getOAuthRedirectUri("onedrive")
  const state = btoa(JSON.stringify({ provider: "onedrive", userId, timestamp: Date.now() }))

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: "Files.ReadWrite.All",
    state,
  })

  return `https://login.microsoftonline.com/common/oauth2/v2.0/authorize?${params.toString()}`
}

function generateGitLabAuthUrl(userId: string): string {
  const clientId = process.env.NEXT_PUBLIC_GITLAB_CLIENT_ID
  if (!clientId) throw new Error("GitLab client ID not configured")

  const redirectUri = getOAuthRedirectUri("gitlab")
  const state = btoa(JSON.stringify({ provider: "gitlab", userId, timestamp: Date.now() }))

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: "api read_user",
    state,
  })

  return `https://gitlab.com/oauth/authorize?${params.toString()}`
}

function generateDockerAuthUrl(userId: string): string {
  const clientId = process.env.NEXT_PUBLIC_DOCKER_CLIENT_ID
  if (!clientId) throw new Error("Docker client ID not configured")

  const redirectUri = getOAuthRedirectUri("docker")
  const state = btoa(JSON.stringify({ provider: "docker", userId, timestamp: Date.now() }))

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: "repo:admin",
    state,
  })

  return `https://hub.docker.com/oauth/authorize?${params.toString()}`
}
