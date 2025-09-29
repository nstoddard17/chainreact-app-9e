"use client"

import { Handle, Position, type NodeProps } from "@xyflow/react"
import { Layers, Plus } from "lucide-react"
import { Button } from "@/components/ui/button"

type ChainPlaceholderNodeData = {
  parentId: string
  parentAIAgentId: string
  onClick: () => void
}

export function ChainPlaceholderNode({ data }: NodeProps) {
  const nodeData = data as any

  console.log('🔵 ChainPlaceholderNode rendering with data:', nodeData)

  return (
    <div className="relative">
      {/* Connection line from AI Agent */}
      <div className="absolute left-1/2 -translate-x-1/2 -top-4 w-px h-4 bg-border" />

      <div
        className="w-[400px] bg-background border-2 border-dashed border-purple-500/30 rounded-lg hover:border-purple-500/50 transition-colors"
        style={{
          pointerEvents: 'auto',
          cursor: 'default'
        }}
      >
        <div className="p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center space-x-3">
              <Layers className="h-8 w-8 text-purple-500/50" />
              <div>
                <h3 className="text-base font-semibold text-foreground">
                  Chain Placeholder
                </h3>
                <p className="text-xs text-muted-foreground">
                  Click to add first action to this chain
                </p>
              </div>
            </div>
          </div>

          {/* Add Action button */}
          <div className="flex justify-center">
            <Button
              variant="outline"
              size="sm"
              onClick={(e) => {
                e.stopPropagation()
                console.log('Chain placeholder Add Action clicked')
                console.log('Parent AI Agent ID:', nodeData.parentAIAgentId)
                if (nodeData.onClick) {
                  nodeData.onClick()
                }
              }}
              onMouseDown={(e) => e.stopPropagation()}
              onPointerDown={(e) => e.stopPropagation()}
              className="gap-2 w-full max-w-[200px] border-purple-500/30 hover:border-purple-500 hover:text-purple-600"
            >
              <Plus className="w-4 h-4" />
              Add Action
            </Button>
          </div>
        </div>

        <Handle
          type="target"
          position={Position.Top}
          className="!w-3 !h-3 !-top-1.5 !bg-purple-500/50 !border-purple-500"
          isConnectable={false}
        />
      </div>

      {/* Connection line to next element (if any) */}
      <div className="absolute left-1/2 -translate-x-1/2 -bottom-4 w-px h-4 bg-border" />
    </div>
  )
}