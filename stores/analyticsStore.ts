import { create } from "zustand"
import { apiClient } from "@/lib/apiClient"

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
  loading: boolean
  error: string | null
  fetchMetrics: () => Promise<void>
  fetchChartData: () => Promise<void>
}

export const useAnalyticsStore = create<AnalyticsState>((set) => ({
  metrics: {
    workflowsRun: 0,
    hoursSaved: 0,
    integrations: 0,
    aiCommands: 0,
  },
  chartData: [],
  loading: false,
  error: null,
  fetchMetrics: async () => {
    set({ loading: true, error: null })
    try {
      const { data, error } = await apiClient.get<any>("/api/analytics/metrics")

      if (error) {
        console.warn("Failed to fetch metrics, using defaults:", error)
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

      set({ metrics: data, loading: false })
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
      const { data, error } = await apiClient.get<any>("/api/analytics/chart-data")

      if (error) {
        console.warn("Failed to fetch chart data, using defaults:", error)
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

      set({ chartData: data, loading: false })
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
}))
