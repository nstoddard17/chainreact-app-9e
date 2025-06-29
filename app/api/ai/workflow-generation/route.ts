import { NextRequest, NextResponse } from "next/server"
import { createSupabaseServerClient } from "@/utils/supabase/server"
import { cookies } from "next/headers"

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

    const { prompt, workflowId } = await request.json()

    if (!prompt) {
      return NextResponse.json({ error: "Prompt is required" }, { status: 400 })
    }

    // For now, return a simple response
    // In a real implementation, you'd call an AI service here
    const generatedWorkflow = {
      nodes: [
        {
          id: "trigger",
          type: "custom",
          position: { x: 400, y: 100 },
          data: {
            type: "trigger-example",
            name: "Example Trigger",
            isTrigger: true,
          },
        },
      ],
      connections: [],
    }

    return NextResponse.json({ workflow: generatedWorkflow })
  } catch (error) {
    console.error("Workflow generation error:", error)
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
    console.error("Template fetch error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
