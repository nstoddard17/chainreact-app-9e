import { NextRequest, NextResponse } from "next/server"
import { createSupabaseRouteHandlerClient } from "@/utils/supabase/server"
import { logger } from "@/lib/utils/logger"

export async function GET(request: NextRequest) {
  try {
    const supabase = await createSupabaseRouteHandlerClient()

    // Authenticate user
    const { data: { user }, error: userError } = await supabase.auth.getUser()

    if (userError || !user) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      )
    }

    // Fetch conversations for the user
    const { data: conversations, error } = await supabase
      .from('ai_conversations')
      .select('id, title, preview, created_at, updated_at')
      .eq('user_id', user.id)
      .order('updated_at', { ascending: false })
      .limit(50)

    if (error) {
      // Check if table doesn't exist - return empty array instead of error
      if (error.code === '42P01' || error.message?.includes('does not exist')) {
        logger.warn("ai_conversations table does not exist yet - returning empty array")
        return NextResponse.json({ conversations: [] })
      }

      logger.error("Error fetching conversations:", error)
      return NextResponse.json(
        { error: "Failed to fetch conversations" },
        { status: 500 }
      )
    }

    return NextResponse.json({ conversations: conversations || [] })

  } catch (error) {
    logger.error("Error in conversations API:", error)
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  try {
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
    const { id, title, preview, messages } = body

    // Validate UUID format if id is provided
    const isValidUUID = id && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)

    // Insert or update conversation
    const upsertData: any = {
      user_id: user.id,
      title,
      preview,
      messages,
    }

    // Only include id if it's a valid UUID (for updates)
    if (isValidUUID) {
      upsertData.id = id
    }

    const { data, error } = await supabase
      .from('ai_conversations')
      .upsert(upsertData)
      .select()
      .single()

    if (error) {
      logger.error("Error saving conversation:", error)
      return NextResponse.json(
        { error: "Failed to save conversation" },
        { status: 500 }
      )
    }

    return NextResponse.json({ conversation: data })

  } catch (error) {
    logger.error("Error in conversation save API:", error)
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    )
  }
}
