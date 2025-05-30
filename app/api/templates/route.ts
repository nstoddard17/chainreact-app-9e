import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs"
import { cookies } from "next/headers"
import { type NextRequest, NextResponse } from "next/server"
import { z } from "zod"

const templateSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  category: z.string().optional(),
  tags: z.array(z.string()).optional(),
  nodes: z.array(z.any()),
  connections: z.array(z.any()),
  variables: z.object({}).optional(),
  configuration: z.object({}).optional(),
  is_public: z.boolean().optional(),
  organization_id: z.string().uuid().optional(),
})

export async function GET(request: NextRequest) {
  try {
    const supabase = createRouteHandlerClient({ cookies })
    const { searchParams } = new URL(request.url)

    const category = searchParams.get("category")
    const search = searchParams.get("search")
    const featured = searchParams.get("featured") === "true"
    const page = Number.parseInt(searchParams.get("page") || "1")
    const limit = Number.parseInt(searchParams.get("limit") || "12")
    const offset = (page - 1) * limit

    let query = supabase
      .from("workflow_templates")
      .select(`
        *,
        author:auth.users!workflow_templates_author_id_fkey(email),
        organization:organizations(name, slug),
        reviews:template_reviews(rating)
      `)
      .eq("is_public", true)
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1)

    if (category) {
      query = query.eq("category", category)
    }

    if (search) {
      query = query.or(`name.ilike.%${search}%,description.ilike.%${search}%`)
    }

    if (featured) {
      query = query.eq("is_featured", true)
    }

    const { data: templates, error } = await query

    if (error) {
      console.error("Error fetching templates:", error)
      return NextResponse.json({ error: "Failed to fetch templates" }, { status: 500 })
    }

    return NextResponse.json(templates)
  } catch (error) {
    console.error("Error in GET /api/templates:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = createRouteHandlerClient({ cookies })
    const {
      data: { session },
    } = await supabase.auth.getSession()

    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const body = await request.json()
    const templateData = templateSchema.parse(body)

    // If organization_id is provided, check if user is a member
    if (templateData.organization_id) {
      const { data: membership } = await supabase
        .from("organization_members")
        .select("role")
        .eq("organization_id", templateData.organization_id)
        .eq("user_id", session.user.id)
        .single()

      if (!membership) {
        return NextResponse.json({ error: "Not a member of this organization" }, { status: 403 })
      }
    }

    const { data: template, error } = await supabase
      .from("workflow_templates")
      .insert({
        ...templateData,
        author_id: session.user.id,
      })
      .select()
      .single()

    if (error) {
      console.error("Error creating template:", error)
      return NextResponse.json({ error: "Failed to create template" }, { status: 500 })
    }

    return NextResponse.json(template)
  } catch (error) {
    console.error("Error in POST /api/templates:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
