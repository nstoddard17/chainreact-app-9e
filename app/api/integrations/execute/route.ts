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

    const { integrationId, action, params } = await request.json()

    // Get integration details
    const { data: integration, error } = await supabase
      .from("integrations")
      .select("*")
      .eq("id", integrationId)
      .eq("user_id", session.user.id)
      .single()

    if (error || !integration) {
      return NextResponse.json({ error: "Integration not found" }, { status: 404 })
    }

    if (integration.status !== "connected") {
      return NextResponse.json({ error: "Integration not connected" }, { status: 400 })
    }

    let result

    switch (integration.provider) {
      case "slack":
        result = await executeSlackAction(integration, action, params)
        break
      case "google-calendar":
        result = await executeGoogleCalendarAction(integration, action, params)
        break
      case "google-sheets":
        result = await executeGoogleSheetsAction(integration, action, params)
        break
      case "discord":
        result = await executeDiscordAction(integration, action, params)
        break
      default:
        return NextResponse.json({ error: "Unsupported provider" }, { status: 400 })
    }

    return NextResponse.json({ success: true, result })
  } catch (error) {
    console.error("Integration execution error:", error)
    return NextResponse.json({ error: "Execution failed" }, { status: 500 })
  }
}

async function executeSlackAction(integration: any, action: string, params: any) {
  switch (action) {
    case "send_message":
      const response = await fetch("https://slack.com/api/chat.postMessage", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${integration.access_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          channel: params.channel,
          text: params.message,
        }),
      })
      return await response.json()
    default:
      throw new Error(`Unsupported Slack action: ${action}`)
  }
}

async function executeGoogleCalendarAction(integration: any, action: string, params: any) {
  switch (action) {
    case "create_event":
      const response = await fetch("https://www.googleapis.com/calendar/v3/calendars/primary/events", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${integration.access_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          summary: params.title,
          start: {
            dateTime: params.start_time,
            timeZone: params.timezone || "UTC",
          },
          end: {
            dateTime: params.end_time,
            timeZone: params.timezone || "UTC",
          },
        }),
      })
      return await response.json()
    default:
      throw new Error(`Unsupported Google Calendar action: ${action}`)
  }
}

async function executeGoogleSheetsAction(integration: any, action: string, params: any) {
  switch (action) {
    case "append_row":
      const response = await fetch(
        `https://sheets.googleapis.com/v4/spreadsheets/${params.spreadsheet_id}/values/${params.sheet_name}:append?valueInputOption=RAW`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${integration.access_token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            values: [params.values],
          }),
        },
      )
      return await response.json()
    default:
      throw new Error(`Unsupported Google Sheets action: ${action}`)
  }
}

async function executeDiscordAction(integration: any, action: string, params: any) {
  switch (action) {
    case "send_message":
      const response = await fetch(`https://discord.com/api/v10/channels/${params.channel_id}/messages`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${integration.access_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          content: params.message,
        }),
      })
      return await response.json()
    default:
      throw new Error(`Unsupported Discord action: ${action}`)
  }
}
