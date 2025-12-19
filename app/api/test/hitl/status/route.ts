import { NextResponse } from "next/server"
import { NextRequest } from "next/server"

import { createSupabaseServiceClient } from "@/utils/supabase/server"

export async function GET(request: NextRequest) {
  try {
    const supabase = await createSupabaseServiceClient()
    const { searchParams } = new URL(request.url)
    const channelId = searchParams.get('channelId')

    // Check if table exists by querying it
    let tableExists = true
    let tableError: string | null = null

    const { data, error } = await supabase
      .from("hitl_conversations")
      .select("*")
      .order("started_at", { ascending: false })
      .limit(20)

    if (error) {
      tableExists = false
      tableError = error.message
    }

    // If channelId is provided, do a focused lookup
    let channelLookup: any = null
    if (channelId) {
      const { data: channelData, error: channelError } = await supabase
        .from("hitl_conversations")
        .select("*")
        .eq("channel_id", channelId)

      channelLookup = {
        channelId,
        found: channelData?.length || 0,
        conversations: channelData?.map(c => ({
          id: c.id,
          status: c.status,
          executionId: c.execution_id,
          createdAt: c.created_at
        })) || [],
        error: channelError?.message
      }
    }

    // Get workflow executions with 'paused' status
    const { data: pausedExecutions, error: execError } = await supabase
      .from("workflow_executions")
      .select("id, workflow_id, status, paused_node_id, paused_at, created_at")
      .eq("status", "paused")
      .order("created_at", { ascending: false })
      .limit(10)

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
      contextData: conversation.context_data?.substring(0, 200),
      lastMessage: Array.isArray(conversation.conversation_history)
        ? conversation.conversation_history[conversation.conversation_history.length - 1]
        : null,
      historyLength: conversation.conversation_history?.length || 0,
    }))

    return NextResponse.json({
      tableExists,
      tableError,
      conversationCount: conversations.length,
      conversations,
      pausedExecutions: pausedExecutions || [],
      executionsError: execError?.message,
      channelLookup,
      debug: {
        timestamp: new Date().toISOString(),
        tip: "Add ?channelId=xxx to lookup a specific channel"
      }
    })
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || "Failed to load HITL status", tableExists: false },
      { status: 500 }
    )
  }
}
