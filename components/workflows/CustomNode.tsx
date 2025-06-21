"use client"

import React, { memo } from "react"
import { Handle, Position, type NodeProps } from "@xyflow/react"
import { ALL_NODE_COMPONENTS } from "@/lib/workflows/availableNodes"
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
      className={`w-[400px] bg-white rounded-lg shadow-sm border ${
        selected ? "border-blue-500" : "border-gray-200"
      } hover:shadow-md transition-all duration-200`}
    >
      <div className="p-4 flex items-center">
        <div className="mr-4">
          {providerId ? (
            <img
              src={`/integrations/${providerId}.svg`}
              alt={`${title || ''} logo`}
              className="w-8 h-8 object-contain"
            />
          ) : (
            component?.icon && React.createElement(component.icon, { className: "h-8 w-8 text-gray-700" })
          )}
        </div>
        
        <div className="flex-1">
          <h3 className="text-xl font-medium text-gray-900">{title}</h3>
          {description && (
            <p className="text-gray-600">{description}</p>
          )}
        </div>
        
        <div className="flex items-center">
          {component?.configSchema && component.configSchema.length > 0 && (
            <Button
              variant="ghost"
              size="icon"
              onClick={handleConfigure}
              className="h-8 w-8 text-gray-400 hover:text-gray-600"
            >
              <Settings className="w-5 h-5" />
            </Button>
          )}
          <Button
            variant="ghost"
            size="icon"
            onClick={handleDelete}
            className="h-8 w-8 text-gray-400 hover:text-gray-600"
          >
            <Trash2 className="w-5 h-5" />
          </Button>
        </div>
      </div>

      {!isTrigger && (
        <Handle
          type="target"
          position={Position.Top}
          className="!w-3 !h-3 !bg-gray-300"
        />
      )}

      {hasMultipleOutputs ? (
        <>
          <Handle type="source" position={Position.Bottom} id="true" className="!w-3 !h-3 !bg-green-500" style={{ left: "25%" }} />
          <Handle type="source" position={Position.Bottom} id="false" className="!w-3 !h-3 !bg-red-500" style={{ left: "75%" }} />
        </>
      ) : (
        <Handle type="source" position={Position.Bottom} className="!w-3 !h-3 !bg-gray-300" />
      )}
    </div>
  )
}

export default memo(CustomNode)
