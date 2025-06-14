import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs"
import { cookies } from "next/headers"
import { NextResponse } from "next/server"

export async function POST(request: Request) {
  const supabase = createRouteHandlerClient({ cookies })

  try {
    const {
      data: { session },
    } = await supabase.auth.getSession()

    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { provider, dataType } = await request.json()

    // Get integration for the provider
    const { data: integration, error } = await supabase
      .from("integrations")
      .select("*")
      .eq("user_id", session.user.id)
      .eq("provider", provider)
      .eq("status", "connected")
      .single()

    if (error || !integration) {
      return NextResponse.json({ error: "Integration not found or not connected" }, { status: 404 })
    }

    let data = []

    try {
      switch (provider) {
        case "slack":
          data = await fetchSlackData(integration.access_token, dataType)
          break
        case "discord":
          data = await fetchDiscordData(integration.access_token, dataType)
          break
        case "notion":
          data = await fetchNotionData(integration.access_token, dataType)
          break
        case "google-sheets":
          data = await fetchGoogleSheetsData(integration.access_token, dataType)
          break
        case "google-calendar":
          data = await fetchGoogleCalendarData(integration.access_token, dataType)
          break
        case "google-drive":
          data = await fetchGoogleDriveData(integration.access_token, dataType)
          break
        case "airtable":
          data = await fetchAirtableData(integration.access_token, dataType)
          break
        case "trello":
          data = await fetchTrelloData(integration.access_token, dataType)
          break
        case "github":
          data = await fetchGitHubData(integration.access_token, dataType)
          break
        case "hubspot":
          data = await fetchHubSpotData(integration.access_token, dataType)
          break
        case "teams":
          data = await fetchTeamsData(integration.access_token, dataType)
          break
        case "mailchimp":
          data = await fetchMailchimpData(integration.access_token, dataType)
          break
        default:
          return NextResponse.json({ error: "Unsupported provider" }, { status: 400 })
      }

      return NextResponse.json({ success: true, data })
    } catch (fetchError) {
      console.error(`Error fetching ${dataType} from ${provider}:`, fetchError)
      return NextResponse.json({ error: `Failed to fetch ${dataType}` }, { status: 500 })
    }
  } catch (error) {
    console.error("Error in fetch-user-data:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

async function fetchSlackData(accessToken: string, dataType: string) {
  switch (dataType) {
    case "channels":
      const channelsResponse = await fetch(
        "https://slack.com/api/conversations.list?types=public_channel,private_channel",
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        },
      )
      const channelsData = await channelsResponse.json()
      return (
        channelsData.channels?.map((channel: any) => ({
          id: channel.id,
          name: `#${channel.name}`,
          value: channel.id,
        })) || []
      )

    case "users":
      const usersResponse = await fetch("https://slack.com/api/users.list", {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      })
      const usersData = await usersResponse.json()
      return (
        usersData.members
          ?.filter((user: any) => !user.deleted && !user.is_bot)
          .map((user: any) => ({
            id: user.id,
            name: user.real_name || user.name,
            value: user.id,
          })) || []
      )

    default:
      return []
  }
}

async function fetchDiscordData(accessToken: string, dataType: string) {
  switch (dataType) {
    case "channels":
      // First get user's guilds
      const guildsResponse = await fetch("https://discord.com/api/v10/users/@me/guilds", {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      })
      const guilds = await guildsResponse.json()

      const allChannels = []
      for (const guild of guilds.slice(0, 5)) {
        // Limit to first 5 guilds to avoid rate limits
        try {
          const channelsResponse = await fetch(`https://discord.com/api/v10/guilds/${guild.id}/channels`, {
            headers: {
              Authorization: `Bearer ${accessToken}`,
            },
          })
          const channels = await channelsResponse.json()
          const textChannels = channels.filter((channel: any) => channel.type === 0) // Text channels only
          allChannels.push(
            ...textChannels.map((channel: any) => ({
              id: channel.id,
              name: `#${channel.name} (${guild.name})`,
              value: channel.id,
            })),
          )
        } catch (error) {
          console.error(`Error fetching channels for guild ${guild.id}:`, error)
        }
      }
      return allChannels

    default:
      return []
  }
}

async function fetchNotionData(accessToken: string, dataType: string) {
  switch (dataType) {
    case "databases":
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
        }),
      })
      const data = await response.json()
      return (
        data.results?.map((db: any) => ({
          id: db.id,
          name: db.title?.[0]?.plain_text || "Untitled Database",
          value: db.id,
        })) || []
      )

    default:
      return []
  }
}

