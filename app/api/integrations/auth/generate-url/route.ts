import { type NextRequest, NextResponse } from "next/server"
import { jsonResponse, errorResponse, successResponse } from '@/lib/utils/api-response'
import { createSupabaseRouteHandlerClient } from "@/utils/supabase/server"
import { cookies } from "next/headers"
import crypto from "crypto"
import { createAdminClient } from "@/lib/supabase/admin"
import { getBaseUrl } from "@/lib/utils/getBaseUrl"

import { logger } from '@/lib/utils/logger'

// List of providers that don't support localhost redirect URIs
const PROVIDERS_WITHOUT_LOCALHOST_SUPPORT = [
  'facebook', // Facebook requires HTTPS for OAuth redirects
  'instagram', // Instagram requires HTTPS for OAuth redirects  
  'linkedin', // LinkedIn doesn't allow localhost in production apps
  'twitter', // Twitter (X) doesn't allow localhost URLs
  'tiktok', // TikTok requires verified domains
  'youtube', // YouTube requires verified domains in production
  'youtube-studio', // YouTube Studio requires verified domains
  'stripe', // Stripe requires HTTPS in production mode
  'paypal', // PayPal doesn't allow localhost in production mode
];

export async function POST(request: NextRequest) {
  try {
    cookies()
    const supabase = await createSupabaseRouteHandlerClient()
    const supabaseAdmin = createAdminClient()

    // Get authenticated user
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser()

    if (userError || !user) {
      logger.debug('🔐 [GENERATE-URL] Authentication failed:', userError?.message || 'No user found')
      return errorResponse("Unauthorized", 401, {
        message: "Valid authentication required to generate OAuth URLs",
        details: userError?.message || "No authenticated user session found"
      })
    }

    const { provider, reconnect = false, integrationId, forceFresh = false } = await request.json()

    if (!provider) {
      return errorResponse("Provider is required" , 400)
    }

    // Check if we're running on localhost and the provider doesn't support it
    const baseUrl = getBaseUrl()
    const isLocalhost = baseUrl.includes('localhost') || baseUrl.includes('127.0.0.1')
    
    if (isLocalhost && PROVIDERS_WITHOUT_LOCALHOST_SUPPORT.includes(provider.toLowerCase())) {
      logger.debug(`⚠️ ${provider} doesn't support localhost redirect URIs`)
      return jsonResponse({ 
        error: `${provider} doesn't support localhost redirect URIs`, 
        message: `The ${provider} OAuth provider requires HTTPS and doesn't allow localhost URLs. Please use ngrok or deploy to a staging environment to test ${provider} integration.`,
        details: {
          provider,
          suggestion: "Use 'ngrok http 3000' to create a public HTTPS tunnel to your local development server",
          alternativeSolutions: [
            "Deploy to a staging environment",
            "Use ngrok to create an HTTPS tunnel",
            "Test in production environment"
          ]
        }
      }, { status: 400 })
    }

    // Special handling for Teams integration - check user role
    if (provider.toLowerCase() === "teams") {
      try {
        const { data: profile } = await supabase
          .from('user_profiles')
          .select('role')
          .eq('id', user.id)
          .single()

        const userRole = profile?.role || 'free'
        const allowedRoles = ['business', 'enterprise', 'admin']
        
        if (!allowedRoles.includes(userRole)) {
          return jsonResponse({ 
            error: "Teams integration requires a Business, Enterprise, or Admin plan. Please upgrade your account to access Teams integration.",
            details: {
              currentRole: userRole,
              requiredRoles: allowedRoles
            }
          }, { status: 403 })
        }
      } catch (profileError) {
        logger.error("Error checking user profile for Teams:", profileError)
        return errorResponse("Unable to verify account permissions for Teams integration. Please try again or contact support.", 500, { details: "Profile lookup failed"
         })
      }
    }

    // Create state object
    const stateObject: {
      userId: string
      provider: string
      reconnect: boolean
      integrationId?: string
      timestamp: number
      forceFresh?: boolean
      forceConsent?: boolean
    } = {
      userId: user.id,
      // Microsoft Excel uses OneDrive provider in the database
      provider: provider.toLowerCase() === 'microsoft-excel' ? 'onedrive' : provider.toLowerCase(), // Ensure consistent provider naming
      reconnect,
      integrationId,
      timestamp: Date.now(),
    }

    let finalState = btoa(JSON.stringify(stateObject))
    let authUrl = ""

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
        authUrl = generateGoogleAuthUrl("google", finalState)
        break
      case "gmail":
        authUrl = generateGoogleAuthUrl("gmail", finalState)
        break
      case "google-drive":
        authUrl = generateGoogleAuthUrl("google-drive", finalState)
        break
      case "google-sheets":
        authUrl = generateGoogleAuthUrl("google-sheets", finalState)
        break
      case "google-docs":
        authUrl = generateGoogleAuthUrl("google-docs", finalState)
        break
      case "google-calendar":
        logger.debug("🔵 Generating Google Calendar OAuth URL")
        logger.debug("🔵 State object:", stateObject)
        authUrl = generateGoogleAuthUrl("google-calendar", finalState)
        logger.debug("🔵 Generated Google Calendar auth URL:", authUrl)
        break
      case "youtube":
        authUrl = generateGoogleAuthUrl("youtube", finalState)
        break
      case "youtube-studio":
        authUrl = generateGoogleAuthUrl("youtube-studio", finalState)
        break

      case "notion":
        authUrl = await generateNotionAuthUrl(stateObject, supabaseAdmin)
        break

      case "twitter":
        authUrl = await generateTwitterAuthUrl(stateObject, supabaseAdmin)
        break

      case "linkedin":
        authUrl = await generateLinkedInAuthUrl(stateObject, supabaseAdmin)
        break

      case "facebook":
        authUrl = generateFacebookAuthUrl(finalState)
        break

      case "instagram":
        authUrl = await generateInstagramAuthUrl(stateObject, supabaseAdmin)
        break

      case "tiktok":
        authUrl = await generateTikTokAuthUrl(stateObject, supabaseAdmin)
        break

      case "trello":
        authUrl = generateTrelloAuthUrl(finalState)
        break

      case "dropbox":
        authUrl = await generateDropboxAuthUrl(stateObject, supabaseAdmin)
        break

      case "box":
        authUrl = generateBoxAuthUrl(finalState)
        break

      case "hubspot":
        authUrl = await generateHubSpotAuthUrl(stateObject, supabaseAdmin)
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
        authUrl = await generateTeamsAuthUrl(finalState)
        break

      case "onedrive":
        authUrl = await generateOneDriveAuthUrl(finalState)
        break

      case "microsoft-excel":
        // Microsoft Excel uses OneDrive's authentication
        authUrl = await generateOneDriveAuthUrl(finalState)
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

      case "microsoft-outlook":
        authUrl = await generateMicrosoftOutlookAuthUrl(finalState)
        break

      case "microsoft-onenote":
        // For OneNote, always force fresh consent by adding unique parameters
        stateObject.forceFresh = true
        stateObject.timestamp = Date.now() // Ensure unique state
        stateObject.forceConsent = true // Force Microsoft to show consent screen
        finalState = btoa(JSON.stringify(stateObject))
        authUrl = await generateMicrosoftOneNoteAuthUrl(finalState)
        break

      case "gumroad":
        authUrl = await generateGumroadAuthUrl(stateObject)
        break

      default:
        return jsonResponse({ error: `Provider ${provider} not supported` }, { status: 400 })
    }

    return jsonResponse({
      success: true,
      authUrl,
      provider,
    })
  } catch (error: any) {
    logger.error("OAuth URL generation error:", error)
    return jsonResponse(
      { error: "Failed to generate OAuth URL", details: error.message },
      { status: 500 },
    )
  }
}

