import { type NextRequest, NextResponse } from "next/server"
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs"
import { cookies } from "next/headers"
import type { Database } from "@/types/supabase"
import { getAllScopes, getRequiredScopes } from "@/lib/integrations/integrationScopes"

interface DiagnosticResult {
  integrationId: string
  provider: string
  status: "✅ Connected & functional" | "⚠️ Connected but limited" | "❌ Connected but broken"
  tokenValid: boolean
  grantedScopes: string[]
  requiredScopes: string[]
  missingScopes: string[]
  availableComponents: string[]
  unavailableComponents: string[]
  recommendations: string[]
  details: {
    tokenExpiry?: string
    lastVerified?: string
    errorMessage?: string
    connectionType?: "oauth" | "demo" | "api_key"
    rawScopeString?: string
  }
}

// Component definitions with their required scopes - updated to match all integrations
const COMPONENT_SCOPE_MAPPING = {
  // Slack components
  slack_message: { scopes: ["chat:write"], provider: "slack" },
  slack_user_info: { scopes: ["users:read"], provider: "slack" },
  slack_channels_list: { scopes: ["channels:read"], provider: "slack" },

  // Discord components
  discord_message: { scopes: ["identify"], provider: "discord" },
  discord_guild_info: { scopes: ["guilds"], provider: "discord" },

  // Microsoft Teams components
  teams_user_info: { scopes: ["User.Read"], provider: "teams" },
  teams_get_profile: { scopes: ["profile"], provider: "teams" },

  // OneDrive components
  onedrive_upload: { scopes: ["Files.ReadWrite"], provider: "onedrive" },
  onedrive_download: { scopes: ["Files.Read"], provider: "onedrive" },

  // Google Calendar components
  google_calendar_create: { scopes: ["https://www.googleapis.com/auth/calendar"], provider: "google-calendar" },
  google_calendar_read: { scopes: ["https://www.googleapis.com/auth/calendar.readonly"], provider: "google-calendar" },

  // Google Sheets components
  google_sheets_append: { scopes: ["https://www.googleapis.com/auth/spreadsheets"], provider: "google-sheets" },
  google_sheets_read: { scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"], provider: "google-sheets" },

  // Google Docs components
  google_docs_create: { scopes: ["https://www.googleapis.com/auth/documents"], provider: "google-docs" },
  google_docs_read: { scopes: ["https://www.googleapis.com/auth/documents.readonly"], provider: "google-docs" },

  // Gmail components
  gmail_send: { scopes: ["https://www.googleapis.com/auth/gmail.send"], provider: "gmail" },
  gmail_modify: { scopes: ["https://www.googleapis.com/auth/gmail.modify"], provider: "gmail" },

  // Google Drive components
  google_drive_upload: { scopes: ["https://www.googleapis.com/auth/drive.file"], provider: "google-drive" },
  google_drive_read: { scopes: ["https://www.googleapis.com/auth/drive.readonly"], provider: "google-drive" },

  // YouTube components
  youtube_get_channel: { scopes: ["https://www.googleapis.com/auth/youtube.readonly"], provider: "youtube" },
  youtube_get_videos: { scopes: ["https://www.googleapis.com/auth/youtube.readonly"], provider: "youtube" },
  youtube_get_analytics: { scopes: ["https://www.googleapis.com/auth/youtube.readonly"], provider: "youtube" },

  // GitHub components
  github_get_user: { scopes: ["user:email"], provider: "github" },
  github_get_repos: { scopes: ["public_repo"], provider: "github" },
  github_create_issue: { scopes: ["repo"], provider: "github" },
  github_create_pr: { scopes: ["repo"], provider: "github" },

  // GitLab components
  gitlab_get_user: { scopes: ["read_user"], provider: "gitlab" },
  gitlab_get_projects: { scopes: ["read_repository"], provider: "gitlab" },

  // Notion components
  notion_create_page: { scopes: [], provider: "notion" },
  notion_read_page: { scopes: [], provider: "notion" },
  notion_update_page: { scopes: [], provider: "notion" },

  // Airtable components
  airtable_create_record: { scopes: ["data.records:write"], provider: "airtable" },
  airtable_read_records: { scopes: ["data.records:read"], provider: "airtable" },

  // Trello components
  trello_create_card: { scopes: ["write"], provider: "trello" },
  trello_read_boards: { scopes: ["read"], provider: "trello" },

  // Dropbox components
  dropbox_upload: { scopes: ["files.content.write"], provider: "dropbox" },
  dropbox_download: { scopes: ["files.content.read"], provider: "dropbox" },

  // Twitter/X components
  twitter_post_tweet: { scopes: ["tweet.write"], provider: "twitter" },
  twitter_read_tweets: { scopes: ["tweet.read"], provider: "twitter" },
  twitter_get_user: { scopes: ["users.read"], provider: "twitter" },

  // LinkedIn components
  linkedin_get_profile: { scopes: ["r_liteprofile"], provider: "linkedin" },
  linkedin_post_share: { scopes: ["w_member_social"], provider: "linkedin" },

  // Facebook components
  facebook_get_profile: { scopes: ["public_profile"], provider: "facebook" },
  facebook_post_page: { scopes: ["pages_manage_posts"], provider: "facebook" },

  // Instagram components
  instagram_get_profile: { scopes: ["user_profile"], provider: "instagram" },
  instagram_get_media: { scopes: ["user_media"], provider: "instagram" },

  // TikTok components
  tiktok_get_profile: { scopes: ["user.info.basic"], provider: "tiktok" },
  tiktok_get_videos: { scopes: ["video.list"], provider: "tiktok" },

  // Mailchimp components
  mailchimp_create_campaign: { scopes: ["basic_access"], provider: "mailchimp" },
  mailchimp_add_subscriber: { scopes: ["basic_access"], provider: "mailchimp" },

  // HubSpot components
  hubspot_create_contact: { scopes: ["contacts"], provider: "hubspot" },
  hubspot_get_deals: { scopes: ["crm.objects.deals.read"], provider: "hubspot" },

  // Shopify components
  shopify_get_products: { scopes: ["read_products"], provider: "shopify" },
  shopify_create_order: { scopes: ["write_orders"], provider: "shopify" },

  // PayPal components
  paypal_create_payment: { scopes: [], provider: "paypal" },
  paypal_get_transactions: { scopes: [], provider: "paypal" },

  // Stripe components
  stripe_create_payment: { scopes: [], provider: "stripe" },
  stripe_get_customers: { scopes: [], provider: "stripe" },

  // Docker components
  docker_list_containers: { scopes: [], provider: "docker" },
  docker_create_container: { scopes: [], provider: "docker" },
}

async function verifyNotionToken(accessToken: string): Promise<{ valid: boolean; scopes: string[]; error?: string }> {
  try {
    const response = await fetch("https://api.notion.com/v1/users/me", {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Notion-Version": "2022-06-28",
      },
    })

    if (!response.ok) {
      const error = await response.json()
      return { valid: false, scopes: [], error: error.message || "Token validation failed" }
    }

    // Notion doesn't return scopes in the API, so we assume basic access
    return { valid: true, scopes: ["basic_access"] }
  } catch (error: any) {
    return { valid: false, scopes: [], error: error.message }
  }
}

