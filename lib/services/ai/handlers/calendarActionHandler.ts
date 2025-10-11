import { google, calendar_v3 } from "googleapis"
import { BaseActionHandler } from "./baseActionHandler"
import { IntentAnalysisResult, Integration } from "../aiIntentAnalysisService"
import { ActionExecutionResult } from "../aiActionExecutionService"
import { getDecryptedAccessToken } from "@/lib/integrations/getDecryptedAccessToken"

export class CalendarActionHandler extends BaseActionHandler {
  async handleQuery(
    intent: IntentAnalysisResult,
    integrations: Integration[],
    userId: string,
    supabaseAdmin: any
  ): Promise<ActionExecutionResult> {
    this.logHandlerStart("Calendar", intent)

    const calendarIntegrations = this.filterIntegrationsByProvider(integrations, ["google-calendar"])
    this.logIntegrationsFound("Calendar", calendarIntegrations)

    if (calendarIntegrations.length === 0) {
      return this.getNoIntegrationsResponse("calendar", "Google Calendar")
    }

    try {
      const parameters = intent.parameters || {}
      const calendarId = parameters.calendarId || "primary"
      const timeframe = parameters.timeframe || "week"

      const events = await this.fetchEvents(userId, calendarId, timeframe, parameters)

      return this.getSuccessResponse(
        `Found ${events.length} event${events.length === 1 ? "" : "s"} in your ${timeframe} window.`,
        {
          type: "calendar_query",
          timeframe,
          integrationsCount: calendarIntegrations.length,
          events
        }
      )
    } catch (error: any) {
      console.error("❌ Calendar query error:", error)
      return this.getErrorResponse("Failed to fetch calendar events. Please try again.")
    }
  }

  async handleAction(
    intent: IntentAnalysisResult,
    integrations: Integration[],
    userId: string,
    supabaseAdmin: any
  ): Promise<ActionExecutionResult> {
    this.logHandlerStart("Calendar Action", intent)

    const calendarIntegrations = this.filterIntegrationsByProvider(integrations, ["google-calendar"])
    this.logIntegrationsFound("Calendar", calendarIntegrations)

    if (calendarIntegrations.length === 0) {
      return this.getNoIntegrationsResponse("calendar", "Google Calendar")
    }

    try {
      const action = intent.action
      const parameters = intent.parameters || {}

      // Handle different calendar actions
      switch (action) {
        case "create_event":
          return this.handleCreateEvent(parameters, userId)
        case "cancel_event":
          return this.handleCancelEvent(parameters, userId)
        case "update_event":
          return this.handleUpdateEvent(parameters, userId)
        default:
          return this.getErrorResponse(`Calendar action "${action}" is not supported yet.`)
      }
    } catch (error: any) {
      console.error("❌ Calendar action error:", error)
      return this.getErrorResponse("Failed to perform calendar action. Please try again.")
    }
  }

  private async handleCreateEvent(parameters: any, userId: string): Promise<ActionExecutionResult> {
    const calendar = await this.getCalendarClient(userId)
    const calendarId = parameters.calendarId || "primary"
    const summary = parameters.title || parameters.summary || "Untitled Event"
    const description = parameters.description || parameters.agenda
    const timezone = parameters.timezone || "UTC"

    const { start, end, allDay } = this.parseEventTimes(parameters)

    const requestBody: any = {
      summary,
      description,
      location: parameters.location,
      start: allDay ? { date: start, timeZone: timezone } : { dateTime: start, timeZone: timezone },
      end: allDay ? { date: end, timeZone: timezone } : { dateTime: end, timeZone: timezone }
    }

    if (parameters.attendees) {
      const attendees = Array.isArray(parameters.attendees) ? parameters.attendees : [parameters.attendees]
      requestBody.attendees = attendees.filter(Boolean).map((email: string) => ({ email }))
    }

    const result = await calendar.events.insert({
      calendarId,
      requestBody,
      sendUpdates: parameters.notifyGuests ? "all" : "none"
    })

    return this.getSuccessResponse(
      `Created calendar event "${summary}".`,
      {
        type: "calendar_create_event",
        eventId: result.data.id,
        htmlLink: result.data.htmlLink,
        calendarId,
        summary,
        start,
        end
      }
    )
  }

  private async handleCancelEvent(parameters: any, userId: string): Promise<ActionExecutionResult> {
    const calendar = await this.getCalendarClient(userId)
    const calendarId = parameters.calendarId || "primary"

    const event = await this.resolveEvent(calendar, calendarId, parameters)
    if (!event) {
      return this.getErrorResponse("Could not find a matching event to cancel.")
    }

    await calendar.events.delete({
      calendarId,
      eventId: event.id as string,
      sendUpdates: parameters.notifyGuests ? "all" : "none"
    })

    return this.getSuccessResponse(
      `Cancelled event "${event.summary || event.id}".`,
      {
        type: "calendar_cancel_event",
        calendarId,
        eventId: event.id,
        summary: event.summary
      }
    )
  }

