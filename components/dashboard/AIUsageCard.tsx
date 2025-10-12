"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { MessageSquare, PenTool, Zap, TrendingUp, AlertTriangle } from "lucide-react"
import { useBillingStore } from "@/stores/billingStore"
import Link from "next/link"

import { logger } from '@/lib/utils/logger'

interface AIUsageData {
  ai_assistant_calls: number
  ai_compose_uses: number
  ai_agent_executions: number
  ai_assistant_limit: number
  ai_compose_limit: number
  ai_agent_limit: number
}

export default function AIUsageCard() {
  const [usage, setUsage] = useState<AIUsageData | null>(null)
  const [loading, setLoading] = useState(true)
  const { currentSubscription } = useBillingStore()

  useEffect(() => {
    fetchAIUsage()
  }, [])

  const fetchAIUsage = async () => {
    try {
      const response = await fetch('/api/usage/ai')
      if (response.ok) {
        const data = await response.json()
        setUsage(data)
      }
    } catch (error) {
      logger.error('Failed to fetch AI usage:', error)
    } finally {
      setLoading(false)
    }
  }

  const getUsagePercentage = (current: number, limit: number) => {
    if (limit === -1) return 0 // Unlimited
    return Math.min((current / limit) * 100, 100)
  }

  const getUsageColor = (percentage: number) => {
    if (percentage >= 90) return "text-red-600"
    if (percentage >= 75) return "text-yellow-600"
    return "text-green-600"
  }

  const getProgressColor = (percentage: number) => {
    if (percentage >= 90) return "bg-red-500"
    if (percentage >= 75) return "bg-yellow-500"
    return "bg-green-500"
  }

  if (loading) {
    return (
      <Card className="bg-white rounded-2xl shadow-lg border border-slate-200">
        <CardHeader>
          <CardTitle className="text-lg font-semibold text-slate-900">AI Usage</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="animate-pulse space-y-4">
            <div className="h-4 bg-slate-200 rounded"></div>
            <div className="h-4 bg-slate-200 rounded w-3/4"></div>
            <div className="h-4 bg-slate-200 rounded w-1/2"></div>
          </div>
        </CardContent>
      </Card>
    )
  }

  if (!usage) {
    return null
  }

  const assistantPercentage = getUsagePercentage(usage.ai_assistant_calls, usage.ai_assistant_limit)
  const composePercentage = getUsagePercentage(usage.ai_compose_uses, usage.ai_compose_limit)
  const agentPercentage = getUsagePercentage(usage.ai_agent_executions, usage.ai_agent_limit)

  const totalUsed = usage.ai_assistant_calls + usage.ai_compose_uses + usage.ai_agent_executions
  const totalLimit = usage.ai_assistant_limit + usage.ai_compose_limit + usage.ai_agent_limit
  const totalPercentage = totalLimit > 0 ? getUsagePercentage(totalUsed, totalLimit) : 0

  return (
    <Card className="bg-white rounded-2xl shadow-lg border border-slate-200">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg font-semibold text-slate-900 flex items-center gap-2">
            <Zap className="w-5 h-5 text-blue-600" />
            AI Usage This Month
          </CardTitle>
          {totalPercentage >= 90 && (
            <Badge variant="destructive" className="flex items-center gap-1">
              <AlertTriangle className="w-3 h-3" />
              Near Limit
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Overall Usage */}
        <div className="space-y-2">
          <div className="flex justify-between items-center">
            <span className="text-sm font-medium text-slate-700">Total AI Messages</span>
            <span className={`text-sm font-semibold ${getUsageColor(totalPercentage)}`}>
              {totalUsed} / {totalLimit === -1 ? '∞' : totalLimit}
            </span>
          </div>
          <Progress 
            value={totalPercentage} 
            className="h-2"
            style={{
              '--progress-background': getProgressColor(totalPercentage)
            } as React.CSSProperties}
          />
        </div>

        {/* Individual Usage Types */}
        <div className="space-y-3">
          {/* AI Assistant */}
          <div className="space-y-2">
            <div className="flex justify-between items-center">
              <div className="flex items-center gap-2">
                <MessageSquare className="w-4 h-4 text-blue-500" />
                <span className="text-sm font-medium text-slate-700">AI Assistant</span>
              </div>
              <span className={`text-sm font-semibold ${getUsageColor(assistantPercentage)}`}>
                {usage.ai_assistant_calls} / {usage.ai_assistant_limit === -1 ? '∞' : usage.ai_assistant_limit}
              </span>
            </div>
            <Progress 
              value={assistantPercentage} 
              className="h-1.5"
              style={{
                '--progress-background': getProgressColor(assistantPercentage)
              } as React.CSSProperties}
            />
          </div>

          {/* AI Compose */}
          <div className="space-y-2">
            <div className="flex justify-between items-center">
              <div className="flex items-center gap-2">
                <PenTool className="w-4 h-4 text-green-500" />
                <span className="text-sm font-medium text-slate-700">AI Compose</span>
              </div>
              <span className={`text-sm font-semibold ${getUsageColor(composePercentage)}`}>
                {usage.ai_compose_uses} / {usage.ai_compose_limit === -1 ? '∞' : usage.ai_compose_limit}
              </span>
            </div>
            <Progress 
              value={composePercentage} 
              className="h-1.5"
              style={{
                '--progress-background': getProgressColor(composePercentage)
              } as React.CSSProperties}
            />
          </div>

          {/* AI Agent */}
          <div className="space-y-2">
            <div className="flex justify-between items-center">
              <div className="flex items-center gap-2">
                <Zap className="w-4 h-4 text-purple-500" />
                <span className="text-sm font-medium text-slate-700">AI Agent</span>
              </div>
              <span className={`text-sm font-semibold ${getUsageColor(agentPercentage)}`}>
                {usage.ai_agent_executions} / {usage.ai_agent_limit === -1 ? '∞' : usage.ai_agent_limit}
              </span>
            </div>
            <Progress 
              value={agentPercentage} 
              className="h-1.5"
              style={{
                '--progress-background': getProgressColor(agentPercentage)
              } as React.CSSProperties}
            />
          </div>
        </div>

        {/* Upgrade Prompt */}
        {totalPercentage >= 75 && (
          <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
            <div className="flex items-start gap-3">
              <TrendingUp className="w-5 h-5 text-blue-600 mt-0.5" />
              <div className="flex-1">
                <h4 className="text-sm font-semibold text-blue-900 mb-1">
                  Need More AI Power?
                </h4>
                <p className="text-sm text-blue-700 mb-3">
                  You're using {Math.round(totalPercentage)}% of your AI usage limit. Upgrade your plan for more AI messages.
                </p>
                <Link href="/settings/billing">
                  <Button size="sm" className="bg-blue-600 hover:bg-blue-700">
                    Upgrade Plan
                  </Button>
                </Link>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
} 