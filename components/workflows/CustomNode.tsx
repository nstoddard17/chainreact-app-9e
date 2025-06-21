"use client"

import React, { memo } from "react"
import { Handle, Position, type NodeProps } from "@xyflow/react"
import { Card } from "@/components/ui/card"
import { ALL_NODE_COMPONENTS, NodeComponent } from "@/lib/workflows/availableNodes"
import { Settings, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"

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
}

function CustomNode({ id, data, selected }: NodeProps<CustomNodeData>) {
  const {
    title,
    description,
    type,
    providerId,
    isTrigger,
    config,
    onConfigure,
    onDelete,
  } = data

  const component = ALL_NODE_COMPONENTS.find((c) => c.type === type)
  const hasMultipleOutputs = ["if_condition", "switch_case", "try_catch"].includes(type)
  const filledConfig = config
    ? Object.entries(config).filter(([_, value]) => value !== null && value !== "")
    : []

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
    <Card
      className={`w-64 ${
        selected ? "border-2 border-primary shadow-lg" : "border"
      } ${isTrigger ? "bg-primary/5" : "bg-card"} hover:shadow-md transition-all duration-200`}
    >
      <div className="p-3 border-b flex items-center justify-between">
        <div className="flex items-center space-x-2">
          <div className="w-8 h-8 rounded-md flex items-center justify-center bg-primary/10">
            {providerId ? (
              <img
                src={`/integrations/${providerId}.svg`}
                alt={`${title || ''} logo`}
                className="w-5 h-5 object-contain"
              />
            ) : (
              component?.icon && React.createElement(component.icon, { className: "h-5 w-5 text-primary" })
            )}
          </div>
          <div className="font-medium text-sm truncate max-w-[140px]">{title}</div>
        </div>
        <div className="flex items-center">
          {component?.configSchema && component.configSchema.length > 0 && (
            <Button
              variant="ghost"
              size="icon"
              onClick={handleConfigure}
              className="h-6 w-6 text-muted-foreground hover:text-foreground"
            >
              <Settings className="w-3.5 h-3.5" />
            </Button>
          )}
          <Button
            variant="ghost"
            size="icon"
            onClick={handleDelete}
            className="h-6 w-6 text-muted-foreground hover:text-destructive"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </Button>
        </div>
      </div>

      {(description || filledConfig.length > 0) && (
        <div className="p-3 text-xs">
          {description && (
            <div className="text-muted-foreground mb-2">
              {description}
            </div>
          )}

          {filledConfig.length > 0 && (
            <div className="bg-muted/50 rounded-sm p-2 space-y-1">
              <div className="font-medium text-[10px] text-muted-foreground uppercase tracking-wider">Configuration</div>
              {filledConfig.map(([key, value]) => (
                <div key={key} className="flex">
                  <div className="w-1/3 font-medium text-muted-foreground truncate capitalize">{key.replace(/_/g, ' ')}:</div>
                  <div className="w-2/3 text-foreground font-mono text-[10px] bg-background rounded px-1.5 py-0.5 truncate">{String(value)}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {!isTrigger && (
        <Handle
          type="target"
          position={Position.Top}
          className="!w-3 !h-3 !bg-primary/50"
        />
      )}

      {hasMultipleOutputs ? (
        <>
          <Handle type="source" position={Position.Bottom} id="true" className="!w-3 !h-3 !bg-green-500" style={{ left: "25%" }} />
          <Handle type="source" position={Position.Bottom} id="false" className="!w-3 !h-3 !bg-red-500" style={{ left: "75%" }} />
        </>
      ) : (
        <Handle type="source" position={Position.Bottom} className="!w-3 !h-3 !bg-primary/50" />
      )}
    </Card>
  )
}

export default memo(CustomNode)