async function fetchGoogleSheetsData(accessToken: string, dataType: string) {
  switch (dataType) {
    case "spreadsheets":
      const response = await fetch(
        "https://www.googleapis.com/drive/v3/files?q=mimeType='application/vnd.google-apps.spreadsheet'&pageSize=50",
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        },
      )
      const data = await response.json()
      return (
        data.files?.map((file: any) => ({
          id: file.id,
          name: file.name,
          value: file.id,
        })) || []
      )

    default:
      return []
  }
}

async function fetchGoogleCalendarData(accessToken: string, dataType: string) {
  switch (dataType) {
    case "calendars":
      const response = await fetch("https://www.googleapis.com/calendar/v3/users/me/calendarList", {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      })
      const data = await response.json()
      return (
        data.items?.map((calendar: any) => ({
          id: calendar.id,
          name: calendar.summary,
          value: calendar.id,
        })) || []
      )

    default:
      return []
  }
}

async function fetchGoogleDriveData(accessToken: string, dataType: string) {
  switch (dataType) {
    case "folders":
      const response = await fetch(
        "https://www.googleapis.com/drive/v3/files?q=mimeType='application/vnd.google-apps.folder'&pageSize=50",
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        },
      )
      const data = await response.json()
      return (
        data.files?.map((folder: any) => ({
          id: folder.id,
          name: folder.name,
          value: folder.id,
        })) || []
      )

    default:
      return []
  }
}

async function fetchAirtableData(accessToken: string, dataType: string) {
  switch (dataType) {
    case "bases":
      const response = await fetch("https://api.airtable.com/v0/meta/bases", {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      })
      const data = await response.json()
      return (
        data.bases?.map((base: any) => ({
          id: base.id,
          name: base.name,
          value: base.id,
        })) || []
      )

    default:
      return []
  }
}

async function fetchTrelloData(accessToken: string, dataType: string) {
  switch (dataType) {
    case "boards":
      const response = await fetch("https://api.trello.com/1/members/me/boards", {
        headers: {
          Authorization: `OAuth oauth_consumer_key="${process.env.NEXT_PUBLIC_TRELLO_CLIENT_ID}", oauth_token="${accessToken}"`,
        },
      })
      const data = await response.json()
      return (
        data?.map((board: any) => ({
          id: board.id,
          name: board.name,
          value: board.id,
        })) || []
      )

    default:
      return []
  }
}

async function fetchGitHubData(accessToken: string, dataType: string) {
  switch (dataType) {
    case "repositories":
      const response = await fetch("https://api.github.com/user/repos?per_page=50&sort=updated", {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      })
      const data = await response.json()
      return (
        data?.map((repo: any) => ({
          id: repo.id,
          name: repo.full_name,
          value: repo.full_name,
        })) || []
      )

    default:
      return []
  }
}

async function fetchHubSpotData(accessToken: string, dataType: string) {
  switch (dataType) {
    case "pipelines":
      const response = await fetch("https://api.hubapi.com/crm/v3/pipelines/deals", {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      })
      const data = await response.json()
      return (
        data.results?.map((pipeline: any) => ({
          id: pipeline.id,
          name: pipeline.label,
          value: pipeline.id,
        })) || []
      )

    default:
      return []
  }
}

async function fetchTeamsData(accessToken: string, dataType: string) {
  switch (dataType) {
    case "teams":
      const response = await fetch("https://graph.microsoft.com/v1.0/me/joinedTeams", {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      })
      const data = await response.json()
      return (
        data.value?.map((team: any) => ({
          id: team.id,
          name: team.displayName,
          value: team.id,
        })) || []
      )

    default:
      return []
  }
}

async function fetchMailchimpData(accessToken: string, dataType: string) {
  switch (dataType) {
    case "lists":
      // First get the server prefix
      const rootResponse = await fetch("https://login.mailchimp.com/oauth2/metadata", {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      })
      const rootData = await rootResponse.json()
      const dc = rootData.dc

      const response = await fetch(`https://${dc}.api.mailchimp.com/3.0/lists`, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      })
      const data = await response.json()
      return (
        data.lists?.map((list: any) => ({
          id: list.id,
          name: list.name,
          value: list.id,
        })) || []
      )

    default:
      return []
  }
}
