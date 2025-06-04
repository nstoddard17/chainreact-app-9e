import { NextResponse } from "next/server"
import { getSupabaseClient } from "@/lib/supabase"

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

// Component definitions with their required scopes
const COMPONENT_SCOPE_MAPPING = {
  // Slack components
  slack_message: { scopes: ["chat:write"], provider: "slack" },
  slack_channel_create: { scopes: ["channels:write"], provider: "slack" },
  slack_file_upload: { scopes: ["files:write"], provider: "slack" },
  slack_user_info: { scopes: ["users:read"], provider: "slack" },

  // Discord components
  discord_message: { scopes: ["bot"], provider: "discord" },
  discord_webhook: { scopes: ["webhook.incoming"], provider: "discord" },

  // Microsoft Teams components
  teams_message: { scopes: ["Chat.ReadWrite"], provider: "teams" },
  teams_meeting: { scopes: ["OnlineMeetings.ReadWrite"], provider: "teams" },
  teams_calendar: { scopes: ["Calendars.ReadWrite"], provider: "teams" },

  // Google Calendar components
  google_calendar_create: { scopes: ["https://www.googleapis.com/auth/calendar"], provider: "google-calendar" },
  google_calendar_read: { scopes: ["https://www.googleapis.com/auth/calendar.readonly"], provider: "google-calendar" },
  google_calendar_events: { scopes: ["https://www.googleapis.com/auth/calendar.events"], provider: "google-calendar" },

  // Google Sheets components
  google_sheets_append: { scopes: ["https://www.googleapis.com/auth/spreadsheets"], provider: "google-sheets" },
  google_sheets_read: { scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"], provider: "google-sheets" },
  google_sheets_create: { scopes: ["https://www.googleapis.com/auth/spreadsheets"], provider: "google-sheets" },

  // Google Docs components
  google_docs_create: { scopes: ["https://www.googleapis.com/auth/documents"], provider: "google-docs" },
  google_docs_read: { scopes: ["https://www.googleapis.com/auth/documents.readonly"], provider: "google-docs" },

  // Gmail components
  gmail_send: { scopes: ["https://www.googleapis.com/auth/gmail.send"], provider: "gmail" },
  gmail_read: { scopes: ["https://www.googleapis.com/auth/gmail.readonly"], provider: "gmail" },
  gmail_modify: { scopes: ["https://www.googleapis.com/auth/gmail.modify"], provider: "gmail" },

  // GitHub components
  github_create_issue: { scopes: ["repo"], provider: "github" },
  github_create_pr: { scopes: ["repo"], provider: "github" },
  github_workflow: { scopes: ["workflow"], provider: "github" },

  // Notion components
  notion_create_page: { scopes: ["insert"], provider: "notion" },
  notion_update_database: { scopes: ["update"], provider: "notion" },
  notion_read: { scopes: ["read"], provider: "notion" },

  // Airtable components
  airtable_create_record: { scopes: ["data.records:write"], provider: "airtable" },
  airtable_read_records: { scopes: ["data.records:read"], provider: "airtable" },
  airtable_update_record: { scopes: ["data.records:write"], provider: "airtable" },

  // Trello components
  trello_create_card: { scopes: ["write"], provider: "trello" },
  trello_read_boards: { scopes: ["read"], provider: "trello" },

  // Dropbox components
  dropbox_upload: { scopes: ["files.content.write"], provider: "dropbox" },
  dropbox_download: { scopes: ["files.content.read"], provider: "dropbox" },
  dropbox_share: { scopes: ["sharing.write"], provider: "dropbox" },
}

async function verifyGoogleToken(accessToken: string): Promise<{ valid: boolean; scopes: string[]; error?: string }> {
  try {
    // First, check token info
    const tokenInfoResponse = await fetch(`https://www.googleapis.com/oauth2/v1/tokeninfo?access_token=${accessToken}`)
    const tokenInfo = await tokenInfoResponse.json()

    if (tokenInfo.error) {
      return { valid: false, scopes: [], error: tokenInfo.error_description || tokenInfo.error }
    }

    // Get user info to verify token is still valid
    const userInfoResponse = await fetch(`https://www.googleapis.com/oauth2/v2/userinfo?access_token=${accessToken}`)
    const userInfo = await userInfoResponse.json()

    if (userInfo.error) {
      return { valid: false, scopes: [], error: userInfo.error.message || "User info fetch failed" }
    }

    // Extract scopes from token info
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
    // Check user info
    const userResponse = await fetch("https://graph.microsoft.com/v1.0/me", {
      headers: { Authorization: `Bearer ${accessToken}` },
    })

    if (!userResponse.ok) {
      const error = await userResponse.json()
      return { valid: false, scopes: [], error: error.error?.message || "Token validation failed" }
    }

    // Test specific endpoints to determine granted scopes
    const scopes: string[] = []

    // Test calendar access
    const calendarResponse = await fetch("https://graph.microsoft.com/v1.0/me/calendar", {
      headers: { Authorization: `Bearer ${accessToken}` },
    })
    if (calendarResponse.ok) {
      scopes.push("Calendars.Read")

      // Test calendar write access
      const testEvent = {
        subject: "Test Event - ChainReact Diagnostic",
        start: { dateTime: new Date().toISOString(), timeZone: "UTC" },
        end: { dateTime: new Date(Date.now() + 3600000).toISOString(), timeZone: "UTC" },
      }

      const createResponse = await fetch("https://graph.microsoft.com/v1.0/me/events", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(testEvent),
      })

      if (createResponse.ok) {
        scopes.push("Calendars.ReadWrite")
        // Clean up test event
        const eventData = await createResponse.json()
        await fetch(`https://graph.microsoft.com/v1.0/me/events/${eventData.id}`, {
          method: "DELETE",
          headers: { Authorization: `Bearer ${accessToken}` },
        })
      }
    }

    // Test chat access
    const chatResponse = await fetch("https://graph.microsoft.com/v1.0/me/chats", {
      headers: { Authorization: `Bearer ${accessToken}` },
    })
    if (chatResponse.ok) {
      scopes.push("Chat.Read", "Chat.ReadWrite")
    }

    // Test files access
    const filesResponse = await fetch("https://graph.microsoft.com/v1.0/me/drive/root/children", {
      headers: { Authorization: `Bearer ${accessToken}` },
    })
    if (filesResponse.ok) {
      scopes.push("Files.Read", "Files.ReadWrite")
    }

    return { valid: true, scopes }
  } catch (error: any) {
    return { valid: false, scopes: [], error: error.message }
  }
}

