"use client"

import { useEffect, useState } from "react"
import { useAnalyticsStore } from "@/stores/analyticsStore"
import { useAuthStore } from "@/stores/authStore"
import { useIntegrationStore } from '@/stores/integrationStore'
import { useWorkflowStore } from '@/stores/workflowStore'
import { useTimeoutLoading } from '@/hooks/use-timeout-loading'
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Workflow, Puzzle, Activity, TrendingUp, Zap, Clock, CheckCircle2, PlayCircle, Loader2, ArrowRight } from "lucide-react"
import { logger } from '@/lib/utils/logger'
import { useRouter } from 'next/navigation'
import { Button } from "@/components/ui/button"

export function DashboardContentRedesign() {
  const router = useRouter()
  const { metrics, chartData, fetchMetrics, fetchChartData } = useAnalyticsStore()
  const { user, profile } = useAuthStore()
  const { getConnectedProviders, fetchIntegrations } = useIntegrationStore()
  const { workflows, fetchWorkflows } = useWorkflowStore()
  const [isClientReady, setIsClientReady] = useState(false)
  const connectedIntegrationsCount = getConnectedProviders().length

  const activeWorkflowsCount = workflows.filter((workflow: any) => workflow.status === 'active').length
  const totalExecutions = metrics?.totalExecutions || 0
  const successRate = metrics?.successRate || 0

  useEffect(() => {
    setIsClientReady(true)
  }, [])

  useTimeoutLoading({
    loadFunction: async (force) => {
      if (!user) return null

      const promises = [
        fetchMetrics().catch(error => {
          logger.warn('Failed to fetch metrics:', error)
          return null
        }),
        fetchChartData().catch(error => {
          logger.warn('Failed to fetch chart data:', error)
          return null
        }),
        fetchWorkflows().catch(error => {
          logger.warn('Failed to fetch workflows:', error)
          return null
        }),
        fetchIntegrations(force).catch(error => {
          logger.warn('Failed to fetch integrations:', error)
          return null
        })
      ]

      await Promise.allSettled(promises)
      return true
    },
    timeout: 5000,
    forceRefreshOnMount: false,
    dependencies: [user],
    onError: (error) => {
      logger.warn('Dashboard data loading error (non-blocking):', error)
    }
  })

  const getFirstName = () => {
    if (profile?.username) return profile.username
    if (profile?.full_name) return profile.full_name.split(" ")[0]
    if (user?.name) return user.name.split(" ")[0]
    if (user?.email) return user.email.split("@")[0]
    return "User"
  }

  const firstName = getFirstName()
  const recentWorkflows = workflows.slice(0, 5)

  const metricCards = [
    {
      title: "Active Workflows",
      value: activeWorkflowsCount,
      icon: Workflow,
      color: "text-blue-600 dark:text-blue-400",
      bgColor: "bg-blue-100 dark:bg-blue-500/10",
      description: "Currently running"
    },
    {
      title: "Integrations",
      value: connectedIntegrationsCount,
      icon: Puzzle,
      color: "text-purple-600 dark:text-purple-400",
      bgColor: "bg-purple-100 dark:bg-purple-500/10",
      description: "Connected services"
    },
    {
      title: "Total Executions",
      value: totalExecutions,
      icon: Activity,
      color: "text-green-600 dark:text-green-400",
      bgColor: "bg-green-100 dark:bg-green-500/10",
      description: "All time"
    },
    {
      title: "Success Rate",
      value: `${successRate}%`,
      icon: TrendingUp,
      color: "text-orange-600 dark:text-orange-400",
      bgColor: "bg-orange-100 dark:bg-orange-500/10",
      description: "Execution success"
    },
  ]

  return (
    <div className="space-y-6">
      {/* Welcome Header */}
      <div>
        <h1 className="text-2xl lg:text-3xl font-bold text-foreground mb-1">
          Welcome back, {firstName}
        </h1>
        <p className="text-muted-foreground">Here's an overview of your automation platform</p>
      </div>

      {/* Metrics Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        {metricCards.map((metric, index) => (
          <Card key={index} className="hover:shadow-md transition-shadow">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                {metric.title}
              </CardTitle>
              <div className={`p-2 rounded-lg ${metric.bgColor}`}>
                <metric.icon className={`h-5 w-5 ${metric.color}`} />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-foreground mb-1">{metric.value}</div>
              <p className="text-xs text-muted-foreground">{metric.description}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Recent Workflows */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-xl">Recent Workflows</CardTitle>
              <p className="text-sm text-muted-foreground mt-1">Your most recently updated workflows</p>
            </div>
            <Button
              variant="outline"
              onClick={() => router.push('/workflows')}
            >
              View All
              <ArrowRight className="h-4 w-4 ml-2" />
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {!isClientReady || workflows.length === 0 ? (
            recentWorkflows.length === 0 && isClientReady ? (
              <div className="text-center py-12">
                <Workflow className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                <p className="text-muted-foreground mb-4">No workflows yet</p>
                <Button onClick={() => router.push('/workflows')}>
                  <Zap className="h-4 w-4 mr-2" />
                  Create Your First Workflow
                </Button>
              </div>
            ) : (
              <div className="flex justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            )
          ) : (
            <div className="space-y-3">
              {recentWorkflows.map((workflow: any) => (
                <div
                  key={workflow.id}
                  className="flex items-center gap-4 p-4 border rounded-lg hover:bg-muted/30 transition-colors cursor-pointer"
                  onClick={() => router.push(`/workflows/builder?id=${workflow.id}`)}
                >
                  <div className={`p-2 rounded-lg ${
                    workflow.status === 'active'
                      ? 'bg-green-100 dark:bg-green-500/10'
                      : 'bg-muted'
                  }`}>
                    {workflow.status === 'active' ? (
                      <PlayCircle className="w-5 h-5 text-green-600 dark:text-green-400" />
                    ) : (
                      <Clock className="w-5 h-5 text-muted-foreground" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-medium text-foreground truncate">{workflow.name}</h3>
                    <p className="text-sm text-muted-foreground truncate">
                      {workflow.description || 'No description'}
                    </p>
                  </div>
                  <div className={`px-3 py-1 rounded-full text-xs font-medium ${
                    workflow.status === 'active'
                      ? 'bg-green-100 text-green-700 dark:bg-green-500/10 dark:text-green-400'
                      : workflow.status === 'paused'
                      ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-500/10 dark:text-yellow-400'
                      : 'bg-muted text-muted-foreground'
                  }`}>
                    {workflow.status || 'draft'}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Quick Actions */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card className="group hover:shadow-md transition-all cursor-pointer" onClick={() => router.push('/workflows')}>
          <CardHeader>
            <div className="p-3 bg-blue-100 dark:bg-blue-500/10 rounded-lg inline-flex w-fit mb-3">
              <Zap className="w-6 h-6 text-blue-600 dark:text-blue-400" />
            </div>
            <CardTitle className="group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
              Create Workflow
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              Build a new automation workflow from scratch or use a template
            </p>
          </CardContent>
        </Card>

        <Card className="group hover:shadow-md transition-all cursor-pointer" onClick={() => router.push('/workflows/templates')}>
          <CardHeader>
            <div className="p-3 bg-purple-100 dark:bg-purple-500/10 rounded-lg inline-flex w-fit mb-3">
              <Workflow className="w-6 h-6 text-purple-600 dark:text-purple-400" />
            </div>
            <CardTitle className="group-hover:text-purple-600 dark:group-hover:text-purple-400 transition-colors">
              Browse Templates
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              Get started quickly with pre-built workflow templates
            </p>
          </CardContent>
        </Card>

        <Card className="group hover:shadow-md transition-all cursor-pointer" onClick={() => router.push('/integrations')}>
          <CardHeader>
            <div className="p-3 bg-green-100 dark:bg-green-500/10 rounded-lg inline-flex w-fit mb-3">
              <Puzzle className="w-6 h-6 text-green-600 dark:text-green-400" />
            </div>
            <CardTitle className="group-hover:text-green-600 dark:group-hover:text-green-400 transition-colors">
              Connect Apps
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              Add new integrations to expand your automation capabilities
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
