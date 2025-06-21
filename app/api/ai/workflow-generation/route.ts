import { createSupabaseServerClient } from "@/utils/supabase/server"
import { cookies } from "next/headers"
import { type NextRequest, NextResponse } from "next/server"

export async function POST(request: NextRequest) {
  try {
    cookies()
    const supabase = createSupabaseServerClient()
    const {
      data: { session },
    } = await supabase.auth.getSession()

    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const body = await request.json()
    const { prompt, generated_workflow, confidence_score } = body

    const { data, error } = await supabase
      .from("ai_workflow_generations")
      .insert({
        user_id: session.user.id,
        prompt,
        generated_workflow,
        confidence_score,
        status: "generated",
      })
      .select()
      .single()

    if (error) throw error

    return NextResponse.json({ success: true, generation: data })
  } catch (error: any) {
    console.error("Error saving workflow generation:", error)
    return NextResponse.json({ error: "Failed to save workflow generation" }, { status: 500 })
  }
}

export async function GET(request: NextRequest) {
  try {
    cookies()
    const supabase = createSupabaseServerClient()
    const {
      data: { session },
    } = await supabase.auth.getSession()

    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { data, error } = await supabase
      .from("ai_workflow_generations")
      .select("*")
      .eq("user_id", session.user.id)
      .order("created_at", { ascending: false })
      .limit(20)

    if (error) throw error

    return NextResponse.json({ generations: data })
  } catch (error: any) {
    console.error("Error fetching workflow generations:", error)
    return NextResponse.json({ error: "Failed to fetch workflow generations" }, { status: 500 })
  }
}
