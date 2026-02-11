"use client"

import {
  CheckCircle2,
  Circle,
  AlertTriangle,
  Pause,
  AlertCircle,
  Clock,
  XCircle
} from "lucide-react"
import { Badge } from "@/components/ui/badge"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"

export type WorkflowStatusType = 'active' | 'paused' | 'draft' | 'error' | 'incomplete'

interface WorkflowValidation {
  isValid: boolean
  issues: string[]
}

interface WorkflowStatusBadgeProps {
  status: string
  validation?: WorkflowValidation
  showLabel?: boolean
  size?: 'sm' | 'md' | 'lg'
  className?: string
}

// Validate workflow configuration
export function validateWorkflow(workflow: any): WorkflowValidation {
  const issues: string[] = []

  let nodes: any[] = []
  try {
    const workflowData = typeof workflow.workflow_json === 'string'
      ? JSON.parse(workflow.workflow_json)
      : workflow.workflow_json
    nodes = workflowData?.nodes || []
  } catch (e) {
    issues.push('Invalid workflow configuration')
    return { isValid: false, issues }
  }

  // Helper to check isTrigger from either Flow or ReactFlow format
  const isNodeTrigger = (node: any) =>
    node.data?.isTrigger ?? node.metadata?.isTrigger ?? node.type?.includes('_trigger_')

  // Helper to check if node is a valid workflow node (not a placeholder)
  const isWorkflowNode = (node: any) =>
    node.type === 'custom' || (node.type && !node.type.startsWith('add-'))

  const hasTrigger = nodes.some((node: any) => isNodeTrigger(node))
  if (!hasTrigger) {
    issues.push('No trigger node configured')
  }

  const hasAction = nodes.some((node: any) => !isNodeTrigger(node) && isWorkflowNode(node))
  if (!hasAction) {
    issues.push('No action nodes configured')
  }

  // Check for nodes that are NOT ready (using validationState if available)
  const notReadyNodes = nodes.filter((node: any) => {
    if (!isWorkflowNode(node)) return false

    // If node has validationState, use it (most accurate - set by ConfigurationForm)
    const validationState = node.data?.validationState
    if (validationState) {
      return validationState.isValid === false
    }

    // For backward compatibility with older workflows without validationState:
    // Consider node "ready" if it has any config at all
    const config = node.data?.config || node.config || {}
    const configKeys = Object.keys(config)
    return configKeys.length === 0
  })
  if (notReadyNodes.length > 0) {
    issues.push(`${notReadyNodes.length} node${notReadyNodes.length > 1 ? 's need' : ' needs'} configuration`)
  }

  return { isValid: issues.length === 0, issues }
}

// Get status configuration based on workflow status and validation
export function getStatusConfig(status: string, validation?: WorkflowValidation) {
  const normalizedStatus = status || 'draft'

  if (normalizedStatus === 'active') {
    return {
      type: 'active' as WorkflowStatusType,
      icon: CheckCircle2,
      iconColor: 'text-green-500',
      bgColor: 'bg-green-500/10',
      borderColor: 'border-green-500/20',
      dotColor: 'bg-green-500',
      label: 'Active',
      labelColor: 'text-green-700 dark:text-green-400',
      description: 'Workflow is running and processing events'
    }
  }

  if (normalizedStatus === 'paused') {
    return {
      type: 'paused' as WorkflowStatusType,
      icon: Pause,
      iconColor: 'text-orange-500',
      bgColor: 'bg-orange-500/10',
      borderColor: 'border-orange-500/20',
      dotColor: 'bg-orange-500',
      label: 'Paused',
      labelColor: 'text-orange-700 dark:text-orange-400',
      description: 'Workflow is paused and not processing events'
    }
  }

  if (normalizedStatus === 'error') {
    return {
      type: 'error' as WorkflowStatusType,
      icon: XCircle,
      iconColor: 'text-red-500',
      bgColor: 'bg-red-500/10',
      borderColor: 'border-red-500/20',
      dotColor: 'bg-red-500',
      label: 'Error',
      labelColor: 'text-red-700 dark:text-red-400',
      description: 'Workflow encountered an error'
    }
  }

  // Draft status - check validation
  if (validation && !validation.isValid) {
    return {
      type: 'incomplete' as WorkflowStatusType,
      icon: AlertTriangle,
      iconColor: 'text-yellow-500',
      bgColor: 'bg-yellow-500/10',
      borderColor: 'border-yellow-500/20',
      dotColor: 'bg-yellow-500',
      label: 'Incomplete',
      labelColor: 'text-yellow-700 dark:text-yellow-400',
      description: 'Workflow needs configuration before activation',
      warning: true,
      issues: validation.issues
    }
  }

  return {
    type: 'draft' as WorkflowStatusType,
    icon: Circle,
    iconColor: 'text-gray-400',
    bgColor: 'bg-gray-500/10',
    borderColor: 'border-gray-500/20',
    dotColor: 'bg-gray-400',
    label: 'Draft',
    labelColor: 'text-gray-600 dark:text-gray-400',
    description: 'Workflow is saved but not active'
  }
}

