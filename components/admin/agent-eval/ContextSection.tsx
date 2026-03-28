"use client"

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend } from 'recharts'
import type { ContextDashboardData } from '@/lib/eval/agentEvalTypes'

interface ContextSectionProps {
  data: ContextDashboardData
}

const contextLabels: Record<string, string> = {
  none: 'No Context',
  manual: 'Manual',
  auto: 'Auto-Context',
  'auto+drafting': 'Auto + Drafting',
}

export function ContextSection({ data }: ContextSectionProps) {
  const chartData = data.groups.map(g => ({
    name: contextLabels[g.context_type] || g.context_type,
    'Plan Approval': g.plan_approval_pct,
    'Build Completion': g.build_completion_pct,
    'Activation': g.activation_pct,
    'Avg Turns': Math.min(g.avg_follow_up_turns * 10, 100), // normalize to 0-100 scale
    sessions: g.session_count,
    score: g.effectiveness_score,
  }))

  return (
    <Card className="bg-card">
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Context Effectiveness</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {chartData.some(d => d.sessions > 0) ? (
          <>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={chartData} barCategoryGap="20%">
                <XAxis dataKey="name" tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" />
                <YAxis tick={{ fontSize: 10 }} width={30} domain={[0, 100]} tickFormatter={v => `${v}%`} stroke="hsl(var(--muted-foreground))" />
                <Tooltip
                  contentStyle={{
                    backgroundColor: 'hsl(var(--card))',
                    border: '1px solid hsl(var(--border))',
                    borderRadius: '6px',
                    fontSize: '11px',
                  }}
                  formatter={(v: number, name: string) => {
                    if (name === 'Avg Turns') return [`${(v / 10).toFixed(1)} turns`, name]
                    return [`${v.toFixed(1)}%`, name]
                  }}
                />
                <Legend wrapperStyle={{ fontSize: '10px' }} />
                <Bar dataKey="Plan Approval" fill="hsl(200, 60%, 50%)" radius={[2, 2, 0, 0]} />
                <Bar dataKey="Build Completion" fill="hsl(220, 60%, 50%)" radius={[2, 2, 0, 0]} />
                <Bar dataKey="Activation" fill="hsl(142, 60%, 50%)" radius={[2, 2, 0, 0]} />
                <Bar dataKey="Avg Turns" fill="hsl(40, 60%, 50%)" radius={[2, 2, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>

            {/* Effectiveness scores */}
            <div className="flex gap-4 text-xs">
              {data.groups.filter(g => g.session_count > 0).map(g => (
                <div key={g.context_type} className="flex items-center gap-1">
                  <span className="text-muted-foreground">{contextLabels[g.context_type]}:</span>
                  <span className={`font-semibold ${g.context_type === data.best_group ? 'text-green-600 dark:text-green-400' : ''}`}>
                    {g.effectiveness_score}
                  </span>
                  <span className="text-muted-foreground">({g.session_count})</span>
                </div>
              ))}
            </div>

            {/* Summary */}
            <p className="text-xs text-muted-foreground">{data.summary}</p>
          </>
        ) : (
          <p className="text-sm text-muted-foreground">No context data yet</p>
        )}
      </CardContent>
    </Card>
  )
}