async function verifySlackToken(accessToken: string): Promise<{ valid: boolean; scopes: string[]; error?: string }> {
  try {
    // Test auth
    const authResponse = await fetch("https://slack.com/api/auth.test", {
      headers: { Authorization: `Bearer ${accessToken}` },
    })
    const authData = await authResponse.json()

    if (!authData.ok) {
      return { valid: false, scopes: [], error: authData.error || "Auth test failed" }
    }

    // Test specific endpoints to determine scopes
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

    // Test files:write
    const filesResponse = await fetch("https://slack.com/api/files.list", {
      headers: { Authorization: `Bearer ${accessToken}` },
    })
    const filesData = await filesResponse.json()
    if (filesData.ok) {
      scopes.push("files:read")
    }

    return { valid: true, scopes }
  } catch (error: any) {
    return { valid: false, scopes: [], error: error.message }
  }
}

async function verifyGitHubToken(accessToken: string): Promise<{ valid: boolean; scopes: string[]; error?: string }> {
  try {
    // Get user info and check scopes
    const userResponse = await fetch("https://api.github.com/user", {
      headers: { Authorization: `Bearer ${accessToken}` },
    })

    if (!userResponse.ok) {
      const error = await userResponse.json()
      return { valid: false, scopes: [], error: error.message || "Token validation failed" }
    }

    // GitHub returns scopes in the X-OAuth-Scopes header
    const scopesHeader = userResponse.headers.get("X-OAuth-Scopes")
    const scopes = scopesHeader ? scopesHeader.split(", ").map((s) => s.trim()) : []

    return { valid: true, scopes }
  } catch (error: any) {
    return { valid: false, scopes: [], error: error.message }
  }
}

async function verifyDropboxToken(accessToken: string): Promise<{ valid: boolean; scopes: string[]; error?: string }> {
  try {
    // Get current account info
    const accountResponse = await fetch("https://api.dropboxapi.com/2/users/get_current_account", {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}` },
    })

    if (!accountResponse.ok) {
      const error = await accountResponse.json()
      return { valid: false, scopes: [], error: error.error_summary || "Token validation failed" }
    }

    // Test specific endpoints to determine scopes
    const scopes: string[] = []

    // Test files.content.read
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

    // Test files.content.write by attempting to create a folder
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

  // Get all components for this provider
  const providerComponents = Object.entries(COMPONENT_SCOPE_MAPPING).filter(
    ([_, config]) => config.provider === provider,
  )

  const availableComponents: string[] = []
  const unavailableComponents: string[] = []
  const missingScopes: string[] = []
  const recommendations: string[] = []

  // Analyze each component
  providerComponents.forEach(([componentName, config]) => {
    const hasRequiredScopes = config.scopes.every((scope) => {
      // For Google scopes, handle readonly vs full access
      if (scope.includes("googleapis.com/auth/")) {
        if (scope.includes(".readonly")) {
          const fullAccessScope = scope.replace(".readonly", "")
          return grantedScopes.includes(scope) || grantedScopes.includes(fullAccessScope)
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
        if (!grantedScopes.includes(scope) && !missingScopes.includes(scope)) {
          missingScopes.push(scope)
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
    }
  }

  return {
    integrationId: integration.id,
    provider,
    status,
    tokenValid,
    grantedScopes,
    requiredScopes: [...new Set(providerComponents.flatMap(([_, config]) => config.scopes))],
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

export async function GET() {
  try {
    const supabase = getSupabaseClient()
    const { data: sessionData } = await supabase.auth.getSession()

    if (!sessionData?.session) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 })
    }

    const userId = sessionData.session.user.id

    // Get all connected integrations
    const { data: integrations, error } = await supabase
      .from("integrations")
      .select("*")
      .eq("user_id", userId)
      .eq("status", "connected")

    if (error) {
      throw error
    }

    const diagnostics: DiagnosticResult[] = []

    for (const integration of integrations || []) {
      const { provider, metadata } = integration
      const accessToken = metadata?.access_token

      let tokenValid = false
      let grantedScopes: string[] = []
      let errorMessage: string | undefined

      if (metadata?.demo) {
        // Demo integration - assume all scopes are available
        tokenValid = true
        grantedScopes = metadata?.scopes || []
      } else if (accessToken) {
        // Real OAuth integration - verify token
        let verificationResult

        switch (provider) {
          case "google-calendar":
          case "google-sheets":
          case "google-docs":
          case "gmail":
          case "youtube":
            verificationResult = await verifyGoogleToken(accessToken)
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
            // For other providers, trust stored scopes
            verificationResult = {
              valid: true,
              scopes: metadata?.scopes || [],
            }
        }

        tokenValid = verificationResult.valid
        grantedScopes = verificationResult.scopes
        errorMessage = verificationResult.error
      } else {
        // No access token - likely API key or broken integration
        tokenValid = false
        grantedScopes = metadata?.scopes || []
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
