"use client"

import { memo } from "react"
import { Handle, Position, type NodeProps } from "@xyflow/react"
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { ALL_NODE_COMPONENTS } from "@/lib/workflows/availableNodes"
import { Settings, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"

function CustomNode({ data, selected }: NodeProps) {
  const isTrigger = data.isTrigger
  const hasMultipleOutputs = ["if_condition", "switch_case", "try_catch"].includes(data.type)
  const component = ALL_NODE_COMPONENTS.find((c) => c.type === data.type)

  return (
    <Card
      className={`min-w-[200px] ${
        selected ? "border-2 border-blue-500 shadow-lg" : "border"
      } hover:shadow-lg transition-all duration-200`}
    >
      <div className="p-4">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 rounded-lg flex items-center justify-center">
            {data.providerId ? (
              <img
                src={`/integrations/${data.providerId}.svg`}
                alt={`${data.title} logo`}
                className="w-7 h-7 object-contain"
              />
            ) : (
              component && <component.icon className="h-7 w-7" />
            )}
          </div>
          <div className="flex-1 font-medium text-slate-900">{data.title}</div>
          <div className="flex items-center">
            {component?.configSchema && component.configSchema.length > 0 && (
              <Button
                variant="ghost"
                size="icon"
                onClick={(e) => { e.stopPropagation(); data.onConfigure?.(data.id); }}
                className="h-8 w-8 text-slate-500 hover:bg-slate-100"
              >
                <Settings className="w-4 h-4" />
              </Button>
            )}
            <Button
              variant="ghost"
              size="icon"
              onClick={(e) => { e.stopPropagation(); data.onDelete?.(data.id); }}
              className="h-8 w-8 text-slate-500 hover:bg-slate-100"
            >
              <Trash2 className="w-4 h-4" />
            </Button>
          </div>
        </div>

        {data.description && (
          <div className="text-xs text-slate-500 mt-2 pl-13">
            {data.description}
          </div>
        )}

        {data.status && (
          <div className="mt-2">
            <Badge
              variant={data.status === "connected" ? "default" : "secondary"}
              className={`text-xs ${
                data.status === "connected" ? "bg-green-100 text-green-700" : "bg-slate-100 text-slate-600"
              }`}
            >
              {data.status}
            </Badge>
          </div>
        )}

        {data.config && Object.keys(data.config).length > 0 && (
          <div className="text-xs text-slate-600 bg-slate-50 rounded p-2">
            <div className="font-medium mb-1">Configuration:</div>
            {Object.entries(data.config)
              .slice(0, 2)
              .map(([key, value]) => (
                <div key={key} className="truncate">
                  {key}: {String(value)}
                </div>
              ))}
            {Object.keys(data.config).length > 2 && (
              <div className="text-slate-400">+{Object.keys(data.config).length - 2} more...</div>
            )}
          </div>
        )}
      </div>

      {/* Input Handle - not for triggers */}
      {!isTrigger && (
        <Handle
          type="target"
          position={Position.Top}
          className="w-3 h-3 bg-slate-400 border-2 border-white"
        />
      )}

      {/* Output Handles */}
      {hasMultipleOutputs ? (
        <>
          <Handle
            type="source"
            position={Position.Bottom}
            id="true"
            className="w-3 h-3 bg-green-500 border-2 border-white"
            style={{ left: "25%" }}
          />
          <Handle
            type="source"
            position={Position.Bottom}
            id="false"
            className="w-3 h-3 bg-red-500 border-2 border-white"
            style={{ left: "75%" }}
          />
        </>
      ) : (
        <Handle
          type="source"
          position={Position.Bottom}
          className="w-3 h-3 bg-green-500 border-2 border-white"
        />
      )}
    </Card>
  )
}

export default memo(CustomNode)
