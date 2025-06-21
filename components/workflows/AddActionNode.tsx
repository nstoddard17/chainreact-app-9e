"use client"

import { Handle, Position, type NodeProps } from "@xyflow/react"
import { PlusCircle } from "lucide-react"
import type { MouseEventHandler } from "react"

type AddActionNodeData = {
  onClick: () => void
}

export function AddActionNode({ data }: NodeProps) {
  return (
    <div className="w-[120px] flex flex-col items-center">
      <div className="w-px h-8 bg-muted" />
      <button
        onClick={data.onClick as MouseEventHandler<HTMLButtonElement>}
        className="nodrag nopan flex items-center justify-center w-8 h-8 bg-background border border-dashed border-muted-foreground rounded-full hover:border-primary hover:text-primary transition-colors cursor-pointer"
        aria-label="Add new action"
      >
        <PlusCircle className="w-4 h-4" />
      </button>
      <Handle type="target" position={Position.Top} className="!w-2 !h-2 !-top-1 !bg-transparent !border-none" />
    </div>
  )
} 