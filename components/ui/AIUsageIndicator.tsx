'use client'

import { useEffect, useState } from 'react'
import { Progress } from '@/components/ui/progress'
import { Button } from '@/components/ui/button'
import { Sparkles, AlertTriangle, XCircle } from 'lucide-react'
import Link from 'next/link'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'

interface UsageData {
  usage_percent: number
  estimated_remaining?: {
    min: number
    max: number
    confidence: 'high' | 'medium' | 'low'
  }
}

export function AIUsageIndicator() {
  const [usage, setUsage] = useState<UsageData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchUsage()
    // Refresh every 2 minutes
    const interval = setInterval(fetchUsage, 120000)
    return () => clearInterval(interval)
  }, [])

  const fetchUsage = async () => {
    try {
      const response = await fetch('/api/ai/usage')
      if (response.ok) {
        const data = await response.json()
        setUsage({
          usage_percent: data.current_period.usage_percent,
          estimated_remaining: data.current_period.estimated_remaining_uses
        })
      }
    } catch (error) {
      console.error('Failed to fetch AI usage:', error)
    } finally {
      setLoading(false)
    }
  }

  if (loading || !usage) {
    return null
  }

  // Determine color and icon based on usage
  const getIndicatorStyle = (percent: number) => {
    if (percent >= 100) {
      return {
        icon: <XCircle className="h-4 w-4" />,
        color: 'text-red-500',
        progressColor: 'bg-red-500',
        bgColor: 'bg-red-50 hover:bg-red-100'
      }
    }
    if (percent >= 90) {
      return {
        icon: <AlertTriangle className="h-4 w-4" />,
        color: 'text-orange-500',
        progressColor: 'bg-orange-500',
        bgColor: 'bg-orange-50 hover:bg-orange-100'
      }
    }
    if (percent >= 75) {
      return {
        icon: <AlertTriangle className="h-4 w-4" />,
        color: 'text-yellow-500',
        progressColor: 'bg-yellow-500',
        bgColor: 'bg-yellow-50 hover:bg-yellow-100'
      }
    }
    return {
      icon: <Sparkles className="h-4 w-4" />,
      color: 'text-primary',
      progressColor: 'bg-primary',
      bgColor: 'hover:bg-accent'
    }
  }

  const style = getIndicatorStyle(usage.usage_percent)

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Link href="/settings/ai-usage">
            <Button
              variant="ghost"
              size="sm"
              className={`gap-2 transition-colors ${style.bgColor}`}
            >
              <span className={style.color}>{style.icon}</span>
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium">{usage.usage_percent}%</span>
                <div className="w-16 h-1.5 bg-gray-200 rounded-full overflow-hidden">
                  <div 
                    className={`h-full transition-all ${style.progressColor}`}
                    style={{ width: `${Math.min(100, usage.usage_percent)}%` }}
                  />
                </div>
              </div>
            </Button>
          </Link>
        </TooltipTrigger>
        <TooltipContent>
          <div className="space-y-1">
            <p className="font-medium">AI Usage: {usage.usage_percent}%</p>
            {usage.estimated_remaining && usage.estimated_remaining.confidence !== 'low' && (
              <p className="text-xs text-muted-foreground">
                ~{usage.estimated_remaining.min}-{usage.estimated_remaining.max} uses remaining
              </p>
            )}
            {usage.usage_percent >= 100 && (
              <p className="text-xs text-red-600 font-medium">Monthly limit reached</p>
            )}
            {usage.usage_percent >= 90 && usage.usage_percent < 100 && (
              <p className="text-xs text-orange-600 font-medium">High usage - consider upgrading</p>
            )}
            {usage.usage_percent >= 75 && usage.usage_percent < 90 && (
              <p className="text-xs text-yellow-600 font-medium">Approaching limit</p>
            )}
            <p className="text-xs text-muted-foreground mt-1">Click to view details</p>
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}