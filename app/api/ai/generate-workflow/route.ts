import { NextRequest, NextResponse } from "next/server"
import { createSupabaseServerClient } from "@/utils/supabase/server"
import { cookies } from "next/headers"
import { generateWorkflow } from "@/lib/ai/workflowAI"

export async function POST(request: NextRequest) {
  try {
    cookies()
    const supabase = await createSupabaseServerClient()
    
    // Get authenticated user
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser()

    if (userError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { prompt } = await request.json()

    if (!prompt) {
      return NextResponse.json({ error: "Prompt is required" }, { status: 400 })
    }

    // Generate workflow using AI
    const generatedWorkflow = await generateWorkflow({
      prompt,
      userId: user.id,
    })

    // Save the generated workflow to the database
    const { data: workflow, error: dbError } = await supabase
      .from("workflows")
      .insert({
        name: generatedWorkflow.name,
        description: generatedWorkflow.description,
        user_id: user.id,
        nodes: generatedWorkflow.nodes,
        connections: generatedWorkflow.connections,
        status: "draft",
      })
      .select()
      .single()

    if (dbError) {
      console.error("Database error:", dbError)
      return NextResponse.json({ error: "Failed to save workflow" }, { status: 500 })
    }

    // Log the AI generation
    await supabase.from("ai_workflow_generations").insert({
      user_id: user.id,
      prompt,
      generated_workflow: generatedWorkflow,
      confidence_score: 0.8,
      status: "generated",
    })

    return NextResponse.json({
      success: true,
      workflow,
      generated: generatedWorkflow,
    })
  } catch (error: any) {
    console.error("Error generating workflow:", error)
    return NextResponse.json(
      {
        error: "Failed to generate workflow",
        details: error.message,
      },
      { status: 500 },
    )
  }
}
