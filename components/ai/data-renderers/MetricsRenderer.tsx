"use client"

import React from "react"
import { TrendingUp, TrendingDown, Minus, DollarSign, Users, Activity, Clock, Target, BarChart3 } from "lucide-react"
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"

interface Metric {
  label: string
  value: string | number
  change?: number
  changeLabel?: string
  icon?: 'dollar' | 'users' | 'activity' | 'clock' | 'target' | 'chart'
  trend?: 'up' | 'down' | 'neutral'
  subtitle?: string
  color?: 'default' | 'success' | 'warning' | 'danger' | 'info'
}

interface MetricsRendererProps {
  metrics: Metric[]
  title?: string
  layout?: 'grid' | 'list'
  columns?: 2 | 3 | 4
  className?: string
}

export function MetricsRenderer({
  metrics,
  title,
  layout = 'grid',
  columns = 3,
  className
}: MetricsRendererProps) {
  const getIcon = (iconType?: string) => {
    const iconClass = "w-5 h-5"

    switch (iconType) {
      case 'dollar':
        return <DollarSign className={iconClass} />
      case 'users':
        return <Users className={iconClass} />
      case 'activity':
        return <Activity className={iconClass} />
      case 'clock':
        return <Clock className={iconClass} />
      case 'target':
        return <Target className={iconClass} />
      case 'chart':
        return <BarChart3 className={iconClass} />
      default:
        return <BarChart3 className={iconClass} />
    }
  }

  const getTrendIcon = (trend?: 'up' | 'down' | 'neutral') => {
    const iconClass = "w-4 h-4"

    switch (trend) {
      case 'up':
        return <TrendingUp className={cn(iconClass, "text-green-600")} />
      case 'down':
        return <TrendingDown className={cn(iconClass, "text-red-600")} />
      case 'neutral':
        return <Minus className={cn(iconClass, "text-gray-600")} />
      default:
        return null
    }
  }

  const getColorClasses = (color?: string) => {
    switch (color) {
      case 'success':
        return {
          bg: 'bg-green-50 dark:bg-green-950/20',
          border: 'border-green-200 dark:border-green-800',
          icon: 'text-green-600 dark:text-green-400',
          value: 'text-green-900 dark:text-green-100'
        }
      case 'warning':
        return {
          bg: 'bg-yellow-50 dark:bg-yellow-950/20',
          border: 'border-yellow-200 dark:border-yellow-800',
          icon: 'text-yellow-600 dark:text-yellow-400',
          value: 'text-yellow-900 dark:text-yellow-100'
        }
      case 'danger':
        return {
          bg: 'bg-red-50 dark:bg-red-950/20',
          border: 'border-red-200 dark:border-red-800',
          icon: 'text-red-600 dark:text-red-400',
          value: 'text-red-900 dark:text-red-100'
        }
      case 'info':
        return {
          bg: 'bg-blue-50 dark:bg-blue-950/20',
          border: 'border-blue-200 dark:border-blue-800',
          icon: 'text-blue-600 dark:text-blue-400',
          value: 'text-blue-900 dark:text-blue-100'
        }
      default:
        return {
          bg: 'bg-background',
          border: 'border',
          icon: 'text-primary',
          value: 'text-foreground'
        }
    }
  }

  const formatValue = (value: string | number) => {
    if (typeof value === 'number') {
      // Format large numbers
      if (value >= 1000000) {
        return `${(value / 1000000).toFixed(1)}M`
      }
      if (value >= 1000) {
        return `${(value / 1000).toFixed(1)}K`
      }
      return value.toLocaleString()
    }
    return value
  }

  const formatChange = (change?: number, changeLabel?: string) => {
    if (change === undefined) return null

    const isPositive = change >= 0
    const formattedChange = Math.abs(change)

    return (
      <div className={cn(
        "flex items-center gap-1 text-xs font-medium",
        isPositive ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"
      )}>
        {isPositive ? (
          <TrendingUp className="w-3 h-3" />
        ) : (
          <TrendingDown className="w-3 h-3" />
        )}
        <span>
          {isPositive ? '+' : '-'}{formattedChange}%
        </span>
        {changeLabel && (
          <span className="text-muted-foreground ml-1">{changeLabel}</span>
        )}
      </div>
    )
  }

  if (metrics.length === 0) {
    return (
      <div className={cn("mt-3 p-4 bg-muted/50 rounded-lg border text-center", className)}>
        <BarChart3 className="w-8 h-8 mx-auto mb-2 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">No metrics available</p>
      </div>
    )
  }

  const gridCols = layout === 'grid'
    ? columns === 2
      ? 'grid-cols-2'
      : columns === 3
      ? 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3'
      : 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-4'
    : 'grid-cols-1'

  return (
    <div className={cn("mt-3 space-y-3", className)}>
      {/* Header */}
      {title && (
        <div className="flex items-center gap-2">
          <BarChart3 className="w-5 h-5 text-primary" />
          <span className="font-medium text-lg">{title}</span>
          <Badge variant="secondary" className="ml-auto">{metrics.length}</Badge>
        </div>
      )}

      {/* Metrics Grid/List */}
      <div className={cn("grid gap-3", gridCols)}>
        {metrics.map((metric, index) => {
          const colors = getColorClasses(metric.color)

          return (
            <Card
              key={index}
              className={cn(
                "p-4 transition-all hover:shadow-md",
                colors.bg,
                colors.border
              )}
            >
              <div className="flex items-start justify-between gap-3">
                {/* Icon */}
                <div className={cn(
                  "flex-shrink-0 w-10 h-10 rounded-lg flex items-center justify-center",
                  metric.color === 'success' ? 'bg-green-100 dark:bg-green-900/30' :
                  metric.color === 'warning' ? 'bg-yellow-100 dark:bg-yellow-900/30' :
                  metric.color === 'danger' ? 'bg-red-100 dark:bg-red-900/30' :
                  metric.color === 'info' ? 'bg-blue-100 dark:bg-blue-900/30' :
                  'bg-primary/10'
                )}>
                  <div className={colors.icon}>
                    {getIcon(metric.icon)}
                  </div>
                </div>

                {/* Trend */}
                {metric.trend && (
                  <div className="flex-shrink-0">
                    {getTrendIcon(metric.trend)}
                  </div>
                )}
              </div>

              {/* Content */}
              <div className="mt-3 space-y-1">
                {/* Value */}
                <div className={cn("text-2xl font-bold", colors.value)}>
                  {formatValue(metric.value)}
                </div>

                {/* Label */}
                <div className="text-sm text-muted-foreground">
                  {metric.label}
                </div>

                {/* Subtitle */}
                {metric.subtitle && (
                  <div className="text-xs text-muted-foreground">
                    {metric.subtitle}
                  </div>
                )}

                {/* Change */}
                {metric.change !== undefined && (
                  <div className="mt-2">
                    {formatChange(metric.change, metric.changeLabel)}
                  </div>
                )}
              </div>
            </Card>
          )
        })}
      </div>
    </div>
  )
}
