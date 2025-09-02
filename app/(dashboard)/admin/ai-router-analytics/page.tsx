"use client"

import { useEffect, useState } from "react"
import { createClient } from "@/utils/supabaseClient"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Progress } from "@/components/ui/progress"
import { 
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer
} from 'recharts'
import { 
  TrendingUp, TrendingDown, GitBranch, DollarSign, 
  Activity, Users, Clock, AlertCircle, ChevronRight,
  Brain, Zap, Shield, Calendar
} from "lucide-react"
import { formatDistanceToNow } from "date-fns"
import { useRouter } from "next/navigation"
import { useToast } from "@/hooks/use-toast"

interface RoutingAnalytics {
  totalDecisions: number
  successRate: number
  averageConfidence: number
  totalCost: number
  pathUsage: Array<{
    path: string
    count: number
    percentage: number
  }>
  modelUsage: Array<{
    model: string
    count: number
    cost: number
  }>
  timeSeriesData: Array<{
    date: string
    decisions: number
    cost: number
  }>
  recentDecisions: Array<{
    id: string
    workflow_id: string
    input_preview: string
    selected_paths: string[]
    confidence: number
    model: string
    cost: number
    created_at: string
  }>
  errorRate: number
  averageExecutionTime: number
  topWorkflows: Array<{
    workflow_id: string
    workflow_name: string
    count: number
  }>
}

const COLORS = ['#8b5cf6', '#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#ec4899', '#06b6d4']

