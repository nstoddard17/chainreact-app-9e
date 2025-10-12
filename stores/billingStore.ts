"use client"

import { create } from "zustand"
import { getSupabaseClient } from "@/lib/supabase"

import { logger } from '@/lib/utils/logger'

interface Plan {
  id: string
  name: string
  description: string
  price_monthly: number
  price_yearly: number
  stripe_price_id_monthly: string
  stripe_price_id_yearly: string
  max_workflows: number
  max_executions_per_month: number
  max_integrations: number
  max_nodes_per_workflow: number
  max_storage_mb: number
  max_team_members: number
  features: string[]
  is_active: boolean
}

interface Subscription {
  id: string
  plan_id: string
  status: string
  current_period_start: string
  current_period_end: string
  cancel_at_period_end: boolean
  billing_cycle: string
  plan?: Plan
}

interface UsageData {
  workflow_count: number
  execution_count: number
  integration_count: number
  storage_used_mb: number
  team_member_count: number
}

interface BillingState {
  plans: Plan[]
  currentSubscription: Subscription | null
  usage: UsageData | null
  loading: boolean
  error: string | null
  lastFetchTime: number | null
}

interface BillingActions {
  fetchPlans: () => Promise<void>
  fetchSubscription: () => Promise<void>
  fetchUsage: () => Promise<void>
  fetchAll: () => Promise<void>
  createCheckoutSession: (planId: string, billingCycle: string) => Promise<string>
  cancelSubscription: () => Promise<void>
  reactivateSubscription: () => Promise<void>
  changePlan: (newPlanId: string, billingCycle: string) => Promise<any>
  createPortalSession: () => Promise<string>
  checkUsageLimits: (resourceType: string) => boolean
}

