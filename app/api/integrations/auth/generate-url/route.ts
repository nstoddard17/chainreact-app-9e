import { type NextRequest, NextResponse } from "next/server"
import { createSupabaseRouteHandlerClient } from "@/utils/supabase/server"
import { cookies } from "next/headers"
import crypto from "crypto"
import { createAdminClient } from "@/lib/supabase/admin"
import { getBaseUrl } from "@/lib/utils/getBaseUrl"

export async function POST(request: NextRequest) {
  try {
    cookies()
    const supabase = await createSupabaseRouteHandlerClient()

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
    const supabaseAdmin = createAdminClient()

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
        authUrl = await generateNotionAuthUrl(stateObject, supabase)
        break

      case "twitter":
        authUrl = await generateTwitterAuthUrl(stateObject, supabaseAdmin)
        break

      case "linkedin":
        authUrl = await generateLinkedInAuthUrl(stateObject, supabase)
        break

      case "facebook":
        authUrl = generateFacebookAuthUrl(finalState)
        break

      case "instagram":
        authUrl = await generateInstagramAuthUrl(stateObject, supabase)
        break

      case "tiktok":
        authUrl = await generateTikTokAuthUrl(stateObject, supabase)
        break

      case "trello":
        authUrl = generateTrelloAuthUrl(finalState)
        break

      case "dropbox":
        authUrl = await generateDropboxAuthUrl(stateObject, supabase)
        break

      case "box":
        authUrl = generateBoxAuthUrl(finalState)
        break

      case "hubspot":
        authUrl = await generateHubSpotAuthUrl(stateObject, supabase)
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
        authUrl = await generatePayPalAuthUrl(stateObject)
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

      case "kit":
        authUrl = await generateKitAuthUrl(stateObject)
        break

      case "blackbaud":
        authUrl = generateBlackbaudAuthUrl(finalState)
        break

      case "globalpayments":
        authUrl = generateGlobalPaymentsAuthUrl(finalState)
        break

      case "microsoft-outlook":
        authUrl = generateMicrosoftOutlookAuthUrl(finalState)
        break

      case "microsoft-onenote":
        authUrl = generateMicrosoftOneNoteAuthUrl(finalState)
        break

      case "gumroad":
        authUrl = generateGumroadAuthUrl(finalState)
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
  const baseUrl = getBaseUrl()

  const params = new URLSearchParams({
    client_id: clientId,
    scope: "channels:read,chat:write,users:read", // Bot permissions (if user has admin access)
    user_scope: "channels:read,chat:write,users:read", // User permissions (fallback)
    redirect_uri: `${baseUrl}/api/integrations/slack/callback`,
    state,
    response_type: "code",
  })

  // Add this parameter to force Slack to show the workspace selector
  // This is critical for users who don't have a workspace yet
  params.append("multiple_workspaces", "true")

  const authUrl = `https://slack.com/oauth/v2/authorize?${params.toString()}`
  console.log(`Generated Slack auth URL: ${authUrl}`)
  
  return authUrl
}

function generateDiscordAuthUrl(state: string): string {
  const clientId = process.env.NEXT_PUBLIC_DISCORD_CLIENT_ID
  if (!clientId) throw new Error("Discord client ID not configured")
  const baseUrl = getBaseUrl()

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: `${baseUrl}/api/integrations/discord/callback`,
    response_type: "code",
    scope: "identify guilds",
    state,
    prompt: "consent",
  })

  return `https://discord.com/api/oauth2/authorize?${params.toString()}`
}

function generateGitHubAuthUrl(state: string): string {
  const clientId = process.env.NEXT_PUBLIC_GITHUB_CLIENT_ID
  if (!clientId) throw new Error("GitHub client ID not configured")
  const baseUrl = getBaseUrl()

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: `${baseUrl}/api/integrations/github/callback`,
    scope: "repo user:email read:org",
    state,
    response_type: "code",
  })

  return `https://github.com/login/oauth/authorize?${params.toString()}`
}

