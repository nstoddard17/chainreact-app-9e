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
        "https://slack.com/api/conversations.list?types=public_channel,private_channel&exclude_archived=true&limit=200",
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        },
      )
      const channelsData = await channelsResponse.json()
      return (
        channelsData.channels
          ?.filter((channel: any) => !channel.is_archived && channel.is_member)
          .map((channel: any) => ({
            id: channel.id,
            name: `#${channel.name}`,
            value: channel.id,
          })) || []
      )

    case "users":
      const usersResponse = await fetch("https://slack.com/api/users.list?limit=200", {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      })
      const usersData = await usersResponse.json()
      return (
        usersData.members
          ?.filter((user: any) => !user.deleted && !user.is_bot && !user.is_app_user)
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
      for (const guild of guilds.slice(0, 10)) {
        // Limit to first 10 guilds
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
          page_size: 100,
        }),
      })
      const data = await response.json()
      return (
        data.results
          ?.filter((db: any) => {
            // Filter out databases without proper titles or that are archived
            const hasTitle = db.title && db.title.length > 0 && db.title[0].plain_text
            return hasTitle && !db.archived
          })
          .map((db: any) => ({
            id: db.id,
            name: extractNotionTitle(db.title),
            value: db.id,
          })) || []
      )

    case "pages":
      // First get the current user info to filter by ownership
      const userResponse = await fetch("https://api.notion.com/v1/users/me", {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Notion-Version": "2022-06-28",
        },
      })
      const currentUser = await userResponse.json()
      const currentUserId = currentUser.id

      const pagesResponse = await fetch("https://api.notion.com/v1/search", {
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
      const pagesData = await pagesResponse.json()

      // Get detailed page info to check ownership
      const ownedPages = []
      for (const page of pagesData.results || []) {
        try {
          // Get detailed page info including who created it
          const pageDetailResponse = await fetch(`https://api.notion.com/v1/pages/${page.id}`, {
            headers: {
              Authorization: `Bearer ${accessToken}`,
              "Notion-Version": "2022-06-28",
            },
          })
          const pageDetail = await pageDetailResponse.json()

          // Filter criteria:
          // 1. Not archived
          // 2. Not a database item (allow sub-pages)
          // 3. Created by current user OR in a workspace they own
          // 4. Has a meaningful title
          if (
            !pageDetail.archived &&
            pageDetail.parent?.type !== "database_id" &&
            (pageDetail.created_by?.id === currentUserId ||
              pageDetail.parent?.type === "workspace" ||
              isUserOwnedPage(pageDetail, currentUserId))
          ) {
            const title = getPageTitle(pageDetail)
            if (title && title.trim() !== "" && title !== "Untitled") {
              ownedPages.push({
                id: pageDetail.id,
                name: title,
                value: pageDetail.id,
              })
            }
          }
        } catch (error) {
          // Skip pages we can't access or get details for
          console.log(`Skipping page ${page.id}: ${error}`)
        }
      }

      return ownedPages.sort((a: any, b: any) => a.name.localeCompare(b.name))

    default:
      return []
  }
}

// Helper function to extract title with emojis from Notion rich text
function extractNotionTitle(titleArray: any[]): string {
  if (!titleArray || titleArray.length === 0) {
    return "Untitled"
  }

  // Combine all text segments to preserve emojis and formatting
  return titleArray
    .map((segment: any) => {
      if (segment.type === "text") {
        return segment.text?.content || ""
      }
      return segment.plain_text || ""
    })
    .join("")
    .trim()
}

