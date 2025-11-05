"use client"

import { Handle, Position, type NodeProps } from "@xyflow/react"
import { Plus } from "lucide-react"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { ADD_ACTION_NODE_WIDTH } from "@/lib/workflows/layoutConstants"

import { logger } from '@/lib/utils/logger'

type AddActionNodeData = {
  onClick: () => void
  isChainPlaceholder?: boolean
  label?: string
}

export function AddActionNode({ data }: NodeProps) {
  const nodeData = data as AddActionNodeData
  const isChainPlaceholder = nodeData?.isChainPlaceholder
  const tooltipText = nodeData?.label || (isChainPlaceholder ? 'Add branch' : 'Add step')

  return (
    <div
      className="flex items-center justify-center py-4"
      style={{
        width: ADD_ACTION_NODE_WIDTH,
        pointerEvents: 'auto'
      }}
    >
      <div className="group relative flex w-full items-center justify-center gap-3">
        <div className="h-px flex-1 bg-border/70 transition-colors duration-150 group-hover:bg-border" />
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                className={`inline-flex items-center gap-2 rounded-full border px-3.5 py-1.5 text-xs font-semibold uppercase tracking-wide transition-all duration-150 shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 ${
                  isChainPlaceholder
                    ? 'border-purple-200 bg-white text-purple-600 hover:border-purple-400 hover:bg-purple-50 focus-visible:ring-purple-400/40'
                    : 'border-border bg-background text-muted-foreground hover:border-primary hover:bg-primary hover:text-primary-foreground focus-visible:ring-primary/40'
                }`}
                onClick={(e) => {
                  e.stopPropagation()
                  logger.debug('AddActionNode button clicked', {
                    isChainPlaceholder,
                    hasOnClick: !!nodeData?.onClick
                  })
                  if (nodeData?.onClick) {
                    nodeData.onClick()
                  } else {
                    logger.error('No onClick handler found in data:', data)
                  }
                }}
                onMouseDown={(e) => e.stopPropagation()}
                onPointerDown={(e) => e.stopPropagation()}
              >
                <Plus className={`h-3.5 w-3.5 ${isChainPlaceholder ? 'text-purple-500' : ''}`} />
                {tooltipText}
              </button>
            </TooltipTrigger>
            <TooltipContent side="top">{tooltipText}</TooltipContent>
          </Tooltip>
        </TooltipProvider>
        <div className="h-px flex-1 bg-border/70 transition-colors duration-150 group-hover:bg-border" />
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
