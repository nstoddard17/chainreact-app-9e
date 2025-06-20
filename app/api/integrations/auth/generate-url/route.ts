import { type NextRequest, NextResponse } from "next/server"
import { createServerComponentClient } from "@supabase/auth-helpers-nextjs"
import { cookies } from "next/headers"
import crypto from "crypto"
import supabaseAdmin from "@/lib/supabase/admin"

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
      case "youtube-studio":
        authUrl = generateGoogleAuthUrl(provider, finalState)
        break

      case "notion":
        authUrl = generateNotionAuthUrl(finalState)
        break

      case "twitter":
        authUrl = await generateTwitterAuthUrl(stateObject, supabaseAdmin)
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

      case "box":
        authUrl = generateBoxAuthUrl(finalState)
        break

      case "hubspot":
        authUrl = generateHubSpotAuthUrl(finalState)
        break

      case "airtable":
        authUrl = await generateAirtableAuthUrl(stateObject, supabaseAdmin)
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

      case "convertkit":
        authUrl = generateConvertKitAuthUrl(finalState)
        break

      case "microsoft-forms":
        authUrl = generateMicrosoftAuthUrl(finalState)
        break

      case "canva":
        authUrl = generateCanvaAuthUrl(finalState)
        break

      case "blackbaud":
        authUrl = generateBlackbaudAuthUrl(finalState)
        break

      case "globalpayments":
        authUrl = generateGlobalPaymentsAuthUrl(finalState)
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

  // Note: For distributed apps, do not use the 'team' parameter
  // as it causes 'invalid_team_for_non_distributed_app' error
  // Distributed apps should work across all workspaces

  const authUrl = `https://slack.com/oauth/v2/authorize?${params.toString()}`
  console.log(`Generated Slack auth URL: ${authUrl}`)
  
  return authUrl
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
    case "youtube-studio":
      scopes +=
        " https://www.googleapis.com/auth/youtube.readonly https://www.googleapis.com/auth/yt-analytics.readonly https://www.googleapis.com/auth/youtube.force-ssl"
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

  // Note: The `owner` parameter has been intentionally omitted to ensure
  // the user is always prompted to select a workspace.
  const params = new URLSearchParams({
    client_id: clientId,
    response_type: "code",
    redirect_uri: "https://chainreact.app/api/integrations/notion/callback",
    state,
  })

  return `https://api.notion.com/v1/oauth/authorize?${params.toString()}`
}

async function generateTwitterAuthUrl(stateObject: any, supabase: any): Promise<string> {
  const clientId = process.env.NEXT_PUBLIC_TWITTER_CLIENT_ID
  if (!clientId) throw new Error("Twitter client ID not configured")

  // Generate PKCE challenge
  const codeVerifier = crypto.randomBytes(32).toString("hex")
  const codeChallenge = crypto.createHash("sha256").update(codeVerifier).digest("base64url")

  const state = btoa(JSON.stringify(stateObject))

  // Store the code_verifier in the database
  const { error } = await supabase
    .from("pkce_flow")
    .insert({ state, code_verifier: codeVerifier, provider: "twitter" })

  if (error) {
    throw new Error(`Failed to store PKCE code verifier: ${error.message}`)
  }

  const params = new URLSearchParams({
    response_type: "code",
    client_id: clientId,
    redirect_uri: "https://chainreact.app/api/integrations/twitter/callback",
    scope: "tweet.read users.read tweet.write offline.access",
    state: state,
    code_challenge: codeChallenge,
    code_challenge_method: "S256",
  })

  return `https://twitter.com/i/oauth2/authorize?${params.toString()}`
}

function generateLinkedInAuthUrl(state: string): string {
  const clientId = process.env.NEXT_PUBLIC_LINKEDIN_CLIENT_ID
  if (!clientId) throw new Error("LinkedIn client ID not configured")

  const params = new URLSearchParams({
    response_type: "code",
    client_id: clientId,
    redirect_uri: `https://chainreact.app/api/integrations/linkedin/callback`,
    state,
    scope: "profile email openid",
  })

  return `https://www.linkedin.com/oauth/v2/authorization?${params.toString()}`
}

function generateFacebookAuthUrl(state: string): string {
  const clientId = process.env.NEXT_PUBLIC_FACEBOOK_CLIENT_ID
  console.log('Facebook Client ID:', clientId ? `${clientId.substring(0, 4)}...` : 'NOT SET')
  console.log('Facebook Client ID length:', clientId ? clientId.length : 0)
  console.log('Facebook Client ID format valid:', clientId ? /^\d{15,16}$/.test(clientId) : false)
  
  if (!clientId) throw new Error("Facebook client ID not configured")
  
  if (!/^\d{15,16}$/.test(clientId)) {
    console.error('Facebook Client ID format appears invalid. Expected 15-16 digits, got:', clientId)
  }

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: "https://chainreact.app/api/integrations/facebook/callback",
    response_type: "code",
    scope: "email manage_fundraisers pages_show_list business_management read_insights pages_read_user_content pages_read_engagement pages_manage_metadata pages_manage_posts pages_manage_engagement",
    state,
  })

  const authUrl = `https://www.facebook.com/v19.0/dialog/oauth?${params.toString()}`
  console.log('Generated Facebook auth URL:', authUrl)
  
  return authUrl
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
    client_id: clientId,
    response_type: "code",
    scope: "user.info.basic",
    redirect_uri: "https://chainreact.app/api/integrations/tiktok/callback",
    state,
  })

  return `https://www.tiktok.com/v2/auth/authorize?${params.toString()}`
}

