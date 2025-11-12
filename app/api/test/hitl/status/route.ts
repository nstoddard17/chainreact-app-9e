import { NextResponse } from "next/server"

import { createSupabaseServiceClient } from "@/utils/supabase/server"

export async function GET() {
  try {
    const supabase = await createSupabaseServiceClient()

    const { data, error } = await supabase
      .from("hitl_conversations")
      .select("*")
      .order("started_at", { ascending: false })
      .limit(20)

    if (error) {
      throw error
    }

    const conversations = (data || []).map((conversation) => ({
      id: conversation.id,
      status: conversation.status,
      workflowId: conversation.workflow_id,
      executionId: conversation.execution_id,
      nodeId: conversation.node_id,
      userId: conversation.user_id,
      channelType: conversation.channel_type,
      channelId: conversation.channel_id,
      guildId: conversation.guild_id,
      timeoutAt: conversation.timeout_at,
      timeoutMinutes: conversation.timeout_minutes,
      timeoutAction: conversation.timeout_action,
      startedAt: conversation.started_at,
      updatedAt: conversation.updated_at,
      continuationSignals: conversation.continuation_signals || [],
      extractVariables: conversation.extract_variables || {},
      contextData: conversation.context_data,
      lastMessage: Array.isArray(conversation.conversation_history)
        ? conversation.conversation_history[conversation.conversation_history.length - 1]
        : null,
      history: conversation.conversation_history || [],
    }))

    return NextResponse.json({ conversations })
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || "Failed to load HITL status" },
      { status: 500 }
    )
  }
}
