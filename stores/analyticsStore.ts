import { create } from "zustand"
import { apiClient } from "@/lib/apiClient"
import { logger } from "@/lib/utils/logger"

// Types for the new dashboard API
export interface ExecutionStats {
  total: number
  completed: number
  failed: number
  running: number
  cancelled: number
  successRate: number
  avgExecutionTimeMs: number
}

export interface DailyStats {
  date: string
  dayName: string
  executions: number
  successful: number
  failed: number
}

export interface WorkflowStats {
  workflowId: string
  workflowName: string
  totalExecutions: number
  successfulExecutions: number
  failedExecutions: number
  lastExecutedAt: string | null
  successRate: number
  avgExecutionTimeMs: number
}

export interface RecentExecution {
  id: string
  workflowId: string
  workflowName: string
  status: string
  startedAt: string
  completedAt: string | null
  durationMs: number | null
  error: string | null
}

export interface IntegrationStats {
  total: number
  connected: number
  expiring: number
  expired: number
  disconnected: number
}

export interface DashboardData {
  overview: ExecutionStats
  dailyStats: DailyStats[]
  topWorkflows: WorkflowStats[]
  recentExecutions: RecentExecution[]
  integrationStats: IntegrationStats
  period: {
    start: string
    end: string
    days: number
  }
}

// Legacy types for backward compatibility
interface LegacyExecution {
  id: string
  status: "pending" | "running" | "success" | "error"
  started_at: string
  completed_at?: string
  execution_time_ms?: number
  error_message?: string
}

interface LegacyMetricData {
  workflowsRun: number
  hoursSaved: number
  integrations: number
  aiCommands: number
}

interface LegacyChartData {
  name: string
  workflows: number
  executions: number
}

interface AnalyticsState {
  // New dashboard data
  dashboard: DashboardData | null
  dashboardLoading: boolean
  dashboardError: string | null
  selectedPeriod: number // days

  // Legacy data for backward compatibility
  metrics: LegacyMetricData
  chartData: LegacyChartData[]
  executions: LegacyExecution[]
  loading: boolean
  error: string | null

  // Actions
  fetchDashboard: (days?: number) => Promise<void>
  setSelectedPeriod: (days: number) => void

  // Legacy actions
  fetchMetrics: () => Promise<void>
  fetchChartData: () => Promise<void>
  fetchExecutions: () => Promise<void>
  clearAllData: () => void
}

const defaultDashboard: DashboardData = {
  overview: {
    total: 0,
    completed: 0,
    failed: 0,
    running: 0,
    cancelled: 0,
    successRate: 0,
    avgExecutionTimeMs: 0,
  },
  dailyStats: [],
  topWorkflows: [],
  recentExecutions: [],
  integrationStats: {
    total: 0,
    connected: 0,
    expiring: 0,
    expired: 0,
    disconnected: 0,
  },
  period: {
    start: new Date().toISOString(),
    end: new Date().toISOString(),
    days: 30,
  },
}

export const useAnalyticsStore = create<AnalyticsState>((set, get) => ({
  // New dashboard state
  dashboard: null,
  dashboardLoading: false,
  dashboardError: null,
  selectedPeriod: 30,

  // Legacy state
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

  // New dashboard fetch
  fetchDashboard: async (days?: number) => {
    const period = days ?? get().selectedPeriod
    set({ dashboardLoading: true, dashboardError: null })

    try {
      const response = await apiClient.get<DashboardData>(
        `/api/analytics/dashboard?days=${period}`
      )

      if (!response.success || !response.data) {
        logger.warn("[AnalyticsStore] Failed to fetch dashboard:", response.error)
        set({
          dashboard: defaultDashboard,
          dashboardLoading: false,
          dashboardError: response.error || "Failed to load analytics",
        })
        return
      }

      set({
        dashboard: response.data,
        dashboardLoading: false,
        dashboardError: null,
        selectedPeriod: period,
      })

      logger.debug("[AnalyticsStore] Dashboard fetched successfully", {
        executionCount: response.data.overview.total,
        workflowCount: response.data.topWorkflows.length,
      })
    } catch (error: any) {
      logger.error("[AnalyticsStore] Error fetching dashboard:", error)
      set({
        dashboard: defaultDashboard,
        dashboardLoading: false,
        dashboardError: error.message || "Failed to load analytics",
      })
    }
  },

  setSelectedPeriod: (days: number) => {
    set({ selectedPeriod: days })
    get().fetchDashboard(days)
  },

  // Legacy methods for backward compatibility
  fetchMetrics: async () => {
    set({ loading: true, error: null })
    try {
      const response = await apiClient.get<any>("/api/analytics/metrics")

      if (!response.success) {
        logger.warn("Failed to fetch metrics, using defaults:", response.error)
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

      const metricsData = response.data?.data || response.data
      set({ metrics: metricsData, loading: false })
    } catch (error) {
      logger.warn("Error fetching metrics (using defaults):", error)
      set({
        metrics: {
          workflowsRun: 0,
          hoursSaved: 0,
          integrations: 0,
          aiCommands: 0,
        },
        loading: false,
      })
    }
  },

  fetchChartData: async () => {
    set({ loading: true, error: null })
    try {
      const response = await apiClient.get<any>("/api/analytics/chart-data")

      if (!response.success) {
        logger.warn("Failed to fetch chart data, using defaults:", response.error)
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
      logger.warn("Error fetching chart data (using defaults):", error)
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
    }
  },

  fetchExecutions: async () => {
    set({ loading: true, error: null })
    try {
      const response = await apiClient.get<LegacyExecution[]>("/api/analytics/executions")

      if (!response.success) {
        logger.warn("Failed to fetch executions, using defaults:", response.error)
        set({ executions: [], loading: false })
        return
      }

      set({ executions: response.data || [], loading: false })
    } catch (error) {
      logger.error("Error fetching executions:", error)
      set({ executions: [], loading: false, error: "Failed to load executions" })
    }
  },

  clearAllData: () => {
    set({
      dashboard: null,
      dashboardLoading: false,
      dashboardError: null,
      selectedPeriod: 30,
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
    })
  },
}))
