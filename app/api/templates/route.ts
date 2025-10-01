import { createSupabaseServerClient } from "@/utils/supabase/server"
import { cookies } from "next/headers"
import { type NextRequest, NextResponse } from "next/server"

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

    let query = supabase
      .from("templates")
      .select(`
        *
      `)
      .eq("is_public", true)
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1)

    if (category && category !== "all") {
      query = query.eq("category", category)
    }

    if (search) {
      query = query.or(`name.ilike.%${search}%,description.ilike.%${search}%`)
    }

    const { data: templates, error } = await query

    if (error) {
      console.error("Error fetching templates:", error)
      return NextResponse.json({ error: "Failed to fetch templates" }, { status: 500 })
    }

    return NextResponse.json({ templates })
  } catch (error) {
    console.error("Error in GET /api/templates:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
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
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 })
    }

    const { name, description, workflow_json, category, tags, is_public } = await request.json()

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
      console.log(`Template creation: Filtered ${workflow_json.nodes.length - filteredNodes.length} placeholder nodes`)
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
      })
      .select()
      .single()

    if (error) {
      console.error("Error creating template:", error)
      return NextResponse.json({ error: "Failed to create template" }, { status: 500 })
    }

    return NextResponse.json({ template })
  } catch (error) {
    console.error("Error in POST /api/templates:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
