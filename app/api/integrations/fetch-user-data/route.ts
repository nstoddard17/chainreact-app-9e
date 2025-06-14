import { type NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ""
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || ""
const supabase = createClient(supabaseUrl, supabaseKey)

interface DataFetcher {
  [key: string]: (integration: any, options?: any) => Promise<any[]>
}

// Enhanced data fetchers with robust error handling and proper authentication
const dataFetchers: DataFetcher = {
  // Notion data fetchers
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
          filter: {
            property: "object",
            value: "page",
          },
          page_size: 100,
        }),
      })

      if (!response.ok) {
        if (response.status === 401) {
          throw new Error("Notion authentication expired. Please reconnect your account.")
        }
        throw new Error(`Notion API error: ${response.status} ${response.statusText}`)
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
          filter: {
            property: "object",
            value: "database",
          },
          page_size: 100,
        }),
      })

      if (!response.ok) {
        if (response.status === 401) {
          throw new Error("Notion authentication expired. Please reconnect your account.")
        }
        throw new Error(`Notion API error: ${response.status} ${response.statusText}`)
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

  // Slack data fetchers
  slack_channels: async (integration: any) => {
    try {
      const response = await fetch("https://slack.com/api/conversations.list?types=public_channel,private_channel", {
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
        if (data.error === "invalid_auth") {
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
      const response = await fetch("https://slack.com/api/users.list", {
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
        if (data.error === "invalid_auth") {
          throw new Error("Slack authentication expired. Please reconnect your account.")
        }
        throw new Error(`Slack API error: ${data.error}`)
      }

      return (data.members || [])
        .filter((user: any) => !user.deleted && !user.is_bot)
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

  // Google Sheets data fetchers
  "google-sheets_spreadsheets": async (integration: any) => {
    try {
      const response = await fetch(
        "https://www.googleapis.com/drive/v3/files?q=mimeType='application/vnd.google-apps.spreadsheet'&pageSize=100",
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
        throw new Error(`Google Drive API error: ${response.status} ${response.statusText}`)
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

  // Google Calendar data fetchers
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
        throw new Error(`Google Calendar API error: ${response.status} ${response.statusText}`)
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

  // Gmail data fetchers
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
        throw new Error(`Gmail API error: ${response.status} ${response.statusText}`)
      }

      const data = await response.json()
      return (data.labels || [])
        .filter((label: any) => label.type === "user")
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

  // Airtable data fetchers
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
        throw new Error(`Airtable API error: ${response.status} ${response.statusText}`)
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

  // Trello data fetchers
  trello_boards: async (integration: any) => {
    try {
      const response = await fetch(`https://api.trello.com/1/members/me/boards?token=${integration.access_token}`, {
        headers: {
          "Content-Type": "application/json",
        },
      })

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

  // GitHub data fetchers
  github_repositories: async (integration: any) => {
    try {
      const response = await fetch("https://api.github.com/user/repos?per_page=100&sort=updated", {
        headers: {
          Authorization: `Bearer ${integration.access_token}`,
          "Content-Type": "application/json",
          Accept: "application/vnd.github.v3+json",
        },
      })

      if (!response.ok) {
        if (response.status === 401) {
          throw new Error("GitHub authentication expired. Please reconnect your account.")
        }
        throw new Error(`GitHub API error: ${response.status} ${response.statusText}`)
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

    // Get user from request headers
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

    // Extract user from Supabase auth
    const { data: userData, error: userError } = await supabase.auth.getUser(authHeader.replace("Bearer ", ""))

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

    // Check if access token is valid and not expired
    if (integration.expires_at && new Date(integration.expires_at) <= new Date()) {
      console.log(`🔄 Access token expired for ${provider}, attempting refresh...`)

      // Attempt to refresh the token
      try {
        const refreshResponse = await fetch("/api/integrations/oauth/refresh", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            integrationId: integration.id,
            provider: provider,
          }),
        })

        if (!refreshResponse.ok) {
          throw new Error("Failed to refresh token")
        }

        // Get updated integration
        const { data: updatedIntegration } = await supabase
          .from("integrations")
          .select("*")
          .eq("id", integration.id)
          .single()

        if (updatedIntegration) {
          integration.access_token = updatedIntegration.access_token
          integration.expires_at = updatedIntegration.expires_at
        }
      } catch (refreshError) {
        console.error(`Failed to refresh token for ${provider}:`, refreshError)
        return NextResponse.json(
          {
            success: false,
            error: `${provider} authentication expired. Please reconnect your account.`,
          },
          { status: 401 },
        )
      }
    }

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

    // Fetch the data with timeout
    console.log(`🌐 Fetching ${dataType} for ${provider}${preload ? " (preload)" : ""}`)
    const startTime = Date.now()

    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error("Request timeout")), 15000) // 15 second timeout
    })

    const data = (await Promise.race([fetcher(integration, { batchSize }), timeoutPromise])) as any[]

    const endTime = Date.now()
    console.log(`✅ Fetched ${data.length} ${dataType} for ${provider} in ${endTime - startTime}ms`)

    // Cache headers for better performance
    const headers = {
      "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600",
      "Content-Type": "application/json",
    }

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
      { headers },
    )
  } catch (error: any) {
    console.error("💥 Error in fetch-user-data API:", error)

    // Provide specific error messages for common issues
    let errorMessage = "Failed to fetch user data"
    if (error.message.includes("authentication") || error.message.includes("expired")) {
      errorMessage = error.message
    } else if (error.message.includes("timeout")) {
      errorMessage = "Request timed out. Please try again."
    } else if (error.message.includes("rate limit")) {
      errorMessage = "Rate limit exceeded. Please wait a moment and try again."
    }

    return NextResponse.json(
      {
        success: false,
        error: errorMessage,
        details: process.env.NODE_ENV === "development" ? error.message : undefined,
      },
      { status: 500 },
    )
  }
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
