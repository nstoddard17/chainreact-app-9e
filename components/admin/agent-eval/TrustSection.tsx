"use client"

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, LineChart, Line, XAxis, YAxis } from 'recharts'
import type { TrustDashboardData, KPIData } from '@/lib/eval/agentEvalTypes'

interface TrustSectionProps {
  data: TrustDashboardData
}

function TrustKPI({ label, kpi }: { label: string; kpi: KPIData }) {
  const trendColor = kpi.is_good
    ? 'text-green-600 dark:text-green-400'
    : kpi.trend === 'flat' ? 'text-muted-foreground' : 'text-red-600 dark:text-red-400'

  return (
    <div className="text-center">
      <p className="text-[10px] text-muted-foreground truncate">{label}</p>
      <p className="text-lg font-bold tabular-nums">{kpi.value}</p>
      <p className={`text-[10px] ${trendColor}`}>
        {kpi.trend === 'up' ? '▲' : kpi.trend === 'down' ? '▼' : '-'}
      </p>
    </div>
  )
}

const PIE_COLORS = [
  'hsl(0, 60%, 50%)',    // red
  'hsl(30, 60%, 50%)',   // orange
  'hsl(200, 60%, 50%)',  // blue
  'hsl(260, 60%, 50%)',  // purple
  'oklch(var(--muted-foreground))', // gray
]

export function TrustSection({ data }: TrustSectionProps) {
  return (
    <Card className="bg-card">
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Reliability & Trust</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* KPI row */}
        <div className="grid grid-cols-4 gap-2">
          <TrustKPI label="Test Pass Rate" kpi={data.node_test_pass_rate} />
          <TrustKPI label="Blocked" kpi={data.activation_blocked_count} />
          <TrustKPI label="Resolution Time" kpi={data.median_resolution_time_ms} />
          <TrustKPI label="Provider Blockers" kpi={data.provider_blockers} />
        </div>

        {/* Blocked reasons pie */}
        {data.blocked_reasons.length > 0 && (
          <div className="flex items-center gap-4">
            <ResponsiveContainer width={120} height={120}>
              <PieChart>
                <Pie
                  data={data.blocked_reasons}
                  dataKey="count"
                  nameKey="reason"
                  cx="50%"
                  cy="50%"
                  outerRadius={50}
                  innerRadius={25}
                >
                  {data.blocked_reasons.map((_, i) => (
                    <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{
                    backgroundColor: 'oklch(var(--card))',
                    border: '1px solid oklch(var(--border))',
                    borderRadius: '6px',
                    fontSize: '11px',
                  }}
                  formatter={(v: number, name: string) => [v, name.replace(/_/g, ' ')]}
                />
              </PieChart>
            </ResponsiveContainer>
            <div className="flex-1 space-y-1 text-xs">
              {data.blocked_reasons.slice(0, 5).map((r, i) => (
                <div key={r.reason} className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full" style={{ backgroundColor: PIE_COLORS[i % PIE_COLORS.length] }} />
                  <span className="text-muted-foreground">{r.reason.replace(/_/g, ' ')}</span>
                  <span className="tabular-nums font-medium">{r.pct}%</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Weekly trend */}
        {data.weekly_trends.length > 1 && (
          <div>
            <p className="text-xs text-muted-foreground mb-1">Weekly Trends</p>
            <ResponsiveContainer width="100%" height={80}>
              <LineChart data={data.weekly_trends}>
                <XAxis dataKey="week" tick={{ fontSize: 9 }} tickFormatter={w => w.substring(5)} stroke="oklch(var(--muted-foreground))" />
                <YAxis tick={{ fontSize: 9 }} width={25} domain={[0, 1]} tickFormatter={v => `${(v * 100).toFixed(0)}%`} stroke="oklch(var(--muted-foreground))" />
                <Line type="monotone" dataKey="test_pass_rate" stroke="hsl(200, 60%, 50%)" strokeWidth={2} dot={false} name="Test Pass" />
                <Line type="monotone" dataKey="activation_success_rate" stroke="hsl(142, 60%, 50%)" strokeWidth={2} dot={false} name="Activation" />
                <Tooltip
                  contentStyle={{ backgroundColor: 'oklch(var(--card))', border: '1px solid oklch(var(--border))', borderRadius: '6px', fontSize: '11px' }}
                  formatter={(v: number, name: string) => [`${(v * 100).toFixed(1)}%`, name]}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
