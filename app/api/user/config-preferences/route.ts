import { NextRequest, NextResponse } from "next/server"
import { jsonResponse, errorResponse, successResponse } from '@/lib/utils/api-response'
import { createSupabaseServerClient } from "@/utils/supabase/server"

import { logger } from '@/lib/utils/logger'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const nodeType = searchParams.get("nodeType")
    const providerId = searchParams.get("providerId")

    const supabase = await createSupabaseServerClient()
    
    // Get current user
    const { data: { user }, error: userError } = await supabase.auth.getUser()
    if (userError || !user) {
      return errorResponse("Unauthorized" , 401)
    }

    // Build query
    let query = supabase
      .from("user_config_preferences")
      .select("*")
      .eq("user_id", user.id)

    if (nodeType) {
      query = query.eq("node_type", nodeType)
    }

    if (providerId) {
      query = query.eq("provider_id", providerId)
    }

    const { data, error } = await query

    if (error) {
      logger.error("Error fetching config preferences:", error)
      return errorResponse("Failed to fetch preferences" , 500)
    }

    // Convert to a more usable format
    const preferences: Record<string, any> = {}
    data?.forEach(pref => {
      if (!preferences[pref.node_type]) {
        preferences[pref.node_type] = {}
      }
      
      // Convert value based on field type
      let value = pref.field_value
      if (pref.field_type === "boolean") {
        value = pref.field_value === "true"
      } else if (pref.field_type === "number") {
        value = parseFloat(pref.field_value || "0")
      } else if (pref.field_type === "array") {
        try {
          value = JSON.parse(pref.field_value || "[]")
        } catch {
          value = []
        }
      } else if (pref.field_type === "object") {
        try {
          value = JSON.parse(pref.field_value || "{}")
        } catch {
          value = {}
        }
      }
      
      preferences[pref.node_type][pref.field_name] = value
    })

    return jsonResponse({ preferences })
  } catch (error) {
    logger.error("Error in config preferences GET:", error)
    return errorResponse("Internal server error" , 500)
  }
}

export async function POST(request: NextRequest) {
  try {
    const { nodeType, providerId, preferences } = await request.json()

    if (!nodeType || !providerId || !preferences) {
      return errorResponse("Missing required fields" , 400)
    }

    const supabase = await createSupabaseServerClient()
    
    // Get current user
    const { data: { user }, error: userError } = await supabase.auth.getUser()
    if (userError || !user) {
      return errorResponse("Unauthorized" , 401)
    }

    // Prepare preferences for insertion/update
    const preferencesToSave = Object.entries(preferences).map(([fieldName, fieldValue]) => {
      let fieldType = "string"
      let value = String(fieldValue)
      
      if (typeof fieldValue === "boolean") {
        fieldType = "boolean"
        value = String(fieldValue)
      } else if (typeof fieldValue === "number") {
        fieldType = "number"
        value = String(fieldValue)
      } else if (Array.isArray(fieldValue)) {
        fieldType = "array"
        value = JSON.stringify(fieldValue)
      } else if (typeof fieldValue === "object" && fieldValue !== null) {
        fieldType = "object"
        value = JSON.stringify(fieldValue)
      }

      return {
        user_id: user.id,
        node_type: nodeType,
        provider_id: providerId,
        field_name: fieldName,
        field_value: value,
        field_type: fieldType
      }
    })

    // Use upsert to handle both insert and update
    const { data, error } = await supabase
      .from("user_config_preferences")
      .upsert(preferencesToSave, {
        onConflict: "user_id,node_type,field_name"
      })
      .select()

    if (error) {
      logger.error("Error saving config preferences:", error)
      return errorResponse("Failed to save preferences" , 500)
    }

    return jsonResponse({ success: true, data })
  } catch (error) {
    logger.error("Error in config preferences POST:", error)
    return errorResponse("Internal server error" , 500)
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const nodeType = searchParams.get("nodeType")
    const providerId = searchParams.get("providerId")
    const fieldName = searchParams.get("fieldName")

    const supabase = await createSupabaseServerClient()
    
    // Get current user
    const { data: { user }, error: userError } = await supabase.auth.getUser()
    if (userError || !user) {
      return errorResponse("Unauthorized" , 401)
    }

    // Build delete query
    let query = supabase
      .from("user_config_preferences")
      .delete()
      .eq("user_id", user.id)

    if (nodeType) {
      query = query.eq("node_type", nodeType)
    }

    if (providerId) {
      query = query.eq("provider_id", providerId)
    }

    if (fieldName) {
      query = query.eq("field_name", fieldName)
    }

    const { error } = await query

    if (error) {
      logger.error("Error deleting config preferences:", error)
      return errorResponse("Failed to delete preferences" , 500)
    }

    return jsonResponse({ success: true })
  } catch (error) {
    logger.error("Error in config preferences DELETE:", error)
    return errorResponse("Internal server error" , 500)
  }
} 