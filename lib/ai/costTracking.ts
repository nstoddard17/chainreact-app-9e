/**
 * AI Cost Tracking Utilities
 * 
 * Tracks the cost of AI operations based on token usage and API calls
 */

// OpenAI GPT-4 Pricing (as of 2024)
const OPENAI_PRICING = {
  "gpt-4": {
    input: 0.03,    // $0.03 per 1K input tokens
    output: 0.06    // $0.06 per 1K output tokens
  },
  "gpt-4-turbo": {
    input: 0.01,    // $0.01 per 1K input tokens
    output: 0.03    // $0.03 per 1K output tokens
  },
  "gpt-3.5-turbo": {
    input: 0.0015,  // $0.0015 per 1K input tokens
    output: 0.002   // $0.002 per 1K output tokens
  }
}

// Estimated costs per AI feature (based on average token usage)
const FEATURE_COSTS = {
  ai_assistant: {
    base_cost: 0.03,     // Base cost per call
    per_token: 0.00003,  // Additional cost per token
    avg_tokens: 1000     // Average tokens per assistant call
  },
  ai_compose: {
    base_cost: 0.02,     // Base cost per use
    per_token: 0.00002,  // Additional cost per token
    avg_tokens: 800      // Average tokens per compose use
  },
  ai_agent: {
    base_cost: 0.05,     // Base cost per execution
    per_token: 0.00005,  // Additional cost per token
    avg_tokens: 1500     // Average tokens per agent execution
  }
}

/**
 * Calculate the cost of an AI operation based on token usage
 */
export function calculateAICost(
  model: string = "gpt-4",
  inputTokens: number,
  outputTokens: number
): number {
  const pricing = OPENAI_PRICING[model as keyof typeof OPENAI_PRICING]
  if (!pricing) {
    throw new Error(`Unknown model: ${model}`)
  }

  const inputCost = (inputTokens / 1000) * pricing.input
  const outputCost = (outputTokens / 1000) * pricing.output
  
  return inputCost + outputCost
}

/**
 * Estimate the cost of an AI feature based on average usage
 */
export function estimateFeatureCost(
  feature: keyof typeof FEATURE_COSTS,
  customTokens?: number
): number {
  const featureCost = FEATURE_COSTS[feature]
  const tokens = customTokens || featureCost.avg_tokens
  
  return featureCost.base_cost + (tokens * featureCost.per_token)
}

/**
 * Track AI usage cost in the database
 */
