"use client"

import type { FunnelStep } from '@/lib/eval/agentEvalTypes'

interface FunnelChartProps {
  steps: FunnelStep[]
  biggestDropoff: { from: string; to: string; pct_lost: number } | null
}

export function FunnelChart({ steps, biggestDropoff }: FunnelChartProps) {
  if (steps.length === 0) return <div className="text-muted-foreground text-sm">No funnel data</div>

  const maxCount = Math.max(...steps.map(s => s.count), 1)

  return (
    <div className="space-y-3">
      {steps.map((step, i) => {
        const widthPct = (step.count / maxCount) * 100
        // Gradient from blue to green
        const hue = 200 + (i / (steps.length - 1)) * 80 // 200 (blue) → 140 (green-ish)

        return (
          <div key={step.stage} className="space-y-1">
            <div className="flex items-center justify-between text-sm">
              <span className="font-medium text-foreground">{step.stage}</span>
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground tabular-nums">{step.count}</span>
                {i > 0 && (
                  <span className={`text-xs tabular-nums ${step.conversion_pct >= 80 ? 'text-green-600 dark:text-green-400' : step.conversion_pct >= 50 ? 'text-yellow-600 dark:text-yellow-400' : 'text-red-600 dark:text-red-400'}`}>
                    {step.conversion_pct.toFixed(1)}%
                  </span>
                )}
              </div>
            </div>
            <div className="h-6 bg-muted/30 rounded overflow-hidden">
              <div
                className="h-full rounded transition-all duration-500"
                style={{
                  width: `${widthPct}%`,
                  backgroundColor: `hsl(${hue}, 60%, 50%)`,
                  opacity: 0.85,
                }}
              />
            </div>
          </div>
        )
      })}

      {biggestDropoff && (
        <div className="mt-3 flex items-center gap-2 text-sm bg-yellow-100 dark:bg-yellow-500/20 text-yellow-800 dark:text-yellow-300 px-3 py-2 rounded-md">
          <span>⚠</span>
          <span>
            Biggest drop: <strong>{biggestDropoff.from} → {biggestDropoff.to}</strong> ({biggestDropoff.pct_lost}% lost)
          </span>
        </div>
      )}
    </div>
  )
}