// Helper functions to generate proper OAuth URLs
function generateSlackAuthUrl(state: string): string {
  const clientId = process.env.SLACK_CLIENT_ID
  if (!clientId) throw new Error("Slack client ID not configured")
  
  const baseUrl = getBaseUrl()
  const devWebhookUrl = process.env.NEXT_PUBLIC_WEBHOOK_HTTPS_URL || process.env.NGROK_URL || process.env.NEXT_PUBLIC_NGROK_URL || process.env.TUNNEL_URL
  const redirectBase = devWebhookUrl || baseUrl

  // Using Slack's recommended scopes from their shareable link
  // This includes both bot scopes AND user scopes as configured in the Slack app
  const params = new URLSearchParams({
    client_id: clientId,
    // Bot scopes for workspace-level actions
    scope: "channels:join,channels:read,chat:write,chat:write.public,files:write,groups:read,im:read,reactions:write,team:read,users:read",
    // User scopes for user-level actions
    user_scope: "channels:read,chat:write,groups:read,mpim:read,channels:history,groups:history,im:history,mpim:history,reactions:read",
    redirect_uri: `${redirectBase}/api/integrations/slack/callback`,
    state,
  })

  // Optional: Add team parameter to restrict to a specific workspace
  const teamId = process.env.SLACK_TEAM_ID
  if (teamId) {
    params.append('team', teamId)
    logger.debug(`🏢 Restricting Slack OAuth to team: ${teamId}`)
  }

  const authUrl = `https://slack.com/oauth/v2/authorize?${params.toString()}`
  logger.debug(`🔗 Generated Slack auth URL: ${authUrl}`)
  logger.debug(`🔑 Using Client ID: ${clientId}`)
  logger.debug(`📍 Using base URL: ${baseUrl}`)
  if (devWebhookUrl) {
    logger.debug(`🌐 Using development webhook HTTPS URL for Slack redirect: ${redirectBase}`)
  }
  logger.debug(`📋 Using both bot scopes and user scopes as configured in Slack app`)
  
  return authUrl
}

