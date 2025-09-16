"use client"

import { useEffect } from "react"
import { useSearchParams } from "next/navigation"
import { useAnalyticsStore } from "@/stores/analyticsStore"
import { useAuthStore } from "@/stores/authStore"
import { useIntegrationStore } from '@/stores/integrationStore'
import { useWorkflowStore } from '@/stores/workflowStore'
import { useTimeoutLoading } from '@/hooks/use-timeout-loading'
import AppLayout from "@/components/layout/AppLayout"
import MetricCard from "@/components/dashboard/MetricCard"
import ActivityFeed from "@/components/dashboard/ActivityFeed"
import WorkflowChart from "@/components/dashboard/WorkflowChart"
import AIUsageCard from "./AIUsageCard"
import { OnlineUsersIndicator } from "@/components/providers/LightweightPresenceProvider"
import { Workflow, Puzzle } from "lucide-react"

export default function DashboardContent() {
  const searchParams = useSearchParams()
  const { metrics, chartData, fetchMetrics, fetchChartData } = useAnalyticsStore()
  const { user, profile } = useAuthStore()
  const { getConnectedProviders, fetchIntegrations } = useIntegrationStore()
  const { workflows, fetchWorkflows } = useWorkflowStore()
  const connectedIntegrationsCount = getConnectedProviders().length

  // Count active workflows (workflows that are not drafts)
  const activeWorkflowsCount = workflows.filter((workflow: any) => workflow.status !== 'draft').length


  // Use timeout loading for all data fetching with parallel loading
  useTimeoutLoading({
    loadFunction: async (force) => {
      if (!user) return null

      // Load all data in parallel for maximum speed
      const promises = [
        fetchMetrics().catch(error => {
          console.warn('Failed to fetch metrics:', error)
          return null
        }),
        fetchChartData().catch(error => {
          console.warn('Failed to fetch chart data:', error)
          return null
        }),
        fetchWorkflows().catch(error => {
          console.warn('Failed to fetch workflows:', error)
          return null
        }),
        fetchIntegrations(force).catch(error => {
          console.warn('Failed to fetch integrations:', error)
          return null
        })
      ]

      // Wait for all to complete (don't fail if some fail)
      await Promise.allSettled(promises)
      return true
    },
    timeout: 8000, // 8 second timeout for dashboard
    forceRefreshOnMount: false, // Dashboard can use cached data
    dependencies: [user]
  })

  const getFirstName = () => {
    // First try username from profile
    if (profile?.username) {
      return profile.username
    }
    // Then try full name and extract first part
    if (profile?.full_name) {
      return profile.full_name.split(" ")[0]
    }
    // Fallback to user name if available
    if (user?.name) {
      return user.name.split(" ")[0]
    }
    // Last resort: extract from email
    if (user?.email) {
      return user.email.split("@")[0]
    }
    return "User"
  }

  const firstName = getFirstName()

  return (
    <AppLayout title="Dashboard" subtitle={`Welcome back, ${firstName}! Here's what's happening with your workflows.`}>
      <div className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <MetricCard
            title="Active Workflows"
            value={activeWorkflowsCount}
            icon={<Workflow className="w-6 h-6" />}
            color="blue"
          />
          <MetricCard
            title="Integrations"
            value={connectedIntegrationsCount}
            icon={<Puzzle className="w-6 h-6" />}
            color="purple"
          />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2">
            <WorkflowChart data={chartData} />
          </div>
          <div className="lg:col-span-1 space-y-6">
            <AIUsageCard />
            <ActivityFeed />
          </div>
        </div>
      </div>
      <OnlineUsersIndicator className="fixed bottom-4 right-4 bg-gray-900/90 text-white px-3 py-2 rounded-lg text-sm backdrop-blur-sm border border-gray-700" />
    </AppLayout>
  )
}
