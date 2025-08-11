"use client"

import React, { memo } from "react"
import { Handle, Position, type NodeProps } from "@xyflow/react"
import { ALL_NODE_COMPONENTS } from "@/lib/workflows/availableNodes"
import { Settings, Trash2, TestTube } from "lucide-react"
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
  error?: string
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
    error,
  } = data as unknown as CustomNodeData

  const component = ALL_NODE_COMPONENTS.find((c) => c.type === type)
  const hasMultipleOutputs = ["if_condition", "switch_case", "try_catch"].includes(type)
  
  // Check if this node has test data available
  const { isNodeInExecutionPath, getNodeTestResult } = useWorkflowTestStore()
  const hasTestData = isNodeInExecutionPath(id)
  const testResult = getNodeTestResult(id)
  
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
      className={`w-[400px] bg-card rounded-lg shadow-sm border ${
        selected ? "border-primary" : "border-border"
      } hover:shadow-md transition-shadow ${
        error ? "border-destructive" : ""
      } ${nodeHasConfiguration() ? "cursor-pointer" : ""}`}
      data-testid={`node-${id}`}
      onDoubleClick={handleDoubleClick}
    >
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
