import { NextRequest, NextResponse } from "next/server"
import { createSupabaseServerClient } from "@/utils/supabase/server"
import { cookies } from "next/headers"
import { generateWorkflowFromPrompt } from "@/lib/ai/workflowGenerator"

import { logger } from '@/lib/utils/logger'

export async function POST(request: NextRequest) {
  try {
    logger.debug("🔍 Workflow generation API called")
    cookies()
    const supabase = await createSupabaseServerClient()
    
    // Get authenticated user
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser()

    if (userError || !user) {
      logger.debug("❌ Authentication failed:", userError)
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    logger.debug("✅ User authenticated:", user.id)
    const { prompt, workflowId } = await request.json()

    if (!prompt) {
      logger.debug("❌ No prompt provided")
      return NextResponse.json({ error: "Prompt is required" }, { status: 400 })
    }

    logger.debug("📝 Generating workflow for prompt:", prompt)

    // Generate workflow using AI
    const result = await generateWorkflowFromPrompt(prompt)

    logger.debug("🤖 AI generation result:", result)

    if (!result.success || !result.workflow) {
      logger.debug("❌ AI generation failed:", result.error)
      return NextResponse.json({ 
        error: result.error || "Failed to generate workflow" 
      }, { status: 500 })
    }

    logger.debug("✅ AI generation successful, saving to database")

    // If a workflowId is provided, update the existing workflow
    if (workflowId) {
      const { data: workflow, error: updateError } = await supabase
        .from("workflows")
        .update({
          name: result.workflow.name,
          description: result.workflow.description,
          nodes: result.workflow.nodes,
          connections: result.workflow.connections,
          updated_at: new Date().toISOString(),
        })
        .eq("id", workflowId)
        .select()
        .single()

      if (updateError) {
        logger.error("❌ Database update error:", updateError)
        return NextResponse.json({ error: "Failed to update workflow" }, { status: 500 })
      }

      logger.debug("✅ Workflow updated successfully")
      return NextResponse.json({ 
        success: true,
        workflow,
        confidence: result.confidence,
        message: "Workflow updated successfully"
      })
    }

    // Create new workflow
    const { data: workflow, error: createError } = await supabase
      .from("workflows")
      .insert({
        name: result.workflow.name,
        description: result.workflow.description,
        user_id: user.id,
        nodes: result.workflow.nodes,
        connections: result.workflow.connections,
        status: "draft",
      })
      .select()
      .single()

    if (createError) {
      logger.error("❌ Database create error:", createError)
      return NextResponse.json({ error: "Failed to create workflow" }, { status: 500 })
    }

    logger.debug("✅ Workflow created successfully:", workflow.id)
    return NextResponse.json({ 
      success: true,
      workflow,
      confidence: result.confidence,
      message: "Workflow created successfully"
    })
  } catch (error) {
    logger.error("❌ Workflow generation error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

export async function GET(request: NextRequest) {
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

    // Return available workflow templates
    const templates = [
      {
        id: "email-to-slack",
        name: "Email to Slack",
        description: "Send email notifications to Slack",
        category: "Communication",
      },
      {
        id: "calendar-reminder",
        name: "Calendar Reminder",
        description: "Create calendar reminders from form submissions",
        category: "Productivity",
      },
    ]

    return NextResponse.json({ templates })
  } catch (error) {
    logger.error("Template fetch error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
