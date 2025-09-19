'use client'

import { useEffect, useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { 
  AlertCircle, 
  TrendingUp, 
  Zap, 
  Clock, 
  BarChart3,
  ChevronRight,
  Sparkles,
  AlertTriangle,
  XCircle
} from 'lucide-react'
import Link from 'next/link'

interface UsageData {
  current_period: {
    start_date: string
    end_date: string
    total_requests: number
    total_tokens: number
    total_cost_usd: number
    budget_usd: number
    remaining_budget_usd: number
    usage_percent: number
    estimated_remaining_uses: {
      min: number
      max: number
      confidence: 'high' | 'medium' | 'low'
    }
    enforcement_mode: 'soft' | 'hard' | 'none'
  }
  today: {
    requests: number
    tokens: number
    cost_usd: number
  }
  all_time: {
    requests: number
    tokens: number
    cost_usd: number
  }
  alerts: Array<{
    id: string
    alert_type: string
    alert_level: string
    message: string
    created_at: string
  }>
  thresholds: {
    warning: number
    alert: number
    hard_stop: number
  }
}

export default function AIUsageContent() {
  const [usage, setUsage] = useState<UsageData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    // Fetch immediately when page loads
    fetchUsage()

    // Only refresh every 60 seconds while user is on this page
    // This is less aggressive than 30 seconds
    const interval = setInterval(fetchUsage, 60000)

    return () => {
      clearInterval(interval)
      console.log('🛑 Stopped AI usage polling - user left settings page')
    }
  }, [])

  const fetchUsage = async () => {
    try {
      console.log('📊 Fetching AI usage data for settings page')
      const response = await fetch('/api/ai/usage')
      if (!response.ok) throw new Error('Failed to fetch usage data')
      const data = await response.json()
      setUsage(data)
      setError(null)
    } catch (err) {
      setError('Unable to load usage data')
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="container mx-auto p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-gray-200 rounded w-1/4"></div>
          <div className="h-32 bg-gray-200 rounded"></div>
          <div className="h-64 bg-gray-200 rounded"></div>
        </div>
      </div>
    )
  }

  if (error || !usage) {
    return (
      <div className="container mx-auto p-6">
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>{error || 'Unable to load usage data'}</AlertDescription>
        </Alert>
      </div>
    )
  }

  const { current_period, today, all_time, alerts, thresholds } = usage

  // Determine progress bar color based on usage
  const getProgressColor = (percent: number) => {
    if (percent >= thresholds.hard_stop) return 'bg-red-500'
    if (percent >= thresholds.alert) return 'bg-orange-500'
    if (percent >= thresholds.warning) return 'bg-yellow-500'
    return 'bg-green-500'
  }

  // Get status badge
  const getStatusBadge = (percent: number) => {
    if (percent >= thresholds.hard_stop) {
      return <Badge variant="destructive" className="gap-1"><XCircle className="h-3 w-3" /> Limit Reached</Badge>
    }
    if (percent >= thresholds.alert) {
      return <Badge variant="destructive" className="gap-1"><AlertTriangle className="h-3 w-3" /> High Usage</Badge>
    }
    if (percent >= thresholds.warning) {
      return <Badge variant="secondary" className="gap-1"><AlertCircle className="h-3 w-3" /> Moderate Usage</Badge>
    }
    return <Badge variant="secondary" className="gap-1"><Sparkles className="h-3 w-3" /> Normal Usage</Badge>
  }

  return (
    <div className="space-y-6">

      {/* Alerts */}
      {alerts.length > 0 && (
        <div className="mb-6 space-y-3">
          {alerts.map(alert => (
            <Alert 
              key={alert.id} 
              variant={alert.alert_level === 'error' ? 'destructive' : 'default'}
            >
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>Usage Alert</AlertTitle>
              <AlertDescription>{alert.message}</AlertDescription>
            </Alert>
          ))}
        </div>
      )}

      {/* Main Usage Card */}
      <Card className="mb-6">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Current Billing Period</CardTitle>
              <CardDescription>
                {new Date(current_period.start_date).toLocaleDateString()} - {new Date(current_period.end_date).toLocaleDateString()}
              </CardDescription>
            </div>
            {getStatusBadge(current_period.usage_percent)}
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Progress Bar */}
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="font-medium">Usage</span>
              <span className="text-muted-foreground">{current_period.usage_percent}%</span>
            </div>
            <Progress 
              value={current_period.usage_percent} 
              max={100}
              className="h-3"
            />
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>0%</span>
              <span>75%</span>
              <span>90%</span>
              <span>100%</span>
            </div>
          </div>

          {/* Estimated Remaining Uses */}
          {current_period.estimated_remaining_uses.confidence !== 'low' && (
            <div className="bg-muted/50 rounded-lg p-4">
              <div className="flex items-center gap-2 mb-2">
                <Zap className="h-4 w-4 text-primary" />
                <span className="font-medium">Estimated Remaining Uses</span>
              </div>
              <div className="text-2xl font-bold">
                {current_period.estimated_remaining_uses.min} - {current_period.estimated_remaining_uses.max}
              </div>
              <div className="text-xs text-muted-foreground mt-1">
                Based on your recent usage patterns ({current_period.estimated_remaining_uses.confidence} confidence)
              </div>
            </div>
          )}

          {/* CTAs based on usage */}
          {current_period.usage_percent >= thresholds.hard_stop && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>Monthly limit reached</AlertTitle>
              <AlertDescription>
                You've reached your monthly AI usage limit. Upgrade your plan to continue using AI features.
              </AlertDescription>
              <Link href="/settings/billing">
                <Button className="mt-3" variant="default">
                  Upgrade Plan <ChevronRight className="ml-2 h-4 w-4" />
                </Button>
              </Link>
            </Alert>
          )}

          {current_period.usage_percent >= thresholds.alert && current_period.usage_percent < thresholds.hard_stop && (
            <Alert>
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>High usage alert</AlertTitle>
              <AlertDescription>
                You're at {current_period.usage_percent}% of your monthly limit. Consider switching to more efficient models or upgrading your plan.
              </AlertDescription>
              <div className="mt-3 flex gap-2">
                <Button variant="outline" size="sm">
                  Optimize Usage
                </Button>
                <Link href="/settings/billing">
                  <Button size="sm">
                    Upgrade Plan
                  </Button>
                </Link>
              </div>
            </Alert>
          )}

          {current_period.usage_percent >= thresholds.warning && current_period.usage_percent < thresholds.alert && (
            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>Usage warning</AlertTitle>
              <AlertDescription>
                You've used {current_period.usage_percent}% of your monthly AI budget. Consider optimizing your usage to stay within limits.
              </AlertDescription>
              <Button variant="outline" size="sm" className="mt-3">
                View Optimization Tips
              </Button>
            </Alert>
          )}
        </CardContent>
      </Card>

      {/* Statistics Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground">Today's Usage</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{today.requests}</div>
            <p className="text-xs text-muted-foreground">
              requests • {(today.tokens / 1000).toFixed(1)}k tokens
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground">This Month</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{current_period.total_requests}</div>
            <p className="text-xs text-muted-foreground">
              requests • {(current_period.total_tokens / 1000).toFixed(1)}k tokens
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground">All Time</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{all_time.requests}</div>
            <p className="text-xs text-muted-foreground">
              requests • {(all_time.tokens / 1000).toFixed(1)}k tokens
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Advanced Stats (for power users) */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BarChart3 className="h-5 w-5" />
            Advanced Statistics
          </CardTitle>
          <CardDescription>Detailed token usage and optimization insights</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="flex justify-between items-center py-2 border-b">
              <span className="text-sm">Average tokens per request</span>
              <span className="font-medium">
                {current_period.total_requests > 0 
                  ? Math.round(current_period.total_tokens / current_period.total_requests)
                  : 0}
              </span>
            </div>
            <div className="flex justify-between items-center py-2 border-b">
              <span className="text-sm">Enforcement mode</span>
              <Badge variant="outline">
                {current_period.enforcement_mode === 'hard' ? 'Hard Stop' : 'Soft Warning'}
              </Badge>
            </div>
            <div className="flex justify-between items-center py-2">
              <span className="text-sm">Monthly budget</span>
              <span className="font-medium">
                {current_period.usage_percent}% used
              </span>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}