import { create } from "zustand"
import { apiClient } from "@/lib/apiClient"

interface Execution {
  id: string
  status: "pending" | "running" | "success" | "error"
  started_at: string
  completed_at?: string
  execution_time_ms?: number
  error_message?: string
}

interface MetricData {
  workflowsRun: number
  hoursSaved: number
  integrations: number
  aiCommands: number
}

interface AnalyticsState {
  metrics: {
    workflowsRun: number
    hoursSaved: number
    integrations: number
    aiCommands: number
  }
  chartData: {
    name: string
    workflows: number
    executions: number
  }[]
  executions: Execution[]
  loading: boolean
  error: string | null
  fetchMetrics: () => Promise<void>
  fetchChartData: () => Promise<void>
  fetchExecutions: () => Promise<void>
}

export const useAnalyticsStore = create<AnalyticsState>((set) => ({
  metrics: {
    workflowsRun: 0,
    hoursSaved: 0,
    integrations: 0,
    aiCommands: 0,
  },
  chartData: [],
  executions: [],
  loading: false,
  error: null,
  fetchMetrics: async () => {
    set({ loading: true, error: null })
    try {
      const response = await apiClient.get<any>("/api/analytics/metrics")

      if (response.error) {
        console.warn("Failed to fetch metrics, using defaults:", response.error)
        // Provide default metrics if API fails
        set({
          metrics: {
            workflowsRun: 0,
            hoursSaved: 0,
            integrations: 0,
            aiCommands: 0,
          },
          loading: false,
        })
        return
      }
      
      const metricsData = response.data?.data || response.data;
      set({ metrics: metricsData, loading: false })
    } catch (error) {
      console.error("Error fetching metrics:", error)
      // Provide default metrics on error
      set({
        metrics: {
          workflowsRun: 0,
          hoursSaved: 0,
          integrations: 0,
          aiCommands: 0,
        },
        loading: false,
        error: "Failed to load metrics",
      })
    }
  },
  fetchChartData: async () => {
    set({ loading: true, error: null })
    try {
      const response = await apiClient.get<any>("/api/analytics/chart-data")

      if (response.error) {
        console.warn("Failed to fetch chart data, using defaults:", response.error)
        // Provide default chart data if API fails
        set({
          chartData: [
            { name: "Mon", workflows: 0, executions: 0 },
            { name: "Tue", workflows: 0, executions: 0 },
            { name: "Wed", workflows: 0, executions: 0 },
            { name: "Thu", workflows: 0, executions: 0 },
            { name: "Fri", workflows: 0, executions: 0 },
            { name: "Sat", workflows: 0, executions: 0 },
            { name: "Sun", workflows: 0, executions: 0 },
          ],
          loading: false,
        })
        return
      }

      const chartData = response.data?.data || response.data
      set({ chartData: chartData, loading: false })
    } catch (error) {
      console.error("Error fetching chart data:", error)
      // Provide default chart data on error
      set({
        chartData: [
          { name: "Mon", workflows: 0, executions: 0 },
          { name: "Tue", workflows: 0, executions: 0 },
          { name: "Wed", workflows: 0, executions: 0 },
          { name: "Thu", workflows: 0, executions: 0 },
          { name: "Fri", workflows: 0, executions: 0 },
          { name: "Sat", workflows: 0, executions: 0 },
          { name: "Sun", workflows: 0, executions: 0 },
        ],
        loading: false,
        error: "Failed to load chart data",
      })
    }
  },
  fetchExecutions: async () => {
    set({ loading: true, error: null })
    try {
      const response = await apiClient.get<Execution[]>(
        "/api/analytics/executions",
      )

      if (response.error) {
        console.warn("Failed to fetch executions, using defaults:", response.error)
        set({ executions: [], loading: false })
        return
      }

      set({ executions: response.data || [], loading: false })
    } catch (error) {
      console.error("Error fetching executions:", error)
      set({ executions: [], loading: false, error: "Failed to load executions" })
    }
  },
}))
