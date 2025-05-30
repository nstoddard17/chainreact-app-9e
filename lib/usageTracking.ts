import { getSupabaseClient } from "@/lib/supabase"

export async function trackUsage(userId: string, resourceType: string, action: string, quantity = 1, metadata?: any) {
  const supabase = getSupabaseClient()

  try {
    // Log the usage
    await supabase.from("usage_logs").insert({
      user_id: userId,
      resource_type: resourceType,
      action,
      quantity,
      metadata,
    })

    // Update monthly usage
    const currentDate = new Date()
    const year = currentDate.getFullYear()
    const month = currentDate.getMonth() + 1

    const updateField = getUsageField(resourceType)
    if (updateField) {
      await supabase.rpc("increment_monthly_usage", {
        p_user_id: userId,
        p_year: year,
        p_month: month,
        p_field: updateField,
        p_increment: quantity,
      })
    }
  } catch (error) {
    console.error("Usage tracking error:", error)
  }
}

export async function checkUsageLimit(
  userId: string,
  resourceType: string,
): Promise<{ allowed: boolean; limit: number; current: number }> {
  const supabase = getSupabaseClient()

  try {
    // Get current subscription and plan
    const { data: subscription } = await supabase
      .from("subscriptions")
      .select(`
        *,
        plans (*)
      `)
      .eq("user_id", userId)
      .eq("status", "active")
      .single()

    if (!subscription?.plans) {
      // No active subscription, use free tier limits
      return { allowed: false, limit: 0, current: 0 }
    }

    const plan = subscription.plans
    const limit = getPlanLimit(plan, resourceType)

    if (limit === -1) {
      // Unlimited
      return { allowed: true, limit: -1, current: 0 }
    }

    // Get current usage
    const currentDate = new Date()
    const year = currentDate.getFullYear()
    const month = currentDate.getMonth() + 1

    const { data: usage } = await supabase
      .from("monthly_usage")
      .select("*")
      .eq("user_id", userId)
      .eq("year", year)
      .eq("month", month)
      .single()

    const current = getCurrentUsage(usage, resourceType)
    const allowed = current < limit

    return { allowed, limit, current }
  } catch (error) {
    console.error("Usage limit check error:", error)
    return { allowed: false, limit: 0, current: 0 }
  }
}

function getUsageField(resourceType: string): string | null {
  const fieldMap: Record<string, string> = {
    workflow: "workflow_count",
    execution: "execution_count",
    integration: "integration_count",
    storage: "storage_used_mb",
    team_member: "team_member_count",
  }
  return fieldMap[resourceType] || null
}

function getPlanLimit(plan: any, resourceType: string): number {
  const limitMap: Record<string, string> = {
    workflow: "max_workflows",
    execution: "max_executions_per_month",
    integration: "max_integrations",
    storage: "max_storage_mb",
    team_member: "max_team_members",
  }
  const field = limitMap[resourceType]
  return field ? plan[field] : 0
}

function getCurrentUsage(usage: any, resourceType: string): number {
  if (!usage) return 0

  const usageMap: Record<string, string> = {
    workflow: "workflow_count",
    execution: "execution_count",
    integration: "integration_count",
    storage: "storage_used_mb",
    team_member: "team_member_count",
  }
  const field = usageMap[resourceType]
  return field ? usage[field] || 0 : 0
}
