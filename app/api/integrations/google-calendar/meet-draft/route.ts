import { NextResponse } from "next/server"
import { createSupabaseRouteHandlerClient } from "@/utils/supabase/server"
import { cookies } from "next/headers"

export async function POST(req: Request) {
  cookies()
  const supabase = await createSupabaseRouteHandlerClient()
  const {
    data: { session },
  } = await supabase.auth.getSession()

  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  // Get integration
  const { data: integration, error } = await supabase
    .from("integrations")
    .select("*")
    .eq("user_id", session.user.id)
    .eq("provider", "google-calendar")
    .eq("status", "connected")
    .single()

  if (error || !integration) {
    return NextResponse.json({ error: "Google Calendar integration not found" }, { status: 404 })
  }

  // Create a draft event with Meet link
  try {
    const eventData = {
      summary: "Google Meet (Draft)",
      conferenceData: {
        createRequest: {
          requestId: `meet_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          conferenceSolutionKey: { type: "hangoutsMeet" },
        },
      },
      start: { dateTime: new Date(Date.now() + 5 * 60 * 1000).toISOString(), timeZone: "UTC" },
      end: { dateTime: new Date(Date.now() + 10 * 60 * 1000).toISOString(), timeZone: "UTC" },
    }
    const url = `https://www.googleapis.com/calendar/v3/calendars/primary/events?conferenceDataVersion=1`;
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
      throw new Error(result.error?.message || "Failed to create draft event")
    }
    // Find the Meet link
    const entryPoints = result.conferenceData?.entryPoints || []
    const meetUrl = entryPoints.find((ep: any) => ep.entryPointType === "video")?.uri
    return NextResponse.json({ eventId: result.id, meetUrl })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

export async function DELETE(req: Request) {
  cookies()
  const supabase = await createSupabaseRouteHandlerClient()
  const {
    data: { session },
  } = await supabase.auth.getSession()

  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { eventId } = await req.json()
  if (!eventId) {
    return NextResponse.json({ error: "Missing eventId" }, { status: 400 })
  }

  // Get integration
  const { data: integration, error } = await supabase
    .from("integrations")
    .select("*")
    .eq("user_id", session.user.id)
    .eq("provider", "google-calendar")
    .eq("status", "connected")
    .single()

  if (error || !integration) {
    return NextResponse.json({ error: "Google Calendar integration not found" }, { status: 404 })
  }

  try {
    const url = `https://www.googleapis.com/calendar/v3/calendars/primary/events/${eventId}`
    const response = await fetch(url, {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${integration.access_token}`,
      },
    })
    if (!response.ok && response.status !== 410 && response.status !== 404) {
      throw new Error("Failed to delete draft event")
    }
    return NextResponse.json({ success: true })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
} 