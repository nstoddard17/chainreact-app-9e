"use client"

import { useEffect, useState } from "react"
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
import { Skeleton, SkeletonCard } from "@/components/ui/skeleton-loader"

export default function DashboardContent() {
  const searchParams = useSearchParams()
  const { metrics, chartData, fetchMetrics, fetchChartData } = useAnalyticsStore()
  const { user, profile, initialized, hydrated } = useAuthStore()
  const { getConnectedProviders, fetchIntegrations } = useIntegrationStore()
  const { workflows, fetchWorkflows } = useWorkflowStore()
  const [isClientReady, setIsClientReady] = useState(false)
  const connectedIntegrationsCount = getConnectedProviders().length

  // Count active workflows (workflows that are not drafts)
  const activeWorkflowsCount = workflows.filter((workflow: any) => workflow.status !== 'draft').length

  // Ensure client-side only code runs after mount
  useEffect(() => {
    setIsClientReady(true)
  }, [])

  // Debug logging
  useEffect(() => {
    if (isClientReady) {
      console.log('🎯 [Dashboard] Auth state:', {
        user: user ? {
          id: user.id,
          email: user.email,
          name: user.name,
          first_name: user.first_name,
          last_name: user.last_name,
          full_name: user.full_name
        } : null,
        profile: profile ? {
          id: profile.id,
          username: profile.username,
          user_role: profile.role,
          full_name: profile.full_name,
          first_name: profile.first_name,
          last_name: profile.last_name
        } : null,
        initialized,
        hydrated
      })
    }
  }, [user, profile, initialized, hydrated, isClientReady])


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
    console.log('📝 [Dashboard] Getting first name from:', {
      'profile.username': profile?.username,
      'profile.full_name': profile?.full_name,
      'user.name': user?.name,
      'user.email': user?.email
    })

    // First try username from profile
    if (profile?.username) {
      console.log('✅ [Dashboard] Using username:', profile.username)
      return profile.username
    }
    // Then try full name and extract first part
    if (profile?.full_name) {
      const firstName = profile.full_name.split(" ")[0]
      console.log('✅ [Dashboard] Using full_name first part:', firstName)
      return firstName
    }
    // Fallback to user name if available
    if (user?.name) {
      const firstName = user.name.split(" ")[0]
      console.log('⚠️ [Dashboard] Falling back to user.name:', firstName)
      return firstName
    }
    // Last resort: extract from email
    if (user?.email) {
      const emailName = user.email.split("@")[0]
      console.log('⚠️ [Dashboard] Falling back to email:', emailName)
      return emailName
    }
    console.log('❌ [Dashboard] No name found, using default "User"')
    return "User"
  }

  const firstName = getFirstName()

  // Show skeleton loading state only during hydration
  // This prevents the stuck loading issue
  const isInitialLoading = !isClientReady || !hydrated

  if (isInitialLoading) {
    return (
      <AppLayout title="Dashboard" subtitle="Loading your dashboard...">
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <SkeletonCard />
            <SkeletonCard />
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2">
              <SkeletonCard />
            </div>
            <div className="lg:col-span-1 space-y-6">
              <SkeletonCard />
              <SkeletonCard />
            </div>
          </div>
        </div>
      </AppLayout>
    )
  }

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
