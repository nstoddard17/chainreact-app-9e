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

    const { message } = await request.json()

    if (!message) {
      return NextResponse.json({ error: "Message is required" }, { status: 400 })
    }

    // For now, return a simple response
    // In a real implementation, you'd call an AI service here
    const response = {
      content: `I received your message: "${message}". This is a placeholder response.`,
      metadata: {
        timestamp: new Date().toISOString(),
        userId: user.id,
      },
    }

    // Save chat history
    await supabase.from("ai_chat_history").insert({
      user_id: user.id,
      message,
      response: response.content,
      timestamp: new Date().toISOString(),
    })

    return NextResponse.json(response)
  } catch (error) {
    console.error("AI chat error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
