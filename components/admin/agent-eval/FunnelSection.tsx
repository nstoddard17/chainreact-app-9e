"use client"

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { FunnelChart } from './FunnelChart'
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, Area, AreaChart } from 'recharts'
import type { FunnelDashboardData } from '@/lib/eval/agentEvalTypes'

interface FunnelSectionProps {
  data: FunnelDashboardData
}

export function FunnelSection({ data }: FunnelSectionProps) {
  return (
    <Card className="bg-card">
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Funnel</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <FunnelChart steps={data.funnel} biggestDropoff={data.biggest_dropoff} />

        {data.daily_activations.length > 0 && (
          <div>
            <p className="text-xs text-muted-foreground mb-2">Daily Activations</p>
            <ResponsiveContainer width="100%" height={120}>
              <AreaChart data={data.daily_activations}>
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 10 }}
                  tickFormatter={(d) => d.substring(5)}
                  stroke="hsl(var(--muted-foreground))"
                />
                <YAxis
                  tick={{ fontSize: 10 }}
                  width={30}
                  stroke="hsl(var(--muted-foreground))"
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: 'hsl(var(--card))',
                    border: '1px solid hsl(var(--border))',
                    borderRadius: '6px',
                    fontSize: '12px',
                  }}
                />
                <Area
                  type="monotone"
                  dataKey="count"
                  stroke="hsl(142, 60%, 50%)"
                  fill="hsl(142, 60%, 50%)"
                  fillOpacity={0.15}
                  strokeWidth={2}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
