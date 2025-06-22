import { type NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ""
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || ""
const supabase = createClient(supabaseUrl, supabaseKey)

interface DataFetcher {
  [key: string]: (integration: any, options?: any) => Promise<any[]>
}

// Add comprehensive error handling and fix API calls
export async function POST(request: NextRequest) {
  try {
    const { provider, dataType, batchSize = 100, preload = false } = await request.json()

    if (!provider || !dataType) {
      return NextResponse.json(
        {
          success: false,
          error: "Provider and dataType are required",
        },
        { status: 400 },
      )
    }

    // Get user from authorization header
    const authHeader = request.headers.get("authorization")
    if (!authHeader) {
      return NextResponse.json(
        {
          success: false,
          error: "Authorization header required",
        },
        { status: 401 },
      )
    }

    // Extract token and validate user
    const token = authHeader.replace("Bearer ", "")
    const { data: userData, error: userError } = await supabase.auth.getUser(token)

    if (userError || !userData.user) {
      return NextResponse.json(
        {
          success: false,
          error: "Invalid authentication token",
        },
        { status: 401 },
      )
    }

    console.log(`🔍 Fetching ${dataType} for ${provider} (user: ${userData.user.id})`)

    // Get integration for the provider
    const { data: integration, error: integrationError } = await supabase
      .from("integrations")
      .select("*")
      .eq("user_id", userData.user.id)
      .eq("provider", provider)
      .eq("status", "connected")
      .single()

    if (integrationError || !integration) {
      console.log(`❌ No connected integration found for ${provider}`)
      return NextResponse.json(
        {
          success: false,
          error: `${provider} integration not found or not connected`,
        },
        { status: 404 },
      )
    }

    // Validate and refresh token if needed
    const tokenValidation = await validateAndRefreshToken(integration)
    if (!tokenValidation.success) {
      return NextResponse.json(
        {
          success: false,
          error: tokenValidation.error,
        },
        { status: 401 },
      )
    }

    // Use updated token
    const validToken = tokenValidation.token || integration.access_token

    // Get the appropriate data fetcher
    const fetcherKey = `${provider}_${dataType}`
    const fetcher = dataFetchers[fetcherKey]

    if (!fetcher) {
      return NextResponse.json(
        {
          success: false,
          error: `No data fetcher found for ${provider} ${dataType}`,
        },
        { status: 400 },
      )
    }

    // Fetch the data with timeout and retry logic
    console.log(`🌐 Fetching ${dataType} for ${provider}${preload ? " (preload)" : ""}`)
    const startTime = Date.now()

    const data = await fetchWithRetry(
      () => fetcher({ ...integration, access_token: validToken }, { batchSize }),
      3, // max retries
      2000, // initial delay
    )

    const endTime = Date.now()
    console.log(`✅ Fetched ${data.length} ${dataType} for ${provider} in ${endTime - startTime}ms`)

    return NextResponse.json(
      {
        success: true,
        data,
        count: data.length,
        provider,
        dataType,
        fetchTime: endTime - startTime,
        cached: false,
      },
      {
        headers: {
          "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600",
          "Content-Type": "application/json",
        },
      },
    )
  } catch (error: any) {
    console.error("💥 Error in fetch-user-data API:", error)

    let errorMessage = "Failed to fetch user data"
    let statusCode = 500

    if (error.message.includes("authentication") || error.message.includes("expired")) {
      errorMessage = error.message
      statusCode = 401
    } else if (error.message.includes("timeout")) {
      errorMessage = "Request timed out. Please try again."
      statusCode = 408
    } else if (error.message.includes("rate limit")) {
      errorMessage = "Rate limit exceeded. Please wait a moment and try again."
      statusCode = 429
    } else if (error.message.includes("not found")) {
      errorMessage = "Resource not found or access denied."
      statusCode = 404
    }

    return NextResponse.json(
      {
        success: false,
        error: errorMessage,
        details: process.env.NODE_ENV === "development" ? error.message : undefined,
      },
      { status: statusCode },
    )
  }
}

// Helper function to validate and refresh token if needed
async function validateAndRefreshToken(integration: any): Promise<{
  success: boolean
  token?: string
  error?: string
}> {
  try {
    // Check if token is expired
    if (integration.expires_at) {
      const expiresAt = new Date(integration.expires_at)
      const now = new Date()
      const timeUntilExpiry = expiresAt.getTime() - now.getTime()

      // If expires within 5 minutes, try to refresh
      if (timeUntilExpiry < 5 * 60 * 1000) {
        console.log(`🔄 Token expiring soon for ${integration.provider}, attempting refresh...`)

        if (integration.refresh_token) {
          const { TokenRefreshService } = await import("@/lib/integrations/tokenRefreshService")
          const refreshResult = await TokenRefreshService.refreshTokenForProvider(
            integration.provider,
            integration.refresh_token,
            integration
          )

          if (refreshResult.success && refreshResult.accessToken) {
            return {
              success: true,
              token: refreshResult.accessToken,
            }
          } else if (refreshResult.needsReauthorization) {
            return {
              success: false,
              error: `${integration.provider} authentication expired. Please reconnect your account.`,
            }
          }
        } else {
          return {
            success: false,
            error: `${integration.provider} token expired and no refresh token available. Please reconnect.`,
          }
        }
      }
    }

    return {
      success: true,
      token: integration.access_token,
    }
  } catch (error: any) {
    console.error(`Failed to validate/refresh token for ${integration.provider}:`, error)
    return {
      success: false,
      error: `Token validation failed: ${error.message}`,
    }
  }
}

// Helper function for retry logic
async function fetchWithRetry<T>(fetchFn: () => Promise<T>, maxRetries: number, initialDelay: number): Promise<T> {
  let lastError: any

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error("Request timeout")), 15000)
      })

      return await Promise.race([fetchFn(), timeoutPromise])
    } catch (error: any) {
      lastError = error
      console.warn(`Attempt ${attempt}/${maxRetries} failed:`, error.message)

      if (attempt < maxRetries) {
        const delay = initialDelay * Math.pow(2, attempt - 1)
        console.log(`Retrying in ${delay}ms...`)
        await new Promise((resolve) => setTimeout(resolve, delay))
      }
    }
  }

  throw lastError
}

