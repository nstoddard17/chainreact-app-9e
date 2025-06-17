import { type NextRequest, NextResponse } from "next/server"
import { createServerComponentClient } from "@supabase/auth-helpers-nextjs"
import { cookies } from "next/headers"
import crypto from "crypto"

export async function POST(request: NextRequest) {
  try {
    const supabase = createServerComponentClient({ cookies })

    // Get authenticated user
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser()

    if (userError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { provider, reconnect = false, integrationId } = await request.json()

    if (!provider) {
      return NextResponse.json({ error: "Provider is required" }, { status: 400 })
    }

    // Initial state generation
    const stateObject = {
      provider,
      userId: user.id,
      reconnect,
      integrationId,
      timestamp: Date.now(),
    }

    let authUrl: string
    let finalState = btoa(JSON.stringify(stateObject))

    switch (provider.toLowerCase()) {
      case "slack":
        authUrl = generateSlackAuthUrl(finalState)
        break

      case "discord":
        authUrl = generateDiscordAuthUrl(finalState)
        break

      case "github":
        authUrl = generateGitHubAuthUrl(finalState)
        break

      case "google":
      case "gmail":
      case "google-drive":
      case "google-sheets":
      case "google-docs":
      case "google-calendar":
      case "youtube":
        authUrl = generateGoogleAuthUrl(provider, finalState)
        break

      case "notion":
        authUrl = generateNotionAuthUrl(finalState)
        break

      case "twitter":
        authUrl = await generateTwitterAuthUrl(stateObject)
        break

      case "linkedin":
        authUrl = generateLinkedInAuthUrl(finalState)
        break

      case "facebook":
        authUrl = generateFacebookAuthUrl(finalState)
        break

      case "instagram":
        authUrl = generateInstagramAuthUrl(finalState)
        break

      case "tiktok":
        authUrl = generateTikTokAuthUrl(finalState)
        break

      case "trello":
        authUrl = generateTrelloAuthUrl(finalState)
        break

      case "dropbox":
        authUrl = generateDropboxAuthUrl(finalState)
        break

      case "hubspot":
        authUrl = generateHubSpotAuthUrl(finalState)
        break

      case "airtable":
        authUrl = generateAirtableAuthUrl(finalState)
        break

      case "mailchimp":
        authUrl = generateMailchimpAuthUrl(finalState)
        break

      case "shopify":
        authUrl = generateShopifyAuthUrl(finalState)
        break

      case "stripe":
        authUrl = generateStripeAuthUrl(finalState)
        break

      case "paypal":
        authUrl = generatePayPalAuthUrl(finalState)
        break

      case "teams":
        authUrl = generateTeamsAuthUrl(finalState)
        break

      case "onedrive":
        authUrl = generateOneDriveAuthUrl(finalState)
        break

      case "gitlab":
        authUrl = generateGitLabAuthUrl(finalState)
        break

      case "docker":
        authUrl = generateDockerAuthUrl(finalState)
        break

      default:
        return NextResponse.json({ error: `Provider ${provider} not supported` }, { status: 400 })
    }

    return NextResponse.json({
      success: true,
      authUrl,
      provider,
    })
  } catch (error: any) {
    console.error("OAuth URL generation error:", error)
    return NextResponse.json(
      { error: "Failed to generate OAuth URL", details: error.message },
      { status: 500 },
    )
  }
}

// Helper functions to generate proper OAuth URLs
function generateSlackAuthUrl(state: string): string {
  const clientId = process.env.NEXT_PUBLIC_SLACK_CLIENT_ID
  if (!clientId) throw new Error("Slack client ID not configured")

  const params = new URLSearchParams({
    client_id: clientId,
    scope: "channels:read,chat:write,users:read",
    redirect_uri: "https://chainreact.app/api/integrations/slack/callback",
    state,
    response_type: "code",
  })

  return `https://slack.com/oauth/v2/authorize?${params.toString()}`
}

function generateDiscordAuthUrl(state: string): string {
  const clientId = process.env.NEXT_PUBLIC_DISCORD_CLIENT_ID
  if (!clientId) throw new Error("Discord client ID not configured")

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: "https://chainreact.app/api/integrations/discord/callback",
    response_type: "code",
    scope: "identify guilds",
    state,
  })

  return `https://discord.com/api/oauth2/authorize?${params.toString()}`
}

function generateGitHubAuthUrl(state: string): string {
  const clientId = process.env.NEXT_PUBLIC_GITHUB_CLIENT_ID
  if (!clientId) throw new Error("GitHub client ID not configured")

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: "https://chainreact.app/api/integrations/github/callback",
    scope: "repo user:email read:org",
    state,
    response_type: "code",
  })

  return `https://github.com/login/oauth/authorize?${params.toString()}`
}

