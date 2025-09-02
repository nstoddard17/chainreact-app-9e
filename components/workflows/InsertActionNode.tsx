"use client"

import React, { memo } from "react"
import { Handle, Position, type NodeProps } from "@xyflow/react"
import { Button } from "@/components/ui/button"
import { PlusCircle } from "lucide-react"

interface InsertActionNodeData {
  onClick: () => void
  sourceNodeId: string
  targetNodeId: string
}

function InsertActionNode({ data }: NodeProps<InsertActionNodeData>) {
  const { onClick } = data

  return (
    <div className="relative">
      {/* Input Handle */}
      <Handle
        type="target"
        position={Position.Left}
        className="!bg-transparent !border-0 !w-0 !h-0"
        style={{ left: 0 }}
      />
      
      {/* Insert Button */}
      <Button
        variant="ghost"
        size="sm"
        onClick={onClick}
        className="h-8 px-3 opacity-50 hover:opacity-100 transition-opacity bg-white border border-dashed border-gray-300 hover:border-blue-500"
      >
        <PlusCircle className="w-4 h-4 mr-1" />
        Insert
      </Button>
      
      {/* Output Handle */}
      <Handle
        type="source"
        position={Position.Right}
        className="!bg-transparent !border-0 !w-0 !h-0"
        style={{ right: 0 }}
      />
    </div>
  )
}

export default memo(InsertActionNode)