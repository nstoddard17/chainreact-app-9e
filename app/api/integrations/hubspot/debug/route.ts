import { type NextRequest, NextResponse } from "next/server"
import { jsonResponse, errorResponse, successResponse } from '@/lib/utils/api-response'
import { createClient } from "@supabase/supabase-js"

import { logger } from '@/lib/utils/logger'

// Use direct Supabase client with service role for reliable database operations
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseKey = process.env.SUPABASE_SECRET_KEY

if (!supabaseUrl || !supabaseKey) {
  throw new Error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY must be defined")
}

const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    persistSession: false,
  },
})

export async function GET(request: NextRequest) {
  try {
    // Get the user ID from the query parameter
    const userId = request.nextUrl.searchParams.get("userId")

    if (!userId) {
      return errorResponse("User ID is required" , 400)
    }

    // Get the HubSpot integration for this user
    const { data: integration, error } = await supabase
      .from("integrations")
      .select("*")
      .eq("user_id", userId)
      .eq("provider", "hubspot")
      .maybeSingle()

    if (error) {
      return errorResponse(error.message , 500)
    }

    if (!integration) {
      return errorResponse("HubSpot integration not found for this user" , 404)
    }

    // Return the integration details with sensitive data redacted
    return jsonResponse({
      provider: integration.provider,
      provider_user_id: integration.provider_user_id,
      status: integration.status,
      scopes: integration.scopes || [],
      has_access_token: !!integration.access_token,
      has_refresh_token: !!integration.refresh_token,
      expires_at: integration.expires_at,
      created_at: integration.created_at,
      updated_at: integration.updated_at,
      metadata: integration.metadata,
    })
  } catch (error: any) {
    logger.error("HubSpot debug error:", error)
    return errorResponse(error.message , 500)
  }
}