function generateGoogleAuthUrl(service: string, state: string): string {
  const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID
  if (!clientId) throw new Error("Google client ID not configured")
  const baseUrl = getBaseUrl()

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
      scopes += " https://www.googleapis.com/auth/youtubepartner"
      break
  }

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: `${baseUrl}/api/integrations/${service}/callback`,
    response_type: "code",
    scope: scopes,
    state,
    access_type: "offline",
    prompt: "consent",
  })

  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`
}

async function generateNotionAuthUrl(stateObject: any, supabase: any): Promise<string> {
  const clientId = process.env.NEXT_PUBLIC_NOTION_CLIENT_ID
  if (!clientId) throw new Error("Notion client ID not configured")
  const baseUrl = getBaseUrl()

  // Generate PKCE challenge
  const codeVerifier = crypto.randomBytes(32).toString("hex")
  
  // Convert state object to string
  const state = btoa(JSON.stringify(stateObject))
  
  // Store state in database for verification in callback
  const { error } = await supabase
    .from("pkce_flow")
    .insert({ 
      state,
      code_verifier: codeVerifier,
      provider: "notion" 
    })

  if (error) {
    throw new Error(`Failed to store Notion OAuth state: ${error.message}`)
  }

  const params = new URLSearchParams({
    client_id: clientId,
    response_type: "code",
    redirect_uri: `${baseUrl}/api/integrations/notion/callback`,
    state,
  })

  return `https://api.notion.com/v1/oauth/authorize?${params.toString()}`
}

async function generateTwitterAuthUrl(stateObject: any, supabase: any): Promise<string> {
  const clientId = process.env.NEXT_PUBLIC_TWITTER_CLIENT_ID
  if (!clientId) throw new Error("Twitter client ID not configured")
  const baseUrl = getBaseUrl()

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
    redirect_uri: `${baseUrl}/api/integrations/twitter/callback`,
    scope: "tweet.read users.read tweet.write offline.access",
    state: state,
    code_challenge: codeChallenge,
    code_challenge_method: "S256",
  })

  return `https://twitter.com/i/oauth2/authorize?${params.toString()}`
}

async function generateLinkedInAuthUrl(stateObject: any, supabase: any): Promise<string> {
  const clientId = process.env.NEXT_PUBLIC_LINKEDIN_CLIENT_ID
  console.log('LinkedIn Client ID:', clientId ? `${clientId.substring(0, 4)}...` : 'NOT SET')
  console.log('LinkedIn Client ID length:', clientId ? clientId.length : 0)
  
  if (!clientId) throw new Error("LinkedIn client ID not configured")
  const baseUrl = getBaseUrl()

  // Convert state object to string
  const state = btoa(JSON.stringify(stateObject))
  
  // Store state in database for verification in callback - UPDATED to use pkce_flow table
  const { error } = await supabase
    .from("pkce_flow")
    .insert({ 
      state, 
      code_verifier: crypto.randomBytes(32).toString("hex"), // Add code_verifier for consistency
      provider: "linkedin" 
    })

  if (error) {
    throw new Error(`Failed to store LinkedIn OAuth state: ${error.message}`)
  }

  const params = new URLSearchParams({
    response_type: "code",
    client_id: clientId,
    redirect_uri: `${baseUrl}/api/integrations/linkedin/callback`,
    state,
    scope: "openid profile email w_member_social r_events rw_events",
  })

  const authUrl = `https://www.linkedin.com/oauth/v2/authorization?${params.toString()}`
  console.log('Generated LinkedIn auth URL:', authUrl)
  
  return authUrl
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
  const baseUrl = getBaseUrl()

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: `${baseUrl}/api/integrations/facebook/callback`,
    response_type: "code",
    scope: "email manage_fundraisers pages_show_list business_management read_insights pages_read_user_content pages_read_engagement pages_manage_metadata pages_manage_posts pages_manage_engagement",
    state,
  })

  const authUrl = `https://www.facebook.com/v19.0/dialog/oauth?${params.toString()}`
  console.log('Generated Facebook auth URL:', authUrl)
  
  return authUrl
}

async function generateInstagramAuthUrl(stateObject: any, supabase: any): Promise<string> {
  const clientId = process.env.NEXT_PUBLIC_INSTAGRAM_CLIENT_ID
  if (!clientId) throw new Error("Instagram client ID not configured")
  const baseUrl = getBaseUrl()

  // Generate PKCE challenge
  const codeVerifier = crypto.randomBytes(32).toString("hex")
  
  // Convert state object to string
  const state = btoa(JSON.stringify(stateObject))
  
  // Store state in database for verification in callback
  const { error } = await supabase
    .from("pkce_flow")
    .insert({ 
      state,
      code_verifier: codeVerifier,
      provider: "instagram" 
    })

  if (error) {
    throw new Error(`Failed to store Instagram OAuth state: ${error.message}`)
  }

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: `${baseUrl}/api/integrations/instagram/callback`,
    response_type: "code",
    scope: "user_profile user_media",
    state,
  })

  return `https://api.instagram.com/oauth/authorize?${params.toString()}`
}

