import { type NextRequest, NextResponse } from "next/server"
import { createSupabaseServerClient } from "@/utils/supabase/server"
import { cookies } from "next/headers"
import { TokenAuditLogger } from "@/lib/integrations/TokenAuditLogger"

export async function POST(request: NextRequest) {
  try {
    cookies()
    const supabase = createSupabaseServerClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { integrationId, provider, eventType, details } = await request.json()

    if (!integrationId || !provider || !eventType) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 })
    }

    // Log the event using TokenAuditLogger (server-side)
    const result = await TokenAuditLogger.logEvent(
      integrationId,
      user.id,
      provider,
      eventType,
      details || {}
    )

    if (!result) {
      return NextResponse.json({ error: "Failed to log event" }, { status: 500 })
    }

    return NextResponse.json({ success: true, eventId: result })
  } catch (error: any) {
    console.error("Error logging integration event:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