// Enhanced helper function to extract page title with emojis and icons
function getPageTitle(page: any): string {
  // First try to get the icon (emoji) if it exists
  let icon = ""
  if (page.icon) {
    if (page.icon.type === "emoji") {
      icon = page.icon.emoji + " "
    } else if (page.icon.type === "external" && page.icon.external?.url) {
      // For external icons, we'll skip them in text but they exist
      icon = ""
    } else if (page.icon.type === "file" && page.icon.file?.url) {
      // For uploaded file icons, we'll skip them in text but they exist
      icon = ""
    }
  }

  // Try different ways to get the title with rich text support
  if (page.properties) {
    // Check for common title property names
    const titleProps = ["title", "Title", "Name", "name"]
    for (const prop of titleProps) {
      if (page.properties[prop]?.title && Array.isArray(page.properties[prop].title)) {
        const titleText = extractNotionTitle(page.properties[prop].title)
        if (titleText && titleText !== "Untitled") {
          return icon + titleText
        }
      }
    }
  }

  // For regular pages, try to get title from the page object itself
  if (page.properties?.title?.title && Array.isArray(page.properties.title.title)) {
    const titleText = extractNotionTitle(page.properties.title.title)
    if (titleText && titleText !== "Untitled") {
      return icon + titleText
    }
  }

  // Try to extract from URL as fallback (but clean it up better)
  if (page.url) {
    const urlParts = page.url.split("/")
    const lastPart = urlParts[urlParts.length - 1]
    if (lastPart && lastPart !== page.id && !lastPart.includes("-")) {
      // Only use URL if it doesn't look like a UUID
      const cleanTitle = decodeURIComponent(lastPart.replace(/-/g, " "))
      return icon + cleanTitle
    }
  }

  // If we have an icon but no good title, show just the icon with "Page"
  if (icon.trim()) {
    return icon + "Page"
  }

  // Last resort - don't show ID, just return a generic name
  return "Untitled Page"
}

// Helper function to determine if a page is owned by the user
function isUserOwnedPage(pageDetail: any, currentUserId: string): boolean {
  // Check if user created the page
  if (pageDetail.created_by?.id === currentUserId) {
    return true
  }

  // Check if it's in the user's personal workspace (not shared)
  if (pageDetail.parent?.type === "workspace") {
    return true
  }

  // Check if user has full access (can edit properties, not just read)
  // This is a heuristic - if they can edit, they likely own or have full access
  return false
}

async function fetchGoogleSheetsData(accessToken: string, dataType: string) {
  switch (dataType) {
    case "spreadsheets":
      const response = await fetch(
        "https://www.googleapis.com/drive/v3/files?q=mimeType='application/vnd.google-apps.spreadsheet' and trashed=false&pageSize=100&orderBy=modifiedTime desc",
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        },
      )
      const data = await response.json()
      return (
        data.files
          ?.filter((file: any) => file.name && !file.name.startsWith("Copy of"))
          .map((file: any) => ({
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
      const response = await fetch("https://www.googleapis.com/calendar/v3/users/me/calendarList?maxResults=50", {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      })
      const data = await response.json()
      return (
        data.items
          ?.filter((calendar: any) => !calendar.deleted && calendar.accessRole !== "freeBusyReader")
          .map((calendar: any) => ({
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
        "https://www.googleapis.com/drive/v3/files?q=mimeType='application/vnd.google-apps.folder' and trashed=false&pageSize=100&orderBy=name",
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        },
      )
      const data = await response.json()
      return (
        data.files
          ?.filter((folder: any) => folder.name && folder.name !== "")
          .map((folder: any) => ({
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
        data.bases
          ?.filter((base: any) => base.name && !base.name.startsWith("Copy of"))
          .map((base: any) => ({
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
      const response = await fetch("https://api.trello.com/1/members/me/boards?filter=open&limit=50", {
        headers: {
          Authorization: `OAuth oauth_consumer_key="${process.env.NEXT_PUBLIC_TRELLO_CLIENT_ID}", oauth_token="${accessToken}"`,
        },
      })
      const data = await response.json()
      return (
        data
          ?.filter((board: any) => !board.closed && board.name)
          .map((board: any) => ({
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
      const response = await fetch(
        "https://api.github.com/user/repos?per_page=100&sort=updated&affiliation=owner,collaborator",
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        },
      )
      const data = await response.json()
      return (
        data
          ?.filter((repo: any) => !repo.archived && !repo.disabled)
          .map((repo: any) => ({
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
        data.results
          ?.filter((pipeline: any) => !pipeline.archived)
          .map((pipeline: any) => ({
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
        data.value
          ?.filter((team: any) => team.displayName)
          .map((team: any) => ({
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

      const response = await fetch(`https://${dc}.api.mailchimp.com/3.0/lists?count=100`, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      })
      const data = await response.json()
      return (
        data.lists
          ?.filter((list: any) => list.name && !list.name.startsWith("Test"))
          .map((list: any) => ({
            id: list.id,
            name: list.name,
            value: list.id,
          })) || []
      )

    default:
      return []
  }
}