async function generateTikTokAuthUrl(stateObject: any, supabase: any): Promise<string> {
  const clientId = process.env.NEXT_PUBLIC_TIKTOK_CLIENT_ID
  if (!clientId) throw new Error("TikTok client ID not configured")
  const baseUrl = getBaseUrl()
  
  // Ensure consistent redirect URI format
  const redirectUri = `${baseUrl}/api/integrations/tiktok/callback`
  
  // Log the redirect URI for debugging
  console.log('TikTok redirect URI:', redirectUri)

  // Generate PKCE challenge
  const codeVerifier = crypto.randomBytes(32).toString("hex")
  
  // Convert state object to string
  const state = btoa(JSON.stringify(stateObject))
  
  // Store state in database for verification in callback - UPDATED to use pkce_flow table
  const { error } = await supabase
    .from("pkce_flow")
    .insert({ 
      state,
      code_verifier: codeVerifier,
      provider: "tiktok" 
    })

  if (error) {
    throw new Error(`Failed to store TikTok OAuth state: ${error.message}`)
  }

  const params = new URLSearchParams({
    client_key: clientId, // Use client_key instead of client_id for consistency
    response_type: "code",
    scope: "user.info.basic",
    redirect_uri: redirectUri,
    state,
  })

  // Add this parameter to force login screen
  params.append("force_login", "true")

  const authUrl = `https://www.tiktok.com/v2/auth/authorize?${params.toString()}`
  console.log('Generated TikTok auth URL:', authUrl)
  
  return authUrl
}

function generateTrelloAuthUrl(state: string): string {
  const clientId = process.env.NEXT_PUBLIC_TRELLO_CLIENT_ID
  if (!clientId) throw new Error("Trello client ID not configured")
  const baseUrl = getBaseUrl()

  const params = new URLSearchParams({
    key: clientId,
    name: "ChainReact",
    // These scopes are required to enable the full set of Power-Up capabilities.
    scope: "read,write,account",
    expiration: "never",
    response_type: "token",
    // Use the page.tsx handler instead of the API route for the callback
    // This allows our client-side code to handle parsing the token from the URL fragment
    return_url: `${baseUrl}/integrations/trello-auth?state=${state}`,
    callback_method: "fragment",
    state,
  })

  return `https://trello.com/1/authorize?${params.toString()}`
}

async function generateDropboxAuthUrl(stateObject: any, supabase: any): Promise<string> {
  const clientId = process.env.NEXT_PUBLIC_DROPBOX_CLIENT_ID
  if (!clientId) throw new Error("Dropbox client ID not configured")
  const baseUrl = getBaseUrl()

  // Generate PKCE challenge
  const codeVerifier = crypto.randomBytes(32).toString("hex")
  
  // Convert state object to string
  const state = btoa(JSON.stringify(stateObject))
  
  // Store state in database for verification in callback
  const { error } = await supabase
    .from("pkce_flow")
    .insert({ 
      state,
      code_verifier: codeVerifier,
      provider: "dropbox" 
    })

  if (error) {
    throw new Error(`Failed to store Dropbox OAuth state: ${error.message}`)
  }

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: `${baseUrl}/api/integrations/dropbox/callback`,
    response_type: "code",
    state,
    token_access_type: "offline",
  })

  return `https://www.dropbox.com/oauth2/authorize?${params.toString()}`
}

function generateBoxAuthUrl(state: string): string {
  const clientId = process.env.NEXT_PUBLIC_BOX_CLIENT_ID
  if (!clientId) throw new Error("Box client ID not configured")
  const baseUrl = getBaseUrl()

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: `${baseUrl}/api/integrations/box/callback`,
    response_type: "code",
    state,
  })

  return `https://app.box.com/api/oauth2/authorize?${params.toString()}`
}

async function generateHubSpotAuthUrl(stateObject: any, supabase: any): Promise<string> {
  const clientId = process.env.NEXT_PUBLIC_HUBSPOT_CLIENT_ID
  if (!clientId) throw new Error("HubSpot client ID not configured")
  const baseUrl = getBaseUrl()

  // Generate PKCE challenge
  const codeVerifier = crypto.randomBytes(32).toString("hex")
  
  // Convert state object to string
  const state = btoa(JSON.stringify(stateObject))
  
  // Store state in database for verification in callback
  const { error } = await supabase
    .from("pkce_flow")
    .insert({ 
      state,
      code_verifier: codeVerifier,
      provider: "hubspot" 
    })

  if (error) {
    throw new Error(`Failed to store HubSpot OAuth state: ${error.message}`)
  }

  // HubSpot scopes
  const hubspotScopes = [
    "crm.objects.contacts.read",
    "crm.objects.contacts.write",
    "crm.objects.companies.read",
    "crm.objects.companies.write",
    "crm.objects.deals.read",
    "crm.objects.deals.write",
    "content",
  ]

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: `${baseUrl}/api/integrations/hubspot/callback`,
    response_type: "code",
    scope: hubspotScopes.join(" "),
    access_type: "offline",
    state,
  })

  return `https://app.hubspot.com/oauth/authorize?${params.toString()}`
}

