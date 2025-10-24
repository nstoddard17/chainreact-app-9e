"use client"

import React from "react"
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu"
import { TestTube, Play, Snowflake, StopCircle, Trash2 } from "lucide-react"

interface NodeContextMenuProps {
  children: React.ReactNode
  nodeId: string
  onTestNode?: (nodeId: string) => void
  onTestFlowFromHere?: (nodeId: string) => void
  onFreeze?: (nodeId: string) => void
  onStop?: (nodeId: string) => void
  onDelete?: (nodeId: string) => void
}

export function NodeContextMenu({
  children,
  nodeId,
  onTestNode,
  onTestFlowFromHere,
  onFreeze,
  onStop,
  onDelete,
}: NodeContextMenuProps) {
  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        {children}
      </ContextMenuTrigger>
      <ContextMenuContent className="w-56">
        <ContextMenuItem onClick={() => onTestNode?.(nodeId)}>
          <TestTube className="w-4 h-4 mr-2" />
          Test Node
        </ContextMenuItem>
        <ContextMenuItem onClick={() => onTestFlowFromHere?.(nodeId)}>
          <Play className="w-4 h-4 mr-2" />
          Test Flow from here
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem onClick={() => onFreeze?.(nodeId)}>
          <Snowflake className="w-4 h-4 mr-2" />
          Freeze
        </ContextMenuItem>
        <ContextMenuItem onClick={() => onStop?.(nodeId)}>
          <StopCircle className="w-4 h-4 mr-2" />
          Stop
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem
          onClick={() => onDelete?.(nodeId)}
          className="text-destructive focus:text-destructive"
        >
          <Trash2 className="w-4 h-4 mr-2" />
          Delete
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  )
}
