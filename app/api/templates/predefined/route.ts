import { NextResponse } from "next/server"
import { jsonResponse, errorResponse, successResponse } from '@/lib/utils/api-response'
import { createSupabaseRouteHandlerClient } from "@/utils/supabase/server"
import { cookies } from "next/headers"

import { logger } from '@/lib/utils/logger'

export async function GET(request: Request) {
  try {
    cookies()
    const supabase = await createSupabaseRouteHandlerClient()

    const { searchParams } = new URL(request.url)
    const category = searchParams.get("category")
    const search = searchParams.get("search")

    // Check if templates table exists and has is_predefined column
    const { data: checkTable, error: checkError } = await supabase
      .from("templates")
      .select("*")
      .limit(1)

    if (checkError && checkError.code === '42P01') {
      // Table doesn't exist
      return jsonResponse({
        templates: [],
        count: 0,
        message: "Templates table not yet created. Please run the migration."
      })
    }

    let query = supabase
      .from("templates")
      .select("*")
      .eq("is_public", true)

    // Only filter by is_predefined if the column exists
    if (!checkError || checkError.code !== '42703') {
      query = query.eq("is_predefined", true)
    }

    // Filter by category if provided
    if (category && category !== "all") {
      query = query.eq("category", category)
    }

    // Filter by search query if provided
    if (search) {
      query = query.or(`name.ilike.%${search}%,description.ilike.%${search}%`)
    }

    const { data: templates, error } = await query

    if (error) {
      logger.error("Error fetching templates from database:", error)
      return errorResponse("Failed to fetch templates" , 500)
    }

    // Transform templates to match the expected format
    // Keep the original structure since workflow_json might already exist
    const formattedTemplates = (templates || []).map(template => {
      const airtableSetup =
        typeof template.airtable_setup === "string"
          ? (() => {
              try {
                return JSON.parse(template.airtable_setup)
              } catch (error) {
                console.error("Failed to parse airtable_setup for template", template.id, error)
                return null
              }
            })()
          : template.airtable_setup || null

      const integrationSetup =
        typeof template.integration_setup === "string"
          ? (() => {
              try {
                return JSON.parse(template.integration_setup)
              } catch (error) {
                console.error("Failed to parse integration_setup for template", template.id, error)
                return null
              }
            })()
          : template.integration_setup || null

      const setupOverview =
        typeof template.setup_overview === "string"
          ? (() => {
              try {
                return JSON.parse(template.setup_overview)
              } catch (error) {
                console.error("Failed to parse setup_overview for template", template.id, error)
                return null
              }
            })()
          : template.setup_overview || null

      const defaultFieldValues =
        typeof template.default_field_values === "string"
          ? (() => {
              try {
                return JSON.parse(template.default_field_values)
              } catch (error) {
                console.error("Failed to parse default_field_values for template", template.id, error)
                return null
              }
            })()
          : template.default_field_values || null

      // If template already has workflow_json, use it as-is
      // Otherwise, create it from nodes/connections
      const result = {
        ...template,
        airtable_setup: airtableSetup,
        airtableSetup: airtableSetup,
        integration_setup: integrationSetup,
        integrationSetup,
        setup_overview: setupOverview,
        setupOverview,
        default_field_values: defaultFieldValues,
        defaultFieldValues,
        creator: {
          email: "templates@chainreact.com"
        }
      }

      // Only add workflow_json if it doesn't exist
      if (!template.workflow_json && (template.nodes || template.connections)) {
        result.workflow_json = {
          nodes: template.nodes || [],
          edges: template.connections || []
        }
      }

      return result
    })

    return jsonResponse({
      templates: formattedTemplates,
      count: formattedTemplates.length
    })
  } catch (error) {
    logger.error("Error fetching predefined templates:", error)
    return errorResponse("Failed to fetch templates" , 500)
  }
}
