import { type NextRequest, NextResponse } from "next/server"
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs"
import { cookies } from "next/headers"
import type { Database } from "@/types/supabase"
import { getAllScopes } from "@/lib/integrations/integrationScopes"

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

  // Microsoft Teams components
  teams_message: { scopes: ["Chat.ReadWrite"], provider: "teams" },
  teams_meeting: { scopes: ["OnlineMeetings.ReadWrite"], provider: "teams" },
  teams_calendar: { scopes: ["Calendars.ReadWrite"], provider: "teams" },

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

  // GitHub components
  github_create_issue: { scopes: ["repo"], provider: "github" },
  github_create_pr: { scopes: ["repo"], provider: "github" },

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

async function verifyGoogleToken(accessToken: string): Promise<{ valid: boolean; scopes: string[]; error?: string }> {
  try {
    const tokenInfoResponse = await fetch(`https://www.googleapis.com/oauth2/v1/tokeninfo?access_token=${accessToken}`)
    const tokenInfo = await tokenInfoResponse.json()

    if (tokenInfo.error) {
      return { valid: false, scopes: [], error: tokenInfo.error_description || tokenInfo.error }
    }

    const userInfoResponse = await fetch(`https://www.googleapis.com/oauth2/v2/userinfo?access_token=${accessToken}`)
    const userInfo = await userInfoResponse.json()

    if (userInfo.error) {
      return { valid: false, scopes: [], error: userInfo.error.message || "User info fetch failed" }
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
    const userResponse = await fetch("https://graph.microsoft.com/v1.0/me", {
      headers: { Authorization: `Bearer ${accessToken}` },
    })

    if (!userResponse.ok) {
      const error = await userResponse.json()
      return { valid: false, scopes: [], error: error.error?.message || "Token validation failed" }
    }

    const scopes: string[] = []

    // Test chat access
    const chatResponse = await fetch("https://graph.microsoft.com/v1.0/me/chats", {
      headers: { Authorization: `Bearer ${accessToken}` },
    })
    if (chatResponse.ok) {
      scopes.push("Chat.ReadWrite")
    }

    // Test calendar access
    const calendarResponse = await fetch("https://graph.microsoft.com/v1.0/me/calendar", {
      headers: { Authorization: `Bearer ${accessToken}` },
    })
    if (calendarResponse.ok) {
      scopes.push("Calendars.ReadWrite")
    }

    // Test online meetings - this might require different permissions
    const meetingsResponse = await fetch("https://graph.microsoft.com/v1.0/me/onlineMeetings", {
      headers: { Authorization: `Bearer ${accessToken}` },
    })
    if (meetingsResponse.ok) {
      scopes.push("OnlineMeetings.ReadWrite")
    }

    return { valid: true, scopes }
  } catch (error: any) {
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

function analyzeIntegration(
  integration: any,
  tokenValid: boolean,
  grantedScopes: string[],
  error?: string,
): DiagnosticResult {
  const provider = integration.provider
  const isDemo = integration.metadata?.demo === true

  // Get the scopes we actually request for this provider
  const requestedScopes = getAllScopes(provider)

  // Get all components for this provider
  const providerComponents = Object.entries(COMPONENT_SCOPE_MAPPING).filter(
    ([_, config]) => config.provider === provider,
  )

  const availableComponents: string[] = []
  const unavailableComponents: string[] = []
  const missingScopes: string[] = []
  const recommendations: string[] = []

  // Only check for scopes that we actually request
  const scopesToCheck = requestedScopes.length > 0 ? requestedScopes : []

  // Analyze each component
  providerComponents.forEach(([componentName, config]) => {
    const hasRequiredScopes = config.scopes.every((scope) => {
      // Only check if this scope is in our requested scopes list
      if (scopesToCheck.length > 0 && !scopesToCheck.includes(scope)) {
        return true // If we don't request this scope, consider it satisfied
      }

      // For Google scopes, handle readonly vs full access and scope hierarchy
      if (scope.includes("googleapis.com/auth/")) {
        // Handle readonly vs full access
        if (scope.includes(".readonly")) {
          const fullAccessScope = scope.replace(".readonly", "")
          return grantedScopes.includes(scope) || grantedScopes.includes(fullAccessScope)
        }

        // Handle Gmail scope hierarchy - modify includes readonly
        if (scope === "https://www.googleapis.com/auth/gmail.readonly") {
          return grantedScopes.includes(scope) || grantedScopes.includes("https://www.googleapis.com/auth/gmail.modify")
        }

        // Handle Calendar scope hierarchy
        if (scope === "https://www.googleapis.com/auth/calendar.events") {
          return grantedScopes.includes(scope) || grantedScopes.includes("https://www.googleapis.com/auth/calendar")
        }

        // Handle Sheets scope hierarchy
        if (scope === "https://www.googleapis.com/auth/spreadsheets.readonly") {
          return grantedScopes.includes(scope) || grantedScopes.includes("https://www.googleapis.com/auth/spreadsheets")
        }

        // Handle Docs scope hierarchy
        if (scope === "https://www.googleapis.com/auth/documents.readonly") {
          return grantedScopes.includes(scope) || grantedScopes.includes("https://www.googleapis.com/auth/documents")
        }

        return grantedScopes.includes(scope)
      }
      return grantedScopes.includes(scope)
    })

    if (hasRequiredScopes || isDemo) {
      availableComponents.push(componentName)
    } else {
      unavailableComponents.push(componentName)
      config.scopes.forEach((scope) => {
        // Only add to missing scopes if we actually request this scope
        if (scopesToCheck.length === 0 || scopesToCheck.includes(scope)) {
          let isMissing = !grantedScopes.includes(scope)

          // Check for Google scope hierarchy
          if (scope.includes("googleapis.com/auth/") && isMissing) {
            if (
              scope === "https://www.googleapis.com/auth/gmail.readonly" &&
              grantedScopes.includes("https://www.googleapis.com/auth/gmail.modify")
            ) {
              isMissing = false
            }
            if (
              scope === "https://www.googleapis.com/auth/calendar.events" &&
              grantedScopes.includes("https://www.googleapis.com/auth/calendar")
            ) {
              isMissing = false
            }
            if (
              scope === "https://www.googleapis.com/auth/spreadsheets.readonly" &&
              grantedScopes.includes("https://www.googleapis.com/auth/spreadsheets")
            ) {
              isMissing = false
            }
            if (
              scope === "https://www.googleapis.com/auth/documents.readonly" &&
              grantedScopes.includes("https://www.googleapis.com/auth/documents")
            ) {
              isMissing = false
            }
          }

          if (isMissing && !missingScopes.includes(scope)) {
            missingScopes.push(scope)
          }
        }
      })
    }
  })

  // Determine status
  let status: DiagnosticResult["status"]
  if (!tokenValid && !isDemo) {
    status = "❌ Connected but broken"
    recommendations.push("Reconnect this integration - token is invalid or expired")
  } else if (unavailableComponents.length > 0 && !isDemo) {
    status = "⚠️ Connected but limited"
    recommendations.push(`Missing ${missingScopes.length} required scopes`)
    recommendations.push("Reconnect with expanded permissions to unlock more components")
  } else {
    status = "✅ Connected & functional"
    if (isDemo) {
      recommendations.push("This is a demo connection - connect with real OAuth for full functionality")
    }
  }

  // Add specific recommendations based on missing scopes
  if (missingScopes.length > 0) {
    if (provider.startsWith("google")) {
      recommendations.push("When reconnecting, ensure you grant all requested Google permissions")
    } else if (provider === "slack") {
      recommendations.push("Ensure your Slack app has the required scopes configured")
    } else if (provider === "github") {
      recommendations.push("Grant repository access and workflow permissions when reconnecting")
    } else if (provider === "discord") {
      recommendations.push("Ensure you grant identify and guild permissions when reconnecting")
    } else if (provider === "teams") {
      recommendations.push("Ensure you grant all Microsoft Teams permissions when reconnecting")
    }
  }

  return {
    integrationId: integration.id,
    provider,
    status,
    tokenValid,
    grantedScopes,
    requiredScopes: scopesToCheck, // Only show scopes we actually request
    missingScopes,
    availableComponents,
    unavailableComponents,
    recommendations,
    details: {
      tokenExpiry: integration.metadata?.expires_at,
      lastVerified: integration.metadata?.last_verified,
      errorMessage: error,
      connectionType: isDemo ? "demo" : integration.metadata?.access_token ? "oauth" : "api_key",
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

      if (metadata?.demo) {
        tokenValid = true
        grantedScopes = metadata?.scopes || []
      } else if (accessToken) {
        let verificationResult

        switch (provider) {
          case "discord":
            verificationResult = await verifyDiscordToken(accessToken)
            break
          case "google-calendar":
          case "google-sheets":
          case "google-docs":
          case "gmail":
          case "youtube":
            const googleIntegration = integrations?.find((int) => int.provider === "google")
            if (googleIntegration?.metadata?.access_token || googleIntegration?.access_token) {
              const googleToken = googleIntegration.metadata?.access_token || googleIntegration.access_token
              verificationResult = await verifyGoogleToken(googleToken)
            } else {
              verificationResult = await verifyGoogleToken(accessToken)
            }
            break
          case "teams":
          case "onedrive":
            verificationResult = await verifyMicrosoftToken(accessToken)
            break
          case "slack":
            verificationResult = await verifySlackToken(accessToken)
            break
          case "github":
            verificationResult = await verifyGitHubToken(accessToken)
            break
          case "dropbox":
            verificationResult = await verifyDropboxToken(accessToken)
            break
          default:
            verificationResult = {
              valid: true,
              scopes: metadata?.scopes || integration.scopes || [],
            }
        }

        tokenValid = verificationResult.valid
        grantedScopes = verificationResult.scopes
        errorMessage = verificationResult.error
      } else {
        tokenValid = false
        grantedScopes = metadata?.scopes || integration.scopes || []
        errorMessage = "No access token found"
      }

      // For Google services, use the main Google integration data if available
      if (provider.startsWith("google") || provider === "gmail" || provider === "youtube") {
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
