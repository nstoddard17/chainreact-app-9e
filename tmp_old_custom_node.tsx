"use client"

import React, { memo, useState, useRef, useEffect, useMemo } from "react"
import { Handle, Position, type NodeProps } from "@xyflow/react"
import { ALL_NODE_COMPONENTS } from "@/lib/workflows/nodes"
import { Settings, Trash2, TestTube, Plus, Edit2, Layers, Unplug } from "lucide-react"
import { LightningLoader } from '@/components/ui/lightning-loader'
import { Button } from "@/components/ui/button"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { useWorkflowTestStore } from "@/stores/workflowTestStore"
import { useIntegrationStore } from "@/stores/integrationStore"
import { NodeAIIndicator } from "./nodes/AINodeIndicators"

import { logger } from '@/lib/utils/logger'
import { getIntegrationLogoClasses } from "@/lib/integrations/logoStyles"

// The data object passed to the node will now contain these callbacks.
interface CustomNodeData {
  title: string
  description: string
  type: string
  providerId?: string
  isTrigger?: boolean
  config?: Record<string, any>
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
}

function CustomNode({ id, data, selected }: NodeProps) {
  const [isEditingTitle, setIsEditingTitle] = useState(false)
  const [editedTitle, setEditedTitle] = useState("")
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
    debugListeningMode,
    debugExecutionStatus,
  } = data as CustomNodeData & { debugListeningMode?: boolean; debugExecutionStatus?: string }

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

    // All other trigger nodes should have configuration
    if (isTrigger) {
      return true
    }
    
    // Check if the node has configuration schema
    const hasConfigSchema = !!(component.configSchema && component.configSchema.length > 0)
    
    // Node needs configuration if it has configuration schema
    return hasConfigSchema
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

    // Manual triggers open the trigger selection dialog on double-click
    if (type === 'manual' && onConfigure) {
      // For manual triggers, onConfigure should open the trigger selection dialog
      onConfigure(id)
      return
    }

    // Only open configuration if the node has configuration options
    if (nodeHasConfiguration() && onConfigure) {
      onConfigure(id)
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

  return (
    <div
      className={`relative w-[450px] bg-card rounded-lg shadow-sm border-2 group ${
        selected
          ? "border-primary"
          : isIntegrationDisconnected
            ? "border-red-500"
            : error
              ? "border-destructive"
              : hasValidationIssues
                ? "border-red-400"
                : "border-border"
      } ${
        isIntegrationDisconnected ? "shadow-[0_0_0_3px_rgba(239,68,68,0.4)]" : hasValidationIssues ? "shadow-[0_0_0_2px_rgba(248,113,113,0.35)]" : ""
      } hover:shadow-md transition-all duration-200 ${
        nodeHasConfiguration() ? "cursor-pointer" : ""
      } ${getExecutionStatusStyle()}`}
      data-testid={`node-${id}`}
      onDoubleClick={handleDoubleClick}
    >
      {/* AI indicators for AI-powered nodes (includes chain badges) */}
      <NodeAIIndicator node={{ id, data: { ...data, config, type, parentChainIndex, isAIAgentChild, parentAIAgentId } }} />

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
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={(e) => {
                        e.stopPropagation()
                        handleStartEditTitle()
                      }}
                      className="h-5 w-5 text-muted-foreground hover:text-foreground opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0"
                    >
                      <Edit2 className="h-3 w-3" />
                    </Button>
                  </div>
                  {description && (
                    <p className="text-sm text-muted-foreground leading-snug line-clamp-2">{description || (component && component.description)}</p>
                  )}
                </div>
              )}
            </div>
          </div>
          <div className="flex items-center space-x-0.5 flex-shrink-0">
            {type === 'ai_agent' && onAddChain && (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={(e) => {
                        e.stopPropagation()
                        onAddChain(id)
                      }}
                      className="h-7 w-7 text-muted-foreground hover:text-primary flex-shrink-0"
                    >
                      <Plus className="h-4 w-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="top">Add New Chain</TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}
            {nodeHasConfiguration() && (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={handleConfigure}
                      className="h-7 w-7 text-muted-foreground hover:text-foreground flex-shrink-0"
                    >
                      <Settings className="h-4 w-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="top">Configure {title} (or double-click)</TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}
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

      {!isTrigger && (
        <Handle
          type="target"
          position={Position.Top}
          className="!w-3 !h-3 !bg-muted-foreground border-2 border-background"
          style={{
            visibility: data.isTrigger ? "hidden" : "visible",
            top: "-6px",
          }}
        />
      )}

      {hasMultipleOutputs ? (
        <>
          <Handle type="source" position={Position.Bottom} id="true" className="!w-3 !h-3 !bg-green-500" style={{ left: "25%", bottom: "-6px" }} />
          <Handle type="source" position={Position.Bottom} id="false" className="!w-3 !h-3 !bg-red-500" style={{ left: "75%", bottom: "-6px" }} />
        </>
      ) : (
        <Handle type="source" position={Position.Bottom} className="!w-3 !h-3 !bg-muted-foreground border-2 border-background" style={{ bottom: "-6px" }} />
      )}
    </div>
  )
}

export default memo(CustomNode)
