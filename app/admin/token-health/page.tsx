"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { RefreshCw, AlertTriangle, CheckCircle, Clock, XCircle } from "lucide-react"

interface TokenStats {
  total: number
  by_status: Record<string, number>
  by_provider: Record<string, { total: number; connected: number; failed: number }>
  recent_failures: number
  needs_attention: number
  last_24h_refreshes: number
  failed_refreshes: Array<{
    provider: string
    consecutive_failures: number
    disconnect_reason: string
  }>
}

export default function TokenHealthPage() {
  const [stats, setStats] = useState<TokenStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)

  const fetchStats = async () => {
    try {
      setLoading(true)
      const response = await fetch("/api/admin/token-refresh-stats")
      const data = await response.json()

      if (data.success) {
        setStats(data.stats)
        setLastUpdated(new Date())
      }
    } catch (error) {
      console.error("Failed to fetch token stats:", error)
    } finally {
      setLoading(false)
    }
  }

  const triggerRefresh = async () => {
    alert("Use the API directly or Vercel cron job to trigger refresh")
  }

  useEffect(() => {
    fetchStats()
    // Auto-refresh every 5 minutes
    const interval = setInterval(fetchStats, 5 * 60 * 1000)
    return () => clearInterval(interval)
  }, [])

  if (loading && !stats) {
    return (
      <div className="container mx-auto p-6">
        <div className="flex items-center justify-center min-h-[400px]">
          <RefreshCw className="w-8 h-8 animate-spin" />
        </div>
      </div>
    )
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">Token Health Dashboard</h1>
          <p className="text-gray-600">Monitor OAuth token status and refresh operations</p>
          {lastUpdated && (
            <p className="text-sm text-gray-500 mt-1">Last updated: {lastUpdated.toLocaleTimeString()}</p>
          )}
        </div>
        <div className="space-x-2">
          <Button onClick={fetchStats} variant="outline" disabled={loading}>
            <RefreshCw className={`w-4 h-4 mr-2 ${loading ? "animate-spin" : ""}`} />
            Refresh Stats
          </Button>
          <Button onClick={triggerRefresh} variant="default" disabled>
            <Clock className="w-4 h-4 mr-2" />
            Manual Refresh (Use API)
          </Button>
        </div>
      </div>

      {stats && (
        <>
          {/* Overview Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Total Integrations</CardTitle>
                <CheckCircle className="h-4 w-4 text-blue-600" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{stats.total}</div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Connected</CardTitle>
                <CheckCircle className="h-4 w-4 text-green-600" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-green-600">{stats.by_status.connected || 0}</div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Needs Attention</CardTitle>
                <AlertTriangle className="h-4 w-4 text-yellow-600" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-yellow-600">{stats.needs_attention}</div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">24h Refreshes</CardTitle>
                <RefreshCw className="h-4 w-4 text-blue-600" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{stats.last_24h_refreshes}</div>
              </CardContent>
            </Card>
          </div>

          {/* Status Breakdown */}
          <Card>
            <CardHeader>
              <CardTitle>Status Breakdown</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {Object.entries(stats.by_status).map(([status, count]) => (
                  <div key={status} className="text-center">
                    <Badge
                      variant={
                        status === "connected"
                          ? "default"
                          : status === "expired" || status === "needs_reauthorization"
                            ? "destructive"
                            : "secondary"
                      }
                      className="mb-2"
                    >
                      {status}
                    </Badge>
                    <div className="text-2xl font-bold">{count}</div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Provider Stats */}
          <Card>
            <CardHeader>
              <CardTitle>Provider Health</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {Object.entries(stats.by_provider)
                  .sort(([, a], [, b]) => b.total - a.total)
                  .map(([provider, data]) => (
                    <div key={provider} className="flex items-center justify-between p-3 border rounded">
                      <div className="flex items-center space-x-3">
                        <div className="font-medium capitalize">{provider}</div>
                        <Badge variant="outline">{data.total} total</Badge>
                      </div>
                      <div className="flex items-center space-x-2">
                        <Badge variant="default" className="bg-green-100 text-green-800">
                          {data.connected} connected
                        </Badge>
                        {data.failed > 0 && <Badge variant="destructive">{data.failed} failed</Badge>}
                      </div>
                    </div>
                  ))}
              </div>
            </CardContent>
          </Card>

          {/* Recent Failures */}
          {stats.failed_refreshes.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center">
                  <XCircle className="w-5 h-5 mr-2 text-red-600" />
                  Recent Failures
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {stats.failed_refreshes.slice(0, 10).map((failure, index) => (
                    <div key={index} className="p-3 border-l-4 border-red-500 bg-red-50">
                      <div className="flex justify-between items-start">
                        <div>
                          <div className="font-medium capitalize">{failure.provider}</div>
                          <div className="text-sm text-gray-600 mt-1">{failure.disconnect_reason}</div>
                        </div>
                        <Badge variant="destructive">{failure.consecutive_failures} failures</Badge>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  )
}
