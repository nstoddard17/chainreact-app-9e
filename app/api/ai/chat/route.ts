import { createSupabaseServerClient } from "@/utils/supabase/server"
import { cookies } from "next/headers"
import { type NextRequest, NextResponse } from "next/server"
import { chatWithAI } from "@/lib/ai/workflowAI"

export async function POST(request: NextRequest) {
  try {
    cookies()
    const supabase = createSupabaseServerClient()
    const {
      data: { session },
      error: sessionError,
    } = await supabase.auth.getSession()

    if (sessionError || !session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { message, context } = await request.json()

    if (!message || typeof message !== "string") {
      return NextResponse.json({ error: "Message is required" }, { status: 400 })
    }

    // Get user's workflows for context (only their own due to RLS)
    const { data: userWorkflows } = await supabase.from("workflows").select("name, description, status").limit(10)

    // Enhance context with user's workflow data
    const enhancedContext = {
      ...context,
      userWorkflows: userWorkflows || [],
    }

    // Get AI response
    const response = await chatWithAI(message, enhancedContext)

    // Save chat history
    await supabase.from("ai_chat_history").insert({
      user_id: session.user.id,
      message,
      response,
      context: enhancedContext,
    })

    return NextResponse.json({
      success: true,
      response,
    })
  } catch (error: any) {
    console.error("Error in AI chat:", error)
    return NextResponse.json(
      {
        error: "Failed to get AI response",
        details: error.message,
      },
      { status: 500 },
    )
  }
}
