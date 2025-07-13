import { NextResponse } from "next/server"
import { createSupabaseRouteHandlerClient } from "@/utils/supabase/server"
import { getGoogleContacts, getEnhancedGoogleContacts } from "@/lib/integrations/gmail"
import { cookies } from "next/headers"

export async function POST(req: Request) {
  cookies()
  const supabase = await createSupabaseRouteHandlerClient()
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser()

  if (userError || !user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 })
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
      .eq("user_id", user.id)
      .single()

    if (error || !integration) {
      return NextResponse.json({ error: "Integration not found" }, { status: 404 })
    }

    const contacts = await getEnhancedGoogleContacts(integration.access_token)
    return NextResponse.json(contacts)
  } catch (error) {
    return NextResponse.json({ error: "Failed to load contacts" }, { status: 500 })
  }
}
