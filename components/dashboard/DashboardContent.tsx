"use client"

import { useEffect } from "react"
import { useAnalyticsStore } from "@/stores/analyticsStore"
import MetricCard from "./MetricCard"
import ActivityFeed from "./ActivityFeed"
import WorkflowChart from "./WorkflowChart"
import { Workflow, Clock, Puzzle, Zap } from "lucide-react"

export default function DashboardContent() {
  const { metrics, chartData, fetchMetrics, fetchChartData } = useAnalyticsStore()

  useEffect(() => {
    fetchMetrics()
    fetchChartData()
  }, [fetchMetrics, fetchChartData])

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">Dashboard</h1>
          <p className="text-slate-600 mt-1">Welcome back! Here's what's happening with your workflows.</p>
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
        <MetricCard title="Integrations" value={metrics?.integrations || 0} icon={Puzzle} color="purple" change="+2" />
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
  )
}