function generateDiscordAuthUrl(state: string): string {
  const clientId = "1378595955212812308"
  const baseUrl = getBaseUrl()
  const redirectUri = `${baseUrl}/api/integrations/discord/callback`

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: "identify email connections guilds guilds.members.read",
    state,
    prompt: "consent",
  })

  return `https://discord.com/api/oauth2/authorize?${params.toString()}`
}

function generateGitHubAuthUrl(state: string): string {
  const clientId = process.env.GITHUB_CLIENT_ID
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
  const clientId = process.env.GOOGLE_CLIENT_ID
  if (!clientId) throw new Error("Google client ID not configured")
  const baseUrl = getBaseUrl()

  // Map service to specific scopes
  let scopes = "https://www.googleapis.com/auth/userinfo.email https://www.googleapis.com/auth/userinfo.profile"

  switch (service) {
    case "gmail":
      scopes += " https://www.googleapis.com/auth/gmail.modify https://www.googleapis.com/auth/gmail.settings.basic https://www.googleapis.com/auth/gmail.settings.sharing https://www.googleapis.com/auth/contacts.readonly"
      break
    case "google":
      scopes = "https://www.googleapis.com/auth/userinfo.email https://www.googleapis.com/auth/userinfo.profile"
      break
    case "google-drive":
      scopes += " https://www.googleapis.com/auth/drive"
      break
    case "google-sheets":
      scopes += " https://www.googleapis.com/auth/spreadsheets https://www.googleapis.com/auth/drive.readonly"
      break
    case "google-docs":
      scopes += " https://www.googleapis.com/auth/documents https://www.googleapis.com/auth/drive.readonly"
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
    default:
      // Use base scopes for unknown services
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
    include_granted_scopes: "true",
  })

  // Add debugging for Gmail specifically
  if (service === "gmail") {
    logger.debug("🔍 Generated Gmail OAuth URL with params:", Object.fromEntries(params))
  }

  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`
}

async function generateNotionAuthUrl(stateObject: any, supabase: any): Promise<string> {
  const clientId = process.env.NOTION_CLIENT_ID
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
    owner: "user", // Show all workspaces the user has access to
    state,
  })

  const authUrl = `https://api.notion.com/v1/oauth/authorize?${params.toString()}`
  logger.debug('🔍 Notion OAuth URL Generation:')
  logger.debug('  - Client ID:', clientId ? `${clientId.substring(0, 10)}...` : 'NOT SET')
  logger.debug('  - Redirect URI:', `${baseUrl}/api/integrations/notion/callback`)
  logger.debug('  - Owner parameter: user (shows all workspaces)')

  return authUrl
}