function generateGoogleAuthUrl(service: string, state: string): string {
  const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID
  if (!clientId) throw new Error("Google client ID not configured")

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

function generateNotionAuthUrl(state: string): string {
  const clientId = process.env.NEXT_PUBLIC_NOTION_CLIENT_ID
  if (!clientId) throw new Error("Notion client ID not configured")

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: "https://chainreact.app/api/integrations/notion/callback",
    response_type: "code",
    state,
  })

  return `https://api.notion.com/v1/oauth/authorize?${params.toString()}`
}

async function generateTwitterAuthUrl(stateObject: any): Promise<string> {
  const clientId = process.env.NEXT_PUBLIC_TWITTER_CLIENT_ID
  if (!clientId) throw new Error("Twitter client ID not configured")

  // Generate a random string for the code verifier
  const codeVerifier = crypto.randomBytes(32).toString("hex")

  // Create a code challenge from the verifier
  const codeChallenge = crypto
    .createHash("sha256")
    .update(codeVerifier)
    .digest("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=/g, "")

  // Add the code verifier to the state
  const stateWithVerifier = { ...stateObject, codeVerifier }
  const finalState = btoa(JSON.stringify(stateWithVerifier))

  const params = new URLSearchParams({
    response_type: "code",
    client_id: clientId,
    redirect_uri: `https://chainreact.app/api/integrations/twitter/callback`,
    scope: "tweet.read users.read offline.access",
    state: finalState,
    code_challenge: codeChallenge,
    code_challenge_method: "S256",
  })

  return `https://twitter.com/i/oauth2/authorize?${params.toString()}`
}

function generateLinkedInAuthUrl(state: string): string {
  const clientId = process.env.NEXT_PUBLIC_LINKEDIN_CLIENT_ID
  if (!clientId) throw new Error("LinkedIn client ID not configured")

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: "https://chainreact.app/api/integrations/linkedin/callback",
    response_type: "code",
    scope: "profile email openid",
    state,
  })

  return `https://www.linkedin.com/oauth/v2/authorization?${params.toString()}`
}

function generateFacebookAuthUrl(state: string): string {
  const clientId = process.env.NEXT_PUBLIC_FACEBOOK_CLIENT_ID
  if (!clientId) throw new Error("Facebook client ID not configured")

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: "https://chainreact.app/api/integrations/facebook/callback",
    response_type: "code",
    scope: "public_profile pages_manage_posts",
    state,
  })

  return `https://www.facebook.com/v18.0/dialog/oauth?${params.toString()}`
}

function generateInstagramAuthUrl(state: string): string {
  const clientId = process.env.NEXT_PUBLIC_INSTAGRAM_CLIENT_ID
  if (!clientId) throw new Error("Instagram client ID not configured")

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: "https://chainreact.app/api/integrations/instagram/callback",
    response_type: "code",
    scope: "user_profile user_media",
    state,
  })

  return `https://api.instagram.com/oauth/authorize?${params.toString()}`
}

function generateTikTokAuthUrl(state: string): string {
  const clientId = process.env.NEXT_PUBLIC_TIKTOK_CLIENT_ID
  if (!clientId) throw new Error("TikTok client ID not configured")

  const params = new URLSearchParams({
    client_key: clientId,
    response_type: "code",
    scope: "user.info.basic",
    redirect_uri: "https://chainreact.app/api/integrations/tiktok/callback",
    state,
  })

  return `https://www.tiktok.com/v2/auth/authorize?${params.toString()}`
}

function generateTrelloAuthUrl(state: string): string {
  const apiKey = process.env.NEXT_PUBLIC_TRELLO_CLIENT_ID
  if (!apiKey) throw new Error("Trello API key not configured")

  const callbackUrl = new URL("https://chainreact.app/api/integrations/trello/callback")
  // Trello's callback mechanism is a bit different. We pass the state in the hash.
  // The callback page will have client-side script to handle it.
  const returnUrl = `${callbackUrl.href}#state=${state}`

  const params = new URLSearchParams({
    key: apiKey,
    name: "ChainReact",
    scope: "read,write",
    expiration: "never",
    response_type: "token",
    return_url: returnUrl,
  })

  return `https://trello.com/1/authorize?${params.toString()}`
}

function generateDropboxAuthUrl(state: string): string {
  const clientId = process.env.NEXT_PUBLIC_DROPBOX_CLIENT_ID
  if (!clientId) throw new Error("Dropbox client ID not configured")

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: "https://chainreact.app/api/integrations/dropbox/callback",
    response_type: "code",
    state,
  })

  return `https://www.dropbox.com/oauth2/authorize?${params.toString()}`
}

