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
    <div className="w-[200px] flex flex-col items-center">
      <div className="absolute inset-0 z-10 flex flex-col items-center">
        <div className="w-px h-10 bg-border" />
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                className="nodrag nopan flex items-center justify-center w-10 h-10 bg-background border-2 border-dashed border-border rounded-full hover:border-primary hover:text-primary transition-colors cursor-pointer"
                                 onClick={() => (data as any).onClick?.()}
              >
                <Plus className="h-5 w-5" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="right">Add Action</TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>
      <Handle type="target" position={Position.Top} className="!w-0 !h-0 !-top-1 !bg-transparent !border-none" />
    </div>
  )
}
