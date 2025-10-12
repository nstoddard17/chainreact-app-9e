import { NextRequest, NextResponse } from "next/server"
import { createSupabaseServerClient } from "@/utils/supabase/server"

import { logger } from '@/lib/utils/logger'

/**
 * API to save/retrieve user's HubSpot field preferences
 * This allows users to configure which fields appear in their create contact forms
 */

// GET - Retrieve user's field preferences
export async function GET(request: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // Get user's HubSpot field preferences
    const { data: preferences, error } = await supabase
      .from("user_preferences")
      .select("hubspot_contact_fields")
      .eq("user_id", user.id)
      .single()

    if (error || !preferences) {
      // Return default fields if no preferences exist
      return NextResponse.json({
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

    return NextResponse.json({
      fields: preferences.hubspot_contact_fields || []
    })

  } catch (error: any) {
    logger.error("Error fetching HubSpot field preferences:", error)
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    )
  }
}

// POST - Save user's field preferences
export async function POST(request: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const body = await request.json()
    const { fields } = body

    if (!fields || !Array.isArray(fields)) {
      return NextResponse.json(
        { error: "Invalid fields array" },
        { status: 400 }
      )
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
      return NextResponse.json(
        { error: "Failed to save preferences" },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      message: "HubSpot field preferences saved successfully",
      fields: fields
    })

  } catch (error: any) {
    logger.error("Error saving HubSpot field preferences:", error)
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    )
  }
}