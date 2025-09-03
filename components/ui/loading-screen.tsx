import React from 'react'
import { cn } from '@/lib/utils'
import { LightningLoader } from './lightning-loader'

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

  const loaderSizes = {
    sm: 'md' as const,
    md: 'lg' as const,
    lg: 'xl' as const
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
      <LightningLoader size={loaderSizes[size]} color="primary" />
      <div className="text-center space-y-2">
        <h3 className={cn(
          "font-medium text-foreground",
          titleSizes[size]
        )}>
          {title}
        </h3>
        <p className="text-sm text-muted-foreground max-w-md">
          {description}
        </p>
        <div className="flex items-center justify-center space-x-2 text-xs text-muted-foreground">
          <div className="w-2 h-2 bg-primary rounded-full animate-pulse"></div>
          <span>This may take a few seconds</span>
        </div>
      </div>
    </div>
  )
}

// Specialized loading screens for common use cases
export function DataLoadingScreen({ entityName = "data" }: { entityName?: string }) {
  return (
    <div className="bg-background/80 backdrop-blur-sm">
      <LoadingScreen
        title={`Loading ${entityName}`}
        description={`Fetching ${entityName} from your connected integrations...`}
      />
    </div>
  )
}

export function ConfigurationLoadingScreen({ integrationName }: { integrationName: string }) {
  return (
    <div>
      <LoadingScreen
        title="Loading Configuration"
        description={`Fetching ${integrationName} data for autocomplete suggestions...`}
      />
    </div>
  )
}

export function IntegrationLoadingScreen() {
  return (
    <div className="bg-background/80 backdrop-blur-sm">
      <LoadingScreen
        title="Loading Integrations"
        description="Fetching your connected apps and services..."
      />
    </div>
  )
}

export function WorkflowLoadingScreen() {
  return (
    <div className="bg-background/80 backdrop-blur-sm">
      <LoadingScreen
        title="Loading Workflow"
        description="Setting up your workflow builder..."
        size="lg"
      />
    </div>
  )
} 