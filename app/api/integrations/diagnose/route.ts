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

// Component definitions with their required scopes - only components we actually support
const COMPONENT_SCOPE_MAPPING = {
  // Slack components
  slack_message: { scopes: ["chat:write"], provider: "slack" },
  slack_user_info: { scopes: ["users:read"], provider: "slack" },
  slack_channels_list: { scopes: ["channels:read"], provider: "slack" },

  // Discord components
  discord_message: { scopes: ["identify"], provider: "discord" },
  discord_guild_info: { scopes: ["guilds"], provider: "discord" },

  // Microsoft Teams components - only basic functionality
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

  // YouTube components - only basic functionality
  youtube_get_channel: { scopes: ["https://www.googleapis.com/auth/youtube.readonly"], provider: "youtube" },
  youtube_get_videos: { scopes: ["https://www.googleapis.com/auth/youtube.readonly"], provider: "youtube" },
  youtube_get_analytics: { scopes: ["https://www.googleapis.com/auth/youtube.readonly"], provider: "youtube" },

  // GitHub components - basic functionality
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
  mailchimp_create_campaign: { scopes: [], provider: "mailchimp" },
  mailchimp_add_subscriber: { scopes: [], provider: "mailchimp" },

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

async function verifyTwitterToken(accessToken: string): Promise<{ valid: boolean; scopes: string[]; error?: string }> {
  try {
    const response = await fetch("https://api.twitter.com/2/users/me", {
      headers: { Authorization: `Bearer ${accessToken}` },
    })

    if (!response.ok) {
      const error = await response.json()
      return { valid: false, scopes: [], error: error.detail || error.title || "Token validation failed" }
    }

    // For Twitter, we need to check the scopes from the stored data since the API doesn't return them
    // We'll assume the token is valid if the user info call succeeds
    const scopes = ["tweet.read", "tweet.write", "users.read"] // Default scopes we request
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

    const userInfoResponse = await fetch(`https://www.googleapis.com/oauth2/v2/userinfo?access_token=${accessToken}`)
    const userInfo = await userInfoResponse.json()

    if (userInfo.error) {
      return { valid: false, scopes: [], error: userInfo.error.message || "User info fetch failed" }
    }

    const scopes = tokenInfo.scope ? tokenInfo.scope.split(" ") : []

    // Special handling for YouTube - check if we can access the YouTube API
    if (provider === "youtube") {
      try {
        console.log("Verifying YouTube API access specifically...")
        console.log("YouTube token length:", accessToken.length)
        console.log("YouTube token starts with:", accessToken.substring(0, 10) + "...")

        // First verify the token is valid for Google APIs
        const tokenInfoResponse = await fetch(
          `https://www.googleapis.com/oauth2/v1/tokeninfo?access_token=${accessToken}`,
        )
        const tokenInfo = await tokenInfoResponse.json()

        if (tokenInfo.error) {
          console.log("YouTube token validation failed:", tokenInfo.error)
          return {
            valid: false,
            scopes: [],
            error: `YouTube token invalid: ${tokenInfo.error_description || tokenInfo.error}`,
          }
        }

        console.log("YouTube token is valid, testing API access...")
        console.log("YouTube token scopes:", tokenInfo.scope)

        const youtubeResponse = await fetch(`https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true`, {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            Accept: "application/json",
          },
        })

        if (youtubeResponse.ok) {
          const youtubeData = await youtubeResponse.json()
          console.log("YouTube API access confirmed, channels found:", youtubeData.items?.length || 0)

          // For YouTube, ensure we have the YouTube-specific scopes
          const youtubeScopes = [
            "https://www.googleapis.com/auth/youtube.readonly",
            "https://www.googleapis.com/auth/userinfo.profile",
            "https://www.googleapis.com/auth/userinfo.email",
          ]

          // Return the intersection of granted scopes and YouTube scopes
          const grantedScopes = tokenInfo.scope ? tokenInfo.scope.split(" ") : []
          const validYouTubeScopes = youtubeScopes.filter((scope) => grantedScopes.includes(scope))

          // If we have YouTube readonly scope, we can use YouTube features
          if (validYouTubeScopes.includes("https://www.googleapis.com/auth/youtube.readonly")) {
            return { valid: true, scopes: validYouTubeScopes }
          } else {
            return { valid: false, scopes: grantedScopes, error: "Missing YouTube readonly scope" }
          }
        } else {
          const errorData = await youtubeResponse.json()
          console.log("YouTube API test failed:", youtubeResponse.status, errorData)
          return {
            valid: false,
            scopes: [],
            error: `YouTube API access denied (${youtubeResponse.status}): ${errorData.error?.message || "Authentication required"}`,
          }
        }
      } catch (error) {
        console.log("YouTube API test failed with exception:", error)
        return { valid: false, scopes: [], error: `YouTube API test failed: ${error.message}` }
      }
    }

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

    // Check if token looks like a valid JWT or Bearer token
    if (!accessToken || accessToken.length < 50) {
      return { valid: false, scopes: [], error: "Access token appears to be invalid or too short" }
    }

    // Log token format for debugging (without exposing the token)
    console.log("Microsoft token format:", {
      length: accessToken.length,
      startsWithEy: accessToken.startsWith("ey"),
      hasDots: accessToken.includes("."),
      dotCount: (accessToken.match(/\./g) || []).length,
    })

    const userResponse = await fetch("https://graph.microsoft.com/v1.0/me", {
      headers: { Authorization: `Bearer ${accessToken}` },
    })

    if (!userResponse.ok) {
      const error = await userResponse.json()
      console.error("Microsoft user verification failed:", error)
      return { valid: false, scopes: [], error: error.error?.message || "Token validation failed" }
    }

    const userData = await userResponse.json()
    console.log("Microsoft user verified:", userData.displayName)

    return { valid: true, scopes: [] }
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

    // Test chat:write
    const chatTestResponse = await fetch("https://slack.com/api/chat.postMessage", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        channel: "test-channel-that-doesnt-exist",
        text: "Test message",
      }),
    })
    const chatTestData = await chatTestResponse.json()
    if (chatTestData.error !== "invalid_auth" && chatTestData.error !== "not_authed") {
      scopes.push("chat:write")
    }

    // Test channels:read
    const channelsResponse = await fetch("https://slack.com/api/conversations.list", {
      headers: { Authorization: `Bearer ${accessToken}` },
    })
    const channelsData = await channelsResponse.json()
    if (channelsData.ok) {
      scopes.push("channels:read")
    }

    // Test users:read
    const usersResponse = await fetch("https://slack.com/api/users.list", {
      headers: { Authorization: `Bearer ${accessToken}` },
    })
    const usersData = await usersResponse.json()
    if (usersData.ok) {
      scopes.push("users:read")
    }

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

    const scopes: string[] = []

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

    const createResponse = await fetch("https://api.dropboxapi.com/2/files/create_folder_v2", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        path: "/chainreact_test_" + Date.now(),
        autorename: true,
      }),
    })

    if (createResponse.ok) {
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
  // For providers that don't have specific verification endpoints,
  // we'll assume the token is valid if it exists and use stored scopes
  console.log(`Using generic verification for ${provider}`)
  return {
    valid: true,
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

  // Get only the required scopes for this provider
  const requiredScopes = getRequiredScopes(provider)

  // Get all components for this provider
  const providerComponents = Object.entries(COMPONENT_SCOPE_MAPPING).filter(
    ([_, config]) => config.provider === provider,
  )

  const availableComponents: string[] = []
  const unavailableComponents: string[] = []
  const missingScopes: string[] = []

  // Special handling for Notion scopes
  if (provider === "notion") {
    const notionRequiredScopes = ["read_user", "read_content"]
    const notionMissingScopes = notionRequiredScopes.filter((scope) => !grantedScopes.includes(scope))

    if (notionMissingScopes.length > 0) {
      missingScopes.push(...notionMissingScopes)
      console.log(`Notion missing required scopes: ${notionMissingScopes.join(", ")}`)
    }

    // Check for optional scopes
    const notionOptionalScopes = ["update_content", "insert_content"]
    const missingOptionalScopes = notionOptionalScopes.filter((scope) => !grantedScopes.includes(scope))

    const recommendations: string[] = []
    if (missingOptionalScopes.length > 0) {
      console.log(`Notion missing optional scopes: ${missingOptionalScopes.join(", ")}`)
      recommendations.push(
        `Missing optional scopes: ${missingOptionalScopes.join(", ")} - reconnect for full functionality`,
      )
    }
  }

  // For Teams, be more lenient about scope requirements
  const isTeamsProvider = provider === "teams"
  const isGitHubProvider = provider === "github"
  const isTwitterProvider = provider === "twitter"

  // Analyze each component
  providerComponents.forEach(([componentName, config]) => {
    // Only check component scopes that are part of our requested scopes
    const componentScopesToCheck = config.scopes.filter((scope) => getAllScopes(provider).includes(scope))

    // If no scopes to check (e.g., all component scopes are not in our requested scopes),
    // consider the component available
    if (componentScopesToCheck.length === 0) {
      availableComponents.push(componentName)
      return
    }

    const hasRequiredScopes = componentScopesToCheck.every((scope) => {
      // For Teams, check if we have the scope or if it's a basic scope that's usually granted
      if (isTeamsProvider) {
        const basicScopes = ["openid", "profile", "email", "offline_access", "User.Read"]
        if (basicScopes.includes(scope)) {
          return true // Assume basic scopes are always available
        }
      }

      // For GitHub, handle scope hierarchy
      if (isGitHubProvider) {
        // If we have 'repo' scope, we also have 'public_repo' and 'user:email'
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
        // Check if scope is missing considering GitHub scope hierarchy
        let isMissing = !grantedScopes.includes(scope)

        if (isGitHubProvider && isMissing) {
          if (scope === "public_repo" && grantedScopes.includes("repo")) {
            isMissing = false
          }
          if (scope === "user:email" && (grantedScopes.includes("repo") || grantedScopes.includes("user"))) {
            isMissing = false
          }
        }

        if (isMissing && !missingScopes.includes(scope)) {
          // For Teams, only mark advanced scopes as missing
          if (!isTeamsProvider || !["openid", "profile", "email", "offline_access", "User.Read"].includes(scope)) {
            missingScopes.push(scope)
          }
        }
      })
    }
  })

  // Check for missing required scopes with GitHub scope hierarchy
  const missingRequiredScopes = requiredScopes.filter((scope) => {
    let isMissing = !grantedScopes.includes(scope)

    if (isGitHubProvider && isMissing) {
      if (scope === "public_repo" && grantedScopes.includes("repo")) {
        isMissing = false
      }
      if (scope === "user:email" && (grantedScopes.includes("repo") || grantedScopes.includes("user"))) {
        isMissing = false
      }
    }

    // For Teams, be very lenient - if we have basic OIDC scopes, consider it complete
    if (isTeamsProvider && isMissing) {
      const basicTeamsScopes = ["openid", "profile", "email", "offline_access"]
      if (basicTeamsScopes.includes(scope)) {
        // Check if we have any of the equivalent scopes
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
  } else if (isTeamsProvider) {
    // Special handling for Teams - if token is valid and we have basic scopes, consider it functional
    const hasBasicTeamsScopes =
      grantedScopes.includes("openid") &&
      (grantedScopes.includes("profile") || grantedScopes.includes("User.Read")) &&
      grantedScopes.includes("email")

    if (hasBasicTeamsScopes) {
      status = "✅ Connected & functional"
      recommendations.push("Teams integration is working with your current permissions")
    } else {
      status = "⚠️ Connected but limited"
      recommendations.push("Missing basic Teams authentication scopes")
    }
  } else if (isTwitterProvider) {
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
    } else if (isGitHubProvider) {
      recommendations.push("All GitHub features are available with your current permissions")
    }
  }

  // Add specific recommendations for Teams
  if (isTeamsProvider && missingScopes.length > 0) {
    recommendations.push("Microsoft Teams advanced features may require admin consent")
    recommendations.push("Try reconnecting or contact your organization's admin")
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
          case "youtube":
            // YouTube gets its own independent verification using Google OAuth
            console.log("Verifying YouTube with Google OAuth...")
            console.log("YouTube access token exists:", !!accessToken)
            console.log("YouTube refresh token exists:", !!(integration.refresh_token || metadata?.refresh_token))

            verificationResult = await verifyGoogleToken(
              accessToken,
              integration.refresh_token || metadata?.refresh_token,
              "youtube",
            )

            // If we got a new access token from refresh, update this integration too
            if (verificationResult.newAccessToken) {
              try {
                await supabase
                  .from("integrations")
                  .update({
                    access_token: verificationResult.newAccessToken,
                    metadata: {
                      ...metadata,
                      access_token: verificationResult.newAccessToken,
                      last_refreshed: new Date().toISOString(),
                    },
                    updated_at: new Date().toISOString(),
                  })
                  .eq("id", integration.id)
                console.log("Updated YouTube access token in database")
              } catch (updateError) {
                console.error("Failed to update YouTube token:", updateError)
              }
            }
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

              // If we got a new access token, update the database
              if (verificationResult.newAccessToken) {
                try {
                  await supabase
                    .from("integrations")
                    .update({
                      access_token: verificationResult.newAccessToken,
                      metadata: {
                        ...googleIntegration.metadata,
                        access_token: verificationResult.newAccessToken,
                        last_refreshed: new Date().toISOString(),
                      },
                      updated_at: new Date().toISOString(),
                    })
                    .eq("id", googleIntegration.id)
                  console.log("Updated Google access token in database")
                } catch (updateError) {
                  console.error("Failed to update Google token:", updateError)
                }
              }
            } else {
              verificationResult = await verifyGoogleToken(accessToken, undefined, provider)
            }
            break

          case "teams":
          case "onedrive":
            console.log(`Verifying ${provider} with Microsoft OAuth...`)
            verificationResult = await verifyMicrosoftToken(accessToken)
            // For Microsoft services, use the stored scopes instead of trying to verify each one
            if (verificationResult.valid) {
              const storedScopes = integration.scopes || metadata?.scopes || []
              verificationResult.scopes = storedScopes
              console.log(`${provider}: Using stored scopes:`, storedScopes)
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

          case "gitlab":
            console.log("Verifying GitLab token...")
            // GitLab uses a similar API to GitHub but different endpoints
            verificationResult = await verifyGenericOAuthToken(accessToken, provider)
            // Use stored scopes for GitLab
            const gitlabScopes = integration.scopes || metadata?.scopes || []
            verificationResult.scopes = gitlabScopes
            break

          case "dropbox":
            console.log("Verifying Dropbox token...")
            verificationResult = await verifyDropboxToken(accessToken)
            break

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
          case "notion":
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

      // For Google services (except YouTube), use the main Google integration data if available
      if ((provider.startsWith("google") || provider === "gmail") && provider !== "youtube") {
        const googleIntegration = integrations?.find((int) => int.provider === "google")
        if (googleIntegration && (googleIntegration.metadata?.access_token || googleIntegration.access_token)) {
          const diagnostic = analyzeIntegration(integration, tokenValid, grantedScopes, errorMessage)
          diagnostic.provider = provider
          diagnostics.push(diagnostic)
          continue
        }
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