async function generateTwitterAuthUrl(stateObject: any, supabase: any): Promise<string> {
  const { getOAuthConfig } = await import("@/lib/integrations/oauthConfig")
  const config = getOAuthConfig("twitter")
  if (!config) throw new Error("Twitter OAuth config not found")
  
  const { getOAuthClientCredentials } = await import("@/lib/integrations/oauthConfig")
  const { clientId } = getOAuthClientCredentials(config)
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

  // Use the scope from OAuth config, joining array scopes with spaces
  const scopeString = Array.isArray(config.scope) 
    ? config.scope.join(" ") 
    : (config.scope || "tweet.read users.read offline.access")

  const params = new URLSearchParams({
    response_type: "code",
    client_id: clientId,
    redirect_uri: `${baseUrl}/api/integrations/twitter/callback`,
    scope: scopeString,
    state: state,
    code_challenge: codeChallenge,
    code_challenge_method: "S256",
  })

  logger.debug('🐦 Twitter OAuth URL Generation:')
  logger.debug('  - Scope from config:', config.scope)
  logger.debug('  - Final scope string:', scopeString)
  logger.debug('  - Client ID:', clientId ? `${clientId.substring(0, 10)}...` : 'NOT SET')

  return `https://twitter.com/i/oauth2/authorize?${params.toString()}`
}

async function generateLinkedInAuthUrl(stateObject: any, supabase: any): Promise<string> {
  const clientId = process.env.LINKEDIN_CLIENT_ID
  logger.debug('LinkedIn Client ID:', clientId ? `${clientId.substring(0, 4)}...` : 'NOT SET')
  logger.debug('LinkedIn Client ID length:', clientId ? clientId.length : 0)
  
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
  logger.debug('Generated LinkedIn auth URL:', authUrl)
  
  return authUrl
}

function generateFacebookAuthUrl(state: string): string {
  const clientId = process.env.FACEBOOK_CLIENT_ID
  logger.debug('Facebook Client ID:', clientId ? `${clientId.substring(0, 4)}...` : 'NOT SET')
  logger.debug('Facebook Client ID length:', clientId ? clientId.length : 0)
  logger.debug('Facebook Client ID format valid:', clientId ? /^\d{15,16}$/.test(clientId) : false)
  
  if (!clientId) throw new Error("Facebook client ID not configured")
  
  if (!/^\d{15,16}$/.test(clientId)) {
    logger.error('Facebook Client ID format appears invalid. Expected 15-16 digits, got:', clientId)
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
  logger.debug('Generated Facebook auth URL:', authUrl)
  
  return authUrl
}

async function generateInstagramAuthUrl(stateObject: any, supabase: any): Promise<string> {
  // Use Instagram-specific client ID for Instagram API with Instagram Login
  const clientId = process.env.INSTAGRAM_CLIENT_ID
  if (!clientId) throw new Error("Instagram client ID not configured")
  const baseUrl = getBaseUrl()
  
  // Generate the exact redirect URI and log it for debugging
  const redirectUri = `${baseUrl}/api/integrations/instagram/callback`
  logger.debug('Instagram redirect URI:', redirectUri)

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

  // Instagram business scopes for Instagram API with Instagram Login
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: "instagram_business_basic,instagram_business_content_publish,instagram_business_manage_comments,instagram_business_manage_messages",
    state,
  })

  // Use Instagram's OAuth endpoint instead of Facebook's
  logger.debug("Using Instagram API with Instagram Login")
  return `https://www.instagram.com/oauth/authorize?${params.toString()}`
}