async function verifyTwitterToken(accessToken: string): Promise<{ valid: boolean; scopes: string[]; error?: string }> {
  try {
    const response = await fetch("https://api.twitter.com/2/users/me", {
      headers: { Authorization: `Bearer ${accessToken}` },
    })

    if (!response.ok) {
      const error = await response.json()
      return { valid: false, scopes: [], error: error.detail || error.title || "Token validation failed" }
    }

    // For Twitter, we assume the token has the scopes we requested
    const scopes = ["tweet.read", "tweet.write", "users.read"]
    return { valid: true, scopes }
  } catch (error: any) {
    return { valid: false, scopes: [], error: error.message }
  }
}

async function verifyDiscordToken(accessToken: string): Promise<{ valid: boolean; scopes: string[]; error?: string }> {
  try {
    const response = await fetch("https://discord.com/api/users/@me", {
      headers: { Authorization: `Bearer ${accessToken}` },
    })

    if (!response.ok) {
      const error = await response.json()
      return { valid: false, scopes: [], error: error.message || "Token validation failed" }
    }

    const scopes = ["identify", "guilds"]
    return { valid: true, scopes }
  } catch (error: any) {
    return { valid: false, scopes: [], error: error.message }
  }
}

async function refreshGoogleToken(
  refreshToken: string,
): Promise<{ valid: boolean; accessToken?: string; error?: string }> {
  try {
    const response = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        client_id: process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID!,
        client_secret: process.env.GOOGLE_CLIENT_SECRET!,
        refresh_token: refreshToken,
        grant_type: "refresh_token",
      }),
    })

    if (!response.ok) {
      const error = await response.text()
      return { valid: false, error: `Token refresh failed: ${error}` }
    }

    const data = await response.json()
    return { valid: true, accessToken: data.access_token }
  } catch (error: any) {
    return { valid: false, error: error.message }
  }
}

