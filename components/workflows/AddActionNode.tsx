"use client"

import { Handle, Position, type NodeProps } from "@xyflow/react"
import { Plus } from "lucide-react"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"

type AddActionNodeData = {
  onClick: () => void
  isChainPlaceholder?: boolean
  label?: string
}

export function AddActionNode({ data }: NodeProps) {
  const nodeData = data as any
  const isChainPlaceholder = nodeData?.isChainPlaceholder
  const tooltipText = nodeData?.label || (isChainPlaceholder ? 'Add Chain' : 'Add Action')

  return (
    <div
      className="w-[400px] flex flex-col items-start justify-center py-4"
      style={{
        pointerEvents: 'none',
        cursor: 'default',
        paddingLeft: '200px' // Center the content by offsetting half the width
      }}
    >
      <div className="flex flex-col items-center">
        <div className="w-px h-4 bg-border mb-2" />
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                className={`flex items-center justify-center w-12 h-12 bg-background border-2 border-dashed rounded-full hover:text-primary transition-colors cursor-pointer ${
                  isChainPlaceholder
                    ? 'border-purple-500/50 hover:border-purple-500'
                    : 'border-border hover:border-primary'
                }`}
                style={{
                  pointerEvents: 'auto'
                }}
                onClick={(e) => {
                  e.stopPropagation()
                  console.log('AddActionNode button clicked')
                  console.log('Is chain placeholder:', isChainPlaceholder)
                  console.log('data.onClick available:', !!nodeData.onClick)
                  if (nodeData.onClick) {
                    nodeData.onClick()
                  } else {
                    console.error('No onClick handler found in data:', data)
                  }
                }}
                onMouseDown={(e) => {
                  e.stopPropagation()
                }}
                onPointerDown={(e) => {
                  e.stopPropagation()
                }}
              >
                <Plus className={`h-6 w-6 ${isChainPlaceholder ? 'text-purple-500' : ''}`} />
              </button>
            </TooltipTrigger>
            <TooltipContent side="right">{tooltipText}</TooltipContent>
          </Tooltip>
        </TooltipProvider>
        <div className="w-px h-4 bg-border mt-2" />
      </div>
      <Handle
        type="target"
        position={Position.Top}
        className="!w-3 !h-3 !-top-1 !bg-transparent !border-none !opacity-0"
        style={{ pointerEvents: 'none' }}
        isConnectable={false}
      />
    </div>
  )
}
