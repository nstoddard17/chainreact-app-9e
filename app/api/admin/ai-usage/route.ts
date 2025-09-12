import { NextRequest, NextResponse } from "next/server"
import { createClient } from '@supabase/supabase-js'

// Initialize Supabase with service role for admin access
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function GET(request: NextRequest) {
  try {
    // TODO: Add proper admin authentication check here
    // For now, this is a placeholder - you should verify the user is an admin
    
    // Get current month dates
    const now = new Date()
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)
    const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59)
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate())

    // Fetch all users with their usage data
    const { data: users, error: usersError } = await supabase
      .from('user_profiles')
      .select('id, email, username')

    if (usersError) {
      console.error('Error fetching users:', usersError)
      return NextResponse.json({ error: 'Failed to fetch users' }, { status: 500 })
    }

    // Fetch usage data for all users
    const userUsagePromises = users.map(async (user) => {
      // Get user's budget
      const { data: budget } = await supabase
        .from('ai_usage_budgets')
        .select('monthly_budget_usd, current_usage_usd, enforcement_mode')
        .eq('user_id', user.id)
        .eq('is_active', true)
        .gte('budget_period_end', now.toISOString())
        .single()

      // Get usage stats
      const [todayStats, monthStats, allTimeStats] = await Promise.all([
        // Today
        supabase
          .from('ai_usage_records')
          .select('total_tokens, cost_usd')
          .eq('user_id', user.id)
          .gte('created_at', startOfToday.toISOString())
          .eq('status', 'completed'),
        
        // This month
        supabase
          .from('ai_usage_records')
          .select('total_tokens, cost_usd')
          .eq('user_id', user.id)
          .gte('created_at', startOfMonth.toISOString())
          .lte('created_at', endOfMonth.toISOString())
          .eq('status', 'completed'),
        
        // All time
        supabase
          .from('ai_usage_records')
          .select('total_tokens, cost_usd')
          .eq('user_id', user.id)
          .eq('status', 'completed')
      ])

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

      const todayTotals = calculateTotals(todayStats.data)
      const monthTotals = calculateTotals(monthStats.data)
      const allTimeTotals = calculateTotals(allTimeStats.data)

      const monthlyBudget = budget?.monthly_budget_usd || 10.00
      const usagePercent = Math.round((monthTotals.cost_usd / monthlyBudget) * 100)

      return {
        user_id: user.id,
        email: user.email || 'Unknown',
        username: user.username || '',
        today: todayTotals,
        current_month: monthTotals,
        all_time: allTimeTotals,
        budget: {
          monthly_limit_usd: monthlyBudget,
          usage_percent: usagePercent,
          enforcement_mode: budget?.enforcement_mode || 'soft'
        }
      }
    })

    const userUsageData = await Promise.all(userUsagePromises)

    // Calculate aggregate statistics
    const stats = {
      total_users: userUsageData.length,
      active_users_today: userUsageData.filter(u => u.today.requests > 0).length,
      total_cost_today: userUsageData.reduce((sum, u) => sum + u.today.cost_usd, 0),
      total_cost_month: userUsageData.reduce((sum, u) => sum + u.current_month.cost_usd, 0),
      users_over_75_percent: userUsageData.filter(u => u.budget.usage_percent >= 75).length,
      users_over_90_percent: userUsageData.filter(u => u.budget.usage_percent >= 90).length,
      users_at_limit: userUsageData.filter(u => u.budget.usage_percent >= 100).length
    }

    return NextResponse.json({
      users: userUsageData,
      stats
    })
    
  } catch (error) {
    console.error("Error fetching admin AI usage:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}