  private async handleUpdateEvent(parameters: any, userId: string): Promise<ActionExecutionResult> {
    const calendar = await this.getCalendarClient(userId)
    const calendarId = parameters.calendarId || "primary"

    const event = await this.resolveEvent(calendar, calendarId, parameters)
    if (!event) {
      return this.getErrorResponse("Could not find a matching event to update.")
    }

    const updates: any = {}

    if (parameters.title || parameters.summary) {
      updates.summary = parameters.title || parameters.summary
    }

    if (parameters.description) {
      updates.description = parameters.description
    }

    if (parameters.location) {
      updates.location = parameters.location
    }

    if (parameters.start || parameters.startTime || parameters.startDate || parameters.end || parameters.endTime || parameters.endDate) {
      const { start, end, allDay } = this.parseEventTimes({ ...event, ...parameters })
      const timezone = parameters.timezone || event.start?.timeZone || "UTC"
      updates.start = allDay ? { date: start, timeZone: timezone } : { dateTime: start, timeZone: timezone }
      updates.end = allDay ? { date: end, timeZone: timezone } : { dateTime: end, timeZone: timezone }
    }

    if (parameters.attendees) {
      const attendees = Array.isArray(parameters.attendees) ? parameters.attendees : [parameters.attendees]
      updates.attendees = attendees.filter(Boolean).map((email: string) => ({ email }))
    }

    const updatedEvent = await calendar.events.patch({
      calendarId,
      eventId: event.id as string,
      requestBody: updates,
      sendUpdates: parameters.notifyGuests ? "all" : "none"
    })

    return this.getSuccessResponse(
      `Updated event "${updatedEvent.data.summary || updatedEvent.data.id}".`,
      {
        type: "calendar_update_event",
        calendarId,
        eventId: updatedEvent.data.id,
        summary: updatedEvent.data.summary,
        start: updatedEvent.data.start,
        end: updatedEvent.data.end
      }
    )
  }

  private async fetchEvents(
    userId: string,
    calendarId: string,
    timeframe: string,
    parameters: Record<string, any>
  ) {
    const calendar = await this.getCalendarClient(userId)
    const { timeMin, timeMax } = this.getTimeWindow(timeframe, parameters)
    const response = await calendar.events.list({
      calendarId,
      timeMin,
      timeMax,
      singleEvents: true,
      orderBy: "startTime",
      maxResults: Number(parameters.limit || 20)
    })

    return response.data.items || []
  }

  private getTimeWindow(timeframe: string, parameters: Record<string, any>) {
    const now = new Date()
    const start = new Date(now)
    const end = new Date(now)

    switch (timeframe) {
      case "today":
        start.setHours(0, 0, 0, 0)
        end.setHours(23, 59, 59, 999)
        break
      case "tomorrow":
        start.setDate(start.getDate() + 1)
        start.setHours(0, 0, 0, 0)
        end.setDate(end.getDate() + 1)
        end.setHours(23, 59, 59, 999)
        break
      case "month":
        start.setDate(1)
        start.setHours(0, 0, 0, 0)
        end.setMonth(end.getMonth() + 1, 0)
        end.setHours(23, 59, 59, 999)
        break
      case "custom":
        if (parameters.startDate) {
          start.setTime(new Date(parameters.startDate).getTime())
        }
        if (parameters.endDate) {
          end.setTime(new Date(parameters.endDate).getTime())
        }
        break
      case "week":
      default:
        // upcoming 7 days
        end.setDate(end.getDate() + 7)
        break
    }

    return {
      timeMin: start.toISOString(),
      timeMax: end.toISOString()
    }
  }

  private parseEventTimes(parameters: any) {
    const timezone = parameters.timezone || "UTC"

    if (parameters.allDay || parameters.isAllDay) {
      const startDate = parameters.startDate || parameters.date || new Date().toISOString().split("T")[0]
      const endDate = parameters.endDate || startDate
      return { start: startDate, end: endDate, allDay: true }
    }

    const startDateTime = parameters.start || parameters.startDateTime || this.combineDateTime(
      parameters.startDate || parameters.date || new Date().toISOString().split("T")[0],
      parameters.startTime || parameters.time || "09:00",
      timezone
    )

    const endDateTime = parameters.end || parameters.endDateTime || this.combineDateTime(
      parameters.endDate || parameters.date || new Date().toISOString().split("T")[0],
      parameters.endTime || parameters.end || "10:00",
      timezone
    )

    return { start: startDateTime, end: endDateTime, allDay: false }
  }

  private combineDateTime(date: string, time: string, timezone: string) {
    if (!date) {
      const now = new Date()
      date = now.toISOString().split("T")[0]
    }

    if (!time) {
      time = "09:00"
    }

    const iso = new Date(`${date}T${time}:00`).toISOString()
    return iso
  }

  private async getCalendarClient(userId: string): Promise<calendar_v3.Calendar> {
    const accessToken = await getDecryptedAccessToken(userId, "google-calendar")
    const oauth2Client = new google.auth.OAuth2()
    oauth2Client.setCredentials({ access_token: accessToken })
    return google.calendar({ version: "v3", auth: oauth2Client })
  }

  private async resolveEvent(
    calendar: calendar_v3.Calendar,
    calendarId: string,
    parameters: any
  ) {
    if (parameters.eventId) {
      const { data } = await calendar.events.get({ calendarId, eventId: parameters.eventId })
      return data
    }

    const search = parameters.search || parameters.title || parameters.summary
    if (!search) return null

    const { items } = (await calendar.events.list({
      calendarId,
      q: search,
      maxResults: 5,
      singleEvents: true,
      orderBy: "startTime"
    })).data

    return items?.[0] || null
  }
}
