import React from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { BarChart, TrendingUp, Users, Eye } from 'lucide-react'

interface FacebookInsight {
  name: string
  period: string
  values: Array<{
    value: number
    end_time: string
  }>
  title: string
  description: string
  id: string
}

interface FacebookInsightsPreviewProps {
  insights: FacebookInsight[]
}

export function FacebookInsightsPreview({ insights }: FacebookInsightsPreviewProps) {
  if (!insights || insights.length === 0) {
    return (
      <div className="text-sm text-muted-foreground bg-muted/30 p-4 rounded border flex flex-col items-center justify-center">
        <div className="mb-2">
          <BarChart className="w-8 h-8 text-muted-foreground/50" />
        </div>
        <p>No insights data available. Try adjusting your configuration.</p>
      </div>
    )
  }

  const getMetricIcon = (metricName: string) => {
    switch (metricName) {
      case 'page_impressions':
        return <Eye className="w-4 h-4" />
      case 'page_engaged_users':
        return <Users className="w-4 h-4" />
      case 'page_post_engagements':
        return <TrendingUp className="w-4 h-4" />
      case 'page_fans':
        return <Users className="w-4 h-4" />
      default:
        return <BarChart className="w-4 h-4" />
    }
  }

  const getMetricColor = (metricName: string) => {
    switch (metricName) {
      case 'page_impressions':
        return 'bg-blue-100 text-blue-800'
      case 'page_engaged_users':
        return 'bg-green-100 text-green-800'
      case 'page_post_engagements':
        return 'bg-purple-100 text-purple-800'
      case 'page_fans':
        return 'bg-orange-100 text-orange-800'
      default:
        return 'bg-gray-100 text-gray-800'
    }
  }

  const formatValue = (value: number, metricName: string) => {
    if (metricName === 'page_fans') {
      return value.toLocaleString()
    }
    return value.toLocaleString()
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    })
  }

  return (
    <div className="space-y-4">
      <div className="text-sm text-muted-foreground">
        Showing {insights.length} insight{insights.length !== 1 ? 's' : ''}
      </div>
      
      {insights.map((insight) => (
        <Card key={insight.id} className="w-full">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                {getMetricIcon(insight.name)}
                {insight.title || insight.name.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
              </CardTitle>
              <Badge variant="secondary" className={getMetricColor(insight.name)}>
                {insight.period}
              </Badge>
            </div>
            {insight.description && (
              <p className="text-xs text-muted-foreground mt-1">
                {insight.description}
              </p>
            )}
          </CardHeader>
          <CardContent className="pt-0">
            <div className="space-y-2">
              {insight.values.map((value, index) => (
                <div key={index} className="flex items-center justify-between p-2 bg-muted/30 rounded">
                  <div className="text-sm font-medium">
                    {formatValue(value.value, insight.name)}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {formatDate(value.end_time)}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  )
} 