async function generateTikTokAuthUrl(stateObject: any, supabase: any): Promise<string> {
  const clientId = process.env.TIKTOK_CLIENT_ID
  if (!clientId) throw new Error("TikTok client ID not configured")
  const baseUrl = getBaseUrl()
  
  // Ensure consistent redirect URI format
  const redirectUri = `${baseUrl}/api/integrations/tiktok/callback`
  
  // Log the redirect URI for debugging
  logger.debug('TikTok redirect URI:', redirectUri)

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
  logger.debug('Generated TikTok auth URL:', authUrl)
  
  return authUrl
}

function generateTrelloAuthUrl(state: string): string {
  const clientId = process.env.TRELLO_CLIENT_ID
  if (!clientId) throw new Error("Trello client ID not configured")
  const baseUrl = getBaseUrl()

  const params = new URLSearchParams({
    key: clientId,
    name: "ChainReact",
    // Trello only accepts read, write, and account scopes. Read+write is required for webhooks.
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
  const clientId = process.env.DROPBOX_CLIENT_ID
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

  // Define required scopes for Dropbox
  // Based on our workflow actions:
  // - files.content.write: Upload files
  // - files.content.read: Read/download files  
  // - files.metadata.read: List folders and file metadata
  // - account_info.read: Get account info
  const scopes = [
    "files.content.write",
    "files.content.read",
    "files.metadata.read", 
    "account_info.read"
  ]

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: `${baseUrl}/api/integrations/dropbox/callback`,
    response_type: "code",
    state,
    token_access_type: "offline",
    scope: scopes.join(" "),
  })

  return `https://www.dropbox.com/oauth2/authorize?${params.toString()}`
}

function generateBoxAuthUrl(state: string): string {
  const clientId = process.env.BOX_CLIENT_ID
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
  const clientId = process.env.HUBSPOT_CLIENT_ID
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

  // HubSpot scopes - using the minimum required for our actions
  // Note: These scopes must be configured in your HubSpot app settings
  // If you get a scope error, ensure these are enabled in your HubSpot app at:
  // https://app.hubspot.com/developer/{your-account-id}/application/{your-app-id}
  const hubspotScopes = [
    "crm.objects.contacts.read",
    "crm.objects.contacts.write",
    "crm.objects.companies.read",
    "crm.objects.companies.write",
    "crm.objects.deals.read",
    "crm.objects.deals.write",
    "crm.lists.read", // Required for Add Contact to List action
    "crm.lists.write" // Required for Add Contact to List action
  ]

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: `${baseUrl}/api/integrations/hubspot/callback`,
    response_type: "code",
    scope: hubspotScopes.join(" "),
    access_type: "offline",
    state,
    // Force re-approval to prevent cached authorization issues
    // This ensures HubSpot shows the authorization screen instead of auto-redirecting
    approval_prompt: "force"
  })

  return `https://app.hubspot.com/oauth/authorize?${params.toString()}`
}

async function generateAirtableAuthUrl(stateObject: any, supabase: any): Promise<string> {
  const clientId = process.env.AIRTABLE_CLIENT_ID
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

  const redirectUri = `${baseUrl}/api/integrations/airtable/callback`
  logger.debug('🔍 Airtable OAuth Debug:')
  logger.debug('  - Client ID:', clientId ? `${clientId.substring(0, 10)}...` : 'NOT SET')
  logger.debug('  - Redirect URI:', redirectUri)
  logger.debug('  - Base URL:', baseUrl)

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: "data.records:read data.records:write schema.bases:read webhook:manage",
    state,
    code_challenge,
    code_challenge_method: "S256",
  })

  const authUrl = `https://airtable.com/oauth2/v1/authorize?${params.toString()}`
  logger.debug('  - Final OAuth URL (first 200 chars):', `${authUrl.substring(0, 200) }...`)
  
  return authUrl
}

