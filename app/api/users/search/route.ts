import { NextRequest, NextResponse } from "next/server"
import { jsonResponse, errorResponse } from '@/lib/utils/api-response'
import { createSupabaseRouteHandlerClient, createSupabaseServiceClient } from "@/utils/supabase/server"
import { logger } from '@/lib/utils/logger'

export async function GET(request: NextRequest) {
  try {
    const supabase = await createSupabaseRouteHandlerClient()
    const serviceClient = await createSupabaseServiceClient()

    // Get current user
    const { data: { user }, error: userError } = await supabase.auth.getUser()
    if (userError || !user) {
      return errorResponse("Unauthorized", 401)
    }

    const searchParams = request.nextUrl.searchParams
    const email = searchParams.get('email')

    if (!email) {
      return errorResponse("Email parameter is required", 400)
    }

    // Search for user by email in user_profiles
    const { data: userProfile, error: searchError } = await serviceClient
      .from("user_profiles")
      .select('id, email, full_name, username')
      .eq('email', email.toLowerCase())
      .single()

    if (searchError || !userProfile) {
      return errorResponse("User not found", 404)
    }

    return jsonResponse({ user: userProfile })
  } catch (error) {
    logger.error("Unexpected error searching for user:", error)
    return errorResponse("Internal server error", 500)
  }
}
