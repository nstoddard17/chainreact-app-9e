"use client"

import { Handle, Position, type NodeProps } from "@xyflow/react"
import { PlusCircle, Plus } from "lucide-react"
import type { MouseEventHandler } from "react"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"

type AddActionNodeData = {
  onClick: () => void
}

export function AddActionNode({ data }: NodeProps) {
  return (
    <div className="nodrag nopan w-[400px] flex flex-col items-center justify-center py-4">
      <div className="flex flex-col items-center">
        <div className="w-px h-4 bg-border mb-2" />
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                className="nodrag nopan flex items-center justify-center w-12 h-12 bg-background border-2 border-dashed border-border rounded-full hover:border-primary hover:text-primary transition-colors cursor-pointer"
                onClick={() => {
                  console.log('AddActionNode button clicked')
                  console.log('data.onClick available:', !!(data as any).onClick)
                  if ((data as any).onClick) {
                    (data as any).onClick()
                  } else {
                    console.error('No onClick handler found in data:', data)
                  }
                }}
              >
                <Plus className="h-6 w-6" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="right">Add Action</TooltipContent>
          </Tooltip>
        </TooltipProvider>
        <div className="w-px h-4 bg-border mt-2" />
      </div>
      <Handle type="target" position={Position.Top} className="!w-0 !h-0 !-top-1 !bg-transparent !border-none" />
    </div>
  )
}
