import { NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ""
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ""
const supabase = createClient(supabaseUrl, supabaseKey)

// Placeholder functions for data fetching from different providers
async function fetchNotionData(integration: any, dataType: string) {
  const accessToken = await getValidAccessToken(integration.id)

  const headers = {
    Authorization: `Bearer ${accessToken}`,
    "Content-Type": "application/json",
    "Notion-Version": "2022-06-28",
  }

  switch (dataType) {
    case "pages":
      const pagesResponse = await fetch("https://api.notion.com/v1/search", {
        method: "POST",
        headers,
        body: JSON.stringify({
          filter: { property: "object", value: "page" },
          page_size: 100,
        }),
      })

      if (!pagesResponse.ok) {
        throw new Error(`Notion API error: ${pagesResponse.status}`)
      }

      const pagesData = await pagesResponse.json()
      return pagesData.results.map((page: any) => ({
        id: page.id,
        name:
          page.properties?.title?.title?.[0]?.plain_text || page.properties?.Name?.title?.[0]?.plain_text || "Untitled",
        value: page.id,
        metadata: {
          url: page.url,
          created_time: page.created_time,
          last_edited_time: page.last_edited_time,
        },
      }))

    case "databases":
      const dbResponse = await fetch("https://api.notion.com/v1/search", {
        method: "POST",
        headers,
        body: JSON.stringify({
          filter: { property: "object", value: "database" },
          page_size: 100,
        }),
      })

      if (!dbResponse.ok) {
        throw new Error(`Notion API error: ${dbResponse.status}`)
      }

      const dbData = await dbResponse.json()
      return dbData.results.map((db: any) => ({
        id: db.id,
        name: db.title?.[0]?.plain_text || "Untitled Database",
        value: db.id,
        metadata: {
          url: db.url,
          created_time: db.created_time,
          last_edited_time: db.last_edited_time,
        },
      }))

    default:
      throw new Error(`Unsupported Notion data type: ${dataType}`)
  }
}

async function fetchSlackData(integration: any, dataType: string) {
  const accessToken = await getValidAccessToken(integration.id)

  const headers = {
    Authorization: `Bearer ${accessToken}`,
    "Content-Type": "application/json",
  }

  switch (dataType) {
    case "channels":
      const channelsResponse = await fetch(
        "https://slack.com/api/conversations.list?types=public_channel,private_channel",
        {
          headers,
        },
      )

      if (!channelsResponse.ok) {
        throw new Error(`Slack API error: ${channelsResponse.status}`)
      }

      const channelsData = await channelsResponse.json()
      if (!channelsData.ok) {
        throw new Error(`Slack API error: ${channelsData.error}`)
      }

      return channelsData.channels.map((channel: any) => ({
        id: channel.id,
        name: `#${channel.name}`,
        value: channel.id,
        metadata: {
          is_private: channel.is_private,
          is_archived: channel.is_archived,
          member_count: channel.num_members,
        },
      }))

    case "users":
      const usersResponse = await fetch("https://slack.com/api/users.list", {
        headers,
      })

      if (!usersResponse.ok) {
        throw new Error(`Slack API error: ${usersResponse.status}`)
      }

      const usersData = await usersResponse.json()
      if (!usersData.ok) {
        throw new Error(`Slack API error: ${usersData.error}`)
      }

      return usersData.members
        .filter((user: any) => !user.deleted && !user.is_bot)
        .map((user: any) => ({
          id: user.id,
          name: user.real_name || user.name,
          value: user.id,
          metadata: {
            display_name: user.profile?.display_name,
            email: user.profile?.email,
            is_admin: user.is_admin,
          },
        }))

    default:
      throw new Error(`Unsupported Slack data type: ${dataType}`)
  }
}

async function fetchGitHubData(integration: any, dataType: string) {
  return []
}

async function fetchGoogleSheetsData(integration: any, dataType: string) {
  return []
}

async function fetchGoogleCalendarData(integration: any, dataType: string) {
  return []
}

async function fetchAirtableData(integration: any, dataType: string) {
  return []
}

async function fetchTrelloData(integration: any, dataType: string) {
  return []
}

async function fetchHubSpotData(integration: any, dataType: string) {
  return []
}

async function getValidAccessToken(integrationId: string) {
  return "test-token"
}

export async function POST(request: Request) {
  try {
    const { provider, dataType } = await request.json()

    if (!provider || !dataType) {
      return NextResponse.json({ success: false, error: "Provider and dataType are required" }, { status: 400 })
    }

    // Add cache headers for better performance
    const headers = {
      "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600",
      "Content-Type": "application/json",
    }

    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ success: false, error: "Authentication required" }, { status: 401, headers })
    }

    console.log(`🔍 Fetching ${dataType} for ${provider} (user: ${user.id})`)

    // Get integration for the provider
    const { data: integration } = await supabase
      .from("integrations")
      .select("*")
      .eq("user_id", user.id)
      .eq("provider", provider)
      .eq("status", "connected")
      .single()

    if (!integration) {
      console.log(`❌ No connected integration found for ${provider}`)
      return NextResponse.json(
        { success: false, error: `${provider} integration not found or not connected` },
        { status: 404, headers },
      )
    }

    // Enhanced data fetching with better error handling
    let data = []
    let fetchError = null

    try {
      switch (provider) {
        case "notion":
          data = await fetchNotionData(integration, dataType)
          break
        case "slack":
          data = await fetchSlackData(integration, dataType)
          break
        case "github":
          data = await fetchGitHubData(integration, dataType)
          break
        case "google-sheets":
          data = await fetchGoogleSheetsData(integration, dataType)
          break
        case "google-calendar":
          data = await fetchGoogleCalendarData(integration, dataType)
          break
        case "airtable":
          data = await fetchAirtableData(integration, dataType)
          break
        case "trello":
          data = await fetchTrelloData(integration, dataType)
          break
        case "hubspot":
          data = await fetchHubSpotData(integration, dataType)
          break
        default:
          throw new Error(`Unsupported provider: ${provider}`)
      }
    } catch (error: any) {
      console.error(`💥 Error fetching ${provider} ${dataType}:`, error)
      fetchError = error.message
      data = []
    }

    console.log(`✅ Successfully fetched ${data.length} ${dataType} from ${provider}`)

    return NextResponse.json(
      {
        success: true,
        data,
        provider,
        dataType,
        count: data.length,
        fetchedAt: new Date().toISOString(),
        ...(fetchError && { warning: fetchError }),
      },
      { headers },
    )
  } catch (error: any) {
    console.error("💥 Error in fetch-user-data API:", error)
    return NextResponse.json({ success: false, error: error.message || "Internal server error" }, { status: 500 })
  }
}
