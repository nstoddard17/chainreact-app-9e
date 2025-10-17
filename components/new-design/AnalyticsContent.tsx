"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { TrendingUp, TrendingDown, Zap, CheckCircle2, XCircle, Clock } from "lucide-react"

export function AnalyticsContent() {
  const stats = [
    {
      title: "Total Executions",
      value: "1,234",
      change: "+12.5%",
      trend: "up" as const,
      icon: Zap
    },
    {
      title: "Success Rate",
      value: "98.2%",
      change: "+2.1%",
      trend: "up" as const,
      icon: CheckCircle2
    },
    {
      title: "Failed Executions",
      value: "23",
      change: "-8.3%",
      trend: "down" as const,
      icon: XCircle
    },
    {
      title: "Avg. Execution Time",
      value: "2.4s",
      change: "-15.2%",
      trend: "down" as const,
      icon: Clock
    }
  ]

  const recentActivity = [
    { workflow: "Gmail to Slack Notifier", status: "success", time: "2 minutes ago", duration: "1.2s" },
    { workflow: "Discord Message Parser", status: "success", time: "5 minutes ago", duration: "0.8s" },
    { workflow: "Notion Database Sync", status: "success", time: "12 minutes ago", duration: "3.1s" },
    { workflow: "Email Automation", status: "failed", time: "15 minutes ago", duration: "5.2s" },
    { workflow: "Slack to Airtable", status: "success", time: "23 minutes ago", duration: "2.1s" },
  ]

  return (
    <div className="space-y-6">
      {/* Stats Grid */}
      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map((stat) => {
          const Icon = stat.icon
          const TrendIcon = stat.trend === 'up' ? TrendingUp : TrendingDown
          const trendColor = stat.trend === 'up' ? 'text-green-600' : 'text-red-600'

          return (
            <Card key={stat.title}>
              <CardContent className="p-6">
                <div className="flex items-center justify-between mb-2">
                  <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                    <Icon className="w-5 h-5 text-primary" />
                  </div>
                  <div className={`flex items-center gap-1 text-sm ${trendColor}`}>
                    <TrendIcon className="w-4 h-4" />
                    <span>{stat.change}</span>
                  </div>
                </div>
                <h3 className="text-2xl font-bold mb-1">{stat.value}</h3>
                <p className="text-sm text-muted-foreground">{stat.title}</p>
              </CardContent>
            </Card>
          )
        })}
      </div>

      {/* Recent Activity */}
      <Card>
        <CardHeader>
          <CardTitle>Recent Executions</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {recentActivity.map((activity, index) => (
              <div
                key={index}
                className="flex items-center justify-between py-3 border-b last:border-b-0"
              >
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  <div className={`w-2 h-2 rounded-full flex-shrink-0 ${
                    activity.status === 'success' ? 'bg-green-500' : 'bg-red-500'
                  }`} />
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate">{activity.workflow}</p>
                    <p className="text-sm text-muted-foreground">{activity.time}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <Badge variant="outline" className="text-xs">
                    {activity.duration}
                  </Badge>
                  <Badge
                    variant={activity.status === 'success' ? 'default' : 'destructive'}
                    className="text-xs"
                  >
                    {activity.status}
                  </Badge>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Coming Soon Banner */}
      <Card className="bg-muted/30">
        <CardContent className="p-6 text-center">
          <h3 className="font-semibold mb-2">Advanced Analytics Coming Soon</h3>
          <p className="text-sm text-muted-foreground">
            Detailed charts, workflow insights, cost tracking, and more will be available in the next update.
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