async function generateAirtableAuthUrl(stateObject: any, supabase: any): Promise<string> {
  const clientId = process.env.NEXT_PUBLIC_AIRTABLE_CLIENT_ID
  if (!clientId) throw new Error("Airtable client ID not configured")
  const baseUrl = getBaseUrl()

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
    redirect_uri: `${baseUrl}/api/integrations/airtable/callback`,
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
  const baseUrl = getBaseUrl()

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: `${baseUrl}/api/integrations/mailchimp/callback`,
    response_type: "code",
    state,
  })

  return `https://login.mailchimp.com/oauth2/authorize?${params.toString()}`
}

function generateShopifyAuthUrl(state: string): string {
  const clientId = process.env.NEXT_PUBLIC_SHOPIFY_CLIENT_ID
  if (!clientId) throw new Error("Shopify client ID not configured")
  const baseUrl = getBaseUrl()

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: `${baseUrl}/api/integrations/shopify/callback`,
    response_type: "code",
    scope: "read_products write_products read_orders write_orders read_customers write_customers read_inventory write_inventory",
    state,
  })

  return `https://shopify.com/oauth/authorize?${params.toString()}`
}

function generateStripeAuthUrl(state: string): string {
  const clientId = process.env.NEXT_PUBLIC_STRIPE_CLIENT_ID
  if (!clientId) throw new Error("Stripe client ID not configured")
  const baseUrl = getBaseUrl()

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: `${baseUrl}/api/integrations/stripe/callback`,
    response_type: "code",
    scope: "read_write",
    state,
  })

  return `https://connect.stripe.com/oauth/authorize?${params.toString()}`
}

async function generatePayPalAuthUrl(stateObject: any): Promise<string> {
  const clientId = process.env.NEXT_PUBLIC_PAYPAL_CLIENT_ID
  if (!clientId) throw new Error("PayPal client ID not configured")
  const baseUrl = getBaseUrl()

  // Generate PKCE challenge
  const codeVerifier = crypto.randomBytes(32).toString("hex")
  
  // Convert state object to string
  const state = btoa(JSON.stringify(stateObject))
  
  // Store state in database for verification in callback
  const supabase = createAdminClient()
  const { error } = await supabase
    .from("pkce_flow")
    .insert({ 
      state,
      code_verifier: codeVerifier,
      provider: "paypal"
    })

  if (error) {
    throw new Error(`Failed to store PayPal OAuth state: ${error.message}`)
  }

  // Comprehensive list of PayPal scopes
  const paypalScopes = [
    "openid",
    "profile",
    "email",
    "https://uri.paypal.com/services/paypalattributes",
    "https://uri.paypal.com/services/identity/email",
    "https://uri.paypal.com/services/identity/name",
    "https://uri.paypal.com/services/identity/account",
    "https://uri.paypal.com/services/invoicing",
    "https://uri.paypal.com/services/subscription",
    "https://uri.paypal.com/services/payouts"
  ].join(" ")

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: `${baseUrl}/api/integrations/paypal/callback`,
    response_type: "code",
    scope: paypalScopes,
    state,
  })

  return `https://www.paypal.com/connect?${params.toString()}`
}

function generateTeamsAuthUrl(state: string): string {
  const clientId = process.env.NEXT_PUBLIC_MICROSOFT_CLIENT_ID
  if (!clientId) throw new Error("Microsoft client ID not configured")
  const baseUrl = getBaseUrl()

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: `${baseUrl}/api/integrations/teams/callback`,
    response_type: "code",
    scope: "User.Read Chat.ReadWrite",
    state,
  })

  return `https://login.microsoftonline.com/common/oauth2/v2.0/authorize?${params.toString()}`
}

function generateOneDriveAuthUrl(state: string): string {
  const clientId = process.env.NEXT_PUBLIC_MICROSOFT_CLIENT_ID
  if (!clientId) throw new Error("Microsoft client ID not configured")
  const baseUrl = getBaseUrl()

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: `${baseUrl}/api/integrations/onedrive/callback`,
    response_type: "code",
    scope: "Files.ReadWrite.All",
    state,
  })

  return `https://login.microsoftonline.com/common/oauth2/v2.0/authorize?${params.toString()}`
}

