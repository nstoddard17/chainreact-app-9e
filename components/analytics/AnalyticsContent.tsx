"use client"

import { useEffect } from "react"
import AppLayout from "@/components/layout/AppLayout"
import { useAnalyticsStore } from "@/stores/analyticsStore"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import WorkflowChart from "@/components/dashboard/WorkflowChart"
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from "recharts"
import { CheckCircle, XCircle, Clock, TrendingUp } from "lucide-react"

const COLORS = ["#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6"]

export default function AnalyticsContent() {
  const { metrics, chartData, executions, fetchMetrics, fetchChartData, fetchExecutions } = useAnalyticsStore()

  useEffect(() => {
    fetchMetrics()
    fetchChartData()
    fetchExecutions()
  }, [fetchMetrics, fetchChartData, fetchExecutions])

  // Mock data for additional charts
  const integrationUsage = [
    { name: "Slack", value: 45, color: "#3b82f6" },
    { name: "Google Calendar", value: 30, color: "#10b981" },
    { name: "Google Sheets", value: 20, color: "#f59e0b" },
    { name: "Discord", value: 5, color: "#8b5cf6" },
  ]

  const executionStats = [
    { status: "Success", count: 156, color: "#10b981" },
    { status: "Error", count: 12, color: "#ef4444" },
    { status: "Running", count: 3, color: "#f59e0b" },
  ]

  return (
    <AppLayout title="Analytics">
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-3xl font-bold text-slate-900">Analytics</h1>
        </div>

        {/* Overview Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <Card className="bg-white rounded-2xl shadow-lg border border-slate-200">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-slate-600">Success Rate</p>
                  <p className="text-2xl font-bold text-green-600">92.8%</p>
                </div>
                <div className="w-12 h-12 bg-green-100 rounded-xl flex items-center justify-center">
                  <CheckCircle className="w-6 h-6 text-green-600" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-white rounded-2xl shadow-lg border border-slate-200">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-slate-600">Avg Execution Time</p>
                  <p className="text-2xl font-bold text-blue-600">2.4s</p>
                </div>
                <div className="w-12 h-12 bg-blue-100 rounded-xl flex items-center justify-center">
                  <Clock className="w-6 h-6 text-blue-600" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-white rounded-2xl shadow-lg border border-slate-200">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-slate-600">Failed Executions</p>
                  <p className="text-2xl font-bold text-red-600">12</p>
                </div>
                <div className="w-12 h-12 bg-red-100 rounded-xl flex items-center justify-center">
                  <XCircle className="w-6 h-6 text-red-600" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-white rounded-2xl shadow-lg border border-slate-200">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-slate-600">Growth Rate</p>
                  <p className="text-2xl font-bold text-purple-600">+24%</p>
                </div>
                <div className="w-12 h-12 bg-purple-100 rounded-xl flex items-center justify-center">
                  <TrendingUp className="w-6 h-6 text-purple-600" />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Charts Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Workflow Performance Chart */}
          <WorkflowChart data={chartData} />

          {/* Integration Usage */}
          <Card className="bg-white rounded-2xl shadow-lg border border-slate-200">
            <CardHeader>
              <CardTitle className="text-xl font-semibold text-slate-900">Integration Usage</CardTitle>
              <p className="text-sm text-slate-500">Most used integrations this month</p>
            </CardHeader>
            <CardContent>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={integrationUsage}
                      cx="50%"
                      cy="50%"
                      outerRadius={80}
                      fill="#8884d8"
                      dataKey="value"
                      label={({ name, percent }) => `${name} ${((percent || 0) * 100).toFixed(0)}%`}
                    >
                      {integrationUsage.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          {/* Execution Status */}
          <Card className="bg-white rounded-2xl shadow-lg border border-slate-200">
            <CardHeader>
              <CardTitle className="text-xl font-semibold text-slate-900">Execution Status</CardTitle>
              <p className="text-sm text-slate-500">Breakdown of execution results</p>
            </CardHeader>
            <CardContent>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={executionStats}>
                    <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                    <XAxis dataKey="status" tick={{ fontSize: 12 }} />
                    <YAxis tick={{ fontSize: 12 }} />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: "white",
                        border: "1px solid #e2e8f0",
                        borderRadius: "8px",
                        boxShadow: "0 4px 6px -1px rgba(0, 0, 0, 0.1)",
                      }}
                    />
                    <Bar dataKey="count" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          {/* Recent Executions */}
          <Card className="bg-white rounded-2xl shadow-lg border border-slate-200">
            <CardHeader>
              <CardTitle className="text-xl font-semibold text-slate-900">Recent Executions</CardTitle>
              <p className="text-sm text-slate-500">Latest workflow runs</p>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {[
                  { id: 1, workflow: "Slack to Calendar", status: "success", time: "2 min ago", duration: "1.2s" },
                  { id: 2, workflow: "Email to Sheets", status: "success", time: "5 min ago", duration: "0.8s" },
                  { id: 3, workflow: "Discord Notifications", status: "error", time: "12 min ago", duration: "3.1s" },
                  { id: 4, workflow: "Data Sync", status: "success", time: "1 hour ago", duration: "2.4s" },
                ].map((execution) => (
                  <div
                    key={execution.id}
                    className="flex items-center justify-between p-3 rounded-lg hover:bg-slate-50 transition-colors"
                  >
                    <div className="flex items-center space-x-3">
                      <div
                        className={`w-2 h-2 rounded-full ${
                          execution.status === "success" ? "bg-green-500" : "bg-red-500"
                        }`}
                      />
                      <div>
                        <div className="font-medium text-slate-900">{execution.workflow}</div>
                        <div className="text-xs text-slate-500">{execution.time}</div>
                      </div>
                    </div>
                    <div className="flex items-center space-x-2">
                      <Badge variant={execution.status === "success" ? "default" : "destructive"}>
                        {execution.status}
                      </Badge>
                      <span className="text-xs text-slate-500">{execution.duration}</span>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </AppLayout>
  )
}
