"use client"

import { Handle, Position, type NodeProps } from "@xyflow/react"
import { PlusCircle } from "lucide-react"
import type { MouseEventHandler } from "react"

type AddActionNodeData = {
  onClick: () => void
}

export function AddActionNode({ data }: NodeProps) {
  return (
    <div className="w-[200px] flex flex-col items-center">
      <div className="w-px h-10 bg-gray-300" />
      <button
        onClick={data.onClick as MouseEventHandler<HTMLButtonElement>}
        className="nodrag nopan flex items-center justify-center w-10 h-10 bg-white border-2 border-dashed border-gray-300 rounded-full hover:border-blue-500 hover:text-blue-500 transition-colors cursor-pointer"
        aria-label="Add new action"
      >
        <PlusCircle className="w-6 h-6" />
      </button>
      <Handle type="target" position={Position.Top} className="!w-2 !h-2 !-top-1 !bg-transparent !border-none" />
    </div>
  )
} 