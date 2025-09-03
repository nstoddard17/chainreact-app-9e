"use client"

import React, { memo } from "react"
import { Handle, Position, type NodeProps } from "@xyflow/react"
import { ALL_NODE_COMPONENTS } from "@/lib/workflows/nodes"
import { Settings, Trash2, TestTube, Plus } from "lucide-react"
import { LightningLoader } from '@/components/ui/lightning-loader'
import { Button } from "@/components/ui/button"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { useWorkflowTestStore } from "@/stores/workflowTestStore"

// The data object passed to the node will now contain these callbacks.
interface CustomNodeData {
  title: string
  description: string
  type: string
  providerId?: string
  isTrigger?: boolean
  config?: Record<string, any>
  onConfigure: (id: string) => void
  onDelete: (id: string) => void
  onAddChain?: (nodeId: string) => void
  error?: string
  executionStatus?: 'pending' | 'running' | 'completed' | 'error' | null
  isActiveExecution?: boolean
  isListening?: boolean
  errorMessage?: string
  errorTimestamp?: string
}

function CustomNode({ id, data, selected }: NodeProps) {
  const {
    title,
    description,
    type,
    providerId,
    isTrigger,
    config,
    onConfigure,
    onDelete,
    onAddChain,
    error,
    executionStatus,
    isActiveExecution,
    isListening,
    errorMessage,
    errorTimestamp,
    debugListeningMode,
    debugExecutionStatus,
  } = data as unknown as CustomNodeData & { debugListeningMode?: boolean; debugExecutionStatus?: string }

  const component = ALL_NODE_COMPONENTS.find((c) => c.type === type)
  const hasMultipleOutputs = ["if_condition", "switch_case", "try_catch"].includes(type)
  
  // Check if this node has test data available
  const { isNodeInExecutionPath, getNodeTestResult } = useWorkflowTestStore()
  const hasTestData = isNodeInExecutionPath(id)
  const testResult = getNodeTestResult(id)
  
  // Get execution status styling with enhanced visual feedback
  const getExecutionStatusStyle = () => {
    // Comprehensive debug log for visual feedback
    console.log(`🔍 Node ${id} (${title}) visual data:`)
    console.log(`  - executionStatus: "${executionStatus}"`)
    console.log(`  - isListening: ${isListening}`)
    console.log(`  - isTrigger: ${isTrigger}`)
    console.log(`  - debugListeningMode: ${debugListeningMode}`)
    console.log(`  - debugExecutionStatus: "${debugExecutionStatus}"`)
    console.log(`  - shouldShowBorder: ${!(!executionStatus && !isListening)}`)
    
    if (!executionStatus && !isListening) return ""
    
    let cssClass = ""
    
    switch (executionStatus) {
      case 'running':
        cssClass = "border-2 border-yellow-500 shadow-lg shadow-yellow-200"
        break
      case 'completed':
        cssClass = "border-2 border-green-500 shadow-lg shadow-green-200"
        break
      case 'error':
        cssClass = "border-2 border-red-500 shadow-lg shadow-red-200"
        break
      case 'pending':
        cssClass = "border-2 border-blue-500 shadow-lg shadow-blue-200"
        break
      default:
        cssClass = isListening && isTrigger ? "border-2 border-indigo-500 border-dashed animate-pulse shadow-lg shadow-indigo-200" : ""
        break
    }
    
    console.log(`🎨 CSS class for ${id}: "${cssClass}"`)
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
      case 'completed':
        return null // No indicator for completed - just green border
      case 'error':
        return (
          <div className="absolute top-2 right-2 w-5 h-5 flex items-center justify-center">
            <div className="w-4 h-4 rounded-full bg-red-500" />
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
            <div className="w-2 h-2 rounded-full bg-indigo-500 animate-pulse" />
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
    
    // All trigger nodes should have configuration
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
    // Only open configuration if the node has configuration options
    if (nodeHasConfiguration() && onConfigure) {
      onConfigure(id)
    }
  }

  return (
    <div
      className={`relative w-[400px] bg-card rounded-lg shadow-sm border ${
        selected ? "border-primary" : error ? "border-destructive" : "border-border"
      } hover:shadow-md transition-all duration-200 ${
        nodeHasConfiguration() ? "cursor-pointer" : ""
      } ${getExecutionStatusStyle()}`}
      data-testid={`node-${id}`}
      onDoubleClick={handleDoubleClick}
    >
      {/* Execution status indicator */}
      {getExecutionStatusIndicator()}
      {/* Error label */}
      {getErrorLabel()}
      {error && (
        <div className="bg-destructive/10 border-b border-destructive/20 px-4 py-2">
          <p className="text-sm text-destructive font-medium">{error}</p>
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
      

      <div className="p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            {providerId ? (
              <img
                src={`/integrations/${providerId}.svg`}
                alt={`${title || ''} logo`}
                className="w-8 h-8 object-contain"
                onError={(e) => {
                  console.error(`Failed to load logo for ${providerId} at path: /integrations/${providerId}.svg`)
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
                onLoad={() => console.log(`Successfully loaded logo for ${providerId}`)}
              />
            ) : (
              component?.icon && React.createElement(component.icon, { className: "h-8 w-8 text-foreground" })
            )}
            <div className="min-w-0 flex-1">
              <h3 className="text-xl font-medium text-foreground">
                {title || (component && component.title) || 'Unnamed Action'}
              </h3>
              {description && (
                <p className="text-muted-foreground">{description || (component && component.description)}</p>
              )}
            </div>
          </div>
          <div className="flex items-center space-x-2">
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
                      className="h-8 w-8 text-muted-foreground hover:text-primary"
                    >
                      <Plus />
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
                      className="h-8 w-8 text-muted-foreground hover:text-foreground"
                    >
                      <Settings />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="top">Configure {title} (or double-click)</TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={handleDelete}
                    className="h-8 w-8 text-muted-foreground hover:text-destructive"
                  >
                    <Trash2 />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="top">Delete {title}</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
        </div>
      </div>

      {!isTrigger && (
        <Handle
          type="target"
          position={Position.Top}
          className="!w-3 !h-3 !bg-muted-foreground border-2 border-background"
          style={{
            visibility: data.isTrigger ? "hidden" : "visible",
          }}
        />
      )}

      {hasMultipleOutputs ? (
        <>
          <Handle type="source" position={Position.Bottom} id="true" className="!w-3 !h-3 !bg-green-500" style={{ left: "25%" }} />
          <Handle type="source" position={Position.Bottom} id="false" className="!w-3 !h-3 !bg-red-500" style={{ left: "75%" }} />
        </>
      ) : (
        <Handle type="source" position={Position.Bottom} className="!w-3 !h-3 !bg-muted-foreground border-2 border-background" />
      )}
    </div>
  )
}

export default memo(CustomNode)
