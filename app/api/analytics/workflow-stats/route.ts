import { NextRequest, NextResponse } from "next/server"
import { createSupabaseRouteHandlerClient } from "@/utils/supabase/server"
import { jsonResponse, errorResponse } from "@/lib/utils/api-response"

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    const supabase = await createSupabaseRouteHandlerClient()

    // Get current user
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return errorResponse("Unauthorized", 401)
    }

    // Get all user's workflows
    const { data: workflows, error: workflowsError } = await supabase
      .from('workflows')
      .select('id, name, status')
      .eq('user_id', user.id)

    if (workflowsError) {
      throw workflowsError
    }

    // Get execution stats for each workflow
    const stats: Record<string, { total: number; today: number; success: number; failed: number }> = {}

    const today = new Date()
    today.setHours(0, 0, 0, 0)

    for (const workflow of workflows || []) {
      // Get total executions
      const { count: totalCount } = await supabase
        .from('workflow_executions')
        .select('*', { count: 'exact', head: true })
        .eq('workflow_id', workflow.id)

      // Get today's executions
      const { count: todayCount } = await supabase
        .from('workflow_executions')
        .select('*', { count: 'exact', head: true })
        .eq('workflow_id', workflow.id)
        .gte('created_at', today.toISOString())

      // Get success count
      const { count: successCount } = await supabase
        .from('workflow_executions')
        .select('*', { count: 'exact', head: true })
        .eq('workflow_id', workflow.id)
        .eq('status', 'completed')

      // Get failed count
      const { count: failedCount } = await supabase
        .from('workflow_executions')
        .select('*', { count: 'exact', head: true })
        .eq('workflow_id', workflow.id)
        .eq('status', 'failed')

      stats[workflow.id] = {
        total: totalCount || 0,
        today: todayCount || 0,
        success: successCount || 0,
        failed: failedCount || 0
      }
    }

    return jsonResponse({ stats })
  } catch (error: any) {
    console.error('Error fetching workflow stats:', error)
    return errorResponse(error.message || "Failed to fetch workflow stats", 500)
  }
}
