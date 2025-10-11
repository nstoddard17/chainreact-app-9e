import { NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const days = parseInt(searchParams.get("days") || "30", 10)
    const tierFilter = searchParams.get("tier") || "all"

    const supabase = createAdminClient()

    // Calculate date range
    const endDate = new Date()
    const startDate = new Date()
    startDate.setDate(startDate.getDate() - days)

    // Build query based on tier filter
    let userQuery = supabase
      .from("users")
      .select("id, email, role")

    if (tierFilter !== "all") {
      userQuery = userQuery.eq("role", tierFilter)
    }

    const { data: users, error: usersError } = await userQuery

    if (usersError) {
      throw usersError
    }

    const userIds = users.map(user => user.id)

    // Get usage data for the date range
    const { data: usageData, error: usageError } = await supabase
      .from("monthly_usage")
      .select("*")
      .in("user_id", userIds)
      .gte("created_at", startDate.toISOString())
      .lte("created_at", endDate.toISOString())

    if (usageError) {
      throw usageError
    }

    // Calculate statistics
    const totalUsers = users.length
    const activeUsers = usageData.filter(u => 
      (u.ai_assistant_calls || 0) + (u.ai_compose_uses || 0) + (u.ai_agent_executions || 0) > 0
    ).length

    const totalUsage = {
      ai_assistant_calls: usageData.reduce((sum, u) => sum + (u.ai_assistant_calls || 0), 0),
      ai_compose_uses: usageData.reduce((sum, u) => sum + (u.ai_compose_uses || 0), 0),
      ai_agent_executions: usageData.reduce((sum, u) => sum + (u.ai_agent_executions || 0), 0)
    }

    // Estimate cost (rough calculation based on OpenAI pricing)
    const estimatedCost = (
      totalUsage.ai_assistant_calls * 0.03 + // ~$0.03 per assistant call
      totalUsage.ai_compose_uses * 0.02 + // ~$0.02 per compose use
      totalUsage.ai_agent_executions * 0.05 // ~$0.05 per agent execution
    )

    // Group usage by tier
    const usageByTier = users.reduce((acc, user) => {
      const userUsage = usageData.find(u => u.user_id === user.id)
      const totalUserUsage = (userUsage?.ai_assistant_calls || 0) + 
                           (userUsage?.ai_compose_uses || 0) + 
                           (userUsage?.ai_agent_executions || 0)

      const tier = user.role || "free"
      if (!acc[tier]) {
        acc[tier] = { users: 0, totalUsage: 0, avgUsage: 0 }
      }
      acc[tier].users++
      acc[tier].totalUsage += totalUserUsage
      acc[tier].avgUsage = acc[tier].totalUsage / acc[tier].users

      return acc
    }, {} as Record<string, { users: number; totalUsage: number; avgUsage: number }>)

    // Get daily usage data
    const dailyUsage = []
    for (let i = 0; i < days; i++) {
      const date = new Date(startDate)
      date.setDate(date.getDate() + i)
      
      const dayUsage = usageData.filter(u => {
        const usageDate = new Date(u.created_at)
        return usageDate.toDateString() === date.toDateString()
      })

      dailyUsage.push({
        date: date.toISOString(),
        ai_assistant_calls: dayUsage.reduce((sum, u) => sum + (u.ai_assistant_calls || 0), 0),
        ai_compose_uses: dayUsage.reduce((sum, u) => sum + (u.ai_compose_uses || 0), 0),
        ai_agent_executions: dayUsage.reduce((sum, u) => sum + (u.ai_agent_executions || 0), 0)
      })
    }

    // Get top users by usage
    const topUsers = users.map(user => {
      const userUsage = usageData.find(u => u.user_id === user.id)
      const totalUserUsage = (userUsage?.ai_assistant_calls || 0) + 
                           (userUsage?.ai_compose_uses || 0) + 
                           (userUsage?.ai_agent_executions || 0)
      const userCost = (
        (userUsage?.ai_assistant_calls || 0) * 0.03 +
        (userUsage?.ai_compose_uses || 0) * 0.02 +
        (userUsage?.ai_agent_executions || 0) * 0.05
      )

      return {
        userId: user.id,
        email: user.email,
        tier: user.role || "free",
        totalUsage,
        cost: userCost
      }
    })
    .filter(user => user.totalUsage > 0)
    .sort((a, b) => b.totalUsage - a.totalUsage)
    .slice(0, 10)

    return NextResponse.json({
      totalUsers,
      activeUsers,
      totalUsage,
      estimatedCost,
      usageByTier: Object.entries(usageByTier).map(([tier, data]) => ({
        tier,
        ...data
      })),
      dailyUsage,
      topUsers
    })

  } catch (error) {
    console.error("Error fetching AI usage stats:", error)
    return NextResponse.json(
      { error: "Failed to fetch AI usage statistics" },
      { status: 500 }
    )
  }
} 