export const useBillingStore = create<BillingState & BillingActions>((set, get) => ({
  plans: [],
  currentSubscription: null,
  usage: null,
  loading: false,
  error: null,
  lastFetchTime: null,

  fetchPlans: async () => {
    const supabase = getSupabaseClient()
    if (!supabase) {
      throw new Error("Supabase client not available")
    }

    try {
      const { data, error } = await supabase
        .from("plans")
        .select("*")
        .eq("is_active", true)
        .order("price_monthly", { ascending: true })

      if (error) throw error

      set({ plans: data || [] })
    } catch (error: any) {
      logger.error("Error fetching plans:", error)
      set({ error: error.message })
    }
  },

  fetchSubscription: async () => {
    try {
      const supabase = getSupabaseClient()
      if (!supabase) {
        logger.debug("Supabase client not available for subscription fetch")
        return
      }

      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser()

      if (userError || !user) {
        logger.debug("User not authenticated for subscription fetch")
        return
      }

      const { data, error } = await supabase
        .from("subscriptions")
        .select(`
          *,
          plan:plans (*)
        `)
        .eq("user_id", user.id)
        .maybeSingle()

      // It's OK if no subscription exists
      if (error && error.code !== "PGRST116") {
        logger.error("Error fetching subscription:", error)
        return
      }

      set({ currentSubscription: data || null })
    } catch (error: any) {
      logger.error("Subscription fetch error:", error)
      // Don't set error state to prevent blocking UI
    }
  },

  fetchUsage: async () => {
    try {
      const supabase = getSupabaseClient()
      if (!supabase) {
        logger.debug("Supabase client not available for usage fetch")
        return
      }

      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser()

      if (userError || !user) {
        logger.debug("User not authenticated for usage fetch")
        return
      }

      const currentDate = new Date()
      const year = currentDate.getFullYear()
      const month = currentDate.getMonth() + 1

      const { data, error } = await supabase
        .from("monthly_usage")
        .select("*")
        .eq("user_id", user.id)
        .eq("year", year)
        .eq("month", month)
        .maybeSingle()

      // It's OK if no usage record exists
      if (error && error.code !== "PGRST116") {
        logger.error("Error fetching usage:", error)
      }

      set({
        usage: data || {
          workflow_count: 0,
          execution_count: 0,
          integration_count: 0,
          storage_used_mb: 0,
          team_member_count: 1,
        },
      })
    } catch (error: any) {
      logger.error("Usage fetch error:", error)
      // Don't set error state to prevent blocking UI
    }
  },

  fetchAll: async () => {
    // Check if data was recently fetched (cache for 30 seconds)
    const state = get()
    const now = Date.now()
    const CACHE_DURATION = 30000 // 30 seconds
    
    if (state.lastFetchTime && (now - state.lastFetchTime) < CACHE_DURATION && state.plans.length > 0) {
      logger.debug("Using cached billing data")
      return
    }

    // Fetch all data in parallel for better performance
    const supabase = getSupabaseClient()
    if (!supabase) {
      logger.debug("Supabase client not available")
      return
    }

    set({ loading: true, error: null })

    try {
      // Run all fetches in parallel
      await Promise.all([
        get().fetchPlans().catch(err => logger.error("Error fetching plans:", err)),
        get().fetchSubscription().catch(err => logger.error("Error fetching subscription:", err)),
        get().fetchUsage().catch(err => logger.error("Error fetching usage:", err))
      ])
      
      set({ lastFetchTime: now })
    } finally {
      set({ loading: false })
    }
  },

  createCheckoutSession: async (planId: string, billingCycle: string) => {
    try {
      logger.debug("Creating checkout session for plan:", planId, "billing cycle:", billingCycle)

      // Get the current session token
      const supabase = getSupabaseClient()
      logger.debug("Getting session...")
      const { data: { session }, error: sessionError } = await supabase.auth.getSession()
      
      if (sessionError || !session) {
        logger.error("Session error:", sessionError)
        throw new Error("No active session found. Please sign in again.")
      }
      
      logger.debug("Session obtained, making API request...")
      
      // Add a timeout to the fetch request
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 30000) // 30 second timeout
      
      const response = await fetch("/api/billing/checkout", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ planId, billingCycle }),
        signal: controller.signal,
      }).catch((error) => {
        if (error.name === 'AbortError') {
          throw new Error('Request timed out. Please try again.')
        }
        throw error
      }).finally(() => {
        clearTimeout(timeoutId)
      })

      logger.debug("Checkout response status:", response.status)

      if (!response.ok) {
        const errorText = await response.text()
        logger.error("Checkout response error:", errorText)
        throw new Error(`HTTP ${response.status}: ${errorText}`)
      }

      const data = await response.json()
      logger.debug("Checkout response data:", data)

      if (!data.url) {
        throw new Error("No checkout URL returned from the server")
      }

      return data.url
    } catch (error: any) {
      logger.error("Checkout session error:", error)
      set({ error: error.message })
      throw error
    }
  },

  cancelSubscription: async () => {
    const { currentSubscription } = get()
    if (!currentSubscription) return

    try {
      const response = await fetch(`/api/billing/subscriptions/${currentSubscription.id}/cancel`, {
        method: "POST",
      })

      if (!response.ok) {
        throw new Error("Failed to cancel subscription")
      }

      // Refresh subscription data
      await get().fetchSubscription()
    } catch (error: any) {
      set({ error: error.message })
      throw error
    }
  },

  reactivateSubscription: async () => {
    const { currentSubscription } = get()
    if (!currentSubscription) return

    try {
      const response = await fetch(`/api/billing/subscriptions/${currentSubscription.id}/reactivate`, {
        method: "POST",
      })

      if (!response.ok) {
        throw new Error("Failed to reactivate subscription")
      }

      // Refresh subscription data
      await get().fetchSubscription()
    } catch (error: any) {
      set({ error: error.message })
      throw error
    }
  },

  changePlan: async (newPlanId: string, billingCycle: string) => {
    const { currentSubscription } = get()
    if (!currentSubscription) {
      throw new Error("No active subscription to change")
    }

    try {
      const response = await fetch(`/api/billing/subscriptions/${currentSubscription.id}/change-plan`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ newPlanId, billingCycle }),
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || "Failed to change plan")
      }

      const result = await response.json()

      // Refresh subscription data
      await get().fetchSubscription()

      return result
    } catch (error: any) {
      set({ error: error.message })
      throw error
    }
  },

  createPortalSession: async () => {
    try {
      const response = await fetch("/api/billing/portal", {
        method: "POST",
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || "Failed to create portal session")
      }

      return data.url
    } catch (error: any) {
      set({ error: error.message })
      throw error
    }
  },

  checkUsageLimits: (resourceType: string) => {
    const { currentSubscription, usage } = get()

    if (!currentSubscription?.plan || !usage) return true

    const plan = currentSubscription.plan

    switch (resourceType) {
      case "workflow":
        return plan.max_workflows === -1 || usage.workflow_count < plan.max_workflows
      case "execution":
        return plan.max_executions_per_month === -1 || usage.execution_count < plan.max_executions_per_month
      case "integration":
        return plan.max_integrations === -1 || usage.integration_count < plan.max_integrations
      case "storage":
        return plan.max_storage_mb === -1 || usage.storage_used_mb < plan.max_storage_mb
      case "team_member":
        return plan.max_team_members === -1 || usage.team_member_count < plan.max_team_members
      case "ai_assistant":
        return plan.max_ai_assistant_calls === -1 || usage.ai_assistant_calls < plan.max_ai_assistant_calls
      case "ai_compose":
        return plan.max_ai_compose_uses === -1 || usage.ai_compose_uses < plan.max_ai_compose_uses
      case "ai_agent":
        return plan.max_ai_agent_executions === -1 || usage.ai_agent_executions < plan.max_ai_agent_executions
      default:
        return true
    }
  },
}))
