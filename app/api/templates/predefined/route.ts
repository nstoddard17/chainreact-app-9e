import { NextResponse } from "next/server"
import { createSupabaseServerClient } from "@/utils/supabase/server"
import { cookies } from "next/headers"

export async function GET(request: Request) {
  try {
    cookies()
    const supabase = await createSupabaseServerClient()

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
      return NextResponse.json({
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
      console.error("Error fetching templates from database:", error)
      return NextResponse.json(
        { error: "Failed to fetch templates" },
        { status: 500 }
      )
    }

    // Transform templates to match the expected format
    // Keep the original structure since workflow_json might already exist
    const formattedTemplates = (templates || []).map(template => {
      // If template already has workflow_json, use it as-is
      // Otherwise, create it from nodes/connections
      const result = {
        ...template,
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

    return NextResponse.json({
      templates: formattedTemplates,
      count: formattedTemplates.length
    })
  } catch (error) {
    console.error("Error fetching predefined templates:", error)
    return NextResponse.json(
      { error: "Failed to fetch templates" },
      { status: 500 }
    )
  }
}