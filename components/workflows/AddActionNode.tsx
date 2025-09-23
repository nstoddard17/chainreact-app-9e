"use client"

import { Handle, Position, type NodeProps } from "@xyflow/react"
import { PlusCircle, Plus } from "lucide-react"
import type { MouseEventHandler } from "react"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"

type AddActionNodeData = {
  onClick: () => void
}

export function AddActionNode({ data, dragging }: NodeProps) {
  // Make the node completely non-draggable by always returning true for dragging
  // This prevents the node from being moved on its own
  const isDraggable = false
  
  return (
    <div 
      className="w-[400px] flex flex-col items-center justify-center py-4 pointer-events-none"
      style={{ cursor: 'default' }}
    >
      <div className="flex flex-col items-center">
        <div className="w-px h-4 bg-border mb-2 pointer-events-none" />
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                className="nodrag nopan flex items-center justify-center w-12 h-12 bg-background border-2 border-dashed border-border rounded-full hover:border-primary hover:text-primary transition-colors cursor-pointer pointer-events-auto"
                onClick={() => {
                  console.log('AddActionNode button clicked')
                  console.log('data.onClick available:', !!(data as any).onClick)
                  if ((data as any).onClick) {
                    (data as any).onClick()
                  } else {
                    console.error('No onClick handler found in data:', data)
                  }
                }}
                // Prevent any drag behavior on the button itself
                onMouseDown={(e) => {
                  e.stopPropagation()
                }}
                onPointerDown={(e) => {
                  e.stopPropagation()
                }}
              >
                <Plus className="h-6 w-6" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="right">Add Action</TooltipContent>
          </Tooltip>
        </TooltipProvider>
        <div className="w-px h-4 bg-border mt-2 pointer-events-none" />
      </div>
      <Handle
        type="target"
        position={Position.Top}
        className="!w-0 !h-0 !-top-1 !bg-transparent !border-none pointer-events-none"
        isConnectable={false}
      />
    </div>
  )
}