function generateMailchimpAuthUrl(state: string): string {
  const clientId = process.env.MAILCHIMP_CLIENT_ID
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
  const clientId = process.env.SHOPIFY_CLIENT_ID
  if (!clientId) throw new Error("Shopify client ID not configured")
  const baseUrl = getBaseUrl()
  
  // Shopify requires a shop parameter - this should be set in the app admin
  // For draft apps, this needs to be your development store
  const shopifyStore = process.env.SHOPIFY_STORE
  if (!shopifyStore) {
    throw new Error("Shopify store not configured. Set SHOPIFY_STORE env variable to your store domain, e.g., 'your-store.myshopify.com'")
  }
  
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: `${baseUrl}/api/integrations/shopify/callback`,
    response_type: "code",
    scope: "read_products write_products read_orders write_orders read_customers write_customers read_inventory write_inventory",
    state,
  })

  // The correct format for Shopify OAuth URL includes the shop domain
  return `https://${shopifyStore}/admin/oauth/authorize?${params.toString()}`
}

function generateStripeAuthUrl(state: string): string {
  const clientId = process.env.STRIPE_CLIENT_ID
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
  const clientId = process.env.PAYPAL_CLIENT_ID
  if (!clientId) throw new Error("PayPal client ID not configured")
  
  // Instead of using dynamic baseUrl, use the exact registered redirect URI
  // This ensures it matches exactly what's in the PayPal developer dashboard
  const registeredRedirectUri = process.env.PAYPAL_REDIRECT_URI || "https://chainreact.app/api/integrations/paypal/callback"
  
  // For debugging
  logger.debug("PayPal OAuth URL generation - using redirect URI:", registeredRedirectUri)
  logger.debug("PayPal client ID exists:", !!clientId)

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

  // Simplified list of PayPal scopes for better compatibility
  const paypalScopes = [
    "openid",
    "email",
    "profile",
  ].join(" ")

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: registeredRedirectUri,
    response_type: "code",
    scope: paypalScopes,
    state,
  })

  // Use sandbox URL if client ID contains 'sandbox' or is explicitly set via env variable
  const isSandbox = clientId.includes('sandbox') || process.env.PAYPAL_SANDBOX === 'true'
  
  // Use standard authorization endpoints that work better with sandbox
  if (isSandbox) {
    return `https://www.sandbox.paypal.com/signin/authorize?${params.toString()}`
  } 
    return `https://www.paypal.com/signin/authorize?${params.toString()}`
  
}

async function generateTeamsAuthUrl(state: string): Promise<string> {
  const { getOAuthConfig } = await import("@/lib/integrations/oauthConfig")
  const config = getOAuthConfig("teams")
  if (!config) throw new Error("Teams OAuth config not found")
  
  const { getOAuthClientCredentials } = await import("@/lib/integrations/oauthConfig")
  const { clientId } = getOAuthClientCredentials(config)
  if (!clientId) throw new Error("Teams client ID not configured")
  
  const baseUrl = getBaseUrl()
  const redirectUri = `${baseUrl}${config.redirectUriPath}`

  // Debug logging
  logger.debug('🔍 Teams OAuth URL Generation Debug:')
  logger.debug('  - Config scope:', config.scope)
  logger.debug('  - Client ID:', clientId ? `${clientId.substring(0, 10)}...` : 'NOT SET')
  logger.debug('  - Redirect URI:', redirectUri)
  logger.debug('  - Auth endpoint:', config.authEndpoint)

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: config.scope || "",
    prompt: "consent", // Force consent screen every time
    state,
  })

  const finalUrl = `${config.authEndpoint}?${params.toString()}`
  logger.debug('  - Final OAuth URL (first 300 chars):', `${finalUrl.substring(0, 300) }...`)
  
  return finalUrl
}

