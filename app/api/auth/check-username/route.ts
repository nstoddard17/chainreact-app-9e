import { createSupabaseRouteHandlerClient } from "@/utils/supabase/server"
import { NextResponse } from "next/server"
import { jsonResponse, errorResponse, successResponse } from '@/lib/utils/api-response'

import { logger } from '@/lib/utils/logger'

export async function POST(request: Request) {
  try {
    const { username } = await request.json()

    if (!username) {
      return errorResponse("Username is required" , 400)
    }

    const supabase = await createSupabaseRouteHandlerClient()

    // Check if username already exists
    const { data, error } = await supabase
      .from("user_profiles")
      .select("username")
      .eq("username", username)
      .single()

    if (error) {
      // PGRST116 means no rows found, which is what we want
      if (error.code === "PGRST116") {
        return jsonResponse({ exists: false })
      }
      
      logger.error("Error checking username:", error)
      return errorResponse("Failed to check username" , 500)
    }

    // If data exists, username is taken
    return jsonResponse({ exists: true })
  } catch (error) {
    logger.error("Error in check-username route:", error)
    return errorResponse("Internal server error" , 500)
  }
}
