"use client"

import React from 'react'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { AlertCircle, CheckCircle2, Info } from 'lucide-react'
import { cn } from '@/lib/utils'

export interface ValidationError {
  field?: string
  pathId?: string
  pathName?: string
  conditionId?: string
  message: string
  type: 'error' | 'warning' | 'info'
}

interface InlineValidationProps {
  errors: ValidationError[]
  className?: string
}

export function InlineValidation({ errors, className }: InlineValidationProps) {
  if (errors.length === 0) return null

  return (
    <div className={cn("space-y-2", className)}>
      {errors.map((error, index) => {
        const Icon = error.type === 'error'
          ? AlertCircle
          : error.type === 'warning'
          ? AlertCircle
          : Info

        const alertClass = error.type === 'error'
          ? 'border-red-500/50 bg-red-50 dark:bg-red-950/30 text-red-900 dark:text-red-100'
          : error.type === 'warning'
          ? 'border-yellow-500/50 bg-yellow-50 dark:bg-yellow-950/30 text-yellow-900 dark:text-yellow-100'
          : 'border-blue-500/50 bg-blue-50 dark:bg-blue-950/30 text-blue-900 dark:text-blue-100'

        const iconClass = error.type === 'error'
          ? 'text-red-600 dark:text-red-400'
          : error.type === 'warning'
          ? 'text-yellow-600 dark:text-yellow-400'
          : 'text-blue-600 dark:text-blue-400'

        return (
          <Alert key={index} className={alertClass}>
            <Icon className={cn("h-4 w-4", iconClass)} />
            <AlertDescription className="text-sm ml-2">
              {error.pathName && (
                <span className="font-semibold">{error.pathName}: </span>
              )}
              {error.message}
            </AlertDescription>
          </Alert>
        )
      })}
    </div>
  )
}

interface FieldValidationProps {
  error?: string
  className?: string
}

export function FieldValidation({ error, className }: FieldValidationProps) {
  if (!error) return null

  return (
    <div className={cn("flex items-start gap-2 mt-1.5 text-sm text-red-600 dark:text-red-400", className)}>
      <AlertCircle className="h-4 w-4 flex-shrink-0 mt-0.5" />
      <span>{error}</span>
    </div>
  )
}

interface PathCompletionBadgeProps {
  pathName: string
  totalConditions: number
  validConditions: number
  className?: string
}

export function PathCompletionBadge({
  pathName,
  totalConditions,
  validConditions,
  className
}: PathCompletionBadgeProps) {
  const percentage = totalConditions > 0 ? Math.round((validConditions / totalConditions) * 100) : 0
  const isComplete = percentage === 100

  return (
    <div className={cn("flex items-center gap-2", className)}>
      {isComplete ? (
        <CheckCircle2 className="h-4 w-4 text-green-600 dark:text-green-400" />
      ) : (
        <div className="relative h-4 w-4">
          <svg className="h-4 w-4 -rotate-90" viewBox="0 0 16 16">
            <circle
              cx="8"
              cy="8"
              r="6"
              stroke="currentColor"
              strokeWidth="2"
              fill="none"
              className="text-gray-300 dark:text-gray-600"
            />
            <circle
              cx="8"
              cy="8"
              r="6"
              stroke="currentColor"
              strokeWidth="2"
              fill="none"
              strokeDasharray={`${percentage * 0.377} 37.7`}
              className="text-blue-600 dark:text-blue-400"
            />
          </svg>
        </div>
      )}
      <span className={cn(
        "text-xs font-medium",
        isComplete ? "text-green-600 dark:text-green-400" : "text-blue-600 dark:text-blue-400"
      )}>
        {percentage}% complete
      </span>
    </div>
  )
}
