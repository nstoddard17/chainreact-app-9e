"use client"

import React, { memo } from "react"
import { Handle, Position, type NodeProps } from "@xyflow/react"
import { ALL_NODE_COMPONENTS } from "@/lib/workflows/availableNodes"
import { Settings, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"

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

  return (
    <div
      className={`w-[400px] bg-card rounded-lg shadow-sm border ${
        selected ? "border-primary" : "border-border"
      } hover:shadow-md transition-shadow ${
        error ? "border-destructive" : ""
      }`}
      data-testid={`node-${id}`}
    >
      {error && (
        <div className="bg-destructive/10 border-b border-destructive/20 px-4 py-2">
          <p className="text-sm text-destructive font-medium">{error}</p>
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
              <h3 className="text-xl font-medium text-foreground">{title}</h3>
              {description && (
                <p className="text-muted-foreground">{description}</p>
              )}
            </div>
          </div>
          <div className="flex items-center space-x-2">
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
                <TooltipContent side="top">Configure {title}</TooltipContent>
              </Tooltip>
            </TooltipProvider>
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
