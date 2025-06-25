import { NextResponse } from "next/server"
import { createSupabaseRouteHandlerClient } from "@/utils/supabase/server"
import { getGoogleCalendars } from "@/lib/integrations/google-calendar"
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

  const { integrationId } = await req.json()

  if (!integrationId) {
    return NextResponse.json({ error: "Integration ID is required" }, { status: 400 })
  }

  try {
    const { data: integration, error } = await supabase
      .from("integrations")
      .select("access_token")
      .eq("id", integrationId)
      .eq("user_id", session.user.id)
      .single()

    if (error || !integration) {
      return NextResponse.json({ error: "Integration not found" }, { status: 404 })
    }

    const calendars = await getGoogleCalendars(integration.access_token)
    return NextResponse.json(calendars)
  } catch (error) {
    return NextResponse.json({ error: "Failed to load calendars" }, { status: 500 })
  }
}
