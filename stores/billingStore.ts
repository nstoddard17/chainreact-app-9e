"use client"

import { create } from "zustand"
import { getSupabaseClient } from "@/lib/supabase"

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
}

interface BillingActions {
  fetchPlans: () => Promise<void>
  fetchSubscription: () => Promise<void>
  fetchUsage: () => Promise<void>
  createCheckoutSession: (planId: string, billingCycle: string) => Promise<string>
  cancelSubscription: () => Promise<void>
  createPortalSession: () => Promise<string>
  checkUsageLimits: (resourceType: string) => boolean
}

export const useBillingStore = create<BillingState & BillingActions>((set, get) => ({
  plans: [],
  currentSubscription: null,
  usage: null,
  loading: false,
  error: null,

  fetchPlans: async () => {
    const supabase = getSupabaseClient()
    if (!supabase) {
      throw new Error("Supabase client not available")
    }

    set({ loading: true, error: null })

    try {
      const { data, error } = await supabase
        .from("plans")
        .select("*")
        .eq("is_active", true)
        .order("price_monthly", { ascending: true })

      if (error) throw error

      set({ plans: data || [], loading: false })
    } catch (error: any) {
      set({ error: error.message, loading: false })
    }
  },

  fetchSubscription: async () => {
    try {
      const supabase = getSupabaseClient()
      if (!supabase) {
        throw new Error("Supabase client not available")
      }

      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser()

      if (userError || !user) {
        throw new Error("Not authenticated")
      }

      const { data, error } = await supabase
        .from("subscriptions")
        .select(`
          *,
          plans (*)
        `)
        .eq("user_id", user.id)
        .single()

      if (error && error.code !== "PGRST116") throw error

      set({ currentSubscription: data })
    } catch (error: any) {
      set({ error: error.message })
    }
  },

  fetchUsage: async () => {
    try {
      const supabase = getSupabaseClient()
      if (!supabase) {
        throw new Error("Supabase client not available")
      }

      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser()

      if (userError || !user) {
        throw new Error("Not authenticated")
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
        .single()

      if (error && error.code !== "PGRST116") throw error

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
      set({ error: error.message })
    }
  },

  createCheckoutSession: async (planId: string, billingCycle: string) => {
    try {
      console.log("Creating checkout session for plan:", planId, "billing cycle:", billingCycle)

      const response = await fetch("/api/billing/checkout", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ planId, billingCycle }),
      })

      console.log("Checkout response status:", response.status)

      if (!response.ok) {
        const errorText = await response.text()
        console.error("Checkout response error:", errorText)
        throw new Error(`HTTP ${response.status}: ${errorText}`)
      }

      const data = await response.json()
      console.log("Checkout response data:", data)

      if (!data.url) {
        throw new Error("No checkout URL returned from the server")
      }

      return data.url
    } catch (error: any) {
      console.error("Checkout session error:", error)
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
      default:
        return true
    }
  },
}))