function generateHubSpotAuthUrl(state: string): string {
  const clientId = process.env.NEXT_PUBLIC_HUBSPOT_CLIENT_ID
  if (!clientId) throw new Error("HubSpot client ID not configured")

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: "https://chainreact.app/api/integrations/hubspot/callback",
    scope: "crm.objects.contacts.read crm.objects.deals.read",
    state,
  })

  return `https://app.hubspot.com/oauth/authorize?${params.toString()}`
}

function generateAirtableAuthUrl(state: string): string {
  const clientId = process.env.NEXT_PUBLIC_AIRTABLE_CLIENT_ID
  if (!clientId) throw new Error("Airtable client ID not configured")

  // PKCE
  const codeVerifier = crypto.randomBytes(32).toString("hex")
  const codeChallenge = crypto.createHash("sha256").update(codeVerifier).digest("base64url")

  // Storing the code_verifier in the state temporarily.
  // This is not ideal for production. A database or a secure server-side session would be better.
  const stateWithPKCE = JSON.parse(atob(state))
  stateWithPKCE.code_verifier = codeVerifier
  const finalState = btoa(JSON.stringify(stateWithPKCE))

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: "https://chainreact.app/api/integrations/airtable/callback",
    response_type: "code",
    scope: "data.records:read data.records:write schema.bases:read",
    state: finalState,
    code_challenge: codeChallenge,
    code_challenge_method: "S256",
  })

  return `https://airtable.com/oauth2/v1/authorize?${params.toString()}`
}

function generateMailchimpAuthUrl(state: string): string {
  const clientId = process.env.NEXT_PUBLIC_MAILCHIMP_CLIENT_ID
  if (!clientId) throw new Error("Mailchimp client ID not configured")

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: "https://chainreact.app/api/integrations/mailchimp/callback",
    response_type: "code",
    state,
  })

  return `https://login.mailchimp.com/oauth2/authorize?${params.toString()}`
}

function generateShopifyAuthUrl(state: string): string {
  const clientId = process.env.NEXT_PUBLIC_SHOPIFY_CLIENT_ID
  if (!clientId) throw new Error("Shopify client ID not configured")

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: "https://chainreact.app/api/integrations/shopify/callback",
    response_type: "code",
    scope: "read_products write_products",
    state,
  })

  return `https://shopify.com/oauth/authorize?${params.toString()}`
}

function generateStripeAuthUrl(state: string): string {
  const clientId = process.env.NEXT_PUBLIC_STRIPE_CLIENT_ID
  if (!clientId) throw new Error("Stripe client ID not configured")

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: "https://chainreact.app/api/integrations/stripe/callback",
    response_type: "code",
    scope: "read_write",
    state,
  })

  return `https://connect.stripe.com/oauth/authorize?${params.toString()}`
}

function generatePayPalAuthUrl(state: string): string {
  const clientId = process.env.NEXT_PUBLIC_PAYPAL_CLIENT_ID
  if (!clientId) throw new Error("PayPal client ID not configured")

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: "https://chainreact.app/api/integrations/paypal/callback",
    response_type: "code",
    scope: "openid profile email",
    state,
  })

  return `https://www.paypal.com/signin/authorize?${params.toString()}`
}

function generateTeamsAuthUrl(state: string): string {
  const clientId = process.env.NEXT_PUBLIC_TEAMS_CLIENT_ID
  if (!clientId) throw new Error("Teams client ID not configured")

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: "https://chainreact.app/api/integrations/teams/callback",
    response_type: "code",
    scope: "User.Read Chat.ReadWrite",
    state,
  })

  return `https://login.microsoftonline.com/common/oauth2/v2.0/authorize?${params.toString()}`
}

function generateOneDriveAuthUrl(state: string): string {
  const clientId = process.env.NEXT_PUBLIC_ONEDRIVE_CLIENT_ID
  if (!clientId) throw new Error("OneDrive client ID not configured")

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: "https://chainreact.app/api/integrations/onedrive/callback",
    response_type: "code",
    scope: "Files.ReadWrite.All",
    state,
  })

  return `https://login.microsoftonline.com/common/oauth2/v2.0/authorize?${params.toString()}`
}

function generateGitLabAuthUrl(state: string): string {
  const clientId = process.env.NEXT_PUBLIC_GITLAB_CLIENT_ID
  if (!clientId) throw new Error("GitLab client ID not configured")

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: "https://chainreact.app/api/integrations/gitlab/callback",
    response_type: "code",
    scope: "api read_user",
    state,
  })

  return `https://gitlab.com/oauth/authorize?${params.toString()}`
}

function generateDockerAuthUrl(state: string): string {
  const clientId = process.env.NEXT_PUBLIC_DOCKER_CLIENT_ID
  if (!clientId) throw new Error("Docker client ID not configured")

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: "https://chainreact.app/api/integrations/docker/callback",
    response_type: "code",
    scope: "repo:admin",
    state,
  })

  return `https://hub.docker.com/oauth/authorize?${params.toString()}`
}
