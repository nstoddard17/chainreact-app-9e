import { NextResponse } from "next/server"

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const provider = searchParams.get("provider")
  const userId = searchParams.get("userId")

  if (!provider) {
    return NextResponse.json({ success: false, error: "Missing provider parameter" }, { status: 400 })
  }

  if (!userId) {
    return NextResponse.json({ success: false, error: "Missing userId parameter" }, { status: 400 })
  }

  let authUrl: string | null = null

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
        authUrl = generateGoogleAuthUrl(provider, userId)
        break

      case "slack":
        authUrl = generateSlackAuthUrl(userId)
        break

      case "github":
        authUrl = generateGitHubAuthUrl(userId)
        break

      case "discord":
        authUrl = generateDiscordAuthUrl(userId)
        break

      case "twitter":
        authUrl = generateTwitterAuthUrl(userId)
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
}

// Helper functions to generate OAuth URLs for each provider
function generateGoogleAuthUrl(service: string, userId: string): string {
  const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID
  if (!clientId) throw new Error("Google client ID not configured")

  const state = btoa(JSON.stringify({ provider: service, userId, timestamp: Date.now() }))

  // Map service to specific scopes
  let scopes = "https://www.googleapis.com/auth/userinfo.email https://www.googleapis.com/auth/userinfo.profile"

  switch (service) {
    case "gmail":
      scopes += " https://www.googleapis.com/auth/gmail.modify"
      break
    case "google-drive":
      scopes += " https://www.googleapis.com/auth/drive"
      break
    case "google-sheets":
      scopes += " https://www.googleapis.com/auth/spreadsheets"
      break
    case "google-docs":
      scopes += " https://www.googleapis.com/auth/documents"
      break
    case "google-calendar":
      scopes += " https://www.googleapis.com/auth/calendar"
      break
    case "youtube":
      scopes += " https://www.googleapis.com/auth/youtube"
      break
  }

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: `https://chainreact.app/api/integrations/${service}/callback`,
    response_type: "code",
    scope: scopes,
    access_type: "offline",
    prompt: "consent",
    state,
  })

  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`
}

function generateSlackAuthUrl(userId: string): string {
  const clientId = process.env.NEXT_PUBLIC_SLACK_CLIENT_ID
  if (!clientId) throw new Error("Slack client ID not configured")

  const state = btoa(JSON.stringify({ provider: "slack", userId, timestamp: Date.now() }))
  const params = new URLSearchParams({
    client_id: clientId,
    scope: "chat:write,channels:read,users:read",
    redirect_uri: "https://chainreact.app/api/integrations/slack/callback",
    state,
  })

  return `https://slack.com/oauth/v2/authorize?${params.toString()}`
}

function generateGitHubAuthUrl(userId: string): string {
  const clientId = process.env.NEXT_PUBLIC_GITHUB_CLIENT_ID
  if (!clientId) throw new Error("GitHub client ID not configured")

  const state = btoa(JSON.stringify({ provider: "github", userId, timestamp: Date.now() }))
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: "https://chainreact.app/api/integrations/github/callback",
    scope: "repo user read:org",
    state,
  })

  return `https://github.com/login/oauth/authorize?${params.toString()}`
}

function generateDiscordAuthUrl(userId: string): string {
  const clientId = process.env.NEXT_PUBLIC_DISCORD_CLIENT_ID
  if (!clientId) throw new Error("Discord client ID not configured")

  const state = btoa(JSON.stringify({ provider: "discord", userId, timestamp: Date.now() }))
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: "https://chainreact.app/api/integrations/discord/callback",
    response_type: "code",
    scope: "identify guilds",
    state,
  })

  return `https://discord.com/api/oauth2/authorize?${params.toString()}`
}

function generateTwitterAuthUrl(userId: string): string {
  const clientId = process.env.NEXT_PUBLIC_TWITTER_CLIENT_ID
  if (!clientId) throw new Error("Twitter client ID not configured")

  const state = btoa(JSON.stringify({ provider: "twitter", userId, timestamp: Date.now() }))
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: "https://chainreact.app/api/integrations/twitter/callback",
    response_type: "code",
    scope: "tweet.read tweet.write users.read",
    state,
    code_challenge_method: "S256",
    code_challenge: "challenge", // In production, generate proper PKCE challenge
  })

  return `https://twitter.com/i/oauth2/authorize?${params.toString()}`
}