function generateGitLabAuthUrl(state: string): string {
  const clientId = process.env.NEXT_PUBLIC_GITLAB_CLIENT_ID
  if (!clientId) throw new Error("GitLab client ID not configured")
  const baseUrl = getBaseUrl()

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: `${baseUrl}/api/integrations/gitlab/callback`,
    response_type: "code",
    scope: "api read_user",
    state,
  })

  return `https://gitlab.com/oauth/authorize?${params.toString()}`
}

function generateDockerAuthUrl(state: string): string {
  const clientId = process.env.NEXT_PUBLIC_DOCKER_CLIENT_ID
  if (!clientId) throw new Error("Docker client ID not configured")
  const baseUrl = getBaseUrl()

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: `${baseUrl}/api/integrations/docker/callback`,
    response_type: "code",
    scope: "openid",
    state,
  })

  return `https://hub.docker.com/oauth/authorize?${params.toString()}`
}

async function generateKitAuthUrl(stateObject: any): Promise<string> {
  const clientId = process.env.NEXT_PUBLIC_KIT_CLIENT_ID
  if (!clientId) throw new Error("Kit client ID not configured")
  const baseUrl = getBaseUrl()

  // Generate PKCE challenge
  const codeVerifier = crypto.randomBytes(32).toString("hex")
  
  // Convert state object to string
  const state = btoa(JSON.stringify(stateObject))
  
  // Store state in database for verification in callback
  const supabase = createAdminClient()
  const { error } = await supabase
    .from("pkce_flow")
    .insert({ 
      state,
      code_verifier: codeVerifier,
      provider: "kit"
    })

  if (error) {
    throw new Error(`Failed to store Kit OAuth state: ${error.message}`)
  }

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: `${baseUrl}/api/integrations/kit/callback`,
    response_type: "code",
    state,
  })

  return `https://app.kit.com/oauth/authorize?${params.toString()}`
}

function generateBlackbaudAuthUrl(state: string): string {
  const clientId = process.env.NEXT_PUBLIC_BLACKBAUD_CLIENT_ID
  if (!clientId) throw new Error("Blackbaud client ID not configured")
  const baseUrl = getBaseUrl()

  const params = new URLSearchParams({
    client_id: clientId,
    response_type: "code",
    redirect_uri: `${baseUrl}/api/integrations/blackbaud/callback`,
    state,
  })

  return `https://oauth2.sky.blackbaud.com/authorization?${params.toString()}`
}

function generateGlobalPaymentsAuthUrl(state: string): string {
  const clientId = process.env.NEXT_PUBLIC_GLOBALPAYMENTS_CLIENT_ID
  if (!clientId) throw new Error("GlobalPayments client ID not configured")
  const baseUrl = getBaseUrl()

  const params = new URLSearchParams({
    client_id: clientId,
    response_type: "code",
    redirect_uri: `${baseUrl}/api/integrations/globalpayments/callback`,
    scope: "read_transactions write_transactions",
    state,
  })

  return `https://api.globalpayments.com/oauth/authorize?${params.toString()}`
}

function generateMicrosoftOutlookAuthUrl(state: string): string {
  const clientId = process.env.NEXT_PUBLIC_MICROSOFT_CLIENT_ID
  if (!clientId) throw new Error("Microsoft client ID not configured")
  const baseUrl = getBaseUrl()

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: `${baseUrl}/api/integrations/microsoft-outlook/callback`,
    response_type: "code",
    scope: "User.Read Mail.ReadWrite Mail.Send",
    state,
  })

  return `https://login.microsoftonline.com/common/oauth2/v2.0/authorize?${params.toString()}`
}

function generateMicrosoftOneNoteAuthUrl(state: string): string {
  const clientId = process.env.NEXT_PUBLIC_MICROSOFT_CLIENT_ID
  if (!clientId) throw new Error("Microsoft client ID not configured")
  const baseUrl = getBaseUrl()

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: `${baseUrl}/api/integrations/microsoft-onenote/callback`,
    response_type: "code",
    scope: "User.Read Notes.ReadWrite.All",
    state,
  })

  return `https://login.microsoftonline.com/common/oauth2/v2.0/authorize?${params.toString()}`
}

function generateGumroadAuthUrl(state: string): string {
  const clientId = process.env.NEXT_PUBLIC_GUMROAD_CLIENT_ID
  if (!clientId) throw new Error("Gumroad client ID not configured")
  const baseUrl = getBaseUrl()

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: `${baseUrl}/api/integrations/gumroad/callback`,
    response_type: "code",
    scope: "view_profile edit_products view_sales mark_sales_as_shipped refund_sales",
    state,
  })

  return `https://gumroad.com/oauth/authorize?${params.toString()}`
}
