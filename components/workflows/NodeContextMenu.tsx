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
  selectedNodeIds?: string[]
  onTestNode?: (nodeId: string) => void
  onTestFlowFromHere?: (nodeId: string) => void
  onFreeze?: (nodeId: string) => void
  onStop?: (nodeId: string) => void
  onDelete?: (nodeId: string) => void
  onDeleteSelected?: (nodeIds: string[]) => void
}

export function NodeContextMenu({
  children,
  nodeId,
  selectedNodeIds = [],
  onTestNode,
  onTestFlowFromHere,
  onFreeze,
  onStop,
  onDelete,
  onDeleteSelected,
}: NodeContextMenuProps) {
  // Check if multiple nodes are selected and this node is one of them
  const isMultiSelect = selectedNodeIds.length > 1 && selectedNodeIds.includes(nodeId)

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        {children}
      </ContextMenuTrigger>
      <ContextMenuContent className="w-56">
        {isMultiSelect ? (
          <ContextMenuItem
            onClick={() => {
              void onDeleteSelected?.(selectedNodeIds)
            }}
            className="text-destructive focus:text-destructive"
          >
            <Trash2 className="w-4 h-4 mr-2" />
            {`Delete ${selectedNodeIds.length} nodes`}
          </ContextMenuItem>
        ) : (
          <>
            <ContextMenuItem onClick={() => {
              console.log('[NodeContextMenu] Test Node clicked:', nodeId, 'Handler exists:', !!onTestNode)
              onTestNode?.(nodeId)
            }}>
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
              onClick={() => {
                void onDelete?.(nodeId)
              }}
              className="text-destructive focus:text-destructive"
            >
              <Trash2 className="w-4 h-4 mr-2" />
              Delete
            </ContextMenuItem>
          </>
        )}
      </ContextMenuContent>
    </ContextMenu>
  )
}