async function verifyGoogleToken(
  accessToken: string,
  refreshToken?: string,
  provider?: string,
): Promise<{ valid: boolean; scopes: string[]; error?: string; newAccessToken?: string }> {
  try {
    // First try with the current access token
    let tokenInfoResponse = await fetch(`https://www.googleapis.com/oauth2/v1/tokeninfo?access_token=${accessToken}`)
    let tokenInfo = await tokenInfoResponse.json()

    // If token is expired and we have a refresh token, try to refresh
    if (tokenInfo.error && refreshToken) {
      console.log(`${provider || "Google"} token expired, attempting refresh...`)
      const refreshResult = await refreshGoogleToken(refreshToken)

      if (refreshResult.valid && refreshResult.accessToken) {
        // Try again with the new token
        tokenInfoResponse = await fetch(
          `https://www.googleapis.com/oauth2/v1/tokeninfo?access_token=${refreshResult.accessToken}`,
        )
        tokenInfo = await tokenInfoResponse.json()

        if (!tokenInfo.error) {
          console.log(`${provider || "Google"} token successfully refreshed`)
          return {
            valid: true,
            scopes: tokenInfo.scope ? tokenInfo.scope.split(" ") : [],
            newAccessToken: refreshResult.accessToken,
          }
        }
      }
    }

    if (tokenInfo.error) {
      return { valid: false, scopes: [], error: tokenInfo.error_description || tokenInfo.error }
    }

    const scopes = tokenInfo.scope ? tokenInfo.scope.split(" ") : []
    return { valid: true, scopes }
  } catch (error: any) {
    return { valid: false, scopes: [], error: error.message }
  }
}

async function verifyMicrosoftToken(
  accessToken: string,
): Promise<{ valid: boolean; scopes: string[]; error?: string }> {
  try {
    console.log("Verifying Microsoft token...")

    // Basic token validation
    if (!accessToken || accessToken.length < 50) {
      return { valid: false, scopes: [], error: "Access token appears to be invalid or too short" }
    }

    // Skip JWT format check - Microsoft tokens can be in different formats
    console.log("Verifying Microsoft token with Graph API...")

    const userResponse = await fetch("https://graph.microsoft.com/v1.0/me", {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
    })

    if (!userResponse.ok) {
      const error = await userResponse.json()
      console.error("Microsoft user verification failed:", error)

      if (error.error?.code === "InvalidAuthenticationToken") {
        return {
          valid: false,
          scopes: [],
          error: `Invalid token format: ${error.error.message}`,
        }
      }

      return { valid: false, scopes: [], error: error.error?.message || "Token validation failed" }
    }

    const userData = await userResponse.json()
    console.log("Microsoft user verified:", userData.displayName)

    // Return basic Microsoft scopes
    return { valid: true, scopes: ["openid", "profile", "email", "User.Read"] }
  } catch (error: any) {
    console.error("Microsoft token verification error:", error)
    return { valid: false, scopes: [], error: error.message }
  }
}

