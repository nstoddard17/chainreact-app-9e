"use client"

import { useEffect } from "react"
import { useAnalyticsStore } from "@/stores/analyticsStore"
import { useAuthStore } from "@/stores/authStore"
import { useIntegrationStore } from '@/stores/integrationStore'
import { useWorkflowStore } from '@/stores/workflowStore'
import AppLayout from "@/components/layout/AppLayout"
import MetricCard from "@/components/dashboard/MetricCard"
import ActivityFeed from "@/components/dashboard/ActivityFeed"
import WorkflowChart from "@/components/dashboard/WorkflowChart"
import { OnlineStatusIndicator } from "@/components/providers/PresenceProvider"
import { Workflow, Clock, Puzzle, Zap } from "lucide-react"

export default function DashboardContent() {
  const { metrics, chartData, fetchMetrics, fetchChartData } = useAnalyticsStore()
  const { user } = useAuthStore()
  const { getConnectedProviders } = useIntegrationStore()
  const { workflows, fetchWorkflows } = useWorkflowStore()
  const connectedIntegrationsCount = getConnectedProviders().length

  // Count active workflows (workflows that are not drafts)
  const activeWorkflowsCount = workflows.filter((workflow: any) => workflow.status !== 'draft').length

  useEffect(() => {
    fetchMetrics()
    fetchChartData()
    fetchWorkflows()
  }, [fetchMetrics, fetchChartData, fetchWorkflows])

  const getFirstName = () => {
    if (user?.name) {
      return user.name.split(" ")[0]
    }
    if (user?.email) {
      return user.email.split("@")[0]
    }
    return "User"
  }

  const firstName = getFirstName()

  return (
    <AppLayout title="Dashboard" subtitle={`Welcome back, ${firstName}! Here's what's happening with your workflows.`}>
      <div className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <MetricCard
            title="Active Workflows"
            value={activeWorkflowsCount}
            icon={<Workflow className="w-6 h-6" />}
            color="blue"
          />
          <MetricCard 
            title="Hours Saved" 
            value={metrics?.hoursSaved || 0} 
            icon={<Clock className="w-6 h-6" />} 
            color="green" 
            change="+8%" 
          />
          <MetricCard
            title="Integrations"
            value={connectedIntegrationsCount}
            icon={<Puzzle className="w-6 h-6" />}
            color="purple"
          />
          <MetricCard 
            title="AI Commands" 
            value={metrics?.aiCommands || 0} 
            icon={<Zap className="w-6 h-6" />} 
            color="yellow" 
            change="+15%" 
          />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2">
            <WorkflowChart data={chartData} />
          </div>
          <div className="lg:col-span-1">
            <ActivityFeed />
          </div>
        </div>
      </div>
      <OnlineStatusIndicator />
    </AppLayout>
  )
}
