"use client"

import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import type { KPIData } from '@/lib/eval/agentEvalTypes'

interface KPICardProps {
  label: string
  kpi: KPIData
  compare?: boolean
}

function KPICard({ label, kpi, compare }: KPICardProps) {
  const trendColor = kpi.is_good
    ? 'text-green-600 dark:text-green-400'
    : kpi.trend === 'flat'
      ? 'text-muted-foreground'
      : 'text-red-600 dark:text-red-400'

  const arrow = kpi.trend === 'up' ? '▲' : kpi.trend === 'down' ? '▼' : '-'

  return (
    <Card className="bg-card">
      <CardContent className="p-4">
        <p className="text-xs text-muted-foreground mb-1 truncate">{label}</p>
        <div className="flex items-baseline gap-2">
          <span className="text-2xl font-bold tabular-nums">{kpi.value}</span>
          {compare && (
            <span className="text-xs text-muted-foreground tabular-nums">
              vs {kpi.previous_value}
            </span>
          )}
        </div>
        <div className={`text-xs mt-1 ${trendColor}`}>
          {arrow} {kpi.delta !== 0 ? (kpi.delta > 0 ? '+' : '') + kpi.delta : ''}
        </div>
      </CardContent>
    </Card>
  )
}

interface KPIStripProps {
  kpis: {
    activation_rate: KPIData
    first_plan_accept: KPIData
    turns_to_success: KPIData
    build_completion: KPIData
    invalid_variable_rate: KPIData
    top_failure: KPIData
  }
  agentVersion: string
  compare: boolean
}

export function KPIStrip({ kpis, agentVersion, compare }: KPIStripProps) {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <Badge variant="outline" className="bg-blue-100 text-blue-800 dark:bg-blue-500/20 dark:text-blue-300">
          Agent {agentVersion}
        </Badge>
      </div>
      <div className="grid grid-cols-6 gap-4">
        <KPICard label="Activation Rate" kpi={kpis.activation_rate} compare={compare} />
        <KPICard label="First Plan Accept" kpi={kpis.first_plan_accept} compare={compare} />
        <KPICard label="Turns to Success" kpi={kpis.turns_to_success} compare={compare} />
        <KPICard label="Build Completion" kpi={kpis.build_completion} compare={compare} />
        <KPICard label="Invalid Var Rate" kpi={kpis.invalid_variable_rate} compare={compare} />
        <KPICard label="Top Failure" kpi={kpis.top_failure} compare={compare} />
      </div>
    </div>
  )
}
