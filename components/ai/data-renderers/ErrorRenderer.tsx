"use client"

import React from "react"
import { AlertCircle, AlertTriangle, Info, XCircle } from "lucide-react"
import { Card } from "@/components/ui/card"
import { cn } from "@/lib/utils"

interface ErrorRendererProps {
  error: string | Error
  type?: 'error' | 'warning' | 'info'
  title?: string
  details?: string
  stack?: string
  className?: string
}

export function ErrorRenderer({
  error,
  type = 'error',
  title,
  details,
  stack,
  className
}: ErrorRendererProps) {
  const errorMessage = typeof error === 'string' ? error : error.message
  const errorStack = typeof error === 'object' ? error.stack : stack

  const getIcon = () => {
    switch (type) {
      case 'warning':
        return <AlertTriangle className="w-5 h-5" />
      case 'info':
        return <Info className="w-5 h-5" />
      default:
        return <XCircle className="w-5 h-5" />
    }
  }

  const getColorClasses = () => {
    switch (type) {
      case 'warning':
        return {
          bg: 'bg-yellow-50 dark:bg-yellow-950/20',
          border: 'border-yellow-200 dark:border-yellow-800',
          icon: 'text-yellow-600 dark:text-yellow-400',
          title: 'text-yellow-900 dark:text-yellow-100'
        }
      case 'info':
        return {
          bg: 'bg-blue-50 dark:bg-blue-950/20',
          border: 'border-blue-200 dark:border-blue-800',
          icon: 'text-blue-600 dark:text-blue-400',
          title: 'text-blue-900 dark:text-blue-100'
        }
      default:
        return {
          bg: 'bg-red-50 dark:bg-red-950/20',
          border: 'border-red-200 dark:border-red-800',
          icon: 'text-red-600 dark:text-red-400',
          title: 'text-red-900 dark:text-red-100'
        }
    }
  }

  const colors = getColorClasses()

  return (
    <Card className={cn("p-4", colors.bg, colors.border, className)}>
      <div className="flex items-start gap-3">
        <div className={cn("flex-shrink-0 mt-0.5", colors.icon)}>
          {getIcon()}
        </div>

        <div className="flex-1 min-w-0 space-y-2">
          {/* Title */}
          <h4 className={cn("font-semibold text-sm", colors.title)}>
            {title || (type === 'warning' ? 'Warning' : type === 'info' ? 'Information' : 'Error')}
          </h4>

          {/* Error Message */}
          <div className="text-sm">
            {errorMessage}
          </div>

          {/* Details */}
          {details && (
            <div className="text-sm text-muted-foreground">
              {details}
            </div>
          )}

          {/* Stack Trace */}
          {errorStack && (
            <details className="text-xs">
              <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
                Show stack trace
              </summary>
              <pre className="mt-2 p-2 bg-background/50 rounded border overflow-x-auto">
                {errorStack}
              </pre>
            </details>
          )}
        </div>
      </div>
    </Card>
  )
}