export async function trackAICost(
  userId: string,
  feature: string,
  model: string,
  inputTokens: number,
  outputTokens: number,
  actualCost?: number
): Promise<void> {
  try {
    const { createAdminClient } = await import("@/lib/supabase/admin")
    const supabase = createAdminClient()
    
    const calculatedCost = calculateAICost(model, inputTokens, outputTokens)
    const cost = actualCost || calculatedCost

    // Insert cost record
    await supabase.from("ai_cost_logs").insert({
      user_id: userId,
      feature,
      model,
      input_tokens: inputTokens,
      output_tokens: outputTokens,
      cost,
      calculated_cost: calculatedCost,
      timestamp: new Date().toISOString()
    })

    // Update monthly cost tracking
    const currentDate = new Date()
    const year = currentDate.getFullYear()
    const month = currentDate.getMonth() + 1

    // Get or create monthly cost record
    const { data: existingCost } = await supabase
      .from("monthly_ai_costs")
      .select("*")
      .eq("user_id", userId)
      .eq("year", year)
      .eq("month", month)
      .single()

    if (existingCost) {
      // Update existing record
      await supabase
        .from("monthly_ai_costs")
        .update({
          total_cost: existingCost.total_cost + cost,
          total_tokens: existingCost.total_tokens + inputTokens + outputTokens,
          updated_at: new Date().toISOString()
        })
        .eq("id", existingCost.id)
    } else {
      // Create new record
      await supabase.from("monthly_ai_costs").insert({
        user_id: userId,
        year,
        month,
        total_cost: cost,
        total_tokens: inputTokens + outputTokens,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
    }

  } catch (error) {
    console.error("Failed to track AI cost:", error)
    // Don't throw error to avoid breaking the main functionality
  }
}

/**
 * Get AI cost statistics for a user
 */
export async function getUserAICosts(
  userId: string,
  days: number = 30
): Promise<{
  totalCost: number
  totalTokens: number
  costByFeature: Record<string, number>
  dailyCosts: Array<{ date: string; cost: number }>
}> {
  try {
    const { createAdminClient } = await import("@/lib/supabase/admin")
    const supabase = createAdminClient()
    
    const startDate = new Date()
    startDate.setDate(startDate.getDate() - days)

    // Get cost logs
    const { data: costLogs } = await supabase
      .from("ai_cost_logs")
      .select("*")
      .eq("user_id", userId)
      .gte("timestamp", startDate.toISOString())
      .order("timestamp", { ascending: true })

    if (!costLogs) {
      return {
        totalCost: 0,
        totalTokens: 0,
        costByFeature: {},
        dailyCosts: []
      }
    }

    // Calculate totals
    const totalCost = costLogs.reduce((sum, log) => sum + log.cost, 0)
    const totalTokens = costLogs.reduce((sum, log) => sum + log.input_tokens + log.output_tokens, 0)

    // Group by feature
    const costByFeature = costLogs.reduce((acc, log) => {
      acc[log.feature] = (acc[log.feature] || 0) + log.cost
      return acc
    }, {} as Record<string, number>)

    // Group by day
    const dailyCosts = costLogs.reduce((acc, log) => {
      const date = new Date(log.timestamp).toISOString().split('T')[0]
      acc[date] = (acc[date] || 0) + log.cost
      return acc
    }, {} as Record<string, number>)

    const dailyCostsArray = Object.entries(dailyCosts).map(([date, cost]) => ({
      date,
      cost
    })).sort((a, b) => a.date.localeCompare(b.date))

    return {
      totalCost,
      totalTokens,
      costByFeature,
      dailyCosts: dailyCostsArray
    }

  } catch (error) {
    console.error("Failed to get user AI costs:", error)
    return {
      totalCost: 0,
      totalTokens: 0,
      costByFeature: {},
      dailyCosts: []
    }
  }
}

/**
 * Get cost statistics across all users (admin only)
 */
export async function getAllUsersAICosts(days: number = 30): Promise<{
  totalCost: number
  totalTokens: number
  userCosts: Array<{
    userId: string
    email: string
    totalCost: number
    totalTokens: number
    costByFeature: Record<string, number>
  }>
}> {
  try {
    const { createAdminClient } = await import("@/lib/supabase/admin")
    const supabase = createAdminClient()
    
    const startDate = new Date()
    startDate.setDate(startDate.getDate() - days)

    // Get all cost logs with user info
    const { data: costLogs } = await supabase
      .from("ai_cost_logs")
      .select(`
        *,
        users!inner(email)
      `)
      .gte("timestamp", startDate.toISOString())
      .order("timestamp", { ascending: true })

    if (!costLogs) {
      return {
        totalCost: 0,
        totalTokens: 0,
        userCosts: []
      }
    }

    // Calculate totals
    const totalCost = costLogs.reduce((sum, log) => sum + log.cost, 0)
    const totalTokens = costLogs.reduce((sum, log) => sum + log.input_tokens + log.output_tokens, 0)

    // Group by user
    const userCosts = costLogs.reduce((acc, log) => {
      const userId = log.user_id
      if (!acc[userId]) {
        acc[userId] = {
          userId,
          email: log.users.email,
          totalCost: 0,
          totalTokens: 0,
          costByFeature: {}
        }
      }
      
      acc[userId].totalCost += log.cost
      acc[userId].totalTokens += log.input_tokens + log.output_tokens
      acc[userId].costByFeature[log.feature] = (acc[userId].costByFeature[log.feature] || 0) + log.cost
      
      return acc
    }, {} as Record<string, any>)

    return {
      totalCost,
      totalTokens,
      userCosts: Object.values(userCosts)
    }

  } catch (error) {
    console.error("Failed to get all users AI costs:", error)
    return {
      totalCost: 0,
      totalTokens: 0,
      userCosts: []
    }
  }
} 