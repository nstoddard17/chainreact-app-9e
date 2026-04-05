"use client"

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts'
import type { QualityDashboardData, KPIData } from '@/lib/eval/agentEvalTypes'

interface QualitySectionProps {
  data: QualityDashboardData
  onSessionClick?: (conversationId: string) => void
}

function MiniKPI({ label, kpi }: { label: string; kpi: KPIData }) {
  const trendColor = kpi.is_good
    ? 'text-green-600 dark:text-green-400'
    : kpi.trend === 'flat' ? 'text-muted-foreground' : 'text-red-600 dark:text-red-400'

  return (
    <div className="space-y-0.5">
      <p className="text-[10px] text-muted-foreground truncate">{label}</p>
      <p className="text-sm font-semibold tabular-nums">{kpi.value}</p>
      <p className={`text-[10px] ${trendColor}`}>
        {kpi.trend === 'up' ? '▲' : kpi.trend === 'down' ? '▼' : '-'}
      </p>
    </div>
  )
}

const issueColors: Record<string, string> = {
  manual_correction: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-500/20 dark:text-yellow-300',
  invalid_variable_ref: 'bg-red-100 text-red-800 dark:bg-red-500/20 dark:text-red-300',
  hallucinated_field: 'bg-red-100 text-red-800 dark:bg-red-500/20 dark:text-red-300',
  duplicate_node: 'bg-orange-100 text-orange-800 dark:bg-orange-500/20 dark:text-orange-300',
}

export function QualitySection({ data, onSessionClick }: QualitySectionProps) {
  // Version change markers
  const versionChanges = data.weekly_trends.reduce<string[]>((acc, t, i) => {
    if (i > 0 && t.agent_version !== data.weekly_trends[i - 1].agent_version) {
      acc.push(t.week)
    }
    return acc
  }, [])

  // Failure label breakdown
  const failureEntries = Object.entries(data.failure_label_breakdown)
  const totalFailures = failureEntries.reduce((s, [, v]) => s + v, 0)

  return (
    <Card className="bg-card">
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Agent Quality</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Mini KPIs */}
        <div className="grid grid-cols-3 gap-3">
          <MiniKPI label="First Plan Accept" kpi={data.mini_kpis.first_plan_accept_pct} />
          <MiniKPI label="Clarification Rate" kpi={data.mini_kpis.clarification_rate} />
          <MiniKPI label="Correction Rate" kpi={data.mini_kpis.manual_correction_rate} />
          <div className="space-y-0.5">
            <p className="text-[10px] text-muted-foreground">Severity Split</p>
            <div className="flex gap-1 text-[10px]">
              <span className="text-green-600 dark:text-green-400">{data.mini_kpis.severity_breakdown.minor}m</span>
              <span className="text-yellow-600 dark:text-yellow-400">{data.mini_kpis.severity_breakdown.moderate}M</span>
              <span className="text-red-600 dark:text-red-400">{data.mini_kpis.severity_breakdown.major}!</span>
            </div>
          </div>
          <MiniKPI label="Duplicate Rate" kpi={data.mini_kpis.duplicate_node_rate} />
          <MiniKPI label="Hallucinations" kpi={data.mini_kpis.hallucinated_field_count} />
        </div>

        {/* Weekly Trend */}
        {data.weekly_trends.length > 1 && (
          <div>
            <p className="text-xs text-muted-foreground mb-1">Is the agent getting smarter?</p>
            <ResponsiveContainer width="100%" height={100}>
              <LineChart data={data.weekly_trends}>
                <XAxis dataKey="week" tick={{ fontSize: 9 }} tickFormatter={w => w.substring(5)} stroke="hsl(var(--muted-foreground))" />
                <YAxis tick={{ fontSize: 9 }} width={25} domain={[0, 1]} tickFormatter={v => `${(v * 100).toFixed(0)}%`} stroke="hsl(var(--muted-foreground))" />
                <Tooltip
                  contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: '6px', fontSize: '11px' }}
                  formatter={(v: number, name: string) => [`${(v * 100).toFixed(1)}%`, name === 'first_plan_accept' ? 'Accept' : 'Corrections']}
                />
                <Line type="monotone" dataKey="first_plan_accept" stroke="hsl(142, 60%, 50%)" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="correction_rate" stroke="hsl(0, 60%, 50%)" strokeWidth={2} dot={false} />
                {versionChanges.map(week => (
                  <ReferenceLine key={week} x={week} stroke="hsl(var(--muted-foreground))" strokeDasharray="3 3" />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* Failure Label Breakdown */}
        {totalFailures > 0 && (
          <div>
            <p className="text-xs text-muted-foreground mb-1">Failure Categories</p>
            <div className="flex gap-1 h-4 rounded overflow-hidden">
              {failureEntries.map(([label, count]) => {
                const pct = (count / totalFailures) * 100
                const colors: Record<string, string> = {
                  understanding_failure: 'bg-purple-500',
                  mapping_failure: 'bg-blue-500',
                  structure_failure: 'bg-orange-500',
                  config_failure: 'bg-red-500',
                }
                return (
                  <div
                    key={label}
                    className={`${colors[label] || 'bg-gray-500'} relative group`}
                    style={{ width: `${pct}%` }}
                    title={`${label.replace('_failure', '')}: ${count} (${pct.toFixed(0)}%)`}
                  />
                )
              })}
            </div>
            <div className="flex gap-3 mt-1 text-[10px] text-muted-foreground">
              {failureEntries.map(([label, count]) => (
                <span key={label}>{label.replace('_failure', '')}: {count}</span>
              ))}
            </div>
          </div>
        )}

        {/* Recent Issues Table */}
        {data.recent_issues.length > 0 && (
          <div>
            <p className="text-xs text-muted-foreground mb-1">Recent Issues</p>
            <div className="max-h-[160px] overflow-y-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs py-1">Date</TableHead>
                    <TableHead className="text-xs py-1">Type</TableHead>
                    <TableHead className="text-xs py-1">Label</TableHead>
                    <TableHead className="text-xs py-1">Severity</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.recent_issues.slice(0, 5).map((issue, i) => (
                    <TableRow
                      key={i}
                      className="cursor-pointer hover:bg-muted/50"
                      onClick={() => onSessionClick?.(issue.conversation_id)}
                    >
                      <TableCell className="text-xs py-1 tabular-nums">
                        {issue.date.substring(5, 10)}
                      </TableCell>
                      <TableCell className="py-1">
                        <Badge variant="outline" className={`text-[10px] ${issueColors[issue.event_type] || ''}`}>
                          {issue.event_type.replace(/_/g, ' ')}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs py-1">
                        {issue.failure_label?.replace('_failure', '') || '-'}
                      </TableCell>
                      <TableCell className="text-xs py-1">
                        {issue.severity || '-'}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
