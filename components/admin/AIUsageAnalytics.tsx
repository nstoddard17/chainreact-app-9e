"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell
} from "recharts"
import { Download, Filter, TrendingUp, Users, Zap, DollarSign } from "lucide-react"

import { logger } from '@/lib/utils/logger'

interface AIUsageStats {
  totalUsers: number
  activeUsers: number
  totalUsage: {
    ai_assistant_calls: number
    ai_compose_uses: number
    ai_agent_executions: number
  }
  estimatedCost: number
  usageByTier: Array<{
    tier: string
    users: number
    totalUsage: number
    avgUsage: number
  }>
  dailyUsage: Array<{
    date: string
    ai_assistant_calls: number
    ai_compose_uses: number
    ai_agent_executions: number
  }>
  topUsers: Array<{
    userId: string
    email: string
    tier: string
    totalUsage: number
    cost: number
  }>
}

export default function AIUsageAnalytics() {
  const [stats, setStats] = useState<AIUsageStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [timeRange, setTimeRange] = useState("30")
  const [tierFilter, setTierFilter] = useState("all")

  useEffect(() => {
    fetchAIUsageStats()
  }, [timeRange, tierFilter])

  const fetchAIUsageStats = async () => {
    try {
      const params = new URLSearchParams({
        days: timeRange,
        tier: tierFilter
      })
      
      const response = await fetch(`/api/admin/ai-usage-stats?${params}`)
      if (response.ok) {
        const data = await response.json()
        setStats(data)
      }
    } catch (error) {
      logger.error('Failed to fetch AI usage stats:', error)
    } finally {
      setLoading(false)
    }
  }

  const exportData = async () => {
    try {
      const response = await fetch('/api/admin/ai-usage-export')
      if (response.ok) {
        const blob = await response.blob()
        const url = window.URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `ai-usage-${new Date().toISOString().split('T')[0]}.csv`
        document.body.appendChild(a)
        a.click()
        window.URL.revokeObjectURL(url)
        document.body.removeChild(a)
      }
    } catch (error) {
      logger.error('Failed to export data:', error)
    }
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-slate-200 rounded w-1/4"></div>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="h-24 bg-slate-200 rounded"></div>
            ))}
          </div>
        </div>
      </div>
    )
  }

  if (!stats) {
    return (
      <div className="text-center py-12">
        <p className="text-slate-500">Failed to load AI usage statistics</p>
      </div>
    )
  }

  const totalUsage = stats.totalUsage.ai_assistant_calls + stats.totalUsage.ai_compose_uses + stats.totalUsage.ai_agent_executions

  const chartData = stats.dailyUsage.map(day => ({
    date: new Date(day.date).toLocaleDateString(),
    'AI Assistant': day.ai_assistant_calls,
    'AI Compose': day.ai_compose_uses,
    'AI Agent': day.ai_agent_executions
  }))

  const pieData = [
    { name: 'AI Assistant', value: stats.totalUsage.ai_assistant_calls, color: '#3B82F6' },
    { name: 'AI Compose', value: stats.totalUsage.ai_compose_uses, color: '#10B981' },
    { name: 'AI Agent', value: stats.totalUsage.ai_agent_executions, color: '#8B5CF6' }
  ]

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">AI Usage Analytics</h1>
          <p className="text-slate-600">Monitor AI feature usage across all users</p>
        </div>
        <div className="flex items-center gap-3">
          <Button onClick={exportData} variant="outline">
            <Download className="w-4 h-4 mr-2" />
            Export Data
          </Button>
        </div>
      </div>

      {/* Filters */}
      <Card className="bg-white rounded-2xl shadow-lg border border-slate-200">
        <CardContent className="p-4">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <Filter className="w-4 h-4 text-slate-500" />
              <span className="text-sm font-medium text-slate-700">Time Range:</span>
            </div>
            <Select value={timeRange} onValueChange={setTimeRange}>
              <SelectTrigger className="w-32">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="7">Last 7 days</SelectItem>
                <SelectItem value="30">Last 30 days</SelectItem>
                <SelectItem value="90">Last 90 days</SelectItem>
              </SelectContent>
            </Select>

            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-slate-700">Tier:</span>
            </div>
            <Select value={tierFilter} onValueChange={setTierFilter}>
              <SelectTrigger className="w-32">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Tiers</SelectItem>
                <SelectItem value="free">Free</SelectItem>
                <SelectItem value="pro">Pro</SelectItem>
                <SelectItem value="business">Business</SelectItem>
                <SelectItem value="enterprise">Enterprise</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Key Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <Card className="bg-white rounded-2xl shadow-lg border border-slate-200">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-slate-600">Total Users</p>
                <p className="text-2xl font-bold text-slate-900">{stats.totalUsers}</p>
              </div>
              <Users className="w-8 h-8 text-blue-600" />
            </div>
            <div className="mt-2">
              <Badge variant="secondary" className="text-xs">
                {stats.activeUsers} active
              </Badge>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-white rounded-2xl shadow-lg border border-slate-200">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-slate-600">Total AI Usage</p>
                <p className="text-2xl font-bold text-slate-900">{totalUsage.toLocaleString()}</p>
              </div>
              <Zap className="w-8 h-8 text-yellow-600" />
            </div>
            <div className="mt-2">
              <Badge variant="secondary" className="text-xs">
                {Math.round(totalUsage / stats.totalUsers)} avg per user
              </Badge>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-white rounded-2xl shadow-lg border border-slate-200">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-slate-600">Estimated Cost</p>
                <p className="text-2xl font-bold text-slate-900">${stats.estimatedCost.toFixed(2)}</p>
              </div>
              <DollarSign className="w-8 h-8 text-green-600" />
            </div>
            <div className="mt-2">
              <Badge variant="secondary" className="text-xs">
                ${(stats.estimatedCost / stats.totalUsers).toFixed(2)} avg per user
              </Badge>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-white rounded-2xl shadow-lg border border-slate-200">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-slate-600">Usage Growth</p>
                <p className="text-2xl font-bold text-green-600">+12.5%</p>
              </div>
              <TrendingUp className="w-8 h-8 text-green-600" />
            </div>
            <div className="mt-2">
              <Badge variant="secondary" className="text-xs">
                vs last month
              </Badge>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Daily Usage Chart */}
        <Card className="bg-white rounded-2xl shadow-lg border border-slate-200">
          <CardHeader>
            <CardTitle>Daily AI Usage</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" />
                <YAxis />
                <Tooltip />
                <Bar dataKey="AI Assistant" fill="#3B82F6" />
                <Bar dataKey="AI Compose" fill="#10B981" />
                <Bar dataKey="AI Agent" fill="#8B5CF6" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Usage Distribution */}
        <Card className="bg-white rounded-2xl shadow-lg border border-slate-200">
          <CardHeader>
            <CardTitle>Usage Distribution</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={pieData}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                  outerRadius={80}
                  fill="#8884d8"
                  dataKey="value"
                >
                  {pieData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Top Users */}
      <Card className="bg-white rounded-2xl shadow-lg border border-slate-200">
        <CardHeader>
          <CardTitle>Top AI Users</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {stats.topUsers.map((user, index) => (
              <div key={user.userId} className="flex items-center justify-between p-4 border border-slate-200 rounded-lg">
                <div className="flex items-center gap-4">
                  <div className="w-8 h-8 bg-slate-100 rounded-full flex items-center justify-center text-sm font-semibold">
                    {index + 1}
                  </div>
                  <div>
                    <p className="font-medium text-slate-900">{user.email}</p>
                    <p className="text-sm text-slate-500">{user.tier} tier</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="font-semibold text-slate-900">{user.totalUsage} uses</p>
                  <p className="text-sm text-slate-500">${user.cost.toFixed(2)}</p>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  )
} 