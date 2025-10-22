import { NextRequest, NextResponse } from "next/server"
import { createSupabaseRouteHandlerClient } from "@/utils/supabase/server"
import { cookies } from "next/headers"
import { jsonResponse, errorResponse } from '@/lib/utils/api-response'

import { logger } from '@/lib/utils/logger'

export async function GET(request: NextRequest) {
  try {
    const cookieStore = await cookies()
    const supabase = await createSupabaseRouteHandlerClient()
    
    // Get authenticated user
    const { data: { user }, error: userError } = await supabase.auth.getUser()
    if (userError || !user) {
      return errorResponse("Unauthorized" , 401)
    }

    // Get current month dates
    const now = new Date()
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)
    const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59)
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate())

    // Get usage statistics for different periods from ai_cost_logs
    const [monthStats, todayStats, allTimeStats] = await Promise.all([
      // This month
      supabase
        .from('ai_cost_logs')
        .select('input_tokens, output_tokens, cost')
        .eq('user_id', user.id)
        .gte('created_at', startOfMonth.toISOString())
        .lte('created_at', endOfMonth.toISOString()),

      // Today
      supabase
        .from('ai_cost_logs')
        .select('input_tokens, output_tokens, cost')
        .eq('user_id', user.id)
        .gte('created_at', startOfToday.toISOString()),

      // All time
      supabase
        .from('ai_cost_logs')
        .select('input_tokens, output_tokens, cost')
        .eq('user_id', user.id)
    ])

    // Calculate totals
    const calculateTotals = (records: any[] | null) => {
      if (!records || records.length === 0) {
        return { requests: 0, tokens: 0, cost_usd: 0 }
      }
      return {
        requests: records.length,
        tokens: records.reduce((sum, r) => sum + ((r.input_tokens || 0) + (r.output_tokens || 0)), 0),
        cost_usd: records.reduce((sum, r) => sum + (parseFloat(r.cost) || 0), 0)
      }
    }

    const monthTotals = calculateTotals(monthStats.data)
    const todayTotals = calculateTotals(todayStats.data)
    const allTimeTotals = calculateTotals(allTimeStats.data)

    // Calculate usage percentage and remaining (using a default budget of $10)
    const monthlyBudget = 10.00 // Default budget, can be made configurable later
    const usagePercent = Math.round((monthTotals.cost_usd / monthlyBudget) * 100)
    const remainingBudget = Math.max(0, monthlyBudget - monthTotals.cost_usd)

    // Get recent usage for estimates (last 10 similar requests)
    const { data: recentUsage } = await supabase
      .from('ai_cost_logs')
      .select('feature, model, input_tokens, output_tokens')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(10)

    // Calculate median tokens for estimates
    let estimatedRemainingUses = { min: 0, max: 0, confidence: 'low' as const }
    if (recentUsage && recentUsage.length > 0) {
      const tokens = recentUsage.map(r => (r.input_tokens || 0) + (r.output_tokens || 0)).sort((a, b) => a - b)
      const medianTokens = tokens[Math.floor(tokens.length / 2)]
      const avgCostPerRequest = monthTotals.cost_usd / monthTotals.requests

      if (avgCostPerRequest > 0) {
        const remainingRequests = Math.floor(remainingBudget / avgCostPerRequest)
        const variance = Math.max(...tokens) - Math.min(...tokens)
        const confidence = variance < medianTokens * 0.5 ? 'high' : variance < medianTokens ? 'medium' : 'low'

        estimatedRemainingUses = {
          min: Math.max(0, Math.floor(remainingRequests * 0.8)),
          max: Math.ceil(remainingRequests * 1.2),
          confidence
        }
      }
    }

    return jsonResponse({
      current_period: {
        start_date: startOfMonth.toISOString(),
        end_date: endOfMonth.toISOString(),
        total_requests: monthTotals.requests,
        total_tokens: monthTotals.tokens,
        total_cost_usd: monthTotals.cost_usd,
        budget_usd: monthlyBudget,
        remaining_budget_usd: remainingBudget,
        usage_percent: usagePercent,
        estimated_remaining_uses: estimatedRemainingUses,
        enforcement_mode: 'soft' // Default enforcement mode
      },
      today: todayTotals,
      all_time: allTimeTotals,
      alerts: [], // No alerts table exists yet
      thresholds: {
        warning: 75,
        alert: 90,
        hard_stop: 100
      }
    })
    
  } catch (error) {
    logger.error("Error fetching AI usage:", error)
    return errorResponse("Internal server error" , 500)
  }
}