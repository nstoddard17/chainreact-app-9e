import { NextRequest, NextResponse } from "next/server"
import { jsonResponse, errorResponse, successResponse } from '@/lib/utils/api-response'
import { createSupabaseRouteHandlerClient } from "@/utils/supabase/server"

import { logger } from '@/lib/utils/logger'

/**
 * API to save/retrieve user's HubSpot field preferences
 * This allows users to configure which fields appear in their create contact forms
 */

// GET - Retrieve user's field preferences
export async function GET(request: NextRequest) {
  try {
    const supabase = await createSupabaseRouteHandlerClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return errorResponse("Unauthorized" , 401)
    }

    // Get user's HubSpot field preferences
    const { data: preferences, error } = await supabase
      .from("user_preferences")
      .select("hubspot_contact_fields")
      .eq("user_id", user.id)
      .single()

    if (error || !preferences) {
      // Return default fields if no preferences exist
      return jsonResponse({
        fields: [
          "firstname",
          "lastname",
          "email",
          "phone",
          "company",
          "jobtitle",
          "hs_lead_status",
          "lifecyclestage"
        ]
      })
    }

    return jsonResponse({
      fields: preferences.hubspot_contact_fields || []
    })

  } catch (error: any) {
    logger.error("Error fetching HubSpot field preferences:", error)
    return errorResponse("Internal server error" , 500)
  }
}

// POST - Save user's field preferences
export async function POST(request: NextRequest) {
  try {
    const supabase = await createSupabaseRouteHandlerClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return errorResponse("Unauthorized" , 401)
    }

    const body = await request.json()
    const { fields } = body

    if (!fields || !Array.isArray(fields)) {
      return errorResponse("Invalid fields array" , 400)
    }

    // Upsert user preferences
    const { error } = await supabase
      .from("user_preferences")
      .upsert({
        user_id: user.id,
        hubspot_contact_fields: fields,
        updated_at: new Date().toISOString()
      }, {
        onConflict: 'user_id'
      })

    if (error) {
      logger.error("Error saving preferences:", error)
      return errorResponse("Failed to save preferences" , 500)
    }

    return jsonResponse({
      success: true,
      message: "HubSpot field preferences saved successfully",
      fields: fields
    })

  } catch (error: any) {
    logger.error("Error saving HubSpot field preferences:", error)
    return errorResponse("Internal server error" , 500)
  }
}