async function verifySlackToken(accessToken: string): Promise<{ valid: boolean; scopes: string[]; error?: string }> {
  try {
    const authResponse = await fetch("https://slack.com/api/auth.test", {
      headers: { Authorization: `Bearer ${accessToken}` },
    })
    const authData = await authResponse.json()

    if (!authData.ok) {
      return { valid: false, scopes: [], error: authData.error || "Auth test failed" }
    }

    const scopes: string[] = []

    // Test various Slack API endpoints to determine available scopes
    const endpoints = [
      { url: "https://slack.com/api/conversations.list", scope: "channels:read" },
      { url: "https://slack.com/api/users.list", scope: "users:read" },
    ]

    for (const endpoint of endpoints) {
      try {
        const response = await fetch(endpoint.url, {
          headers: { Authorization: `Bearer ${accessToken}` },
        })
        const data = await response.json()
        if (data.ok) {
          scopes.push(endpoint.scope)
        }
      } catch (e) {
        // Ignore individual endpoint failures
      }
    }

    // Always assume chat:write if auth.test passes
    scopes.push("chat:write")

    return { valid: true, scopes }
  } catch (error: any) {
    return { valid: false, scopes: [], error: error.message }
  }
}

async function verifyGitHubToken(accessToken: string): Promise<{ valid: boolean; scopes: string[]; error?: string }> {
  try {
    const userResponse = await fetch("https://api.github.com/user", {
      headers: { Authorization: `Bearer ${accessToken}` },
    })

    if (!userResponse.ok) {
      const error = await userResponse.json()
      return { valid: false, scopes: [], error: error.message || "Token validation failed" }
    }

    const scopesHeader = userResponse.headers.get("X-OAuth-Scopes")
    const scopes = scopesHeader ? scopesHeader.split(", ").map((s) => s.trim()) : []

    return { valid: true, scopes }
  } catch (error: any) {
    return { valid: false, scopes: [], error: error.message }
  }
}

