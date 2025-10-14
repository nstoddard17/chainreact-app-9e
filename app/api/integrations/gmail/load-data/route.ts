import { NextResponse } from "next/server"
import { jsonResponse, errorResponse, successResponse } from '@/lib/utils/api-response'
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
    return errorResponse("Not authenticated" , 401)
  }

  const { integrationId } = await req.json()

  if (!integrationId) {
    return errorResponse("Integration ID is required" , 400)
  }

  try {
    const { data: integration, error } = await supabase
      .from("integrations")
      .select("access_token")
      .eq("id", integrationId)
      .eq("user_id", user.id)
      .single()

    if (error || !integration) {
      return errorResponse("Integration not found" , 404)
    }

    const contacts = await getEnhancedGoogleContacts(integration.access_token)
    return jsonResponse(contacts)
  } catch (error) {
    return errorResponse("Failed to load contacts" , 500)
  }
}
