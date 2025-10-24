"use client"

import React, { memo, useState, useRef, useEffect, useMemo } from "react"
import { Handle, Position, type NodeProps } from "@xyflow/react"
import { ALL_NODE_COMPONENTS } from "@/lib/workflows/nodes"
import { Settings, Trash2, TestTube, Plus, Edit2, Layers, Unplug, Sparkles, ChevronDown, ChevronUp, Loader2, CheckCircle2, AlertTriangle } from "lucide-react"
import { LightningLoader } from '@/components/ui/lightning-loader'
import { Button } from "@/components/ui/button"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { useWorkflowTestStore } from "@/stores/workflowTestStore"
import { useIntegrationStore } from "@/stores/integrationStore"
import { NodeAIIndicator } from "./nodes/AINodeIndicators"
import { NodeContextMenu } from "./NodeContextMenu"

import { logger } from '@/lib/utils/logger'
import { getIntegrationLogoClasses } from "@/lib/integrations/logoStyles"
import { cn } from "@/lib/utils"

// The data object passed to the node will now contain these callbacks.
interface CustomNodeData {
  title: string
  description: string
  type: string
  providerId?: string
  isTrigger?: boolean
  config?: Record<string, any>
  testData?: Record<string, any>
  savedDynamicOptions?: Record<string, any[]>
  validationState?: {
    missingRequired?: string[]
    allRequiredFields?: string[]
    lastValidatedAt?: string
    lastUpdatedAt?: string
    isValid?: boolean
  }
  onConfigure: (id: string) => void
  onDelete: (id: string) => void
  onAddChain?: (nodeId: string) => void
  onRename?: (id: string, newTitle: string) => void
  onEditingStateChange?: (id: string, isEditing: boolean) => void
  onAddAction?: () => void
  onTestNode?: (nodeId: string) => void
  onTestFlowFromHere?: (nodeId: string) => void
  onFreeze?: (nodeId: string) => void
  onStop?: (nodeId: string) => void
  hasAddButton?: boolean
  isPlaceholder?: boolean
  error?: string
  executionStatus?: 'pending' | 'running' | 'completed' | 'error' | null
  isActiveExecution?: boolean
  isListening?: boolean
  errorMessage?: string
  errorTimestamp?: string
  parentChainIndex?: number
  isAIAgentChild?: boolean
  parentAIAgentId?: string
  needsSetup?: boolean
  aiStatus?: 'creating' | 'configuring' | 'configured' | 'testing' | 'ready' | 'error' | string
  aiBadgeText?: string
  aiBadgeVariant?: 'success' | 'warning' | 'info' | 'danger' | 'default' | string
  aiTestSummary?: string | null
  autoExpand?: boolean
  aiFallbackFields?: string[]
  aiProgressConfig?: {
    key: string
    value: any
    displayValue?: string
    viaFallback?: boolean
  }[]
}