async function verifyDropboxToken(accessToken: string): Promise<{ valid: boolean; scopes: string[]; error?: string }> {
  try {
    const accountResponse = await fetch("https://api.dropboxapi.com/2/users/get_current_account", {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}` },
    })

    if (!accountResponse.ok) {
      const error = await accountResponse.json()
      return { valid: false, scopes: [], error: error.error_summary || "Token validation failed" }
    }

    // Test file operations to determine scopes
    const scopes: string[] = []

    try {
      const listResponse = await fetch("https://api.dropboxapi.com/2/files/list_folder", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ path: "" }),
      })

      if (listResponse.ok) {
        scopes.push("files.content.read")
      }
    } catch (e) {
      // Ignore
    }

    // Assume write access if read access works
    if (scopes.includes("files.content.read")) {
      scopes.push("files.content.write")
    }

    return { valid: true, scopes }
  } catch (error: any) {
    return { valid: false, scopes: [], error: error.message }
  }
}

async function verifyGenericOAuthToken(
  accessToken: string,
  provider: string,
): Promise<{ valid: boolean; scopes: string[]; error?: string }> {
  // For providers without specific verification endpoints,
  // assume the token is valid if it exists and use stored scopes
  console.log(`Using generic verification for ${provider}`)
  return {
    valid: !!accessToken,
    scopes: [], // Will be filled from stored scopes
    error: undefined,
  }
}

function analyzeIntegration(
  integration: any,
  tokenValid: boolean,
  grantedScopes: string[],
  error?: string,
): DiagnosticResult {
  const provider = integration.provider
  const isDemo = integration.metadata?.demo === true

  // Get required scopes for this provider
  const requiredScopes = getRequiredScopes(provider)

  // Get all components for this provider
  const providerComponents = Object.entries(COMPONENT_SCOPE_MAPPING).filter(
    ([_, config]) => config.provider === provider,
  )

  const availableComponents: string[] = []
  const unavailableComponents: string[] = []
  const missingScopes: string[] = []

  // Special handling for providers with no scope requirements
  const noScopeProviders = ["notion", "mailchimp", "paypal", "stripe", "docker"]
  const isNoScopeProvider = noScopeProviders.includes(provider)

  // Analyze each component
  providerComponents.forEach(([componentName, config]) => {
    // For providers with no scope requirements, all components are available if token is valid
    if (isNoScopeProvider) {
      if (tokenValid || isDemo) {
        availableComponents.push(componentName)
      } else {
        unavailableComponents.push(componentName)
      }
      return
    }

    // Check if component scopes are satisfied
    const componentScopesToCheck = config.scopes.filter((scope) => getAllScopes(provider).includes(scope))

    if (componentScopesToCheck.length === 0) {
      availableComponents.push(componentName)
      return
    }

    const hasRequiredScopes = componentScopesToCheck.every((scope) => {
      // For Teams, be lenient with basic scopes
      if (provider === "teams") {
        const basicScopes = ["openid", "profile", "email", "offline_access", "User.Read"]
        if (basicScopes.includes(scope)) {
          return true
        }
      }

      // For GitHub, handle scope hierarchy
      if (provider === "github") {
        if (scope === "public_repo" && grantedScopes.includes("repo")) {
          return true
        }
        if (scope === "user:email" && (grantedScopes.includes("repo") || grantedScopes.includes("user"))) {
          return true
        }
      }

      return grantedScopes.includes(scope)
    })

    if (hasRequiredScopes || isDemo) {
      availableComponents.push(componentName)
    } else {
      unavailableComponents.push(componentName)
      componentScopesToCheck.forEach((scope) => {
        if (!grantedScopes.includes(scope) && !missingScopes.includes(scope)) {
          missingScopes.push(scope)
        }
      })
    }
  })

  // Check for missing required scopes
  const missingRequiredScopes = requiredScopes.filter((scope) => {
    let isMissing = !grantedScopes.includes(scope)

    // Handle GitHub scope hierarchy
    if (provider === "github" && isMissing) {
      if (scope === "public_repo" && grantedScopes.includes("repo")) {
        isMissing = false
      }
      if (scope === "user:email" && (grantedScopes.includes("repo") || grantedScopes.includes("user"))) {
        isMissing = false
      }
    }

    // For Teams, be lenient with basic scopes
    if (provider === "teams" && isMissing) {
      const basicTeamsScopes = ["openid", "profile", "email", "offline_access"]
      if (basicTeamsScopes.includes(scope)) {
        if (scope === "openid" && grantedScopes.includes("openid")) isMissing = false
        if (scope === "profile" && (grantedScopes.includes("profile") || grantedScopes.includes("User.Read")))
          isMissing = false
        if (scope === "email" && grantedScopes.includes("email")) isMissing = false
        if (scope === "offline_access" && grantedScopes.includes("offline_access")) isMissing = false
      }
    }

    return isMissing
  })

  const recommendations: string[] = []

  // Determine status
  let status: DiagnosticResult["status"]
  if (!tokenValid && !isDemo) {
    status = "❌ Connected but broken"
    recommendations.push("Reconnect this integration - token is invalid or expired")
  } else if (isNoScopeProvider) {
    // For providers with no scope requirements, just check if token is valid
    if (tokenValid || isDemo) {
      status = "✅ Connected & functional"
      if (isDemo) {
        recommendations.push("This is a demo connection - connect with real OAuth for full functionality")
      } else {
        recommendations.push(`${provider} integration is working correctly`)
      }
    } else {
      status = "❌ Connected but broken"
      recommendations.push("Token is invalid - please reconnect")
    }
  } else if (provider === "teams") {
    // Special handling for Teams
    const hasBasicTeamsScopes =
      grantedScopes.includes("openid") &&
      (grantedScopes.includes("profile") || grantedScopes.includes("User.Read")) &&
      grantedScopes.includes("email")

    if (hasBasicTeamsScopes || tokenValid) {
      status = "✅ Connected & functional"
      recommendations.push("Teams integration is working with your current permissions")
    } else {
      status = "⚠️ Connected but limited"
      recommendations.push("Missing basic Teams authentication scopes")
    }
  } else if (provider === "twitter") {
    // Special handling for Twitter/X
    if (tokenValid) {
      status = "✅ Connected & functional"
      recommendations.push("X integration is working - you can post tweets and read user data")
    } else {
      status = "❌ Connected but broken"
      recommendations.push("X token is invalid - please reconnect")
    }
  } else if (missingRequiredScopes.length > 0 && !isDemo) {
    status = "⚠️ Connected but limited"
    recommendations.push(`Missing ${missingRequiredScopes.length} required scopes`)
    recommendations.push("Reconnect with expanded permissions to unlock more components")
  } else if (unavailableComponents.length > 0 && !isDemo) {
    status = "⚠️ Connected but limited"
    recommendations.push(`Some optional features are unavailable due to missing scopes`)
    recommendations.push("Reconnect with expanded permissions to unlock more components")
  } else {
    status = "✅ Connected & functional"
    if (isDemo) {
      recommendations.push("This is a demo connection - connect with real OAuth for full functionality")
    } else {
      recommendations.push(`All ${provider} features are available with your current permissions`)
    }
  }

  return {
    integrationId: integration.id,
    provider,
    status,
    tokenValid,
    grantedScopes,
    requiredScopes,
    missingScopes,
    availableComponents,
    unavailableComponents,
    recommendations,
    details: {
      tokenExpiry: integration.metadata?.expires_at,
      lastVerified: integration.metadata?.last_verified,
      errorMessage: error,
      connectionType: isDemo ? "demo" : integration.metadata?.access_token ? "oauth" : "api_key",
      rawScopeString: integration.metadata?.raw_scope_string,
    },
  }
}

export async function GET(request: NextRequest) {
  try {
    const supabase = createRouteHandlerClient<Database>({ cookies })

    const {
      data: { session },
      error: sessionError,
    } = await supabase.auth.getSession()

    if (sessionError) {
      console.error("Session error:", sessionError)
      return NextResponse.json({ error: "Authentication error" }, { status: 401 })
    }

    if (!session) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 })
    }

    const userId = session.user.id

    const { data: integrations, error } = await supabase
      .from("integrations")
      .select("*")
      .eq("user_id", userId)
      .eq("status", "connected")

    if (error) {
      console.error("Database error:", error)
      throw error
    }

    const diagnostics: DiagnosticResult[] = []

    for (const integration of integrations || []) {
      const { provider, metadata } = integration
      const accessToken = metadata?.access_token || integration.access_token

      let tokenValid = false
      let grantedScopes: string[] = []
      let errorMessage: string | undefined

      console.log(`Processing integration: ${provider}`)

      if (metadata?.demo) {
        tokenValid = true
        grantedScopes = metadata?.scopes || []
      } else if (accessToken) {
        let verificationResult

        switch (provider) {
          case "notion":
            console.log("Verifying Notion token...")
            verificationResult = await verifyNotionToken(accessToken)
            // Use stored scopes if available, otherwise use verification result
            const notionStoredScopes = integration.scopes || metadata?.scopes || []
            if (notionStoredScopes.length > 0) {
              verificationResult.scopes = notionStoredScopes
            }
            break

          case "youtube":
            console.log("Verifying YouTube with Google OAuth...")
            verificationResult = await verifyGoogleToken(
              accessToken,
              integration.refresh_token || metadata?.refresh_token,
              "youtube",
            )
            break

          case "twitter":
            console.log("Verifying Twitter token...")
            verificationResult = await verifyTwitterToken(accessToken)
            // Use stored scopes for Twitter since API doesn't return them
            if (verificationResult.valid) {
              const storedScopes = integration.scopes || metadata?.scopes || []
              verificationResult.scopes = storedScopes.length > 0 ? storedScopes : verificationResult.scopes
            }
            break

          case "discord":
            console.log("Verifying Discord token...")
            verificationResult = await verifyDiscordToken(accessToken)
            break

          case "google-calendar":
          case "google-sheets":
          case "google-docs":
          case "gmail":
          case "google-drive":
            console.log(`Verifying ${provider} with Google OAuth...`)
            const googleIntegration = integrations?.find((int) => int.provider === "google")
            if (googleIntegration?.metadata?.access_token || googleIntegration?.access_token) {
              const googleToken = googleIntegration.metadata?.access_token || googleIntegration.access_token
              const googleRefreshToken = googleIntegration.metadata?.refresh_token || googleIntegration.refresh_token
              verificationResult = await verifyGoogleToken(googleToken, googleRefreshToken, provider)
            } else {
              verificationResult = await verifyGoogleToken(accessToken, undefined, provider)
            }
            break

          case "teams":
          case "onedrive":
            console.log(`Verifying ${provider} with Microsoft OAuth...`)
            verificationResult = await verifyMicrosoftToken(accessToken)
            // For Microsoft services, use stored scopes if verification fails
            if (!verificationResult.valid) {
              const storedScopes = integration.scopes || metadata?.scopes || []
              verificationResult.scopes = storedScopes
              console.log(`${provider}: Token invalid, using stored scopes:`, storedScopes)
            }
            break

          case "slack":
            console.log("Verifying Slack token...")
            verificationResult = await verifySlackToken(accessToken)
            break

          case "github":
            console.log("Verifying GitHub token...")
            verificationResult = await verifyGitHubToken(accessToken)
            break

          case "dropbox":
            console.log("Verifying Dropbox token...")
            verificationResult = await verifyDropboxToken(accessToken)
            break

          case "gitlab":
          case "linkedin":
          case "facebook":
          case "instagram":
          case "tiktok":
          case "mailchimp":
          case "hubspot":
          case "shopify":
          case "paypal":
          case "stripe":
          case "docker":
          case "airtable":
          case "trello":
            console.log(`Using generic verification for ${provider}...`)
            verificationResult = await verifyGenericOAuthToken(accessToken, provider)
            // Use stored scopes for these providers
            const storedScopes = integration.scopes || metadata?.scopes || []
            verificationResult.scopes = storedScopes
            break

          default:
            console.log(`Unknown provider ${provider}, using generic verification...`)
            verificationResult = await verifyGenericOAuthToken(accessToken, provider)
            const defaultScopes = integration.scopes || metadata?.scopes || []
            verificationResult.scopes = defaultScopes
        }

        tokenValid = verificationResult.valid
        grantedScopes = verificationResult.scopes
        errorMessage = verificationResult.error
      } else {
        tokenValid = false
        grantedScopes = metadata?.scopes || integration.scopes || []
        errorMessage = "No access token found"
      }

      const diagnostic = analyzeIntegration(integration, tokenValid, grantedScopes, errorMessage)
      diagnostics.push(diagnostic)
    }

    return NextResponse.json({ diagnostics })
  } catch (error: any) {
    console.error("Error running diagnostics:", error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
