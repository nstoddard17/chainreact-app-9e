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

    // Get integration details
    const { data: integration, error } = await supabase
      .from("integrations")
      .select("*")
      .eq("user_id", session.user.id)
      .eq("provider", provider)
      .eq("status", "connected")
      .single()

    if (error || !integration) {
      return NextResponse.json({ error: "Integration not found" }, { status: 404 })
    }

    let data = []

    switch (provider) {
      case "discord":
        data = await fetchDiscordData(integration, dataType)
        break
      case "slack":
        data = await fetchSlackData(integration, dataType)
        break
      case "notion":
        data = await fetchNotionData(integration, dataType)
        break
      case "google-sheets":
        data = await fetchGoogleSheetsData(integration, dataType)
        break
      case "google-calendar":
        data = await fetchGoogleCalendarData(integration, dataType)
        break
      case "google-drive":
        data = await fetchGoogleDriveData(integration, dataType)
        break
      case "airtable":
        data = await fetchAirtableData(integration, dataType)
        break
      case "trello":
        data = await fetchTrelloData(integration, dataType)
        break
      case "github":
        data = await fetchGitHubData(integration, dataType)
        break
      case "gitlab":
        data = await fetchGitLabData(integration, dataType)
        break
      case "hubspot":
        data = await fetchHubSpotData(integration, dataType)
        break
      case "teams":
        data = await fetchTeamsData(integration, dataType)
        break
      case "mailchimp":
        data = await fetchMailchimpData(integration, dataType)
        break
      default:
        return NextResponse.json({ error: "Unsupported provider" }, { status: 400 })
    }

    return NextResponse.json({ success: true, data })
  } catch (error) {
    console.error("Error fetching user data:", error)
    return NextResponse.json({ error: "Failed to fetch data" }, { status: 500 })
  }
}

async function fetchDiscordData(integration: any, dataType: string) {
  switch (dataType) {
    case "guilds":
      const guildsResponse = await fetch("https://discord.com/api/users/@me/guilds", {
        headers: {
          Authorization: `Bearer ${integration.access_token}`,
        },
      })
      const guilds = await guildsResponse.json()
      return guilds.map((guild: any) => ({
        id: guild.id,
        name: guild.name,
        icon: guild.icon ? `https://cdn.discordapp.com/icons/${guild.id}/${guild.icon}.png` : null,
      }))

    case "channels":
      // Note: This requires guild_id parameter
      return []

    default:
      return []
  }
}

async function fetchSlackData(integration: any, dataType: string) {
  switch (dataType) {
    case "channels":
      const channelsResponse = await fetch("https://slack.com/api/conversations.list", {
        headers: {
          Authorization: `Bearer ${integration.access_token}`,
        },
      })
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
          Authorization: `Bearer ${integration.access_token}`,
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

async function fetchNotionData(integration: any, dataType: string) {
  switch (dataType) {
    case "databases":
      const dbResponse = await fetch("https://api.notion.com/v1/search", {
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
        }),
      })
      const dbData = await dbResponse.json()
      return (
        dbData.results?.map((db: any) => ({
          id: db.id,
          name: db.title?.[0]?.plain_text || "Untitled Database",
          value: db.id,
        })) || []
      )

    case "pages":
      const pagesResponse = await fetch("https://api.notion.com/v1/search", {
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
        }),
      })
      const pagesData = await pagesResponse.json()
      return (
        pagesData.results?.map((page: any) => ({
          id: page.id,
          name: page.properties?.title?.title?.[0]?.plain_text || "Untitled Page",
          value: page.id,
        })) || []
      )

    default:
      return []
  }
}

async function fetchGoogleSheetsData(integration: any, dataType: string) {
  switch (dataType) {
    case "spreadsheets":
      const response = await fetch(
        "https://www.googleapis.com/drive/v3/files?q=mimeType='application/vnd.google-apps.spreadsheet'",
        {
          headers: {
            Authorization: `Bearer ${integration.access_token}`,
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

async function fetchGoogleCalendarData(integration: any, dataType: string) {
  switch (dataType) {
    case "calendars":
      const response = await fetch("https://www.googleapis.com/calendar/v3/users/me/calendarList", {
        headers: {
          Authorization: `Bearer ${integration.access_token}`,
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

async function fetchGoogleDriveData(integration: any, dataType: string) {
  switch (dataType) {
    case "folders":
      const response = await fetch(
        "https://www.googleapis.com/drive/v3/files?q=mimeType='application/vnd.google-apps.folder'",
        {
          headers: {
            Authorization: `Bearer ${integration.access_token}`,
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

async function fetchAirtableData(integration: any, dataType: string) {
  switch (dataType) {
    case "bases":
      const response = await fetch("https://api.airtable.com/v0/meta/bases", {
        headers: {
          Authorization: `Bearer ${integration.access_token}`,
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

async function fetchTrelloData(integration: any, dataType: string) {
  switch (dataType) {
    case "boards":
      const response = await fetch("https://api.trello.com/1/members/me/boards", {
        headers: {
          Authorization: `OAuth oauth_consumer_key="${process.env.TRELLO_CLIENT_ID}", oauth_token="${integration.access_token}"`,
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

    case "lists":
      // Note: This requires board_id parameter
      return []

    default:
      return []
  }
}

async function fetchGitHubData(integration: any, dataType: string) {
  switch (dataType) {
    case "repositories":
      const response = await fetch("https://api.github.com/user/repos?per_page=100", {
        headers: {
          Authorization: `Bearer ${integration.access_token}`,
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

async function fetchGitLabData(integration: any, dataType: string) {
  switch (dataType) {
    case "projects":
      const response = await fetch("https://gitlab.com/api/v4/projects?membership=true&per_page=100", {
        headers: {
          Authorization: `Bearer ${integration.access_token}`,
        },
      })
      const data = await response.json()
      return (
        data?.map((project: any) => ({
          id: project.id,
          name: project.path_with_namespace,
          value: project.path_with_namespace,
        })) || []
      )

    default:
      return []
  }
}

async function fetchHubSpotData(integration: any, dataType: string) {
  switch (dataType) {
    case "pipelines":
      const response = await fetch("https://api.hubapi.com/crm/v3/pipelines/deals", {
        headers: {
          Authorization: `Bearer ${integration.access_token}`,
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

    case "contacts":
      const contactsResponse = await fetch("https://api.hubapi.com/crm/v3/objects/contacts?limit=100", {
        headers: {
          Authorization: `Bearer ${integration.access_token}`,
        },
      })
      const contactsData = await contactsResponse.json()
      return (
        contactsData.results?.map((contact: any) => ({
          id: contact.id,
          name:
            `${contact.properties.firstname || ""} ${contact.properties.lastname || ""}`.trim() ||
            contact.properties.email,
          value: contact.id,
        })) || []
      )

    default:
      return []
  }
}

async function fetchTeamsData(integration: any, dataType: string) {
  switch (dataType) {
    case "teams":
      const response = await fetch("https://graph.microsoft.com/v1.0/me/joinedTeams", {
        headers: {
          Authorization: `Bearer ${integration.access_token}`,
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

    case "channels":
      // Note: This requires team_id parameter
      return []

    default:
      return []
  }
}

async function fetchMailchimpData(integration: any, dataType: string) {
  switch (dataType) {
    case "lists":
      const response = await fetch("https://us1.api.mailchimp.com/3.0/lists", {
        headers: {
          Authorization: `Bearer ${integration.access_token}`,
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
