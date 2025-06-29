import { NextRequest, NextResponse } from "next/server"
import { createSupabaseServerClient } from "@/utils/supabase/server"
import { cookies } from "next/headers"

export async function POST(request: NextRequest) {
  try {
    cookies()
    const supabase = await createSupabaseServerClient()
    
    // Get authenticated user
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser()

    if (userError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { eventType, eventData, integrationId } = await request.json()

    if (!eventType) {
      return NextResponse.json({ error: "Event type is required" }, { status: 400 })
    }

    // Log the integration event
    const { error } = await supabase.from("integration_audit_log").insert({
      user_id: user.id,
      event_type: eventType,
      event_data: eventData || {},
      integration_id: integrationId,
      timestamp: new Date().toISOString(),
    })

    if (error) {
      console.error("Error logging integration event:", error)
      return NextResponse.json({ error: "Failed to log event" }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Audit log error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