function generateTrelloAuthUrl(state: string): string {
  const apiKey = process.env.NEXT_PUBLIC_TRELLO_API_KEY
  if (!apiKey) throw new Error("Trello API key not configured")

  const params = new URLSearchParams({
    key: apiKey,
    name: "ChainReact",
    // These scopes are required to enable the full set of Power-Up capabilities.
    scope: "read,write,account",
    expiration: "never",
    response_type: "token",
    return_url: "https://chainreact.app/api/integrations/trello/callback",
    callback_method: "fragment",
    state,
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
    token_access_type: "offline",
    scope: "account_info.read files.content.read files.content.write files.metadata.read files.metadata.write sharing.read sharing.write",
    state,
  })
  return `https://www.dropbox.com/oauth2/authorize?${params.toString()}`
}

function generateBoxAuthUrl(state: string): string {
  const clientId = process.env.NEXT_PUBLIC_BOX_CLIENT_ID
  if (!clientId) throw new Error("Box client ID not configured")

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: "https://chainreact.app/api/integrations/box/callback",
    response_type: "code",
    state,
  })

  return `https://app.box.com/api/oauth2/authorize?${params.toString()}`
}

function generateHubSpotAuthUrl(state: string): string {
  const clientId = process.env.NEXT_PUBLIC_HUBSPOT_CLIENT_ID
  if (!clientId) throw new Error("Hubspot client ID not configured")

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: "https://chainreact.app/api/integrations/hubspot/callback",
    response_type: "code",
    scope: "crm.objects.companies.read crm.objects.companies.write crm.objects.contacts.read crm.objects.contacts.write crm.objects.deals.read crm.objects.deals.write oauth",
    access_type: "offline",
    state,
  })

  return `https://app.hubspot.com/oauth/authorize?${params.toString()}`
}

async function generateAirtableAuthUrl(stateObject: any, supabase: any): Promise<string> {
  const clientId = process.env.NEXT_PUBLIC_AIRTABLE_CLIENT_ID
  if (!clientId) throw new Error("Airtable client ID not configured")

  // Generate PKCE challenge
  const codeVerifier = crypto.randomBytes(32).toString("hex")
  const code_challenge = crypto.createHash("sha256").update(codeVerifier).digest("base64url")

  const state = btoa(JSON.stringify(stateObject))

  // Store the code_verifier
  const { error } = await supabase
    .from("pkce_flow")
    .insert({ state, code_verifier: codeVerifier, provider: "airtable" })

  if (error) {
    throw new Error(`Failed to store PKCE code verifier: ${error.message}`)
  }

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: `https://chainreact.app/api/integrations/airtable/callback`,
    response_type: "code",
    scope: "data.records:read data.records:write schema.bases:read",
    state,
    code_challenge,
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
    scope: "campaigns.read campaigns.write audience.read audience.write automation.read automation.write",
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
  const clientId = process.env.NEXT_PUBLIC_MICROSOFT_CLIENT_ID
  if (!clientId) throw new Error("Microsoft client ID not configured")

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
  const clientId = process.env.NEXT_PUBLIC_MICROSOFT_CLIENT_ID
  if (!clientId) throw new Error("Microsoft client ID not configured")

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
    scope: "openid",
    state,
  })

  return `https://hub.docker.com/oauth/authorize?${params.toString()}`
}

function generateConvertKitAuthUrl(state: string): string {
  const clientId = process.env.NEXT_PUBLIC_CONVERTKIT_CLIENT_ID
  if (!clientId) throw new Error("ConvertKit client ID not configured")

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: `https://chainreact.app/api/integrations/convertkit/callback`,
    response_type: "code",
    state,
  })

  return `https://app.convertkit.com/oauth/authorize?${params.toString()}`
}

function generateMicrosoftAuthUrl(state: string): string {
  const clientId = process.env.NEXT_PUBLIC_MICROSOFT_CLIENT_ID
  if (!clientId) throw new Error("Microsoft client ID not configured")

  const params = new URLSearchParams({
    client_id: clientId,
    response_type: "code",
    redirect_uri: `https://chainreact.app/api/integrations/microsoft-forms/callback`,
    response_mode: "query",
    scope: "User.Read Forms.ReadWrite.All offline_access",
    state,
  })

  return `https://login.microsoftonline.com/common/oauth2/v2.0/authorize?${params.toString()}`
}

function generateCanvaAuthUrl(state: string): string {
  const clientId = process.env.NEXT_PUBLIC_CANVA_CLIENT_ID
  if (!clientId) throw new Error("Canva client ID not configured")

  const params = new URLSearchParams({
    client_id: clientId,
    response_type: "code",
    redirect_uri: `https://chainreact.app/api/integrations/canva/callback`,
    scope: "asset:read asset:write design:read design:write",
    state,
  })

  return `https://www.canva.com/api/oauth/authorize?${params.toString()}`
}

function generateBlackbaudAuthUrl(state: string): string {
  const clientId = process.env.NEXT_PUBLIC_BLACKBAUD_CLIENT_ID
  if (!clientId) throw new Error("Blackbaud client ID not configured")

  const params = new URLSearchParams({
    client_id: clientId,
    response_type: "code",
    redirect_uri: `https://chainreact.app/api/integrations/blackbaud/callback`,
    state,
  })

  return `https://oauth2.sky.blackbaud.com/authorization?${params.toString()}`
}

function generateGlobalPaymentsAuthUrl(state: string): string {
  const clientId = process.env.NEXT_PUBLIC_GLOBALPAYMENTS_CLIENT_ID
  if (!clientId) throw new Error("GlobalPayments client ID not configured")

  const params = new URLSearchParams({
    client_id: clientId,
    response_type: "code",
    redirect_uri: `https://chainreact.app/api/integrations/globalpayments/callback`,
    scope: "read_transactions write_transactions",
    state,
  })

  return `https://api.globalpayments.com/oauth/authorize?${params.toString()}`
}
