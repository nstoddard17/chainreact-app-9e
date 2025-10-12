import { NextRequest, NextResponse } from "next/server"
import { createSupabaseRouteHandlerClient } from "@/utils/supabase/server"

import { logger } from '@/lib/utils/logger'

export async function GET(request: NextRequest) {
  try {
    const supabase = await createSupabaseRouteHandlerClient()
    
    // Get current user
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // Get current subscription and plan
    const { data: subscription } = await supabase
      .from("subscriptions")
      .select(`
        *,
        plans (*)
      `)
      .eq("user_id", user.id)
      .eq("status", "active")
      .single()

    // Get current usage
    const currentDate = new Date()
    const year = currentDate.getFullYear()
    const month = currentDate.getMonth() + 1

    const { data: usage } = await supabase
      .from("monthly_usage")
      .select("*")
      .eq("user_id", user.id)
      .eq("year", year)
      .eq("month", month)
      .single()

    // Get limits from plan or use defaults
    const plan = subscription?.plans
    const limits = {
      ai_assistant_limit: plan?.max_ai_assistant_calls || 5,
      ai_compose_limit: plan?.max_ai_compose_uses || 5,
      ai_agent_limit: plan?.max_ai_agent_executions || 5
    }

    // Get current usage or defaults
    const currentUsage = {
      ai_assistant_calls: usage?.ai_assistant_calls || 0,
      ai_compose_uses: usage?.ai_compose_uses || 0,
      ai_agent_executions: usage?.ai_agent_executions || 0
    }

    return NextResponse.json({
      ...currentUsage,
      ...limits
    })

  } catch (error) {
    logger.error("Error fetching AI usage:", error)
    return NextResponse.json(
      { error: "Failed to fetch AI usage" },
      { status: 500 }
    )
  }
} 