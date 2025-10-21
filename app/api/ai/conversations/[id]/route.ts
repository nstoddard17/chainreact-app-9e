import { NextRequest, NextResponse } from "next/server"
import { createSupabaseRouteHandlerClient } from "@/utils/supabase/server"
import { logger } from "@/lib/utils/logger"

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const supabase = await createSupabaseRouteHandlerClient()

    // Authenticate user
    const { data: { user }, error: userError } = await supabase.auth.getUser()

    if (userError || !user) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      )
    }

    // Fetch the conversation
    const { data: conversation, error: convError } = await supabase
      .from('ai_conversations')
      .select('id, title, messages, created_at, updated_at')
      .eq('id', id)
      .eq('user_id', user.id)
      .single()

    if (convError || !conversation) {
      logger.error("Error fetching conversation:", convError)
      return NextResponse.json(
        { error: "Conversation not found" },
        { status: 404 }
      )
    }

    return NextResponse.json({
      id: conversation.id,
      title: conversation.title,
      messages: conversation.messages || [],
      created_at: conversation.created_at,
      updated_at: conversation.updated_at
    })

  } catch (error) {
    logger.error("Error in conversation API:", error)
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    )
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const supabase = await createSupabaseRouteHandlerClient()

    // Authenticate user
    const { data: { user }, error: userError } = await supabase.auth.getUser()

    if (userError || !user) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      )
    }

    const body = await request.json()
    const { messages } = body

    // Update the conversation
    const { data, error } = await supabase
      .from('ai_conversations')
      .update({
        messages,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .eq('user_id', user.id)
      .select()
      .single()

    if (error || !data) {
      logger.error("Error updating conversation:", error)
      return NextResponse.json(
        { error: "Failed to update conversation" },
        { status: 500 }
      )
    }

    return NextResponse.json({ conversation: data })

  } catch (error) {
    logger.error("Error in conversation update API:", error)
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    )
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const supabase = await createSupabaseRouteHandlerClient()

    // Authenticate user
    const { data: { user }, error: userError } = await supabase.auth.getUser()

    if (userError || !user) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      )
    }

    // Delete the conversation
    const { error } = await supabase
      .from('ai_conversations')
      .delete()
      .eq('id', id)
      .eq('user_id', user.id)

    if (error) {
      logger.error("Error deleting conversation:", error)
      return NextResponse.json(
        { error: "Failed to delete conversation" },
        { status: 500 }
      )
    }

    return NextResponse.json({ success: true })

  } catch (error) {
    logger.error("Error in conversation delete API:", error)
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    )
  }
}
