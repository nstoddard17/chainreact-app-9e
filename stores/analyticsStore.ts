"use client"

import { create } from "zustand"
import { getSupabaseClient } from "@/lib/supabase"

interface AnalyticsMetrics {
  workflowsRun: number
  hoursSaved: number
  integrations: number
  aiCommands: number
}

interface ChartDataPoint {
  date: string
  executions: number
  success: number
}

interface ActivityItem {
  title: string
  timestamp: string
  status: "success" | "error" | "pending"
}

interface WorkflowExecution {
  id: string
  workflowId: string
  status: "success" | "error" | "running"
  startedAt: string
  completedAt?: string
  duration?: number
}

interface AnalyticsState {
  metrics: AnalyticsMetrics | null
  chartData: ChartDataPoint[]
  activityFeed: ActivityItem[]
  executions: WorkflowExecution[]
  loading: boolean
  error: string | null
}

interface AnalyticsActions {
  fetchMetrics: () => Promise<void>
  fetchChartData: () => Promise<void>
  fetchActivityFeed: () => Promise<void>
  fetchExecutions: () => Promise<void>
  trackEvent: (event: string, properties?: Record<string, any>) => Promise<void>
}

export const useAnalyticsStore = create<AnalyticsState & AnalyticsActions>((set, get) => ({
  // Initial state
  metrics: null,
  chartData: [],
  activityFeed: [],
  executions: [],
  loading: false,
  error: null,

  // Actions
  fetchMetrics: async () => {
    set({ loading: true, error: null })
    try {
      // Mock data for now - replace with real API calls
      const mockMetrics: AnalyticsMetrics = {
        workflowsRun: 1247,
        hoursSaved: 156,
        integrations: 8,
        aiCommands: 342,
      }

      set({ metrics: mockMetrics, loading: false })
    } catch (error: any) {
      set({ error: error.message, loading: false })
    }
  },

  fetchChartData: async () => {
    set({ loading: true, error: null })
    try {
      // Generate mock chart data for the last 30 days
      const chartData: ChartDataPoint[] = []
      const now = new Date()

      for (let i = 29; i >= 0; i--) {
        const date = new Date(now)
        date.setDate(date.getDate() - i)

        const executions = Math.floor(Math.random() * 50) + 10
        const success = Math.floor(executions * (0.85 + Math.random() * 0.1))

        chartData.push({
          date: date.toISOString(),
          executions,
          success,
        })
      }

      set({ chartData, loading: false })
    } catch (error: any) {
      set({ error: error.message, loading: false })
    }
  },

  fetchActivityFeed: async () => {
    set({ loading: true, error: null })
    try {
      const mockActivity: ActivityItem[] = [
        {
          title: "Slack to Calendar workflow completed",
          timestamp: "2 minutes ago",
          status: "success",
        },
        {
          title: "Email automation triggered",
          timestamp: "5 minutes ago",
          status: "success",
        },
        {
          title: "Data sync workflow failed",
          timestamp: "12 minutes ago",
          status: "error",
        },
        {
          title: "Discord notification sent",
          timestamp: "1 hour ago",
          status: "success",
        },
        {
          title: "Weekly report generated",
          timestamp: "2 hours ago",
          status: "success",
        },
      ]

      set({ activityFeed: mockActivity, loading: false })
    } catch (error: any) {
      set({ error: error.message, loading: false })
    }
  },

  fetchExecutions: async () => {
    set({ loading: true, error: null })
    try {
      const mockExecutions: WorkflowExecution[] = [
        {
          id: "1",
          workflowId: "wf-1",
          status: "success",
          startedAt: new Date(Date.now() - 120000).toISOString(),
          completedAt: new Date(Date.now() - 118000).toISOString(),
          duration: 2000,
        },
        {
          id: "2",
          workflowId: "wf-2",
          status: "success",
          startedAt: new Date(Date.now() - 300000).toISOString(),
          completedAt: new Date(Date.now() - 298000).toISOString(),
          duration: 2000,
        },
        {
          id: "3",
          workflowId: "wf-3",
          status: "error",
          startedAt: new Date(Date.now() - 720000).toISOString(),
          completedAt: new Date(Date.now() - 718000).toISOString(),
          duration: 2000,
        },
      ]

      set({ executions: mockExecutions, loading: false })
    } catch (error: any) {
      set({ error: error.message, loading: false })
    }
  },

  trackEvent: async (event: string, properties = {}) => {
    try {
      const supabase = getSupabaseClient()
      const { data: user } = await supabase.auth.getUser()

      if (user.user) {
        await supabase.from("analytics_events").insert({
          user_id: user.user.id,
          event_name: event,
          properties,
          timestamp: new Date().toISOString(),
        })
      }
    } catch (error) {
      console.error("Failed to track event:", error)
    }
  },
}))
