import { createSupabaseServerClient } from "@/utils/supabase/server"
import { cookies } from "next/headers"
import { type NextRequest, NextResponse } from "next/server"
import { jsonResponse, errorResponse, successResponse } from '@/lib/utils/api-response'

import { logger } from '@/lib/utils/logger'

export async function GET(request: NextRequest) {
  try {
    cookies()
    const supabase = await createSupabaseServerClient()
    const { searchParams } = new URL(request.url)

    const category = searchParams.get("category")
    const search = searchParams.get("search")
    const page = Number.parseInt(searchParams.get("page") || "1")
    const limit = Number.parseInt(searchParams.get("limit") || "12")
    const offset = (page - 1) * limit
    const scope = searchParams.get("scope")

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser()

    let isAdmin = false
    if (user && !userError) {
      const { data: profile } = await supabase
        .from("user_profiles")
        .select("role")
        .eq("id", user.id)
        .maybeSingle()

      isAdmin = profile?.role === "admin"
    }

    const requestingAdminScope = scope === "admin"
    if (requestingAdminScope && !isAdmin) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    let query = supabase
      .from("templates")
      .select(`
        *
      `)
      .order("updated_at", { ascending: false })
      .range(offset, offset + limit - 1)

    if (!requestingAdminScope) {
      query = query.eq("is_public", true)
    }

    if (category && category !== "all") {
      query = query.eq("category", category)
    }

    if (search) {
      query = query.or(`name.ilike.%${search}%,description.ilike.%${search}%`)
    }

    const { data: templates, error } = await query

    if (error) {
      logger.error("Error fetching templates:", error)
      return errorResponse("Failed to fetch templates", 500)
    }

    const hydratedTemplates = (templates || []).map((template) => {
      const airtableSetup =
        typeof template.airtable_setup === "string"
          ? (() => {
              try {
                return JSON.parse(template.airtable_setup)
              } catch (parseError) {
                logger.error("Failed to parse airtable_setup for template", template.id, parseError)
                return null
              }
            })()
          : template.airtable_setup || null

      const integrationSetup =
        typeof template.integration_setup === "string"
          ? (() => {
              try {
                return JSON.parse(template.integration_setup)
              } catch (parseError) {
                logger.error("Failed to parse integration_setup for template", template.id, parseError)
                return null
              }
          })()
        : template.integration_setup || null

      const setupOverview =
        typeof template.setup_overview === "string"
          ? (() => {
              try {
                return JSON.parse(template.setup_overview)
              } catch (parseError) {
                logger.error("Failed to parse setup_overview for template", template.id, parseError)
                return null
              }
            })()
          : template.setup_overview || null

      const defaultFieldValues =
        typeof template.default_field_values === "string"
          ? (() => {
              try {
                return JSON.parse(template.default_field_values)
              } catch (parseError) {
                logger.error("Failed to parse default_field_values for template", template.id, parseError)
                return null
              }
            })()
          : template.default_field_values || null

      return {
        ...template,
        airtable_setup: airtableSetup,
        airtableSetup,
        integration_setup: integrationSetup,
        integrationSetup,
        setup_overview: setupOverview,
        setupOverview,
        default_field_values: defaultFieldValues,
        defaultFieldValues,
      }
    })

    return jsonResponse({ templates: hydratedTemplates })
  } catch (error) {
    logger.error("Error in GET /api/templates:", error)
    return errorResponse("Internal server error" , 500)
  }
}

export async function POST(request: NextRequest) {
  try {
    cookies()
    const supabase = await createSupabaseServerClient()
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser()

    if (userError || !user) {
      return errorResponse("Not authenticated" , 401)
    }

    const {
      name,
      description,
      workflow_json,
      category,
      tags,
      is_public,
      airtable_setup,
      integration_setup,
      primary_setup_target,
      setup_overview,
      default_field_values,
      status,
    } = await request.json()

    // Filter out UI-only placeholder nodes if workflow_json contains nodes
    let cleanedWorkflowJson = workflow_json
    if (workflow_json && workflow_json.nodes) {
      const filteredNodes = workflow_json.nodes.filter((node: any) => {
        const nodeType = node.data?.type || node.type
        const hasAddButton = node.data?.hasAddButton
        const isPlaceholder = node.data?.isPlaceholder

        // Remove addAction, insertAction, and chain placeholder nodes
        return nodeType !== 'addAction'
          && nodeType !== 'insertAction'
          && nodeType !== 'chain_placeholder'
          && !hasAddButton
          && !isPlaceholder
      })
      cleanedWorkflowJson = {
        ...workflow_json,
        nodes: filteredNodes
      }
      logger.debug(`Template creation: Filtered ${workflow_json.nodes.length - filteredNodes.length} placeholder nodes`)
    }

    const { data: template, error } = await supabase
      .from("templates")
      .insert({
        name,
        description,
        workflow_json: cleanedWorkflowJson,
        category,
        tags,
        is_public: is_public || false,
        created_by: user.id,
        airtable_setup,
        integration_setup,
        primary_setup_target,
        setup_overview,
        default_field_values,
        status: status || 'draft',
      })
      .select()
      .single()

    if (error) {
      logger.error("Error creating template:", error)
      return errorResponse("Failed to create template", 500)
    }

    const parsedAirtableSetup =
      typeof template?.airtable_setup === "string"
        ? (() => {
            try {
              return JSON.parse(template.airtable_setup)
            } catch (parseError) {
              logger.error("Failed to parse airtable_setup after creation", parseError)
              return null
            }
          })()
        : template?.airtable_setup || null

    const parsedIntegrationSetup =
      typeof template?.integration_setup === "string"
        ? (() => {
            try {
              return JSON.parse(template.integration_setup)
            } catch (parseError) {
              logger.error("Failed to parse integration_setup after creation", parseError)
              return null
            }
          })()
        : template?.integration_setup || null

    const parsedSetupOverview =
      typeof template?.setup_overview === "string"
        ? (() => {
            try {
              return JSON.parse(template.setup_overview)
            } catch (parseError) {
              logger.error("Failed to parse setup_overview after creation", parseError)
              return null
            }
          })()
        : template?.setup_overview || null

    const parsedDefaultFieldValues =
      typeof template?.default_field_values === "string"
        ? (() => {
            try {
              return JSON.parse(template.default_field_values)
            } catch (parseError) {
              logger.error("Failed to parse default_field_values after creation", parseError)
              return null
            }
          })()
        : template?.default_field_values || null

    return jsonResponse({
      template: {
        ...template,
        airtable_setup: parsedAirtableSetup,
        airtableSetup: parsedAirtableSetup,
        integration_setup: parsedIntegrationSetup,
        integrationSetup: parsedIntegrationSetup,
        setup_overview: parsedSetupOverview,
        setupOverview: parsedSetupOverview,
        default_field_values: parsedDefaultFieldValues,
        defaultFieldValues: parsedDefaultFieldValues,
      }
    })
  } catch (error) {
    logger.error("Error in POST /api/templates:", error)
    return errorResponse("Internal server error" , 500)
  }
}
