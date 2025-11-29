import { NextRequest, NextResponse } from "next/server"
import { jsonResponse, errorResponse, successResponse } from '@/lib/utils/api-response'
import { requireAdmin } from '@/lib/utils/admin-auth'
import { logger } from '@/lib/utils/logger'

export async function GET(request: NextRequest) {
  const authResult = await requireAdmin()
  if (!authResult.isAdmin) {
    return authResult.response
  }
  const { serviceClient: supabase } = authResult

  try {
    const { searchParams } = new URL(request.url)
    const days = parseInt(searchParams.get("days") || "30", 10)
    const tierFilter = searchParams.get("tier") || "all"

    // Calculate date range
    const endDate = new Date()
    const startDate = new Date()
    startDate.setDate(startDate.getDate() - days)

    // Build query based on tier filter
    let userQuery = supabase
      .from("user_profiles")
      .select("id, email, role")

    if (tierFilter !== "all") {
      userQuery = userQuery.eq("role", tierFilter)
    }

    const { data: users, error: usersError } = await userQuery

    if (usersError) {
      logger.error("Error fetching users:", usersError)
      return errorResponse("Failed to fetch users", 500)
    }

    // Get usage stats for each user
    const usagePromises = users?.map(async (user) => {
      const { data: logs, error: logsError } = await supabase
        .from("ai_cost_logs")
        .select("cost, input_tokens, output_tokens, created_at")
        .eq("user_id", user.id)
        .gte("created_at", startDate.toISOString())
        .lte("created_at", endDate.toISOString())

      if (logsError) {
        return { ...user, usage: null, error: logsError.message }
      }

      const totalCost = logs?.reduce((sum, log) => sum + (parseFloat(log.cost) || 0), 0) || 0
      const totalTokens = logs?.reduce((sum, log) => sum + ((log.input_tokens || 0) + (log.output_tokens || 0)), 0) || 0

      return {
        ...user,
        usage: {
          totalCost,
          totalTokens,
          requestCount: logs?.length || 0
        }
      }
    }) || []

    const usersWithUsage = await Promise.all(usagePromises)

    // Calculate aggregate stats
    const aggregateStats = {
      totalUsers: usersWithUsage.length,
      totalCost: usersWithUsage.reduce((sum, u) => sum + (u.usage?.totalCost || 0), 0),
      totalTokens: usersWithUsage.reduce((sum, u) => sum + (u.usage?.totalTokens || 0), 0),
      totalRequests: usersWithUsage.reduce((sum, u) => sum + (u.usage?.requestCount || 0), 0),
      activeUsers: usersWithUsage.filter(u => (u.usage?.requestCount || 0) > 0).length
    }

    return jsonResponse({
      users: usersWithUsage,
      stats: aggregateStats,
      dateRange: {
        start: startDate.toISOString(),
        end: endDate.toISOString()
      }
    })

  } catch (error: any) {
    logger.error("Error fetching AI usage stats:", error)
    return errorResponse("Internal server error", 500)
  }
}
