import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/utils/supabase/server"

/**
 * GET /api/workflow-tags/settings
 * Get all tag color settings for the current user
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()

    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { data: settings, error } = await supabase
      .from("workflow_tag_settings")
      .select("*")
      .eq("user_id", user.id)
      .order("tag_name", { ascending: true })

    if (error) {
      console.error("[workflow-tags/settings] Error fetching settings:", error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ settings })
  } catch (error: any) {
    console.error("[workflow-tags/settings] Error:", error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

/**
 * POST /api/workflow-tags/settings
 * Create or update a tag color setting
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()

    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const body = await request.json()
    const { tag_name, color } = body

    if (!tag_name || !color) {
      return NextResponse.json(
        { error: "tag_name and color are required" },
        { status: 400 }
      )
    }

    // Upsert the tag setting
    const { data: setting, error } = await supabase
      .from("workflow_tag_settings")
      .upsert(
        {
          user_id: user.id,
          tag_name,
          color,
        },
        {
          onConflict: "user_id,tag_name",
        }
      )
      .select()
      .single()

    if (error) {
      console.error("[workflow-tags/settings] Error upserting setting:", error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ setting })
  } catch (error: any) {
    console.error("[workflow-tags/settings] Error:", error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