function CustomNode({ id, data, selected }: NodeProps) {
  const nodeData = data as CustomNodeData & { debugListeningMode?: boolean; debugExecutionStatus?: string }
  const [isEditingTitle, setIsEditingTitle] = useState(false)
  const [editedTitle, setEditedTitle] = useState("")
  const [isConfigExpanded, setIsConfigExpanded] = useState<boolean>(() => Boolean(nodeData.autoExpand)) // Track if config section is expanded
  const titleInputRef = useRef<HTMLInputElement>(null)

  const {
    title,
    description,
    type,
    providerId,
    isTrigger,
    config,
    savedDynamicOptions,
    validationState,
    onConfigure,
    onDelete,
    onAddChain,
    onRename,
    onAddAction,
    onTestNode,
    onTestFlowFromHere,
    onFreeze,
    onStop,
    hasAddButton,
    isPlaceholder,
    error,
    executionStatus,
    isActiveExecution,
    isListening,
    errorMessage,
    errorTimestamp,
    parentChainIndex,
    isAIAgentChild,
    parentAIAgentId,
    needsSetup,
    debugListeningMode,
    debugExecutionStatus,
    aiStatus,
    aiBadgeText,
    aiBadgeVariant,
    aiTestSummary,
    autoExpand,
    testData,
    aiFallbackFields,
    aiProgressConfig,
  } = nodeData

  const component = ALL_NODE_COMPONENTS.find((c) => c.type === type)
  const hasMultipleOutputs = ["if_condition", "switch_case", "try_catch"].includes(type)

  // Check if this node has test data available
  const { isNodeInExecutionPath, getNodeTestResult } = useWorkflowTestStore()
  const hasTestData = isNodeInExecutionPath(id)
  const testResult = getNodeTestResult(id)

  // Check if integration is disconnected
  const { integrations } = useIntegrationStore()
  const isIntegrationDisconnected = (() => {
    // Skip check for system/internal node types
    if (!providerId || ['logic', 'core', 'manual', 'schedule', 'webhook', 'ai'].includes(providerId)) {
      return false
    }

    // Special case: Excel uses OneDrive's OAuth connection
    const actualProvider = providerId === 'microsoft-excel' ? 'onedrive' : providerId

    // Check if integration is connected
    const isConnected = integrations.some(
      integration => integration.provider === actualProvider && integration.status === 'connected'
    )

    return !isConnected
  })()

  // Handle title editing
  useEffect(() => {
    if (isEditingTitle && titleInputRef.current) {
      titleInputRef.current.focus()
      titleInputRef.current.select()
    }
  }, [isEditingTitle])

  useEffect(() => {
    const hasConfig = config && Object.keys(config).length > 0
    const hasTestData = testData && Object.keys(testData).length > 0
    const isActiveStatus = ['preparing', 'creating', 'configuring', 'testing'].includes(aiStatus || '')

    if (!isConfigExpanded && (autoExpand || hasConfig || hasTestData || isActiveStatus)) {
      setIsConfigExpanded(true)
    }
  }, [autoExpand, config, testData, aiStatus, isConfigExpanded])
  
  const handleStartEditTitle = () => {
    setEditedTitle(title || component?.title || 'Unnamed Action')
    setIsEditingTitle(true)
    // Communicate to parent that we're editing (will make node non-draggable)
    if (data.onEditingStateChange) {
      data.onEditingStateChange(id, true)
    }
  }

  const handleSaveTitle = () => {
    const newTitle = editedTitle.trim()
    if (newTitle && newTitle !== title && onRename) {
      onRename(id, newTitle)
    }
    setIsEditingTitle(false)
    // Re-enable dragging
    if (data.onEditingStateChange) {
      data.onEditingStateChange(id, false)
    }
  }

  const handleCancelEdit = () => {
    setIsEditingTitle(false)
    setEditedTitle("")
    // Re-enable dragging
    if (data.onEditingStateChange) {
      data.onEditingStateChange(id, false)
    }
  }
  
  const handleTitleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSaveTitle()
    } else if (e.key === 'Escape') {
      handleCancelEdit()
    }
  }
  
  // Get execution status styling with enhanced visual feedback
  const getExecutionStatusStyle = () => {
    if (!executionStatus && !isListening) return ""
    
    let cssClass = ""
    
    switch (executionStatus) {
      case 'running':
        cssClass = "border-2 border-yellow-500 shadow-lg shadow-yellow-200"
        break
      case 'success':
      case 'completed':
        cssClass = "border-2 border-green-500 shadow-lg shadow-green-200"
        break
      case 'error':
        cssClass = "border-2 border-red-500 shadow-lg shadow-red-200"
        break
      case 'pending':
        cssClass = "border-2 border-blue-500 shadow-lg shadow-blue-200"
        break
      case 'waiting':
        cssClass = "border-2 border-purple-500 shadow-lg shadow-purple-200"
        break
      default:
        cssClass = isListening && isTrigger ? "border-2 border-indigo-500 border-dashed shadow-lg shadow-indigo-200" : ""
        break
    }
    
    return cssClass
  }
  
  // Get execution status indicator for corner
  const getExecutionStatusIndicator = () => {
    if (!executionStatus && !isListening) return null
    
    switch (executionStatus) {
      case 'running':
        return (
          <div className="absolute top-2 right-2 w-5 h-5 flex items-center justify-center">
            <LightningLoader size="sm" color="yellow" />
          </div>
        )
      case 'success':
      case 'completed':
        return (
          <div className="absolute top-2 right-2 w-5 h-5 flex items-center justify-center">
            <div className="w-4 h-4 rounded-full bg-green-500 flex items-center justify-center">
              <span className="text-white text-xs">✓</span>
            </div>
          </div>
        )
      case 'error':
        return (
          <div className="absolute top-2 right-2 w-5 h-5 flex items-center justify-center">
            <div className="w-4 h-4 rounded-full bg-red-500 flex items-center justify-center">
              <span className="text-white text-xs">✕</span>
            </div>
          </div>
        )
      case 'waiting':
        return (
          <div className="absolute top-2 right-2 w-5 h-5 flex items-center justify-center">
            <div className="w-4 h-4 rounded-full bg-purple-500" />
          </div>
        )
      case 'pending':
        return (
          <div className="absolute top-2 right-2 w-5 h-5 flex items-center justify-center">
            <LightningLoader size="sm" color="blue" />
          </div>
        )
      default:
        return isListening && isTrigger ? (
          <div className="absolute top-2 right-2 w-4 h-4 flex items-center justify-center">
            <div className="w-2 h-2 rounded-full bg-indigo-500" />
          </div>
        ) : null
    }
  }

  // Get error label for top-left corner
  const getErrorLabel = () => {
    if (executionStatus === 'error' && (error || errorMessage)) {
      return (
        <div className="absolute top-1 left-1 bg-red-500 text-white text-xs px-1.5 py-0.5 rounded-sm font-medium shadow-sm z-10">
          ERROR
        </div>
      )
    }
    return null
  }
  
  // Check if this node has configuration options
  const nodeHasConfiguration = (): boolean => {
    if (!component) return false

    // Manual triggers don't show configuration button - they open trigger selection on double-click
    if (type === 'manual') {
      return false
    }

    // All nodes with a component definition should be configurable
    // This includes triggers, actions, and any node with optional or required fields
    return true
  }

  const handleConfigure = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (onConfigure) {
      onConfigure(id)
    }
  }

  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (onDelete) {
      onDelete(id)
    }
  }

  const handleDoubleClick = (e: React.MouseEvent) => {
    e.stopPropagation()
    console.log('🔍 [CustomNode] Double-click detected:', {
      nodeId: id,
      type,
      hasOnConfigure: !!onConfigure,
      nodeHasConfiguration: nodeHasConfiguration()
    })

    // Manual triggers open the trigger selection dialog on double-click
    if (type === 'manual' && onConfigure) {
      console.log('🔍 [CustomNode] Opening manual trigger dialog')
      // For manual triggers, onConfigure should open the trigger selection dialog
      onConfigure(id)
      return
    }

    // Only open configuration if the node has configuration options
    if (nodeHasConfiguration() && onConfigure) {
      console.log('🔍 [CustomNode] Calling onConfigure')
      onConfigure(id)
    } else {
      console.log('🔍 [CustomNode] NOT calling onConfigure:', {
        nodeHasConfiguration: nodeHasConfiguration(),
        hasOnConfigure: !!onConfigure
      })
    }
  }

  const hasValidationIssues = Boolean(validationState?.missingRequired?.length)

  // Convert technical field names to human-readable labels
  const getFieldLabel = (fieldName: string): string => {
    const labelMap: Record<string, string> = {
      // Common fields
      'channelId': 'Channel',
      'webhookUrl': 'Webhook URL',
      'baseId': 'Base',
      'tableName': 'Table',
      'to': 'To',
      'subject': 'Subject',
      'body': 'Body',
      'message': 'Message',
      'username': 'Username',
      'email': 'Email',
      'name': 'Name',
      'recordId': 'Record ID',
      // Add more mappings as needed
    }

    return labelMap[fieldName] || fieldName
      .replace(/([A-Z])/g, ' $1') // Add space before capital letters
      .replace(/^./, str => str.toUpperCase()) // Capitalize first letter
      .trim()
  }

  const hasRenderableValue = (value: any): boolean => {
    if (value === null || value === undefined) return false
    if (typeof value === 'string') return value.trim().length > 0
    return true
  }

  const formatDisplayValue = (value: any): string => {
    if (value === null || value === undefined) return 'Not set'
    if (value === '') return 'Empty'

    if (typeof value === 'boolean') {
      return value ? 'Yes' : 'No'
    }

    if (typeof value === 'object') {
      try {
        const serialized = JSON.stringify(value)
        return serialized.length > 60 ? `${serialized.substring(0, 60)}...` : serialized
      } catch {
        return '[Object]'
      }
    }

    const stringValue = String(value)

    if (stringValue.includes('{{AI_FIELD:')) {
      return '✨ AI will generate'
    }

    if (stringValue.includes('{{')) {
      const varMatch = stringValue.match(/\{\{([^}]+)\}\}/)
      if (varMatch) {
        return `📎 From ${varMatch[1]}`
      }
    }

    return stringValue.length > 60 ? `${stringValue.substring(0, 60)}...` : stringValue
  }

  const validationMessage = useMemo(() => {
    if (isIntegrationDisconnected || !hasValidationIssues) return ""

    const fieldsToShow = validationState?.allRequiredFields || validationState?.missingRequired || []

    if (fieldsToShow.length === 0) {
      return "Required fields missing"
    }

    if (fieldsToShow.length === 1) {
      return `Required field: ${getFieldLabel(fieldsToShow[0])}`
    }

    return `Required fields: ${fieldsToShow.map(getFieldLabel).join(', ')}`
  }, [isIntegrationDisconnected, hasValidationIssues, validationState])

  const badgeVariantStyles: Record<string, string> = {
    success: 'border-green-500 text-green-600 bg-green-50',
    warning: 'border-amber-500 text-amber-600 bg-amber-50',
    info: 'border-blue-500 text-blue-600 bg-blue-50',
    danger: 'border-red-500 text-red-600 bg-red-50',
    default: 'border-border text-muted-foreground bg-muted/40'
  }

  // Don't show badge during AI operations
  const isAIActive = aiStatus && aiStatus !== 'ready' && aiStatus !== 'error'
  const badgeLabel = !isAIActive ? (aiBadgeText || (needsSetup && !error && !hasValidationIssues ? 'Setup required' : null)) : null
  const resolvedBadgeVariant = badgeLabel
    ? (aiBadgeText ? (aiBadgeVariant || 'info') : 'warning')
    : null
  const badgeClasses = resolvedBadgeVariant ? (badgeVariantStyles[resolvedBadgeVariant] || badgeVariantStyles.default) : ''

  const summaryVariantStyles: Record<string, string> = {
    success: 'bg-emerald-50 text-emerald-700 border-t border-emerald-200',
    warning: 'bg-amber-50 text-amber-700 border-t border-amber-200',
    info: 'bg-sky-50 text-sky-700 border-t border-sky-200'
  }
  const summaryVariant = aiStatus === 'ready' ? 'success' : aiStatus === 'error' ? 'warning' : 'info'
  const summaryClasses = summaryVariantStyles[summaryVariant] || summaryVariantStyles.info
  const fallbackFields = Array.isArray(aiFallbackFields) ? aiFallbackFields : []

  const progressConfigEntries = useMemo(() => {
    if (!Array.isArray(aiProgressConfig)) return []
    return aiProgressConfig
  }, [aiProgressConfig])

  const progressFallbackKeys = useMemo(() => {
    const set = new Set<string>()
    progressConfigEntries.forEach(({ key, viaFallback }) => {
      if (viaFallback) {
        set.add(key)
      }
    })
    return set
  }, [progressConfigEntries])

  const configEntries = useMemo(() => {
    const baseEntries = Object.entries(config || {})
    if (baseEntries.length > 0) {
      return baseEntries
    }
    if (progressConfigEntries.length > 0) {
      return progressConfigEntries.map(({ key, value }) => [key, value]) as [string, any][]
    }
    return []
  }, [config, progressConfigEntries])

  const configDisplayOverrides = useMemo(() => {
    const map = new Map<string, string>()
    progressConfigEntries.forEach(({ key, displayValue }) => {
      if (displayValue) {
        map.set(key, displayValue)
      }
    })
    return map
  }, [progressConfigEntries])
  const testDataEntries = useMemo(() => Object.entries(testData || {}), [testData])
  const hasConfigEntries = configEntries.length > 0
  const hasTestEntries = testDataEntries.length > 0
  const showConfigSection = hasConfigEntries || ['preparing', 'creating', 'configuring', 'configured', 'testing', 'ready'].includes(aiStatus || '')
  const showConfigSkeleton = !hasConfigEntries && ['preparing', 'creating', 'configuring'].includes(aiStatus || '')
  const showTestingSection = hasTestEntries || aiStatus === 'testing'
  const showTestingSkeleton = !hasTestEntries && aiStatus === 'testing'

  const visibleConfigEntries = useMemo(() => {
    return isConfigExpanded ? configEntries : configEntries.slice(0, 3)
  }, [configEntries, isConfigExpanded])

  const hiddenConfigCount = Math.max(configEntries.length - visibleConfigEntries.length, 0)

  const aiOutline = useMemo(() => {
    if (selected) {
      return { borderClass: 'border-primary', shadowClass: '' }
    }

    if (isIntegrationDisconnected) {
      return {
        borderClass: 'border-red-500',
        shadowClass: 'shadow-[0_0_0_3px_rgba(239,68,68,0.4)]'
      }
    }

    if (error) {
      return { borderClass: 'border-destructive', shadowClass: '' }
    }

    if (hasValidationIssues) {
      return {
        borderClass: 'border-red-400',
        shadowClass: 'shadow-[0_0_0_2px_rgba(248,113,113,0.35)]'
      }
    }

    switch (aiStatus) {
      case 'preparing':
      case 'creating':
      case 'configuring':
        return {
          borderClass: 'border-sky-500',
          shadowClass: 'shadow-[0_0_0_3px_rgba(56,189,248,0.25)]'
        }
      case 'testing':
        return {
          borderClass: 'border-amber-500',
          shadowClass: 'shadow-[0_0_0_3px_rgba(251,191,36,0.28)]'
        }
      case 'ready':
        return {
          borderClass: 'border-emerald-500',
          shadowClass: 'shadow-[0_0_0_3px_rgba(16,185,129,0.28)]'
        }
      case 'error':
        return {
          borderClass: 'border-red-500',
          shadowClass: 'shadow-[0_0_0_3px_rgba(239,68,68,0.28)]'
        }
      default:
        return {
          borderClass: 'border-border',
          shadowClass: ''
        }
    }
  }, [aiStatus, selected, isIntegrationDisconnected, error, hasValidationIssues])

  const { borderClass, shadowClass } = aiOutline

  const renderStatusIndicator = () => {
    // Don't show for error states or when there's no status
    if (!aiStatus || aiStatus === 'error') return null

    let statusText = ''
    let showLoader = true
    let statusColor = 'text-muted-foreground'
    let Icon = Loader2

    switch(aiStatus) {
      case 'preparing':
      case 'creating':
      case 'configuring':
      case 'configured':
        statusText = 'Configuring'
        statusColor = 'text-sky-600'
        break
      case 'testing':
      case 'retesting':
        statusText = 'Testing'
        statusColor = 'text-amber-600'
        break
      case 'fixing':
        statusText = 'Fixing'
        statusColor = 'text-orange-600'
        break
      case 'ready':
        statusText = 'Done'
        showLoader = false
        statusColor = 'text-emerald-600'
        Icon = CheckCircle2
        break
      default:
        statusText = 'Processing'
    }

    return (
      <div className={`flex items-center gap-1.5 text-xs font-normal ${statusColor}`}>
        <Icon className={showLoader ? "w-3 h-3 animate-spin" : "w-3 h-3"} />
        <span>{statusText}</span>
      </div>
    )
  }

  return (
    <NodeContextMenu
      nodeId={id}
      onTestNode={onTestNode}
      onTestFlowFromHere={onTestFlowFromHere}
      onFreeze={onFreeze}
      onStop={onStop}
      onDelete={onDelete}
    >
      <div
        className={`relative w-[450px] bg-card rounded-lg shadow-sm border-2 group ${borderClass} ${shadowClass} hover:shadow-md transition-all duration-200 ${
          nodeHasConfiguration() ? "cursor-pointer" : ""
        } ${getExecutionStatusStyle()}`}
        data-testid={`node-${id}`}
        onDoubleClick={handleDoubleClick}
      >
      {/* AI indicators for AI-powered nodes (includes chain badges) - Skip for ai_agent type */}
      {type !== 'ai_agent' && (
        <NodeAIIndicator node={{ id, data: { ...data, config, type, parentChainIndex, isAIAgentChild, parentAIAgentId } }} />
      )}

      {/* Execution status indicator */}
      {getExecutionStatusIndicator()}
      {/* Error label */}
      {getErrorLabel()}
      {error && !isIntegrationDisconnected && (
        <div className="bg-destructive/10 border-b border-destructive/20 px-4 py-2 rounded-t-lg">
          <p className="text-sm text-destructive font-medium">{error}</p>
        </div>
      )}
      {!error && !isIntegrationDisconnected && hasValidationIssues && (
        <div className="bg-red-50 border-b border-red-100 px-4 py-3 rounded-t-lg">
          <div className="flex items-start gap-2">
            <span className="inline-flex items-center rounded-full bg-red-500 text-white text-[11px] font-semibold uppercase tracking-wide px-2 py-0.5">
              Incomplete
            </span>
            <p className="text-sm text-red-600 font-medium leading-snug flex-1">
              {validationMessage}
            </p>
          </div>
        </div>
      )}

      {hasTestData && (
        <div className="bg-blue-50 border-b border-blue-200 px-4 py-2">
          <div className="flex items-center gap-2 text-xs text-blue-700">
            <TestTube className="w-3 h-3" />
            <span>Test data available</span>
            {testResult && (
              <span className={`px-1.5 py-0.5 rounded text-xs ${
                testResult.success 
                  ? 'bg-green-100 text-green-700' 
                  : 'bg-red-100 text-red-700'
              }`}>
                {testResult.success ? '✓' : '✗'}
              </span>
            )}
          </div>
        </div>
      )}
      

      <div className="p-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-start space-x-2.5 flex-1 min-w-0">
            {type === 'chain_placeholder' ? (
              <Layers className="h-7 w-7 text-muted-foreground flex-shrink-0 mt-0.5" />
            ) : providerId ? (
              <img
                src={`/integrations/${providerId}.svg`}
                alt={`${title || ''} logo`}
                className={getIntegrationLogoClasses(providerId, "w-7 h-7 object-contain flex-shrink-0 mt-0.5")}
                onError={(e) => {
                  logger.error(`Failed to load logo for ${providerId} at path: /integrations/${providerId}.svg`)
                  // Fallback to icon if image fails
                  if (component?.icon) {
                    const parent = e.currentTarget.parentElement
                    if (parent) {
                      e.currentTarget.remove()
                      const iconElement = React.createElement(component.icon, { className: "h-8 w-8 text-foreground" })
                      // This won't work directly, but shows the intent
                    }
                  }
                }}
                onLoad={() => logger.debug(`Successfully loaded logo for ${providerId}`)}
              />
            ) : (
              component?.icon && React.createElement(component.icon, { className: "h-7 w-7 text-foreground flex-shrink-0 mt-0.5" })
            )}
            <div className="min-w-0 flex-1 pr-2">
              {isEditingTitle ? (
                <input
                  ref={titleInputRef}
                  type="text"
                  value={editedTitle}
                  onChange={(e) => setEditedTitle(e.target.value)}
                  onKeyDown={handleTitleKeyPress}
                  onBlur={handleSaveTitle}
                  className="noDrag noPan text-lg font-semibold text-foreground bg-transparent border-b-2 border-primary outline-none w-full"
                  onClick={(e) => e.stopPropagation()}
                  onMouseDown={(e) => e.stopPropagation()}
                />
              ) : (
                <div className="flex flex-col gap-1">
                  <div className="flex items-center gap-1.5">
                    <h3 className="text-lg font-semibold text-foreground whitespace-nowrap overflow-hidden text-ellipsis flex-1">
                      {title || (component && component.title) || 'Unnamed Action'}
                    </h3>
                    {/* Show either the status indicator OR the badge, not both */}
                    {renderStatusIndicator()}
                    {!isAIActive && badgeLabel && !error && !hasValidationIssues && (
                      <span className={`inline-flex items-center rounded-full text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 flex-shrink-0 ${badgeClasses}`}>
                        {badgeLabel}
                      </span>
                    )}
                    {isIntegrationDisconnected && (
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <div className="flex-shrink-0">
                              <Unplug className="h-4 w-4 text-red-500" />
                            </div>
                          </TooltipTrigger>
                          <TooltipContent side="top">
                            <p>Integration disconnected. Reconnect {providerId?.split('-').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ')} to use this node.</p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    )}
                  </div>
                  {description && (
                    <p className="text-sm text-muted-foreground leading-snug line-clamp-2">{description || (component && component.description)}</p>
                  )}
                </div>
              )}
            </div>
          </div>
          <div className="flex items-center space-x-0.5 flex-shrink-0">
            {/* Don't show delete button for chain placeholder nodes */}
            {type !== 'chain_placeholder' && (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={handleDelete}
                      className="h-7 w-7 text-muted-foreground hover:text-destructive flex-shrink-0"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="top">Delete {title}</TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}
          </div>
        </div>
      </div>

      {(showConfigSection || showTestingSection || aiTestSummary) && (
        <div className="border-t border-border bg-muted/20">
          {/* Expand/Collapse Header */}
          <div
            className="px-3 py-2 flex items-center justify-between cursor-pointer hover:bg-muted/30 transition-colors noDrag noPan"
            onClick={(e) => {
              e.stopPropagation()
              setIsConfigExpanded(!isConfigExpanded)
            }}
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div className="text-xs font-medium text-muted-foreground">
              {isConfigExpanded ? 'Configuration & Test Data' : 'Quick Preview'}
            </div>
            {isConfigExpanded ? (
              <ChevronUp className="w-4 h-4 text-muted-foreground" />
            ) : (
              <ChevronDown className="w-4 h-4 text-muted-foreground" />
            )}
          </div>

          {showConfigSection && (
            <div className="border-t border-border/30">
              <div className="px-3 py-2 space-y-1.5">
                {showConfigSkeleton ? (
                  <div className="space-y-2">
                    {Array.from({ length: 3 }).map((_, index) => (
                      <div key={`config-skeleton-${index}`} className="space-y-1">
                        <div
                          className="h-3 w-24 bg-muted rounded animate-pulse"
                          style={{ animationDelay: `${index * 80}ms` }}
                        />
                        <div
                          className="h-4 w-full bg-muted/70 rounded animate-pulse"
                          style={{ animationDelay: `${index * 80 + 80}ms` }}
                        />
                      </div>
                    ))}
                  </div>
                ) : (
                  <>
                    {visibleConfigEntries.map(([key, value], index) => {
                      const liveValue = (testData || {})[key]
                      const hasLiveValue = hasRenderableValue(liveValue)
                      const configuredDisplay = configDisplayOverrides.get(key)
                      const formattedConfigValue = configuredDisplay ?? formatDisplayValue(value)
                      const hasConfiguredValue = configuredDisplay !== undefined
                        ? configuredDisplay.trim().length > 0
                        : hasRenderableValue(value)
                      const isFallback = fallbackFields.includes(key) || progressFallbackKeys.has(key)
                      const isConfiguringPhase = ['preparing', 'configuring'].includes(aiStatus || '')
                      const animationDelay = isAIActive && isConfiguringPhase ? `${index * 50}ms` : '0ms'

                      return (
                        <div
                          key={key}
                          className={`flex items-start gap-3 text-xs transition-all duration-300 ${isFallback ? 'text-amber-600' : ''}`}
                          style={{
                            animation: isAIActive && isConfiguringPhase ? 'fadeInUp 0.35s ease-out forwards' : undefined,
                            animationDelay
                          }}
                        >
                          <span className={`mt-1 min-w-[90px] font-medium ${isFallback ? 'text-amber-600' : 'text-muted-foreground'}`}>
                            {getFieldLabel(key)}
                          </span>
                          <div className="flex-1 space-y-1.5">
                            <div
                              className={cn(
                                "flex items-center justify-between rounded border px-2.5 py-1.5 text-xs transition-colors",
                                hasLiveValue && hasConfiguredValue ? "text-muted-foreground/70 line-through" : "text-foreground",
                                isFallback ? "border-amber-400 bg-amber-50/20" : "border-border bg-background/60"
                              )}
                            >
                              <span className="truncate">{formattedConfigValue || 'Loading…'}</span>
                              <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                            </div>
                            {hasLiveValue && (
                              <div
                                className="flex items-center gap-1 text-[11px] font-medium text-emerald-600"
                                style={{
                                  animation: (aiStatus === 'testing' || aiStatus === 'ready') ? 'fadeInUp 0.3s ease-out forwards' : undefined,
                                  animationDelay: `${index * 50}ms`
                                }}
                              >
                                <CheckCircle2 className="h-3 w-3" />
                                <span className="break-all">
                                  {formatDisplayValue(liveValue)}
                                </span>
                              </div>
                            )}
                          </div>
                        </div>
                      )
                    })}
                    {!isConfigExpanded && hiddenConfigCount > 0 && (
                      <div className="text-xs text-muted-foreground italic">
                        +{hiddenConfigCount} more fields
                      </div>
                    )}
                    {fallbackFields.length > 0 && (
                      <div className={`text-[11px] text-amber-600 ${isConfigExpanded ? 'mt-2' : 'mt-1'}`}>
                        Highlighted fields were auto-filled. Update them to dial in your workflow.
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          )}

          {showTestingSection && (
            <div className="border-t border-border/30">
              <div className="px-3 py-2 bg-muted/20">
                <div className="text-xs font-medium text-foreground">Test Results</div>
              </div>

              <div className="px-3 py-2 space-y-1.5">
                {showTestingSkeleton ? (
                  <div className="space-y-2">
                    {Array.from({ length: 2 }).map((_, index) => (
                      <div key={`test-skeleton-${index}`} className="space-y-1">
                        <div
                          className="h-3 w-28 bg-muted rounded animate-pulse"
                          style={{ animationDelay: `${index * 90}ms` }}
                        />
                        <div
                          className="h-4 w-full bg-muted/70 rounded animate-pulse"
                          style={{ animationDelay: `${index * 90 + 80}ms` }}
                        />
                      </div>
                    ))}
                  </div>
                ) : (
                  <>
                    {(isConfigExpanded
                      ? testDataEntries
                      : testDataEntries.filter(([_, value]) => hasRenderableValue(value)).slice(0, 3)
                    ).map(([key, value], index) => {
                      const animationDelay = isAIActive && aiStatus === 'testing' ? `${index * 50}ms` : '0ms'

                      return (
                        <div
                          key={key}
                          className="flex items-start gap-2 text-xs transition-all duration-300"
                          style={{
                            animation: isAIActive && aiStatus === 'testing' ? 'fadeInUp 0.3s ease-out forwards' : 'none',
                            animationDelay,
                            opacity: isAIActive && aiStatus === 'testing' ? 0 : 1
                          }}
                        >
                          <span className="min-w-[90px] font-medium text-emerald-600">{getFieldLabel(key)}</span>
                          <CheckCircle2 className="w-3 h-3 text-emerald-500 mt-[2px]" />
                          <span className="text-foreground flex-1 break-all">
                            {formatDisplayValue(value)}
                          </span>
                        </div>
                      )
                    })}
                    {!isConfigExpanded && testDataEntries.filter(([_, value]) => hasRenderableValue(value)).length > 3 && (
                      <div className="text-xs text-muted-foreground italic">
                        +{testDataEntries.filter(([_, value]) => hasRenderableValue(value)).length - 3} more fields
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          )}
          {aiTestSummary && (
            <div className={`px-3 py-2 ${summaryClasses}`}>
              <p className="text-xs leading-relaxed">{aiTestSummary}</p>
            </div>
          )}
        </div>
      )}

      {/* CSS for field animations */}
      <style jsx>{`
        @keyframes fadeInUp {
          from {
            opacity: 0;
            transform: translateY(10px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
      `}</style>

      {/* AI Agent instruction input field */}
      {type === 'ai_agent' && (
        <div className="border-t border-border px-3 py-2 bg-muted/30 hover:bg-muted/50 transition-colors">
          <div className="flex items-start gap-2">
            <div className="flex-shrink-0 mt-1">
              <Sparkles className="w-4 h-4 text-primary" />
            </div>
            <input
              type="text"
              placeholder="Tell AI what to change on this node..."
              className="flex-1 text-sm bg-transparent border-none outline-none text-muted-foreground placeholder:text-muted-foreground/60 focus:text-foreground transition-colors noDrag noPan"
              onClick={(e) => e.stopPropagation()}
              onMouseDown={(e) => e.stopPropagation()}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  // TODO: Handle AI instruction submission
                  const input = e.currentTarget
                  console.log('AI instruction:', input.value)
                  // Clear input after submission
                  input.value = ''
                }
              }}
            />
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="flex-shrink-0 mt-1 cursor-help">
                    <svg className="w-4 h-4 text-muted-foreground hover:text-foreground transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </div>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="max-w-xs">
                  <p className="font-semibold mb-1">AI-Powered Configuration</p>
                  <p className="text-xs">Type instructions in plain English to configure this AI Agent. Examples:</p>
                  <ul className="text-xs mt-1 space-y-0.5 list-disc list-inside">
                    <li>"Summarize customer feedback in 2 sentences"</li>
                    <li>"Extract email addresses from this text"</li>
                    <li>"Translate to Spanish"</li>
                  </ul>
                  <p className="text-xs mt-1 italic">Press Enter to apply changes</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
        </div>
      )}

      {/* Centered Add Action button for chain placeholders - matching AI Agent builder design */}
      {type === 'chain_placeholder' && (hasAddButton || isPlaceholder) && onAddAction && (
        <div className="px-4 pb-4 flex justify-center">
          <Button
            variant="outline"
            size="sm"
            onClick={(e) => {
              e.stopPropagation()
              if (onAddAction) {
                onAddAction()
              } else {
                // Fallback: simulate clicking on the placeholder node itself
                // This should trigger the handleAddActionClick with the placeholder's ID
                logger.warn('Chain placeholder missing onAddAction callback, using fallback')
                // Find the workflow builder's handleAddActionClick function
                const event = new CustomEvent('chain-placeholder-add-action', {
                  detail: { nodeId: id, parentId: id }
                })
                window.dispatchEvent(event)
              }
            }}
            className="gap-2 w-full max-w-[200px]"
          >
            <Plus className="w-4 h-4" />
            Add Action
          </Button>
        </div>
      )}

      {/* Input handle - Half-moon on left side */}
      {!isTrigger && (
        <Handle
          type="target"
          position={Position.Left}
          className="!w-3 !h-6 !rounded-r-full !rounded-l-none !bg-border !border-2 !border-background !shadow-sm hover:!scale-110 !transition-transform"
          style={{
            visibility: data.isTrigger ? "hidden" : "visible",
            left: "0px",
            top: "50%",
            transform: "translateY(-50%)",
          }}
        />
      )}

      {/* Output handle - Half-moon on right side - ALWAYS show for all nodes */}
      <Handle
        type="source"
        position={Position.Right}
        className="!w-3 !h-6 !rounded-l-full !rounded-r-none !bg-border !border-2 !border-background !shadow-sm hover:!scale-110 !transition-transform"
        style={{
          right: "0px",
          top: "50%",
          transform: "translateY(-50%)",
        }}
      />
    </div>
    </NodeContextMenu>
  )
}

export default memo(CustomNode)