// Fix data fetchers with better error handling
const dataFetchers: DataFetcher = {
  notion_pages: async (integration: any) => {
    try {
      const response = await fetch("https://api.notion.com/v1/search", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${integration.access_token}`,
          "Content-Type": "application/json",
          "Notion-Version": "2022-06-28",
        },
        body: JSON.stringify({
          filter: { property: "object", value: "page" },
          page_size: 100,
        }),
      })

      if (!response.ok) {
        if (response.status === 401) {
          throw new Error("Notion authentication expired. Please reconnect your account.")
        }
        const errorData = await response.json().catch(() => ({}))
        throw new Error(`Notion API error: ${response.status} - ${errorData.message || response.statusText}`)
      }

      const data = await response.json()
      return (data.results || []).map((page: any) => ({
        id: page.id,
        name: getPageTitle(page),
        value: page.id,
        url: page.url,
        created_time: page.created_time,
        last_edited_time: page.last_edited_time,
      }))
    } catch (error: any) {
      console.error("Error fetching Notion pages:", error)
      throw error
    }
  },

  notion_databases: async (integration: any) => {
    try {
      const response = await fetch("https://api.notion.com/v1/search", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${integration.access_token}`,
          "Content-Type": "application/json",
          "Notion-Version": "2022-06-28",
        },
        body: JSON.stringify({
          filter: { property: "object", value: "database" },
          page_size: 100,
        }),
      })

      if (!response.ok) {
        if (response.status === 401) {
          throw new Error("Notion authentication expired. Please reconnect your account.")
        }
        const errorData = await response.json().catch(() => ({}))
        throw new Error(`Notion API error: ${response.status} - ${errorData.message || response.statusText}`)
      }

      const data = await response.json()
      return (data.results || []).map((db: any) => ({
        id: db.id,
        name: getDatabaseTitle(db),
        value: db.id,
        url: db.url,
        created_time: db.created_time,
        last_edited_time: db.last_edited_time,
      }))
    } catch (error: any) {
      console.error("Error fetching Notion databases:", error)
      throw error
    }
  },

  slack_channels: async (integration: any) => {
    try {
      const response = await fetch(
        "https://slack.com/api/conversations.list?types=public_channel,private_channel&limit=1000",
        {
          headers: {
            Authorization: `Bearer ${integration.access_token}`,
            "Content-Type": "application/json",
          },
        },
      )

      if (!response.ok) {
        throw new Error(`Slack API error: ${response.status} ${response.statusText}`)
      }

      const data = await response.json()
      if (!data.ok) {
        if (data.error === "invalid_auth" || data.error === "token_revoked") {
          throw new Error("Slack authentication expired. Please reconnect your account.")
        }
        throw new Error(`Slack API error: ${data.error}`)
      }

      return (data.channels || [])
        .filter((channel: any) => !channel.is_archived)
        .map((channel: any) => ({
          id: channel.id,
          name: `#${channel.name}`,
          value: channel.id,
          is_private: channel.is_private,
          member_count: channel.num_members,
        }))
    } catch (error: any) {
      console.error("Error fetching Slack channels:", error)
      throw error
    }
  },

  slack_users: async (integration: any) => {
    try {
      const response = await fetch("https://slack.com/api/users.list?limit=1000", {
        headers: {
          Authorization: `Bearer ${integration.access_token}`,
          "Content-Type": "application/json",
        },
      })

      if (!response.ok) {
        throw new Error(`Slack API error: ${response.status} ${response.statusText}`)
      }

      const data = await response.json()
      if (!data.ok) {
        if (data.error === "invalid_auth" || data.error === "token_revoked") {
          throw new Error("Slack authentication expired. Please reconnect your account.")
        }
        throw new Error(`Slack API error: ${data.error}`)
      }

      return (data.members || [])
        .filter((user: any) => !user.deleted && !user.is_bot && user.id !== "USLACKBOT")
        .map((user: any) => ({
          id: user.id,
          name: user.real_name || user.name,
          value: user.id,
          display_name: user.profile?.display_name || user.name,
          email: user.profile?.email,
        }))
    } catch (error: any) {
      console.error("Error fetching Slack users:", error)
      throw error
    }
  },

  "google-sheets_spreadsheets": async (integration: any) => {
    try {
      const response = await fetch(
        "https://www.googleapis.com/drive/v3/files?q=mimeType='application/vnd.google-apps.spreadsheet'&pageSize=100&fields=files(id,name,createdTime,modifiedTime)",
        {
          headers: {
            Authorization: `Bearer ${integration.access_token}`,
            "Content-Type": "application/json",
          },
        },
      )

      if (!response.ok) {
        if (response.status === 401) {
          throw new Error("Google Sheets authentication expired. Please reconnect your account.")
        }
        const errorData = await response.json().catch(() => ({}))
        throw new Error(
          `Google Drive API error: ${response.status} - ${errorData.error?.message || response.statusText}`,
        )
      }

      const data = await response.json()
      return (data.files || []).map((file: any) => ({
        id: file.id,
        name: file.name,
        value: file.id,
        created_time: file.createdTime,
        modified_time: file.modifiedTime,
      }))
    } catch (error: any) {
      console.error("Error fetching Google Sheets:", error)
      throw error
    }
  },

  "google-calendar_calendars": async (integration: any) => {
    try {
      const response = await fetch("https://www.googleapis.com/calendar/v3/users/me/calendarList", {
        headers: {
          Authorization: `Bearer ${integration.access_token}`,
          "Content-Type": "application/json",
        },
      })

      if (!response.ok) {
        if (response.status === 401) {
          throw new Error("Google Calendar authentication expired. Please reconnect your account.")
        }
        const errorData = await response.json().catch(() => ({}))
        throw new Error(
          `Google Calendar API error: ${response.status} - ${errorData.error?.message || response.statusText}`,
        )
      }

      const data = await response.json()
      return (data.items || []).map((calendar: any) => ({
        id: calendar.id,
        name: calendar.summary,
        value: calendar.id,
        description: calendar.description,
        primary: calendar.primary,
        access_role: calendar.accessRole,
      }))
    } catch (error: any) {
      console.error("Error fetching Google Calendar calendars:", error)
      throw error
    }
  },

  gmail_labels: async (integration: any) => {
    try {
      const response = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/labels", {
        headers: {
          Authorization: `Bearer ${integration.access_token}`,
          "Content-Type": "application/json",
        },
      })

      if (!response.ok) {
        if (response.status === 401) {
          throw new Error("Gmail authentication expired. Please reconnect your account.")
        }
        const errorData = await response.json().catch(() => ({}))
        throw new Error(`Gmail API error: ${response.status} - ${errorData.error?.message || response.statusText}`)
      }

      const data = await response.json()
      return (data.labels || [])
        .filter(
          (label: any) =>
            label.type === "user" ||
            ["INBOX", "SENT", "DRAFT", "SPAM", "TRASH", "IMPORTANT", "STARRED"].includes(label.id),
        )
        .map((label: any) => ({
          id: label.id,
          name: label.name,
          value: label.id,
          type: label.type,
          messages_total: label.messagesTotal,
          messages_unread: label.messagesUnread,
        }))
    } catch (error: any) {
      console.error("Error fetching Gmail labels:", error)
      throw error
    }
  },

  airtable_bases: async (integration: any) => {
    try {
      const response = await fetch("https://api.airtable.com/v0/meta/bases", {
        headers: {
          Authorization: `Bearer ${integration.access_token}`,
          "Content-Type": "application/json",
        },
      })

      if (!response.ok) {
        if (response.status === 401) {
          throw new Error("Airtable authentication expired. Please reconnect your account.")
        }
        const errorData = await response.json().catch(() => ({}))
        throw new Error(`Airtable API error: ${response.status} - ${errorData.error?.message || response.statusText}`)
      }

      const data = await response.json()
      return (data.bases || []).map((base: any) => ({
        id: base.id,
        name: base.name,
        value: base.id,
        permission_level: base.permissionLevel,
      }))
    } catch (error: any) {
      console.error("Error fetching Airtable bases:", error)
      throw error
    }
  },

  trello_boards: async (integration: any) => {
    try {
      const response = await fetch(
        `https://api.trello.com/1/members/me/boards?token=${integration.access_token}&fields=id,name,desc,url,closed`,
        {
          headers: {
            "Content-Type": "application/json",
          },
        },
      )

      if (!response.ok) {
        if (response.status === 401) {
          throw new Error("Trello authentication expired. Please reconnect your account.")
        }
        throw new Error(`Trello API error: ${response.status} ${response.statusText}`)
      }

      const data = await response.json()
      return data
        .filter((board: any) => !board.closed)
        .map((board: any) => ({
          id: board.id,
          name: board.name,
          value: board.id,
          description: board.desc,
          url: board.url,
        }))
    } catch (error: any) {
      console.error("Error fetching Trello boards:", error)
      throw error
    }
  },

  github_repositories: async (integration: any) => {
    try {
      const response = await fetch(
        "https://api.github.com/user/repos?per_page=100&sort=updated&affiliation=owner,collaborator",
        {
          headers: {
            Authorization: `Bearer ${integration.access_token}`,
            "Content-Type": "application/json",
            Accept: "application/vnd.github.v3+json",
            "User-Agent": "ChainReact-App",
          },
        },
      )

      if (!response.ok) {
        if (response.status === 401) {
          throw new Error("GitHub authentication expired. Please reconnect your account.")
        }
        const errorData = await response.json().catch(() => ({}))
        throw new Error(`GitHub API error: ${response.status} - ${errorData.message || response.statusText}`)
      }

      const data = await response.json()
      return data.map((repo: any) => ({
        id: repo.id,
        name: repo.full_name,
        value: repo.full_name,
        description: repo.description,
        private: repo.private,
        url: repo.html_url,
        updated_at: repo.updated_at,
      }))
    } catch (error: any) {
      console.error("Error fetching GitHub repositories:", error)
      throw error
    }
  },
}

// Helper functions
function getPageTitle(page: any): string {
  if (page.properties?.title?.title?.[0]?.plain_text) {
    return page.properties.title.title[0].plain_text
  }
  if (page.properties?.Name?.title?.[0]?.plain_text) {
    return page.properties.Name.title[0].plain_text
  }
  return "Untitled"
}

function getDatabaseTitle(database: any): string {
  if (database.title?.[0]?.plain_text) {
    return database.title[0].plain_text
  }
  return "Untitled Database"
}