function generateLinkedInAuthUrl(userId: string): string {
  const clientId = process.env.NEXT_PUBLIC_LINKEDIN_CLIENT_ID
  if (!clientId) throw new Error("LinkedIn client ID not configured")

  const state = btoa(JSON.stringify({ provider: "linkedin", userId, timestamp: Date.now() }))
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: "https://chainreact.app/api/integrations/linkedin/callback",
    response_type: "code",
    scope: "r_liteprofile w_member_social",
    state,
  })

  return `https://www.linkedin.com/oauth/v2/authorization?${params.toString()}`
}

function generateFacebookAuthUrl(userId: string): string {
  const clientId = process.env.NEXT_PUBLIC_FACEBOOK_CLIENT_ID
  if (!clientId) throw new Error("Facebook client ID not configured")

  const state = btoa(JSON.stringify({ provider: "facebook", userId, timestamp: Date.now() }))
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: "https://chainreact.app/api/integrations/facebook/callback",
    response_type: "code",
    scope: "public_profile pages_manage_posts",
    state,
  })

  return `https://www.facebook.com/v18.0/dialog/oauth?${params.toString()}`
}

function generateInstagramAuthUrl(userId: string): string {
  const clientId = process.env.NEXT_PUBLIC_INSTAGRAM_CLIENT_ID
  if (!clientId) throw new Error("Instagram client ID not configured")

  const state = btoa(JSON.stringify({ provider: "instagram", userId, timestamp: Date.now() }))
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: "https://chainreact.app/api/integrations/instagram/callback",
    response_type: "code",
    scope: "user_profile user_media",
    state,
  })

  return `https://api.instagram.com/oauth/authorize?${params.toString()}`
}

function generateTikTokAuthUrl(userId: string): string {
  const clientId = process.env.NEXT_PUBLIC_TIKTOK_CLIENT_ID
  if (!clientId) throw new Error("TikTok client ID not configured")

  const state = btoa(JSON.stringify({ provider: "tiktok", userId, timestamp: Date.now() }))
  const params = new URLSearchParams({
    client_key: clientId,
    redirect_uri: "https://chainreact.app/api/integrations/tiktok/callback",
    response_type: "code",
    scope: "user.info.basic video.list",
    state,
  })

  return `https://www.tiktok.com/auth/authorize/?${params.toString()}`
}

function generateNotionAuthUrl(userId: string): string {
  const clientId = process.env.NEXT_PUBLIC_NOTION_CLIENT_ID
  if (!clientId) throw new Error("Notion client ID not configured")

  const state = btoa(JSON.stringify({ provider: "notion", userId, timestamp: Date.now() }))
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: "https://chainreact.app/api/integrations/notion/callback",
    response_type: "code",
    state,
  })

  return `https://api.notion.com/v1/oauth/authorize?${params.toString()}`
}

function generateTrelloAuthUrl(userId: string): string {
  const clientId = process.env.NEXT_PUBLIC_TRELLO_CLIENT_ID
  if (!clientId) throw new Error("Trello client ID not configured")

  const params = new URLSearchParams({
    key: clientId,
    return_url: "https://chainreact.app/api/integrations/trello/callback",
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

  const state = btoa(JSON.stringify({ provider: "dropbox", userId, timestamp: Date.now() }))
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: "https://chainreact.app/api/integrations/dropbox/callback",
    response_type: "code",
    state,
  })

  return `https://www.dropbox.com/oauth2/authorize?${params.toString()}`
}

function generateHubSpotAuthUrl(userId: string): string {
  const clientId = process.env.NEXT_PUBLIC_HUBSPOT_CLIENT_ID
  if (!clientId) throw new Error("HubSpot client ID not configured")

  const state = btoa(JSON.stringify({ provider: "hubspot", userId, timestamp: Date.now() }))
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: "https://chainreact.app/api/integrations/hubspot/callback",
    scope: "crm.objects.contacts.read crm.objects.deals.read",
    state,
  })

  return `https://app.hubspot.com/oauth/authorize?${params.toString()}`
}

function generateAirtableAuthUrl(userId: string): string {
  const clientId = process.env.NEXT_PUBLIC_AIRTABLE_CLIENT_ID
  if (!clientId) throw new Error("Airtable client ID not configured")

  const state = btoa(JSON.stringify({ provider: "airtable", userId, timestamp: Date.now() }))
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: "https://chainreact.app/api/integrations/airtable/callback",
    response_type: "code",
    scope: "data.records:read data.records:write",
    state,
  })

  return `https://airtable.com/oauth2/v1/authorize?${params.toString()}`
}

