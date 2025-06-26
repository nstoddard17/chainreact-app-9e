import { createSupabaseRouteHandlerClient } from "@/utils/supabase/server"
import { cookies } from "next/headers"
import { NextResponse } from "next/server"

export async function POST(request: Request) {
  cookies()
  const supabase = await createSupabaseRouteHandlerClient()

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
      // Build the event object with all the enhanced fields
      const eventData: any = {
        summary: params.title || params.summary,
        description: params.description || "",
        location: params.location || "",
      }

      // Handle time zone and dates
      const timeZone = params.timeZone || "UTC"
      
      if (params.allDay) {
        // All-day event uses date format
        const startDate = params.startTime ? new Date(params.startTime).toISOString().split('T')[0] : new Date().toISOString().split('T')[0]
        const endDate = params.endTime ? new Date(params.endTime).toISOString().split('T')[0] : new Date(Date.now() + 24*60*60*1000).toISOString().split('T')[0]
        
        eventData.start = { date: startDate }
        eventData.end = { date: endDate }
      } else {
        // Timed event uses dateTime format
        eventData.start = {
          dateTime: params.startTime || new Date().toISOString(),
          timeZone: timeZone,
        }
        eventData.end = {
          dateTime: params.endTime || new Date(Date.now() + 60*60*1000).toISOString(),
          timeZone: timeZone,
        }
      }

      // Add attendees if provided
      if (params.attendees) {
        const attendeeEmails: string[] = typeof params.attendees === 'string' 
          ? params.attendees.split(',').map((email: string) => email.trim()).filter((email: string) => email)
          : params.attendees
        
        if (attendeeEmails.length > 0) {
          eventData.attendees = attendeeEmails.map((email: string) => ({ 
            email: email,
            responseStatus: "needsAction"
          }))
        }
      }

      // Add recurrence if provided
      if (params.recurrence && params.recurrence.trim()) {
        eventData.recurrence = [params.recurrence.trim()]
      }

      // Add reminders
      if (params.reminderMinutes || params.reminderMethod) {
        const minutes = parseInt(params.reminderMinutes) || 15
        const method = params.reminderMethod || "popup"
        
        if (minutes > 0) {
          eventData.reminders = {
            useDefault: false,
            overrides: [{ method: method, minutes: minutes }]
          }
        } else {
          eventData.reminders = { useDefault: false, overrides: [] }
        }
      }

      // Add guest permissions
      if (params.guestsCanInviteOthers !== undefined) {
        eventData.guestsCanInviteOthers = params.guestsCanInviteOthers === true || params.guestsCanInviteOthers === "true"
      }
      if (params.guestsCanModify !== undefined) {
        eventData.guestsCanModify = params.guestsCanModify === true || params.guestsCanModify === "true"
      }
      if (params.guestsCanSeeOtherGuests !== undefined) {
        eventData.guestsCanSeeOtherGuests = params.guestsCanSeeOtherGuests === true || params.guestsCanSeeOtherGuests === "true"
      }

      // Add visibility and transparency
      if (params.visibility) {
        eventData.visibility = params.visibility
      }
      if (params.transparency) {
        eventData.transparency = params.transparency
      }

      // Add color
      if (params.colorId) {
        eventData.colorId = params.colorId
      }

      // Add event type
      if (params.eventType && params.eventType !== "default") {
        eventData.eventType = params.eventType
      }

      // Add Google Meet conference if requested
      if (params.createMeetLink === true || params.createMeetLink === "true") {
        eventData.conferenceData = {
          createRequest: {
            requestId: `meet_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            conferenceSolutionKey: { type: "hangoutsMeet" }
          }
        }
      }

      // Determine calendar and build request URL
      const calendarId = params.calendarId || "primary"
      let url = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`
      
      // Add query parameters
      const queryParams = []
      if (params.sendNotifications && params.sendNotifications !== "none") {
        queryParams.push(`sendUpdates=${params.sendNotifications}`)
      }
      if (params.createMeetLink) {
        queryParams.push("conferenceDataVersion=1")
      }
      if (queryParams.length > 0) {
        url += `?${queryParams.join('&')}`
      }

      const response = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${integration.access_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(eventData),
      })

      const result = await response.json()
      
      if (!response.ok) {
        throw new Error(`Google Calendar API error: ${result.error?.message || 'Unknown error'}`)
      }

      return result
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