async function generateOneDriveAuthUrl(state: string): Promise<string> {
  const { getOAuthConfig } = await import("@/lib/integrations/oauthConfig")
  const config = getOAuthConfig("onedrive")
  if (!config) throw new Error("OneDrive OAuth config not found")
  
  const { getOAuthClientCredentials } = await import("@/lib/integrations/oauthConfig")
  const { clientId } = getOAuthClientCredentials(config)
  if (!clientId) throw new Error("OneDrive client ID not configured")
  
  const baseUrl = getBaseUrl()
  const redirectUri = `${baseUrl}${config.redirectUriPath}`



  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: config.scope || "",
    prompt: "consent", // Force consent screen every time
    state,
  })

  return `${config.authEndpoint}?${params.toString()}`
}

function generateGitLabAuthUrl(state: string): string {
  const clientId = process.env.GITLAB_CLIENT_ID
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
  const clientId = process.env.DOCKER_CLIENT_ID
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
  const clientId = process.env.KIT_CLIENT_ID
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
  const clientId = process.env.BLACKBAUD_CLIENT_ID
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

async function generateMicrosoftOutlookAuthUrl(state: string): Promise<string> {
  const { getOAuthConfig } = await import("@/lib/integrations/oauthConfig")
  const config = getOAuthConfig("microsoft-outlook")
  if (!config) throw new Error("Outlook OAuth config not found")

  const { getOAuthClientCredentials } = await import("@/lib/integrations/oauthConfig")
  const { clientId } = getOAuthClientCredentials(config)
  if (!clientId) throw new Error("Outlook client ID not configured")

  const baseUrl = getBaseUrl()
  const redirectUri = `${baseUrl}${config.redirectUriPath}`



  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: config.scope || "",
    prompt: "select_account", // Allow user to choose which account to use
    state,
  })

  return `${config.authEndpoint}?${params.toString()}`
}

async function generateMicrosoftOneNoteAuthUrl(state: string): Promise<string> {
  const { getOAuthConfig } = await import("@/lib/integrations/oauthConfig")
  const config = getOAuthConfig("microsoft-onenote")
  if (!config) throw new Error("OneNote OAuth config not found")
  
  const { getOAuthClientCredentials } = await import("@/lib/integrations/oauthConfig")
  const { clientId } = getOAuthClientCredentials(config)
  if (!clientId) throw new Error("OneNote client ID not configured")
  
  const baseUrl = getBaseUrl()
  const redirectUri = `${baseUrl}${config.redirectUriPath}`
  
  // Debug logging to see what scopes we're requesting
  logger.debug('🔍 OneNote OAuth URL Generation:')
  logger.debug('  - Config scope:', config.scope)
  logger.debug('  - Client ID:', clientId ? `${clientId.substring(0, 10)}...` : 'NOT SET')
  logger.debug('  - Redirect URI:', redirectUri)

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: config.scope || "",
    prompt: "consent", // Force consent screen every time
    state,
  })
  
  const finalUrl = `${config.authEndpoint}?${params.toString()}`
  logger.debug('  - Final OAuth URL (scope part):', finalUrl.includes('Notes.ReadWrite') ? '✅ Contains Notes.ReadWrite' : '❌ Missing Notes.ReadWrite')

  return finalUrl
}

async function generateGumroadAuthUrl(stateObject: any): Promise<string> {
  const clientId = process.env.GUMROAD_CLIENT_ID
  if (!clientId) throw new Error("Gumroad client ID not configured")
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
      provider: "gumroad" 
    })

  if (error) {
    throw new Error(`Failed to store Gumroad OAuth state: ${error.message}`)
  }

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: `${baseUrl}/api/integrations/gumroad/callback`,
    response_type: "code",
    scope: "view_profile edit_products view_sales mark_sales_as_shipped refund_sales",
    state,
  })

  return `https://gumroad.com/oauth/authorize?${params.toString()}`
}
