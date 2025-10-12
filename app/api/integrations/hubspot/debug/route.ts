import { type NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"

import { logger } from '@/lib/utils/logger'

// Use direct Supabase client with service role for reliable database operations
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !supabaseKey) {
  throw new Error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be defined")
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
      return NextResponse.json({ error: "User ID is required" }, { status: 400 })
    }

    // Get the HubSpot integration for this user
    const { data: integration, error } = await supabase
      .from("integrations")
      .select("*")
      .eq("user_id", userId)
      .eq("provider", "hubspot")
      .maybeSingle()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    if (!integration) {
      return NextResponse.json({ error: "HubSpot integration not found for this user" }, { status: 404 })
    }

    // Return the integration details with sensitive data redacted
    return NextResponse.json({
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
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
