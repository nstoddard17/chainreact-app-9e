import React from 'react'
import { Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'

interface LoadingScreenProps {
  title?: string
  description?: string
  className?: string
  size?: 'sm' | 'md' | 'lg'
}

export function LoadingScreen({
  title = "Loading",
  description = "Please wait while we fetch your data...",
  className,
  size = 'md'
}: LoadingScreenProps) {
  const sizeClasses = {
    sm: 'py-8',
    md: 'py-12',
    lg: 'py-16'
  }

  const spinnerSizes = {
    sm: 'w-8 h-8',
    md: 'w-12 h-12',
    lg: 'w-16 h-16'
  }

  const titleSizes = {
    sm: 'text-base',
    md: 'text-lg',
    lg: 'text-xl'
  }

  return (
    <div className={cn(
      "flex flex-col items-center justify-center space-y-4",
      sizeClasses[size],
      className
    )}>
      <div className="relative">
        <div className={cn(
          "border-4 border-gray-200 border-t-blue-600 rounded-full animate-spin",
          spinnerSizes[size]
        )}></div>
      </div>
      <div className="text-center space-y-2">
        <h3 className={cn(
          "font-medium text-gray-900",
          titleSizes[size]
        )}>
          {title}
        </h3>
        <p className="text-sm text-gray-500 max-w-md">
          {description}
        </p>
        <div className="flex items-center justify-center space-x-2 text-xs text-gray-400">
          <div className="w-2 h-2 bg-blue-600 rounded-full animate-pulse"></div>
          <span>This may take a few seconds</span>
        </div>
      </div>
    </div>
  )
}

// Specialized loading screens for common use cases
export function DataLoadingScreen({ entityName = "data" }: { entityName?: string }) {
  return (
    <LoadingScreen
      title={`Loading ${entityName}`}
      description={`Fetching ${entityName} from your connected integrations...`}
    />
  )
}

export function ConfigurationLoadingScreen({ integrationName }: { integrationName: string }) {
  return (
    <LoadingScreen
      title="Loading Configuration"
      description={`Fetching ${integrationName} data for autocomplete suggestions...`}
    />
  )
}

export function IntegrationLoadingScreen() {
  return (
    <LoadingScreen
      title="Loading Integrations"
      description="Fetching your connected apps and services..."
    />
  )
}

export function WorkflowLoadingScreen() {
  return (
    <LoadingScreen
      title="Loading Workflow"
      description="Setting up your workflow builder..."
      size="lg"
    />
  )
} 