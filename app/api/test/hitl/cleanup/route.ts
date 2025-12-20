import { NextResponse } from "next/server"
import { createSupabaseServiceClient } from "@/utils/supabase/server"

/**
 * POST /api/test/hitl/cleanup
 * Clean up stale HITL conversations - keep only the most recent per channel
 */
export async function POST() {
  try {
    const supabase = await createSupabaseServiceClient()

    // Get all active conversations grouped by channel
    const { data: allActive, error: fetchError } = await supabase
      .from("hitl_conversations")
      .select("id, channel_id, status, started_at")
      .eq("status", "active")
      .order("started_at", { ascending: false })

    if (fetchError) {
      throw fetchError
    }

    // Group by channel and find stale ones (all but the most recent per channel)
    const channelMap = new Map<string, typeof allActive>()
    for (const conv of allActive || []) {
      const existing = channelMap.get(conv.channel_id) || []
      existing.push(conv)
      channelMap.set(conv.channel_id, existing)
    }

    const staleIds: string[] = []
    for (const [channelId, conversations] of channelMap) {
      // Keep the first one (most recent), mark the rest as stale
      if (conversations.length > 1) {
        for (let i = 1; i < conversations.length; i++) {
          staleIds.push(conversations[i].id)
        }
      }
    }

    // Mark stale conversations as cancelled
    let cancelledCount = 0
    if (staleIds.length > 0) {
      // Use 'completed' status since the constraint might not include 'cancelled'
      const { error: updateError } = await supabase
        .from("hitl_conversations")
        .update({ status: "completed", completed_at: new Date().toISOString() })
        .in("id", staleIds)

      if (updateError) {
        throw updateError
      }
      cancelledCount = staleIds.length
    }

    return NextResponse.json({
      success: true,
      message: `Cleaned up ${cancelledCount} stale conversations`,
      totalActive: allActive?.length || 0,
      cancelledCount,
      cancelledIds: staleIds
    })
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || "Cleanup failed" },
      { status: 500 }
    )
  }
}
