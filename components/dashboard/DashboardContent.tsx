"use client"

import { useEffect } from "react"
import { useAnalyticsStore } from "@/stores/analyticsStore"
import { useAuthStore } from "@/stores/authStore"
import AppLayout from "@/components/layout/AppLayout"
import MetricCard from "@/components/dashboard/MetricCard"
import ActivityFeed from "@/components/dashboard/ActivityFeed"
import WorkflowChart from "@/components/dashboard/WorkflowChart"
import { Workflow, Clock, Puzzle, Zap } from "lucide-react"

export default function DashboardContent() {
  const { metrics, chartData, fetchMetrics, fetchChartData } = useAnalyticsStore()
  const { user } = useAuthStore()

  useEffect(() => {
    fetchMetrics()
    fetchChartData()
  }, [fetchMetrics, fetchChartData])

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
    <AppLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-slate-900">Dashboard</h1>
            <p className="text-slate-600 mt-1">
              Welcome back, {firstName}! Here&apos;s what&apos;s happening with your workflows.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <MetricCard
            title="Workflows Run"
            value={metrics?.workflowsRun || 0}
            icon={<Workflow className="w-6 h-6" />}
            color="blue"
            change="+12%"
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
            value={metrics?.integrations || 0}
            icon={<Puzzle className="w-6 h-6" />}
            color="purple"
            change="+2"
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
    </AppLayout>
  )
}
