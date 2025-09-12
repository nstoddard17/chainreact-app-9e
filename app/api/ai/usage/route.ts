import { NextRequest, NextResponse } from "next/server"
import { createSupabaseServerClient } from "@/utils/supabase/server"
import { cookies } from "next/headers"

export async function GET(request: NextRequest) {
  try {
    const cookieStore = await cookies()
    const supabase = await createSupabaseServerClient()
    
    // Get authenticated user
    const { data: { user }, error: userError } = await supabase.auth.getUser()
    if (userError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // Get current month dates
    const now = new Date()
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)
    const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59)
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate())

    // Get current budget
    const { data: budget } = await supabase
      .from('ai_usage_budgets')
      .select('*')
      .eq('user_id', user.id)
      .eq('is_active', true)
      .gte('budget_period_end', now.toISOString())
      .single()

    // Get usage statistics for different periods
    const [monthStats, todayStats, allTimeStats] = await Promise.all([
      // This month
      supabase
        .from('ai_usage_records')
        .select('total_tokens, cost_usd')
        .eq('user_id', user.id)
        .gte('created_at', startOfMonth.toISOString())
        .lte('created_at', endOfMonth.toISOString())
        .eq('status', 'completed'),
      
      // Today
      supabase
        .from('ai_usage_records')
        .select('total_tokens, cost_usd')
        .eq('user_id', user.id)
        .gte('created_at', startOfToday.toISOString())
        .eq('status', 'completed'),
      
      // All time
      supabase
        .from('ai_usage_records')
        .select('total_tokens, cost_usd')
        .eq('user_id', user.id)
        .eq('status', 'completed')
    ])

    // Calculate totals
    const calculateTotals = (records: any[] | null) => {
      if (!records || records.length === 0) {
        return { requests: 0, tokens: 0, cost_usd: 0 }
      }
      return {
        requests: records.length,
        tokens: records.reduce((sum, r) => sum + (r.total_tokens || 0), 0),
        cost_usd: records.reduce((sum, r) => sum + (parseFloat(r.cost_usd) || 0), 0)
      }
    }

    const monthTotals = calculateTotals(monthStats.data)
    const todayTotals = calculateTotals(todayStats.data)
    const allTimeTotals = calculateTotals(allTimeStats.data)

    // Calculate usage percentage and remaining
    const monthlyBudget = budget?.monthly_budget_usd || 10.00
    const usagePercent = Math.round((monthTotals.cost_usd / monthlyBudget) * 100)
    const remainingBudget = Math.max(0, monthlyBudget - monthTotals.cost_usd)

    // Get recent usage for estimates (last 10 similar requests)
    const { data: recentUsage } = await supabase
      .from('ai_usage_records')
      .select('action, model, total_tokens')
      .eq('user_id', user.id)
      .eq('status', 'completed')
      .order('created_at', { ascending: false })
      .limit(10)

    // Calculate median tokens for estimates
    let estimatedRemainingUses = { min: 0, max: 0, confidence: 'low' as const }
    if (recentUsage && recentUsage.length > 0) {
      const tokens = recentUsage.map(r => r.total_tokens).sort((a, b) => a - b)
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

    // Get any active alerts
    const { data: alerts } = await supabase
      .from('ai_usage_alerts')
      .select('*')
      .eq('user_id', user.id)
      .eq('is_read', false)
      .order('created_at', { ascending: false })
      .limit(5)

    return NextResponse.json({
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
        enforcement_mode: budget?.enforcement_mode || 'soft'
      },
      today: todayTotals,
      all_time: allTimeTotals,
      alerts: alerts || [],
      thresholds: {
        warning: 75,
        alert: 90,
        hard_stop: 100
      }
    })
    
  } catch (error) {
    console.error("Error fetching AI usage:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}