export function WorkflowStatusBadge({
  status,
  validation,
  showLabel = true,
  size = 'md',
  className
}: WorkflowStatusBadgeProps) {
  const config = getStatusConfig(status, validation)
  const Icon = config.icon

  const sizeClasses = {
    sm: {
      badge: 'px-1.5 py-0.5 text-xs gap-1',
      icon: 'w-3 h-3',
      dot: 'w-1.5 h-1.5'
    },
    md: {
      badge: 'px-2 py-0.5 text-xs gap-1.5',
      icon: 'w-3.5 h-3.5',
      dot: 'w-2 h-2'
    },
    lg: {
      badge: 'px-2.5 py-1 text-sm gap-2',
      icon: 'w-4 h-4',
      dot: 'w-2.5 h-2.5'
    }
  }

  const sizes = sizeClasses[size]

  const badgeContent = (
    <Badge
      variant="outline"
      className={cn(
        'flex items-center font-medium transition-colors',
        sizes.badge,
        config.bgColor,
        config.borderColor,
        config.labelColor,
        className
      )}
    >
      {showLabel ? (
        <>
          <Icon className={cn(sizes.icon, config.iconColor)} />
          {config.label}
        </>
      ) : (
        <div className={cn('rounded-full', sizes.dot, config.dotColor)} />
      )}
    </Badge>
  )

  // If there are issues, wrap in tooltip
  if (config.warning && config.issues && config.issues.length > 0) {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            {badgeContent}
          </TooltipTrigger>
          <TooltipContent side="top" className="max-w-xs">
            <p className="font-semibold mb-1">Cannot activate workflow:</p>
            <ul className="text-xs space-y-1">
              {config.issues.map((issue, idx) => (
                <li key={idx}>• {issue}</li>
              ))}
            </ul>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    )
  }

  // For non-warning states, add simple tooltip with description
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          {badgeContent}
        </TooltipTrigger>
        <TooltipContent side="top">
          <p className="text-xs">{config.description}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}

// Icon-only version for compact displays
export function WorkflowStatusIcon({
  status,
  validation,
  size = 'md',
  className
}: Omit<WorkflowStatusBadgeProps, 'showLabel'>) {
  const config = getStatusConfig(status, validation)
  const Icon = config.icon

  const sizeClasses = {
    sm: 'w-4 h-4',
    md: 'w-5 h-5',
    lg: 'w-6 h-6'
  }

  const iconContent = (
    <div className={cn(
      'rounded-lg p-1.5 flex items-center justify-center',
      config.bgColor,
      'border',
      config.borderColor,
      className
    )}>
      <Icon className={cn(sizeClasses[size], config.iconColor)} />
    </div>
  )

  if (config.warning && config.issues && config.issues.length > 0) {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            {iconContent}
          </TooltipTrigger>
          <TooltipContent side="right" className="max-w-xs">
            <p className="font-semibold mb-1">Cannot activate workflow:</p>
            <ul className="text-xs space-y-1">
              {config.issues.map((issue, idx) => (
                <li key={idx}>• {issue}</li>
              ))}
            </ul>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    )
  }

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          {iconContent}
        </TooltipTrigger>
        <TooltipContent side="right">
          <p className="text-xs">{config.label}: {config.description}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}

// Dot-only indicator for minimal displays (e.g., in lists)
export function WorkflowStatusDot({
  status,
  validation,
  size = 'md',
  className,
  pulse = false
}: Omit<WorkflowStatusBadgeProps, 'showLabel'> & { pulse?: boolean }) {
  const config = getStatusConfig(status, validation)

  const sizeClasses = {
    sm: 'w-2 h-2',
    md: 'w-2.5 h-2.5',
    lg: 'w-3 h-3'
  }

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <div className={cn(
            'rounded-full',
            sizeClasses[size],
            config.dotColor,
            pulse && status === 'active' && 'animate-pulse',
            className
          )} />
        </TooltipTrigger>
        <TooltipContent side="top">
          <p className="text-xs font-medium">{config.label}</p>
          {config.warning && config.issues && (
            <ul className="text-xs mt-1 space-y-0.5">
              {config.issues.map((issue, idx) => (
                <li key={idx}>• {issue}</li>
              ))}
            </ul>
          )}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}
