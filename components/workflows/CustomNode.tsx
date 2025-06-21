"use client"

import React, { memo } from "react"
import { Handle, Position, type NodeProps } from "@xyflow/react"
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { ALL_NODE_COMPONENTS } from "@/lib/workflows/availableNodes"
import { Settings, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"

function CustomNode({ data, selected }: NodeProps<any>) {
  const isTrigger = data.isTrigger
  const hasMultipleOutputs = ["if_condition", "switch_case", "try_catch"].includes(data.type)
  const component = ALL_NODE_COMPONENTS.find((c) => c.type === data.type)

  // Filter out empty configuration values
  const filledConfig = data.config
    ? Object.entries(data.config).filter(([_, value]) => value !== null && value !== "")
    : []

  const handleConfigure = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (data.onConfigure && typeof data.id === 'string') {
      data.onConfigure(data.id)
    }
  }

  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (data.onDelete && typeof data.id === 'string') {
      data.onDelete(data.id)
    }
  }

  return (
    <Card
      className={`w-80 ${
        selected ? "border-2 border-blue-500 shadow-lg" : "border"
      } hover:shadow-lg transition-all duration-200 flex flex-col`}
    >
      <div className="p-4 border-b">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 rounded-lg flex items-center justify-center">
            {data.providerId && typeof data.providerId === 'string' ? (
              <img
                src={`/integrations/${data.providerId}.svg`}
                alt={`${data.title || ''} logo`}
                className="w-7 h-7 object-contain"
              />
            ) : (
              component && component.icon && React.createElement(component.icon, { className: "h-7 w-7" })
            )}
          </div>
          <div className="flex-1 font-medium text-slate-900">{data.title}</div>
          <div className="flex items-center">
            {component?.configSchema && component.configSchema.length > 0 && (
              <Button
                variant="ghost"
                size="icon"
                onClick={handleConfigure}
                className="h-8 w-8 text-slate-500 hover:bg-slate-100"
              >
                <Settings className="w-4 h-4" />
              </Button>
            )}
            <Button
              variant="ghost"
              size="icon"
              onClick={handleDelete}
              className="h-8 w-8 text-slate-500 hover:bg-slate-100"
            >
              <Trash2 className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </div>

      <div className="p-4 flex-grow">
        {data.description && (
          <div className="text-sm text-slate-600 mb-3">
            {data.description}
          </div>
        )}

        {filledConfig.length > 0 && (
          <div className="text-sm text-slate-600 bg-slate-50 rounded p-3 space-y-1">
            <div className="font-semibold text-xs text-slate-500 uppercase tracking-wider mb-2">Configuration</div>
            {filledConfig.map(([key, value]) => (
              <div key={key} className="flex">
                <div className="w-1/3 font-medium text-slate-500 truncate capitalize">{key.replace(/_/g, ' ')}:</div>
                <div className="w-2/3 text-slate-700 font-mono text-xs bg-white rounded px-2 py-1 truncate">{String(value)}</div>
              </div>
            ))}
          </div>
        )}
      </div>

      {!isTrigger && (
        <Handle
          type="target"
          position={Position.Top}
          className="!w-4 !h-4 !bg-slate-300"
        />
      )}

      {hasMultipleOutputs ? (
        <>
          <Handle
            type="source"
            position={Position.Bottom}
            id="true"
            className="!w-4 !h-4 !bg-green-500"
            style={{ left: "25%" }}
          />
          <Handle
            type="source"
            position={Position.Bottom}
            id="false"
            className="!w-4 !h-4 !bg-red-500"
            style={{ left: "75%" }}
          />
        </>
      ) : (
        <Handle
          type="source"
          position={Position.Bottom}
          className="!w-4 !h-4 !bg-slate-300"
        />
      )}
    </Card>
  )
}

export default memo(CustomNode)
