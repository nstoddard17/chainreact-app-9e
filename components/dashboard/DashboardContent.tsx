"use client"

import { useEffect, useState } from "react"
import { useAnalyticsStore } from "@/stores/analyticsStore"
import { useAuthStore } from "@/stores/authStore"
import { useIntegrationStore } from "@/stores/integrationStore"
import AppLayout from "@/components/layout/AppLayout"
import MetricCard from "@/components/dashboard/MetricCard"
import ActivityFeed from "@/components/dashboard/ActivityFeed"
import WorkflowChart from "@/components/dashboard/WorkflowChart"
import { Workflow, Clock, Puzzle, Zap, Loader2 } from "lucide-react"

export default function DashboardContent() {
  const { metrics, chartData, fetchMetrics, fetchChartData } = useAnalyticsStore()
  const { user, profile } = useAuthStore()
  const { ensureDataPreloaded, globalPreloadingData, preloadProgress } = useIntegrationStore()
  const [isInitialLoading, setIsInitialLoading] = useState(true)

  useEffect(() => {
    const initializeDashboard = async () => {
      try {
        // Start preloading integration data
        await ensureDataPreloaded()

        // Fetch analytics data
        await Promise.all([fetchMetrics(), fetchChartData()])
      } catch (error) {
        console.error("Error initializing dashboard:", error)
      } finally {
        // Add a small delay to ensure smooth transition
        setTimeout(() => {
          setIsInitialLoading(false)
        }, 500)
      }
    }

    initializeDashboard()
  }, [ensureDataPreloaded, fetchMetrics, fetchChartData])

  // Get the user's first name for personalized greeting
  const getFirstName = () => {
    if (profile?.first_name) {
      return profile.first_name
    }
    if (user?.user_metadata?.first_name) {
      return user.user_metadata.first_name
    }
    if (user?.email) {
      return user.email.split("@")[0]
    }
    return "User"
  }

  const firstName = getFirstName()

  // Calculate progress for loading indicator
  const loaded = Object.values(preloadProgress).filter(Boolean).length
  const total = Object.keys(preloadProgress).length
  const progressPercent = total ? Math.round((loaded / total) * 100) : 0

  // Show loading spinner while initial data is being loaded
  if (isInitialLoading || globalPreloadingData) {
    return (
      <AppLayout>
        <div className="min-h-[60vh] flex flex-col items-center justify-center space-y-4">
          <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
          <div className="text-center">
            <h2 className="text-lg font-semibold text-slate-900 mb-2">Loading your dashboard...</h2>
            <p className="text-slate-600">
              {globalPreloadingData && total > 0
                ? `Preparing your integration data... ${progressPercent}%`
                : "Setting up your workspace..."}
            </p>
          </div>
        </div>
      </AppLayout>
    )
  }

  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-slate-900">Dashboard</h1>
            <p className="text-slate-600 mt-1">
              Welcome back, {firstName}! Here's what's happening with your workflows.
            </p>
          </div>
        </div>

        {/* Metrics Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <MetricCard
            title="Workflows Run"
            value={metrics?.workflowsRun || 0}
            icon={Workflow}
            color="blue"
            change="+12%"
          />
          <MetricCard title="Hours Saved" value={metrics?.hoursSaved || 0} icon={Clock} color="green" change="+8%" />
          <MetricCard
            title="Integrations"
            value={metrics?.integrations || 0}
            icon={Puzzle}
            color="purple"
            change="+2"
          />
          <MetricCard title="AI Commands" value={metrics?.aiCommands || 0} icon={Zap} color="yellow" change="+15%" />
        </div>

        {/* Charts and Activity */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2">
            <WorkflowChart data={chartData} />
          </div>
          <div className="lg:col-span-1">
            <ActivityFeed />
          </div>
        </div>
      </div>
    </AppLayout>
  )
}
