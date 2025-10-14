'use client'

import { useEffect, useState, useRef } from 'react'
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

import { logger } from '@/lib/utils/logger'

interface UsageData {
  usage_percent: number
  estimated_remaining?: {
    min: number
    max: number
    confidence: 'high' | 'medium' | 'low'
  }
  timestamp?: number
}

// Cache AI usage data in memory to avoid excessive API calls
let cachedUsageData: UsageData | null = null
let lastFetchTime: number = 0
const CACHE_DURATION = 5 * 60 * 1000 // 5 minutes cache
const MIN_REFRESH_INTERVAL = 30 * 1000 // Minimum 30 seconds between fetches

// Export a function to invalidate cache when AI actions occur
export const refreshAIUsage = () => {
  logger.debug('🔄 AI usage cache invalidated - will refresh on next render')
  cachedUsageData = null
  lastFetchTime = 0
}

export function AIUsageIndicator() {
  const [usage, setUsage] = useState<UsageData | null>(cachedUsageData)
  const [loading, setLoading] = useState(!cachedUsageData)
  const isMounted = useRef(true)
  const fetchTimeoutRef = useRef<NodeJS.Timeout>()

  useEffect(() => {
    isMounted.current = true

    // Check if we need to fetch new data
    const now = Date.now()
    const timeSinceLastFetch = now - lastFetchTime
    const shouldFetch = !cachedUsageData || timeSinceLastFetch > CACHE_DURATION

    if (shouldFetch) {
      fetchUsage()
    } else {
      // Use cached data
      setUsage(cachedUsageData)
      setLoading(false)

      // Schedule next fetch when cache expires
      const timeUntilExpiry = CACHE_DURATION - timeSinceLastFetch
      fetchTimeoutRef.current = setTimeout(() => {
        if (isMounted.current) {
          fetchUsage()
        }
      }, Math.max(timeUntilExpiry, MIN_REFRESH_INTERVAL))
    }

    return () => {
      isMounted.current = false
      if (fetchTimeoutRef.current) {
        clearTimeout(fetchTimeoutRef.current)
      }
    }
  }, [])

  const fetchUsage = async () => {
    // Prevent fetching if we just fetched recently
    const now = Date.now()
    if (now - lastFetchTime < MIN_REFRESH_INTERVAL) {
      logger.debug('Skipping AI usage fetch - too soon since last fetch')
      return
    }

    try {
      lastFetchTime = now
      const response = await fetch('/api/ai/usage')
      if (response.ok) {
        const data = await response.json()
        const usageData: UsageData = {
          usage_percent: data.current_period.usage_percent,
          estimated_remaining: data.current_period.estimated_remaining_uses,
          timestamp: now
        }

        // Update cache
        cachedUsageData = usageData

        // Update component state if still mounted
        if (isMounted.current) {
          setUsage(usageData)
        }
      }
    } catch (error) {
      logger.error('Failed to fetch AI usage:', error)
    } finally {
      if (isMounted.current) {
        setLoading(false)

        // Schedule next refresh
        fetchTimeoutRef.current = setTimeout(() => {
          if (isMounted.current) {
            fetchUsage()
          }
        }, CACHE_DURATION)
      }
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