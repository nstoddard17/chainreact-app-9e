"use client"

import React, { useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { DollarSign, TrendingUp, Info } from 'lucide-react'
import { CostBreakdown } from '@/lib/workflows/ai-agent/cost-tracker'

interface CostDisplayProps {
  estimate?: number
  actual?: number
  breakdown?: CostBreakdown[]
  variant?: 'header' | 'inline'
}

/**
 * Cost Display Component
 * Shows estimated or actual cost with breakdown popover
 */
export function CostDisplay({
  estimate,
  actual,
  breakdown = [],
  variant = 'header'
}: CostDisplayProps) {
  const [isOpen, setIsOpen] = useState(false)

  const displayCost = actual !== undefined ? actual : estimate
  const isEstimate = actual === undefined && estimate !== undefined
  const hasBreakdown = breakdown.length > 0

  if (displayCost === undefined) {
    return null
  }

  const costText = formatCost(displayCost)

  if (variant === 'inline') {
    return (
      <div className="inline-flex items-center gap-2 text-sm text-muted-foreground">
        <DollarSign className="w-4 h-4" />
        <span>{isEstimate ? 'Est. ' : ''}{costText}</span>
      </div>
    )
  }

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="flex items-center gap-2"
        >
          <DollarSign className="w-4 h-4" />
          <span className="font-mono text-sm">
            {isEstimate ? 'Est. ' : ''}{costText}
          </span>
          {hasBreakdown && <Info className="w-3 h-3 opacity-50" />}
        </Button>
      </PopoverTrigger>

      {hasBreakdown && (
        <PopoverContent className="w-96" align="end">
          <CostBreakdownDisplay
            estimate={estimate}
            actual={actual}
            breakdown={breakdown}
          />
        </PopoverContent>
      )}
    </Popover>
  )
}

/**
 * Cost Breakdown Display (inside popover)
 */
function CostBreakdownDisplay({
  estimate,
  actual,
  breakdown
}: {
  estimate?: number
  actual?: number
  breakdown: CostBreakdown[]
}) {
  // Group by provider
  const byProvider = breakdown.reduce((acc, entry) => {
    if (!acc[entry.provider]) {
      acc[entry.provider] = {
        cost: 0,
        tokens: { input: 0, output: 0, total: 0 },
        entries: []
      }
    }
    acc[entry.provider].cost += entry.cost
    if (entry.tokens) {
      acc[entry.provider].tokens.input += entry.tokens.input
      acc[entry.provider].tokens.output += entry.tokens.output
      acc[entry.provider].tokens.total += entry.tokens.total
    }
    acc[entry.provider].entries.push(entry)
    return acc
  }, {} as Record<string, { cost: number; tokens: any; entries: CostBreakdown[] }>)

  const totalCost = breakdown.reduce((sum, entry) => sum + entry.cost, 0)
  const totalTokens = breakdown.reduce(
    (acc, entry) => {
      if (entry.tokens) {
        acc.input += entry.tokens.input
        acc.output += entry.tokens.output
        acc.total += entry.tokens.total
      }
      return acc
    },
    { input: 0, output: 0, total: 0 }
  )

  return (
    <div className="space-y-4">
      {/* Header */}
      <div>
        <h3 className="font-semibold text-sm mb-1">
          Cost Breakdown
        </h3>
        <p className="text-xs text-muted-foreground">
          {estimate !== undefined && actual === undefined && (
            <>Estimated cost for this workflow</>
          )}
          {actual !== undefined && (
            <>Actual cost from execution</>
          )}
        </p>
      </div>

      {/* Comparison (if both estimate and actual exist) */}
      {estimate !== undefined && actual !== undefined && (
        <div className="flex items-center gap-2 p-3 bg-muted rounded-lg">
          <TrendingUp className={`w-4 h-4 ${
            actual > estimate ? 'text-red-500' : 'text-green-500'
          }`} />
          <div className="flex-1 text-xs">
            <div className="font-medium">
              {actual > estimate ? 'Over' : 'Under'} estimate
            </div>
            <div className="text-muted-foreground">
              {formatCost(Math.abs(actual - estimate))} difference
            </div>
          </div>
        </div>
      )}

      {/* Total */}
      <div className="flex justify-between items-center py-2 border-b">
        <span className="font-semibold text-sm">Total</span>
        <span className="font-mono font-semibold">{formatCost(totalCost)}</span>
      </div>

      {/* By Provider */}
      <div className="space-y-3">
        <div className="text-xs font-medium text-muted-foreground uppercase">
          By Provider
        </div>
        {Object.entries(byProvider).map(([provider, data]) => (
          <div key={provider} className="space-y-2">
            <div className="flex justify-between items-center">
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="text-xs">
                  {provider}
                </Badge>
                <span className="text-xs text-muted-foreground">
                  {data.entries.length} call{data.entries.length !== 1 ? 's' : ''}
                </span>
              </div>
              <span className="font-mono text-sm">{formatCost(data.cost)}</span>
            </div>

            {/* Tokens */}
            {data.tokens.total > 0 && (
              <div className="text-xs text-muted-foreground pl-4">
                {formatNumber(data.tokens.input)} in · {formatNumber(data.tokens.output)} out · {formatNumber(data.tokens.total)} total
              </div>
            )}

            {/* Individual entries */}
            <div className="pl-4 space-y-1">
              {data.entries.map((entry, idx) => (
                <div key={idx} className="flex justify-between items-center text-xs">
                  <span className="text-muted-foreground truncate max-w-[200px]">
                    {entry.nodeName}
                  </span>
                  <span className="font-mono">{formatCost(entry.cost)}</span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Total Tokens */}
      {totalTokens.total > 0 && (
        <div className="pt-3 border-t">
          <div className="text-xs font-medium text-muted-foreground uppercase mb-2">
            Total Tokens
          </div>
          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="space-y-1">
              <div className="text-xs text-muted-foreground">Input</div>
              <div className="font-mono text-sm">{formatNumber(totalTokens.input)}</div>
            </div>
            <div className="space-y-1">
              <div className="text-xs text-muted-foreground">Output</div>
              <div className="font-mono text-sm">{formatNumber(totalTokens.output)}</div>
            </div>
            <div className="space-y-1">
              <div className="text-xs text-muted-foreground">Total</div>
              <div className="font-mono text-sm font-semibold">{formatNumber(totalTokens.total)}</div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

/**
 * Format cost for display
 */
function formatCost(cost: number): string {
  if (cost < 0.01) {
    return '< $0.01'
  }
  return `$${cost.toFixed(2)}`
}

/**
 * Format large numbers with commas
 */
function formatNumber(num: number): string {
  return num.toLocaleString('en-US')
}