export default function AIRouterAnalyticsPage() {
  const [analytics, setAnalytics] = useState<RoutingAnalytics | null>(null)
  const [loading, setLoading] = useState(true)
  const [timeRange, setTimeRange] = useState("7d")
  const [selectedWorkflow, setSelectedWorkflow] = useState<string>("all")
  const [isAdmin, setIsAdmin] = useState(false)
  const router = useRouter()
  const { toast } = useToast()
  const supabase = createClient()

  // Check if user is admin
  useEffect(() => {
    checkAdminAccess()
  }, [])

  // Load analytics data
  useEffect(() => {
    if (isAdmin) {
      loadAnalytics()
    }
  }, [isAdmin, timeRange, selectedWorkflow])

  const checkAdminAccess = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        router.push('/login')
        return
      }

      // Check if user is admin (you should have an admin flag in your users table)
      const { data: profile } = await supabase
        .from('profiles')
        .select('is_admin, role')
        .eq('id', user.id)
        .single()

      if (!profile?.is_admin && profile?.role !== 'admin' && profile?.role !== 'developer') {
        toast({
          title: "Access Denied",
          description: "This page is only accessible to administrators",
          variant: "destructive"
        })
        router.push('/workflows')
        return
      }

      setIsAdmin(true)
    } catch (error) {
      console.error('Error checking admin access:', error)
      router.push('/workflows')
    }
  }

  const loadAnalytics = async () => {
    setLoading(true)
    try {
      // Calculate date range
      const now = new Date()
      let startDate = new Date()
      
      switch (timeRange) {
        case '24h':
          startDate.setDate(now.getDate() - 1)
          break
        case '7d':
          startDate.setDate(now.getDate() - 7)
          break
        case '30d':
          startDate.setDate(now.getDate() - 30)
          break
        case '90d':
          startDate.setDate(now.getDate() - 90)
          break
      }

      // Build query
      let query = supabase
        .from('ai_routing_decisions')
        .select('*')
        .gte('created_at', startDate.toISOString())

      if (selectedWorkflow !== 'all') {
        query = query.eq('workflow_id', selectedWorkflow)
      }

      const { data: decisions, error } = await query

      if (error) throw error

      // Calculate analytics
      const totalDecisions = decisions?.length || 0
      const successfulDecisions = decisions?.filter(d => d.confidence_scores && Object.values(d.confidence_scores).some((c: any) => c > 0.5)).length || 0
      const successRate = totalDecisions > 0 ? (successfulDecisions / totalDecisions) * 100 : 0

      // Calculate average confidence
      const totalConfidence = decisions?.reduce((sum, d) => {
        const maxConfidence = d.confidence_scores ? Math.max(...Object.values(d.confidence_scores as any)) : 0
        return sum + maxConfidence
      }, 0) || 0
      const averageConfidence = totalDecisions > 0 ? totalConfidence / totalDecisions : 0

      // Calculate total cost
      const totalCost = decisions?.reduce((sum, d) => sum + (d.cost || 0), 0) || 0

      // Calculate path usage
      const pathCounts: Record<string, number> = {}
      decisions?.forEach(d => {
        d.selected_paths?.forEach((path: string) => {
          pathCounts[path] = (pathCounts[path] || 0) + 1
        })
      })

      const pathUsage = Object.entries(pathCounts).map(([path, count]) => ({
        path,
        count,
        percentage: (count / totalDecisions) * 100
      })).sort((a, b) => b.count - a.count)

      // Calculate model usage
      const modelCounts: Record<string, { count: number, cost: number }> = {}
      decisions?.forEach(d => {
        const model = d.model_used || 'unknown'
        if (!modelCounts[model]) {
          modelCounts[model] = { count: 0, cost: 0 }
        }
        modelCounts[model].count++
        modelCounts[model].cost += d.cost || 0
      })

      const modelUsage = Object.entries(modelCounts).map(([model, data]) => ({
        model,
        count: data.count,
        cost: data.cost
      })).sort((a, b) => b.count - a.count)

      // Calculate time series data
      const timeSeriesMap: Record<string, { decisions: number, cost: number }> = {}
      decisions?.forEach(d => {
        const date = new Date(d.created_at).toLocaleDateString()
        if (!timeSeriesMap[date]) {
          timeSeriesMap[date] = { decisions: 0, cost: 0 }
        }
        timeSeriesMap[date].decisions++
        timeSeriesMap[date].cost += d.cost || 0
      })

      const timeSeriesData = Object.entries(timeSeriesMap).map(([date, data]) => ({
        date,
        decisions: data.decisions,
        cost: data.cost
      })).sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())

      // Get recent decisions
      const recentDecisions = decisions?.slice(0, 10).map(d => ({
        id: d.id,
        workflow_id: d.workflow_id,
        input_preview: JSON.stringify(d.input_data).substring(0, 100) + '...',
        selected_paths: d.selected_paths || [],
        confidence: d.confidence_scores ? Math.max(...Object.values(d.confidence_scores as any)) : 0,
        model: d.model_used || 'unknown',
        cost: d.cost || 0,
        created_at: d.created_at
      })) || []

      // Calculate error rate
      const { data: errors } = await supabase
        .from('ai_error_logs')
        .select('*')
        .eq('feature', 'ai_router')
        .gte('timestamp', startDate.toISOString())

      const errorRate = totalDecisions > 0 ? ((errors?.length || 0) / totalDecisions) * 100 : 0

      // Calculate average execution time
      const totalExecutionTime = decisions?.reduce((sum, d) => sum + (d.execution_time_ms || 0), 0) || 0
      const averageExecutionTime = totalDecisions > 0 ? totalExecutionTime / totalDecisions : 0

      // Get top workflows
      const workflowCounts: Record<string, number> = {}
      decisions?.forEach(d => {
        if (d.workflow_id) {
          workflowCounts[d.workflow_id] = (workflowCounts[d.workflow_id] || 0) + 1
        }
      })

      // Get workflow names
      const workflowIds = Object.keys(workflowCounts)
      const { data: workflows } = await supabase
        .from('workflows')
        .select('id, name')
        .in('id', workflowIds)

      const topWorkflows = Object.entries(workflowCounts)
        .map(([id, count]) => ({
          workflow_id: id,
          workflow_name: workflows?.find(w => w.id === id)?.name || 'Unknown',
          count
        }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 5)

      setAnalytics({
        totalDecisions,
        successRate,
        averageConfidence,
        totalCost,
        pathUsage,
        modelUsage,
        timeSeriesData,
        recentDecisions,
        errorRate,
        averageExecutionTime,
        topWorkflows
      })

    } catch (error) {
      console.error('Error loading analytics:', error)
      toast({
        title: "Error",
        description: "Failed to load analytics data",
        variant: "destructive"
      })
    } finally {
      setLoading(false)
    }
  }

  if (!isAdmin) {
    return null
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-center">
          <Brain className="w-12 h-12 mx-auto mb-4 text-purple-600 animate-pulse" />
          <p className="text-gray-600">Loading AI Router Analytics...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="container mx-auto p-6 max-w-7xl">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-3xl font-bold flex items-center gap-3">
              <GitBranch className="w-8 h-8 text-purple-600" />
              AI Router Analytics
              <Badge variant="secondary">Admin Only</Badge>
            </h1>
            <p className="text-gray-600 mt-2">
              Monitor AI routing decisions, performance, and costs
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Select value={timeRange} onValueChange={setTimeRange}>
              <SelectTrigger className="w-32">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="24h">Last 24h</SelectItem>
                <SelectItem value="7d">Last 7 days</SelectItem>
                <SelectItem value="30d">Last 30 days</SelectItem>
                <SelectItem value="90d">Last 90 days</SelectItem>
              </SelectContent>
            </Select>
            <Button onClick={loadAnalytics} variant="outline">
              Refresh
            </Button>
          </div>
        </div>

        {/* Key Metrics */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-gray-600">
                Total Decisions
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between">
                <span className="text-2xl font-bold">
                  {analytics?.totalDecisions.toLocaleString()}
                </span>
                <Activity className="w-5 h-5 text-purple-600" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-gray-600">
                Success Rate
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between">
                <span className="text-2xl font-bold">
                  {analytics?.successRate.toFixed(1)}%
                </span>
                {analytics?.successRate! > 90 ? (
                  <TrendingUp className="w-5 h-5 text-green-600" />
                ) : (
                  <TrendingDown className="w-5 h-5 text-red-600" />
                )}
              </div>
              <Progress value={analytics?.successRate} className="mt-2" />
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-gray-600">
                Avg Confidence
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between">
                <span className="text-2xl font-bold">
                  {(analytics?.averageConfidence! * 100).toFixed(1)}%
                </span>
                <Brain className="w-5 h-5 text-blue-600" />
              </div>
              <Progress value={analytics?.averageConfidence! * 100} className="mt-2" />
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-gray-600">
                Total Cost
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between">
                <span className="text-2xl font-bold">
                  ${analytics?.totalCost.toFixed(2)}
                </span>
                <DollarSign className="w-5 h-5 text-green-600" />
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Main Content */}
      <Tabs defaultValue="overview" className="space-y-6">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="paths">Path Analysis</TabsTrigger>
          <TabsTrigger value="models">Model Usage</TabsTrigger>
          <TabsTrigger value="workflows">Workflows</TabsTrigger>
          <TabsTrigger value="recent">Recent Decisions</TabsTrigger>
        </TabsList>

        {/* Overview Tab */}
        <TabsContent value="overview" className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Time Series Chart */}
            <Card>
              <CardHeader>
                <CardTitle>Decisions Over Time</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <LineChart data={analytics?.timeSeriesData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="date" />
                    <YAxis />
                    <Tooltip />
                    <Legend />
                    <Line 
                      type="monotone" 
                      dataKey="decisions" 
                      stroke="#8b5cf6" 
                      name="Decisions"
                    />
                    <Line 
                      type="monotone" 
                      dataKey="cost" 
                      stroke="#10b981" 
                      name="Cost ($)"
                    />
                  </LineChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            {/* Additional Metrics */}
            <Card>
              <CardHeader>
                <CardTitle>Performance Metrics</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between py-2 border-b">
                  <span className="text-sm text-gray-600">Error Rate</span>
                  <Badge variant={analytics?.errorRate! < 5 ? "default" : "destructive"}>
                    {analytics?.errorRate.toFixed(2)}%
                  </Badge>
                </div>
                <div className="flex items-center justify-between py-2 border-b">
                  <span className="text-sm text-gray-600">Avg Execution Time</span>
                  <Badge variant="secondary">
                    {analytics?.averageExecutionTime.toFixed(0)}ms
                  </Badge>
                </div>
                <div className="flex items-center justify-between py-2 border-b">
                  <span className="text-sm text-gray-600">Decisions per Day</span>
                  <Badge variant="secondary">
                    {(analytics?.totalDecisions! / parseInt(timeRange)).toFixed(1)}
                  </Badge>
                </div>
                <div className="flex items-center justify-between py-2">
                  <span className="text-sm text-gray-600">Cost per Decision</span>
                  <Badge variant="secondary">
                    ${(analytics?.totalCost! / analytics?.totalDecisions!).toFixed(4)}
                  </Badge>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Path Analysis Tab */}
        <TabsContent value="paths" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Path Usage Distribution</CardTitle>
              <CardDescription>
                Which output paths are triggered most frequently
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={400}>
                <PieChart>
                  <Pie
                    data={analytics?.pathUsage.slice(0, 7)}
                    cx="50%"
                    cy="50%"
                    labelLine={false}
                    label={(entry) => `${entry.path} (${entry.percentage.toFixed(1)}%)`}
                    outerRadius={120}
                    fill="#8884d8"
                    dataKey="count"
                  >
                    {analytics?.pathUsage.slice(0, 7).map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>

              <div className="mt-6 space-y-2">
                {analytics?.pathUsage.map((path, index) => (
                  <div key={path.path} className="flex items-center justify-between p-2 rounded hover:bg-gray-50">
                    <div className="flex items-center gap-3">
                      <div 
                        className="w-3 h-3 rounded-full" 
                        style={{ backgroundColor: COLORS[index % COLORS.length] }}
                      />
                      <span className="font-medium">{path.path}</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <Badge variant="secondary">{path.count} times</Badge>
                      <span className="text-sm text-gray-600">
                        {path.percentage.toFixed(1)}%
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Model Usage Tab */}
        <TabsContent value="models" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Model Usage & Costs</CardTitle>
              <CardDescription>
                Distribution of AI models used for routing decisions
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={analytics?.modelUsage}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="model" />
                  <YAxis yAxisId="left" />
                  <YAxis yAxisId="right" orientation="right" />
                  <Tooltip />
                  <Legend />
                  <Bar yAxisId="left" dataKey="count" fill="#8b5cf6" name="Usage Count" />
                  <Bar yAxisId="right" dataKey="cost" fill="#10b981" name="Cost ($)" />
                </BarChart>
              </ResponsiveContainer>

              <div className="mt-6 space-y-2">
                {analytics?.modelUsage.map((model) => (
                  <div key={model.model} className="flex items-center justify-between p-3 border rounded-lg">
                    <div>
                      <div className="font-medium">{model.model}</div>
                      <div className="text-sm text-gray-600">
                        {model.count} decisions
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="font-medium">${model.cost.toFixed(2)}</div>
                      <div className="text-sm text-gray-600">
                        ${(model.cost / model.count).toFixed(4)}/decision
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Workflows Tab */}
        <TabsContent value="workflows" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Top Workflows</CardTitle>
              <CardDescription>
                Workflows using AI Router most frequently
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {analytics?.topWorkflows.map((workflow, index) => (
                  <div 
                    key={workflow.workflow_id}
                    className="flex items-center justify-between p-3 border rounded-lg hover:bg-gray-50 cursor-pointer"
                    onClick={() => router.push(`/workflows/builder/${workflow.workflow_id}`)}
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 bg-purple-100 rounded-lg flex items-center justify-center text-purple-600 font-bold">
                        {index + 1}
                      </div>
                      <div>
                        <div className="font-medium">{workflow.workflow_name}</div>
                        <div className="text-sm text-gray-600">
                          ID: {workflow.workflow_id.substring(0, 8)}...
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <Badge variant="secondary">
                        {workflow.count} decisions
                      </Badge>
                      <ChevronRight className="w-4 h-4 text-gray-400" />
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Recent Decisions Tab */}
        <TabsContent value="recent" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Recent Routing Decisions</CardTitle>
              <CardDescription>
                Latest AI routing decisions across all workflows
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-[600px]">
                <div className="space-y-3">
                  {analytics?.recentDecisions.map((decision) => (
                    <div key={decision.id} className="p-4 border rounded-lg space-y-3">
                      <div className="flex items-start justify-between">
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <Badge variant="outline">
                              {decision.model}
                            </Badge>
                            <Badge variant="secondary">
                              {Math.round(decision.confidence * 100)}% confidence
                            </Badge>
                            <Badge variant="outline">
                              ${decision.cost.toFixed(4)}
                            </Badge>
                          </div>
                          <div className="text-sm text-gray-600">
                            {formatDistanceToNow(new Date(decision.created_at), { addSuffix: true })}
                          </div>
                        </div>
                      </div>
                      
                      <div className="bg-gray-50 p-2 rounded text-xs font-mono">
                        {decision.input_preview}
                      </div>
                      
                      <div className="flex items-center gap-2">
                        <span className="text-sm text-gray-600">Routed to:</span>
                        {decision.selected_paths.map((path) => (
                          <Badge key={path} variant="default">
                            {path}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}