function generateMailchimpAuthUrl(userId: string): string {
  const clientId = process.env.NEXT_PUBLIC_MAILCHIMP_CLIENT_ID
  if (!clientId) throw new Error("Mailchimp client ID not configured")

  const state = btoa(JSON.stringify({ provider: "mailchimp", userId, timestamp: Date.now() }))
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: "https://chainreact.app/api/integrations/mailchimp/callback",
    response_type: "code",
    state,
  })

  return `https://login.mailchimp.com/oauth2/authorize?${params.toString()}`
}

function generateShopifyAuthUrl(userId: string): string {
  const clientId = process.env.NEXT_PUBLIC_SHOPIFY_CLIENT_ID
  if (!clientId) throw new Error("Shopify client ID not configured")

  const state = btoa(JSON.stringify({ provider: "shopify", userId, timestamp: Date.now() }))
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: "https://chainreact.app/api/integrations/shopify/callback",
    response_type: "code",
    scope: "read_products write_products",
    state,
  })

  return `https://shopify.com/oauth/authorize?${params.toString()}`
}

function generateStripeAuthUrl(userId: string): string {
  const clientId = process.env.NEXT_PUBLIC_STRIPE_CLIENT_ID
  if (!clientId) throw new Error("Stripe client ID not configured")

  const state = btoa(JSON.stringify({ provider: "stripe", userId, timestamp: Date.now() }))
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: "https://chainreact.app/api/integrations/stripe/callback",
    response_type: "code",
    scope: "read_write",
    state,
  })

  return `https://connect.stripe.com/oauth/authorize?${params.toString()}`
}

function generatePayPalAuthUrl(userId: string): string {
  const clientId = process.env.NEXT_PUBLIC_PAYPAL_CLIENT_ID
  if (!clientId) throw new Error("PayPal client ID not configured")

  const state = btoa(JSON.stringify({ provider: "paypal", userId, timestamp: Date.now() }))
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: "https://chainreact.app/api/integrations/paypal/callback",
    response_type: "code",
    scope: "openid profile email",
    state,
  })

  return `https://www.paypal.com/signin/authorize?${params.toString()}`
}

function generateTeamsAuthUrl(userId: string): string {
  const clientId = process.env.NEXT_PUBLIC_TEAMS_CLIENT_ID
  if (!clientId) throw new Error("Teams client ID not configured")

  const state = btoa(JSON.stringify({ provider: "teams", userId, timestamp: Date.now() }))
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: "https://chainreact.app/api/integrations/teams/callback",
    response_type: "code",
    scope: "User.Read Chat.ReadWrite",
    state,
  })

  return `https://login.microsoftonline.com/common/oauth2/v2.0/authorize?${params.toString()}`
}

function generateOneDriveAuthUrl(userId: string): string {
  const clientId = process.env.NEXT_PUBLIC_ONEDRIVE_CLIENT_ID
  if (!clientId) throw new Error("OneDrive client ID not configured")

  const state = btoa(JSON.stringify({ provider: "onedrive", userId, timestamp: Date.now() }))
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: "https://chainreact.app/api/integrations/onedrive/callback",
    response_type: "code",
    scope: "Files.ReadWrite.All",
    state,
  })

  return `https://login.microsoftonline.com/common/oauth2/v2.0/authorize?${params.toString()}`
}

function generateGitLabAuthUrl(userId: string): string {
  const clientId = process.env.NEXT_PUBLIC_GITLAB_CLIENT_ID
  if (!clientId) throw new Error("GitLab client ID not configured")

  const state = btoa(JSON.stringify({ provider: "gitlab", userId, timestamp: Date.now() }))
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: "https://chainreact.app/api/integrations/gitlab/callback",
    response_type: "code",
    scope: "api read_user",
    state,
  })

  return `https://gitlab.com/oauth/authorize?${params.toString()}`
}

function generateDockerAuthUrl(userId: string): string {
  const clientId = process.env.NEXT_PUBLIC_DOCKER_CLIENT_ID
  if (!clientId) throw new Error("Docker client ID not configured")

  const state = btoa(JSON.stringify({ provider: "docker", userId, timestamp: Date.now() }))
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: "https://chainreact.app/api/integrations/docker/callback",
    response_type: "code",
    scope: "repo:admin",
    state,
  })

  return `https://hub.docker.com/oauth/authorize?${params.toString()}`
}
