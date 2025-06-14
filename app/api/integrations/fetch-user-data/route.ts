import { type NextRequest, NextResponse } from "next/server"
import { supabase } from "@/lib/supabase"
import { getValidAccessToken } from "@/lib/integrations/getValidAccessToken"

interface DataFetcher {
  [key: string]: (accessToken: string, options?: any) => Promise<any[]>
}

// Enhanced data fetchers with better error handling and caching
const dataFetchers: DataFetcher = {
  // Notion data fetchers
  notion_pages: async (accessToken: string) => {
    const response = await fetch("https://api.notion.com/v1/search", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
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
      throw new Error(`Notion API error: ${response.status} ${response.statusText}`)
    }

    const data = await response.json()
    return (data.results || []).map((page: any) => ({
      id: page.id,
      name: getPageTitle(page),
      url: page.url,
      created_time: page.created_time,
      last_edited_time: page.last_edited_time,
    }))
  },

  notion_databases: async (accessToken: string) => {
    const response = await fetch("https://api.notion.com/v1/search", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
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
      throw new Error(`Notion API error: ${response.status} ${response.statusText}`)
    }

    const data = await response.json()
    return (data.results || []).map((db: any) => ({
      id: db.id,
      name: getDatabaseTitle(db),
      url: db.url,
      created_time: db.created_time,
      last_edited_time: db.last_edited_time,
    }))
  },

  // Slack data fetchers
  slack_channels: async (accessToken: string) => {
    const response = await fetch("https://slack.com/api/conversations.list", {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
    })

    if (!response.ok) {
      throw new Error(`Slack API error: ${response.status} ${response.statusText}`)
    }

    const data = await response.json()
    if (!data.ok) {
      throw new Error(`Slack API error: ${data.error}`)
    }

    return (data.channels || [])
      .filter((channel: any) => !channel.is_archived)
      .map((channel: any) => ({
        id: channel.id,
        name: `#${channel.name}`,
        is_private: channel.is_private,
        member_count: channel.num_members,
      }))
  },

  slack_users: async (accessToken: string) => {
    const response = await fetch("https://slack.com/api/users.list", {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
    })

    if (!response.ok) {
      throw new Error(`Slack API error: ${response.status} ${response.statusText}`)
    }

    const data = await response.json()
    if (!data.ok) {
      throw new Error(`Slack API error: ${data.error}`)
    }

    return (data.members || [])
      .filter((user: any) => !user.deleted && !user.is_bot)
      .map((user: any) => ({
        id: user.id,
        name: user.real_name || user.name,
        display_name: user.profile?.display_name || user.name,
        email: user.profile?.email,
      }))
  },

  // Google Sheets data fetchers
  "google-sheets_spreadsheets": async (accessToken: string) => {
    const response = await fetch(
      "https://www.googleapis.com/drive/v3/files?q=mimeType='application/vnd.google-apps.spreadsheet'&pageSize=100",
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
      },
    )

    if (!response.ok) {
      throw new Error(`Google Drive API error: ${response.status} ${response.statusText}`)
    }

    const data = await response.json()
    return (data.files || []).map((file: any) => ({
      id: file.id,
      name: file.name,
      created_time: file.createdTime,
      modified_time: file.modifiedTime,
    }))
  },

  // Google Calendar data fetchers
  "google-calendar_calendars": async (accessToken: string) => {
    const response = await fetch("https://www.googleapis.com/calendar/v3/users/me/calendarList", {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
    })

    if (!response.ok) {
      throw new Error(`Google Calendar API error: ${response.status} ${response.statusText}`)
    }

    const data = await response.json()
    return (data.items || []).map((calendar: any) => ({
      id: calendar.id,
      name: calendar.summary,
      description: calendar.description,
      primary: calendar.primary,
      access_role: calendar.accessRole,
    }))
  },

  // Airtable data fetchers
  airtable_bases: async (accessToken: string) => {
    const response = await fetch("https://api.airtable.com/v0/meta/bases", {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
    })

    if (!response.ok) {
      throw new Error(`Airtable API error: ${response.status} ${response.statusText}`)
    }

    const data = await response.json()
    return (data.bases || []).map((base: any) => ({
      id: base.id,
      name: base.name,
      permission_level: base.permissionLevel,
    }))
  },

  // Trello data fetchers
  trello_boards: async (accessToken: string) => {
    const response = await fetch("https://api.trello.com/1/members/me/boards", {
      headers: {
        Authorization: `OAuth oauth_consumer_key="your_key", oauth_token="${accessToken}"`,
        "Content-Type": "application/json",
      },
    })

    if (!response.ok) {
      throw new Error(`Trello API error: ${response.status} ${response.statusText}`)
    }

    const data = await response.json()
    return data.map((board: any) => ({
      id: board.id,
      name: board.name,
      description: board.desc,
      closed: board.closed,
      url: board.url,
    }))
  },

  // GitHub data fetchers
  github_repositories: async (accessToken: string) => {
    const response = await fetch("https://api.github.com/user/repos?per_page=100&sort=updated", {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        Accept: "application/vnd.github.v3+json",
      },
    })

    if (!response.ok) {
      throw new Error(`GitHub API error: ${response.status} ${response.statusText}`)
    }

    const data = await response.json()
    return data.map((repo: any) => ({
      id: repo.id,
      name: repo.full_name,
      description: repo.description,
      private: repo.private,
      url: repo.html_url,
      updated_at: repo.updated_at,
    }))
  },

  // Gmail data fetchers
  gmail_labels: async (accessToken: string) => {
    const response = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/labels", {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
    })

    if (!response.ok) {
      throw new Error(`Gmail API error: ${response.status} ${response.statusText}`)
    }

    const data = await response.json()
    return (data.labels || [])
      .filter((label: any) => label.type === "user")
      .map((label: any) => ({
        id: label.id,
        name: label.name,
        type: label.type,
        messages_total: label.messagesTotal,
        messages_unread: label.messagesUnread,
      }))
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

    // Get user
    const { data: user } = await supabase.auth.getUser()
    if (!user.user) {
      return NextResponse.json(
        {
          success: false,
          error: "User not authenticated",
        },
        { status: 401 },
      )
    }

    // Get integration
    const { data: integration, error: integrationError } = await supabase
      .from("integrations")
      .select("*")
      .eq("user_id", user.user.id)
      .eq("provider", provider)
      .eq("status", "connected")
      .single()

    if (integrationError || !integration) {
      return NextResponse.json(
        {
          success: false,
          error: `No connected ${provider} integration found`,
        },
        { status: 404 },
      )
    }

    // Get valid access token
    const accessToken = await getValidAccessToken(integration.id)
    if (!accessToken) {
      return NextResponse.json(
        {
          success: false,
          error: `Failed to get valid access token for ${provider}`,
        },
        { status: 401 },
      )
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

    // Fetch the data
    console.log(`Fetching ${dataType} for ${provider}${preload ? " (preload)" : ""}`)
    const startTime = Date.now()

    const data = await fetcher(accessToken, { batchSize })

    const endTime = Date.now()
    console.log(`Fetched ${data.length} ${dataType} for ${provider} in ${endTime - startTime}ms`)

    // Log successful fetch for monitoring
    if (preload) {
      console.log(`Preload completed: ${provider}_${dataType} - ${data.length} items`)
    }

    return NextResponse.json({
      success: true,
      data,
      count: data.length,
      provider,
      dataType,
      fetchTime: endTime - startTime,
    })
  } catch (error: any) {
    console.error("Failed to fetch user data:", error)

    return NextResponse.json(
      {
        success: false,
        error: error.message || "Failed to fetch user data",
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
