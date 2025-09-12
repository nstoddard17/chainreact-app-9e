"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import { Workflow, Zap, Puzzle, HardDrive, Users } from "lucide-react"

interface UsageStatsProps {
  usage: any
  subscription: any
}

export default function UsageStats({ usage, subscription }: UsageStatsProps) {
  if (!usage || !subscription?.plan) {
    return (
      <Card className="bg-white rounded-2xl shadow-lg border border-slate-200 h-full">
        <CardHeader>
          <CardTitle className="text-xl font-semibold text-slate-900">Usage Statistics</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-6">
            <p className="text-slate-500">No usage data available</p>
          </div>
        </CardContent>
      </Card>
    )
  }

  const plan = subscription.plan

  const usageMetrics = [
    {
      name: "Workflows",
      icon: Workflow,
      current: usage.workflow_count,
      limit: plan.max_workflows,
      color: "blue",
    },
    {
      name: "Executions",
      icon: Zap,
      current: usage.execution_count,
      limit: plan.max_executions_per_month,
      color: "green",
    },
    {
      name: "Integrations",
      icon: Puzzle,
      current: usage.integration_count,
      limit: plan.max_integrations,
      color: "purple",
    },
    {
      name: "Storage",
      icon: HardDrive,
      current: usage.storage_used_mb,
      limit: plan.max_storage_mb,
      color: "yellow",
      unit: "MB",
    },
    {
      name: "Team Members",
      icon: Users,
      current: usage.team_member_count,
      limit: plan.max_team_members,
      color: "pink",
    },
  ]

  return (
    <Card className="bg-white rounded-2xl shadow-lg border border-slate-200 h-full">
      <CardHeader>
        <CardTitle className="text-xl font-semibold text-slate-900">Usage Statistics</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {usageMetrics.map((metric) => (
          <UsageMetric key={metric.name} metric={metric} />
        ))}
      </CardContent>
    </Card>
  )
}

interface UsageMetricProps {
  metric: {
    name: string
    icon: any
    current: number
    limit: number
    color: string
    unit?: string
  }
}

function UsageMetric({ metric }: UsageMetricProps) {
  const { name, icon: Icon, current, limit, color, unit = "" } = metric
  const isUnlimited = limit === -1
  const percentage = isUnlimited ? 0 : Math.min((current / limit) * 100, 100)
  const isNearLimit = percentage > 80
  const isOverLimit = percentage >= 100

  const getColorClass = () => {
    if (isOverLimit) return "text-red-600"
    if (isNearLimit) return "text-yellow-600"

    switch (color) {
      case "blue":
        return "text-blue-600"
      case "green":
        return "text-green-600"
      case "purple":
        return "text-purple-600"
      case "yellow":
        return "text-yellow-600"
      case "pink":
        return "text-pink-600"
      default:
        return "text-slate-600"
    }
  }

  const getProgressColor = () => {
    if (isOverLimit) return "bg-red-500"
    if (isNearLimit) return "bg-yellow-500"

    switch (color) {
      case "blue":
        return "bg-blue-500"
      case "green":
        return "bg-green-500"
      case "purple":
        return "bg-purple-500"
      case "yellow":
        return "bg-yellow-500"
      case "pink":
        return "bg-pink-500"
      default:
        return "bg-slate-500"
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-2">
          <Icon className={`w-5 h-5 ${getColorClass()}`} />
          <span className="font-medium text-slate-700">{name}</span>
        </div>
        <div className="text-sm">
          <span className={isOverLimit ? "text-red-600 font-medium" : "text-slate-600"}>
            {current.toLocaleString()}
          </span>
          <span className="text-slate-400 mx-1">/</span>
          <span className="text-slate-500">{isUnlimited ? "Unlimited" : limit.toLocaleString() + unit}</span>
        </div>
      </div>
      {!isUnlimited && (
        <Progress value={percentage} className="h-2 bg-slate-100" indicatorClassName={getProgressColor()} />
      )}
    </div>
  )
}
