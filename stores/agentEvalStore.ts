import { create } from 'zustand'
import { fetchWithTimeout } from '@/lib/utils/fetch-with-timeout'
import type { AgentEvalDashboardData, SampledSession } from '@/lib/eval/agentEvalTypes'
import { logger } from '@/lib/utils/logger'

interface AgentEvalFilters {
  days: number
  planner_path: string | null
  prompt_type: string | null
  agent_version: string | null
  compare: boolean
}

interface AgentEvalState {
  data: AgentEvalDashboardData | null
  loading: boolean
  error: string | null
  filters: AgentEvalFilters
  selectedSession: SampledSession | null

  setFilters: (filters: Partial<AgentEvalFilters>) => void
  setSelectedSession: (session: SampledSession | null) => void
  fetchDashboard: () => Promise<void>
}

export const useAgentEvalStore = create<AgentEvalState>((set, get) => ({
  data: null,
  loading: false,
  error: null,
  filters: {
    days: 30,
    planner_path: null,
    prompt_type: null,
    agent_version: null,
    compare: false,
  },
  selectedSession: null,

  setFilters: (newFilters) => {
    set((state) => ({
      filters: { ...state.filters, ...newFilters },
    }))
  },

  setSelectedSession: (session) => set({ selectedSession: session }),

  fetchDashboard: async () => {
    set({ loading: true, error: null })
    try {
      const { filters } = get()
      const params = new URLSearchParams()
      params.set('days', String(filters.days))
      if (filters.planner_path) params.set('planner_path', filters.planner_path)
      if (filters.prompt_type) params.set('prompt_type', filters.prompt_type)
      if (filters.agent_version) params.set('agent_version', filters.agent_version)

      const response = await fetchWithTimeout(
        `/api/admin/agent-eval/dashboard?${params.toString()}`,
        {},
        15000
      )

      if (!response.ok) {
        const errBody = await response.json().catch(() => ({}))
        throw new Error(errBody.error || `HTTP ${response.status}`)
      }

      const data = await response.json()
      set({ data, loading: false })
    } catch (error: any) {
      logger.error('[AgentEvalStore] Fetch failed', { error: error.message })
      set({ error: error.message, loading: false })
    }
  },
}))
