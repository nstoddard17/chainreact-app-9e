import { NextRequest, NextResponse } from "next/server"
import { createClient } from '@supabase/supabase-js'

import { logger } from '@/lib/utils/logger'

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
      logger.error('Error fetching users:', usersError)
      return errorResponse('Failed to fetch users' , 500)
    }

    // Fetch usage data for all users
    const userUsagePromises = users.map(async (user) => {
      // Note: ai_usage_budgets table doesn't exist, using default budget
      // This can be implemented later with proper subscription/plan management
      const monthlyBudget = 10.00 // Default budget

      // Get usage stats from ai_cost_logs table
      const [todayStats, monthStats, allTimeStats] = await Promise.all([
        // Today
        supabase
          .from('ai_cost_logs')
          .select('input_tokens, output_tokens, cost')
          .eq('user_id', user.id)
          .gte('created_at', startOfToday.toISOString()),

        // This month
        supabase
          .from('ai_cost_logs')
          .select('input_tokens, output_tokens, cost')
          .eq('user_id', user.id)
          .gte('created_at', startOfMonth.toISOString())
          .lte('created_at', endOfMonth.toISOString()),

        // All time
        supabase
          .from('ai_cost_logs')
          .select('input_tokens, output_tokens, cost')
          .eq('user_id', user.id)
      ])

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

      const todayTotals = calculateTotals(todayStats.data)
      const monthTotals = calculateTotals(monthStats.data)
      const allTimeTotals = calculateTotals(allTimeStats.data)

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
          enforcement_mode: 'soft' // Default enforcement mode
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

    return jsonResponse({
      users: userUsageData,
      stats
    })
    
  } catch (error) {
    logger.error("Error fetching admin AI usage:", error)
    return errorResponse("Internal server error" , 500)
  }
}