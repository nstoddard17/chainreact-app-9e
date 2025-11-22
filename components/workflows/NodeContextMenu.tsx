"use client"

import React from "react"
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu"
import { TestTube, Play, Snowflake, Trash2 } from "lucide-react"

interface NodeContextMenuProps {
  children: React.ReactNode
  nodeId: string
  selectedNodeIds?: string[]
  onTestNode?: (nodeId: string) => void
  onTestFlowFromHere?: (nodeId: string) => void
  onFreeze?: (nodeId: string) => void
  onDelete?: (nodeId: string) => void
  onDeleteSelected?: (nodeIds: string[]) => void
  hasRequiredFieldsMissing?: boolean
  disabled?: boolean // Disable context menu during flow testing
}

export function NodeContextMenu({
  children,
  nodeId,
  selectedNodeIds = [],
  onTestNode,
  onTestFlowFromHere,
  onFreeze,
  onDelete,
  onDeleteSelected,
  hasRequiredFieldsMissing = false,
  disabled = false,
}: NodeContextMenuProps) {
  // Check if multiple nodes are selected and this node is one of them
  const isMultiSelect = selectedNodeIds.length > 1 && selectedNodeIds.includes(nodeId)

  // When disabled, just render children without context menu
  if (disabled) {
    return <>{children}</>
  }

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        {children}
      </ContextMenuTrigger>
      <ContextMenuContent className="w-56">
        {isMultiSelect ? (
          <ContextMenuItem
            onClick={(e) => {
              e.stopPropagation()
              void onDeleteSelected?.(selectedNodeIds)
            }}
            className="text-destructive focus:text-destructive"
          >
            <Trash2 className="w-4 h-4 mr-2" />
            {`Delete ${selectedNodeIds.length} nodes`}
          </ContextMenuItem>
        ) : (
          <>
            <ContextMenuItem
              onClick={(e) => {
                e.stopPropagation()
                console.log('[NodeContextMenu] Test Node clicked:', nodeId, 'Handler exists:', !!onTestNode)
                if (!hasRequiredFieldsMissing) {
                  onTestNode?.(nodeId)
                }
              }}
              disabled={hasRequiredFieldsMissing}
            >
              <TestTube className="w-4 h-4 mr-2" />
              Test Node
            </ContextMenuItem>
            <ContextMenuItem
              onClick={(e) => {
                e.stopPropagation()
                console.log('[NodeContextMenu] Test Flow from here clicked:', nodeId, 'Handler exists:', !!onTestFlowFromHere, 'Disabled:', hasRequiredFieldsMissing)
                if (!hasRequiredFieldsMissing) {
                  onTestFlowFromHere?.(nodeId)
                }
              }}
              disabled={hasRequiredFieldsMissing}
            >
              <Play className="w-4 h-4 mr-2" />
              Test Flow from here
            </ContextMenuItem>
            <ContextMenuSeparator />
            <ContextMenuItem
              onClick={(e) => {
                e.stopPropagation()
                if (!hasRequiredFieldsMissing) {
                  onFreeze?.(nodeId)
                }
              }}
              disabled={hasRequiredFieldsMissing}
            >
              <Snowflake className="w-4 h-4 mr-2" />
              Freeze
            </ContextMenuItem>
            <ContextMenuItem
              onClick={(e) => {
                e.stopPropagation()
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
