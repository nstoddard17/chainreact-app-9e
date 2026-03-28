"use client"

import { useEffect, useCallback } from 'react'
import { useAgentEvalStore } from '@/stores/agentEvalStore'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { RefreshCw } from 'lucide-react'
import { LightningLoader } from '@/components/ui/lightning-loader'
import { KPIStrip } from './KPIStrip'
import { FunnelSection } from './FunnelSection'
import { QualitySection } from './QualitySection'
import { ContextSection } from './ContextSection'
import { TrustSection } from './TrustSection'
import { SampledSessionsTable } from './SampledSessionsTable'
import { SessionDetailSheet } from './SessionDetailSheet'
import type { SampledSession } from '@/lib/eval/agentEvalTypes'

export function AgentEvalDashboard() {
  const {
    data, loading, error, filters,
    setFilters, fetchDashboard,
    selectedSession, setSelectedSession,
  } = useAgentEvalStore()

  useEffect(() => {
    fetchDashboard()
  }, [filters.days, filters.planner_path, filters.prompt_type, filters.agent_version, fetchDashboard])

  const handleSessionClick = useCallback((session: SampledSession) => {
    setSelectedSession(session)
  }, [setSelectedSession])

  const handleQualitySessionClick = useCallback((conversationId: string) => {
    const session = data?.sampled_sessions.find(s => s.conversation_id === conversationId)
    if (session) setSelectedSession(session)
  }, [data, setSelectedSession])

  if (loading && !data) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <LightningLoader size="lg" color="primary" />
      </div>
    )
  }

  if (error && !data) {
    return (
      <div className="space-y-4 text-center py-12">
        <p className="text-red-600 dark:text-red-400">Error: {error}</p>
        <Button onClick={fetchDashboard} variant="outline">Retry</Button>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Filter Bar */}
      <div className="flex items-center gap-3 flex-wrap">
        {/* Period selector */}
        <div className="flex gap-1">
          {[7, 30, 90].map((d) => (
            <Button
              key={d}
              variant={filters.days === d ? 'default' : 'outline'}
              size="sm"
              onClick={() => setFilters({ days: d })}
            >
              {d}d
            </Button>
          ))}
        </div>

        {/* Planner path filter */}
        <Select
          value={filters.planner_path || 'all'}
          onValueChange={(v) => setFilters({ planner_path: v === 'all' ? null : v })}
        >
          <SelectTrigger className="w-[140px] h-8 text-xs">
            <SelectValue placeholder="Path" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Paths</SelectItem>
            <SelectItem value="llm_3stage">LLM 3-Stage</SelectItem>
            <SelectItem value="pattern_fast">Pattern Fast</SelectItem>
            <SelectItem value="pattern_db">Pattern DB</SelectItem>
            <SelectItem value="llm_mini">LLM Mini</SelectItem>
            <SelectItem value="clarify">Clarify</SelectItem>
          </SelectContent>
        </Select>

        {/* Prompt type filter */}
        <Select
          value={filters.prompt_type || 'all'}
          onValueChange={(v) => setFilters({ prompt_type: v === 'all' ? null : v })}
        >
          <SelectTrigger className="w-[120px] h-8 text-xs">
            <SelectValue placeholder="Complexity" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            <SelectItem value="simple">Simple</SelectItem>
            <SelectItem value="moderate">Moderate</SelectItem>
            <SelectItem value="complex">Complex</SelectItem>
          </SelectContent>
        </Select>

        {/* Compare toggle */}
        <Button
          variant={filters.compare ? 'default' : 'outline'}
          size="sm"
          onClick={() => setFilters({ compare: !filters.compare })}
        >
          Compare
        </Button>

        <div className="flex-1" />

        <Button
          variant="outline"
          size="sm"
          onClick={fetchDashboard}
          disabled={loading}
        >
          <RefreshCw className={`h-3 w-3 mr-1 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      {data && (
        <>
          {/* KPI Strip */}
          <KPIStrip
            kpis={data.funnel.kpis}
            agentVersion={data.agent_version}
            compare={filters.compare}
          />

          {/* Top row: Funnel (60%) + Quality (40%) */}
          <div className="grid grid-cols-5 gap-4">
            <div className="col-span-3">
              <FunnelSection data={data.funnel} />
            </div>
            <div className="col-span-2">
              <QualitySection
                data={data.quality}
                onSessionClick={handleQualitySessionClick}
              />
            </div>
          </div>

          {/* Bottom row: Context (50%) + Trust (50%) */}
          <div className="grid grid-cols-2 gap-4">
            <ContextSection data={data.context} />
            <TrustSection data={data.trust} />
          </div>

          {/* Sampled Sessions */}
          <SampledSessionsTable
            sessions={data.sampled_sessions}
            onSessionClick={handleSessionClick}
          />
        </>
      )}

      {/* Session Detail Sheet */}
      <SessionDetailSheet
        session={selectedSession}
        open={!!selectedSession}
        onClose={() => setSelectedSession(null)}
      />
    </div>
  )
}
