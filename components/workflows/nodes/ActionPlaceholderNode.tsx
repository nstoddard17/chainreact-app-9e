"use client"

import React, { useState } from "react"
import { Handle, Position } from "@xyflow/react"
import { Play, TestTube, Snowflake, Trash2, MoreVertical, Edit2, Copy, FileText } from "lucide-react"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

interface ActionPlaceholderNodeProps {
  id: string
  data: {
    onConfigure?: (nodeId: string) => void
    onDelete?: (nodeId: string) => void
    onTestNode?: (nodeId: string) => void
    onRename?: (nodeId: string, newTitle: string) => void
    onDuplicate?: (nodeId: string) => void
    onAddNote?: (nodeId: string) => void
    onFreeze?: (nodeId: string) => void
    title?: string
    isPlaceholder?: boolean
  }
  selected?: boolean
}

/**
 * ActionPlaceholderNode - Zapier-style
 *
 * Empty placeholder node shown when workflow is created without AI agent.
 * Guides users to configure an action as the second step in building a workflow.
 * Matches Zapier's UX pattern for workflow creation.
 */
export function ActionPlaceholderNode({ id, data, selected }: ActionPlaceholderNodeProps) {
  const handleClick = () => {
    if (data.onConfigure) {
      data.onConfigure(id)
    }
  }

  const handleRename = () => {
    const newName = prompt('Enter new action name:', data.title || 'Action')
    if (newName && newName.trim() && data.onRename) {
      data.onRename(id, newName.trim())
    }
  }

  const handleDuplicate = () => {
    if (data.onDuplicate) {
      data.onDuplicate(id)
    }
  }

  const handleAddNote = () => {
    if (data.onAddNote) {
      data.onAddNote(id)
    }
  }

  const handleTestNode = () => {
    if (data.onTestNode) {
      data.onTestNode(id)
    }
  }

  const handleFreeze = () => {
    if (data.onFreeze) {
      data.onFreeze(id)
    }
  }

  const handleDelete = () => {
    if (data.onDelete) {
      data.onDelete(id)
    }
  }

  // Check if this is still a placeholder (not configured yet)
  const isPlaceholder = data.isPlaceholder ?? true

  return (
    <div
      onClick={handleClick}
      className={`
        relative bg-white dark:bg-gray-900
        border-2 border-dashed border-gray-300 dark:border-gray-600
        rounded-lg w-[360px]
        shadow-sm hover:shadow-md hover:border-gray-400 dark:hover:border-gray-500
        transition-all duration-200
        cursor-pointer
        ${selected ? 'ring-2 ring-blue-500 ring-offset-2 dark:ring-offset-gray-900' : ''}
      `}
      data-testid="action-placeholder"
      role="button"
      aria-label="Configure workflow action"
      tabIndex={0}
      onKeyPress={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          handleClick()
        }
      }}
    >
      {/* Input Handle - connects from trigger */}
      <Handle
        type="target"
        position={Position.Top}
        className="!bg-blue-500 !w-3 !h-3 !border-2 !border-white dark:!border-gray-900"
        id="target"
        style={{
          left: "50%",
          transform: "translate(-50%, -50%)",
        }}
      />

      {/* Three dots menu - matches CustomNode position */}
      <div className="absolute top-2 right-2 z-30">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
              onClick={(e) => e.stopPropagation()}
              aria-label="Node menu"
            >
              <MoreVertical className="w-4 h-4 text-gray-600 dark:text-gray-400" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="w-56" align="end">
            <DropdownMenuItem onClick={(e) => { e.stopPropagation(); handleRename() }} disabled={isPlaceholder}>
              <Edit2 className="w-4 h-4 mr-2" />
              Rename
            </DropdownMenuItem>
            <DropdownMenuItem onClick={(e) => { e.stopPropagation(); handleDuplicate() }} disabled={isPlaceholder}>
              <Copy className="w-4 h-4 mr-2" />
              Duplicate
            </DropdownMenuItem>
            {!isPlaceholder && (
              <DropdownMenuItem onClick={(e) => { e.stopPropagation(); handleAddNote() }}>
                <FileText className="w-4 h-4 mr-2" />
                Add Note
              </DropdownMenuItem>
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={(e) => { e.stopPropagation(); handleTestNode() }} disabled={isPlaceholder}>
              <TestTube className="w-4 h-4 mr-2" />
              Test Node
            </DropdownMenuItem>
            <DropdownMenuItem disabled>
              <Play className="w-4 h-4 mr-2" />
              Test Flow from here
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem disabled>
              <Snowflake className="w-4 h-4 mr-2" />
              Freeze
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={(e) => { e.stopPropagation(); handleDelete() }} disabled={isPlaceholder} className="text-destructive focus:text-destructive">
              <Trash2 className="w-4 h-4 mr-2" />
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Content area - matches CustomNode layout */}
      <div className="p-3">
        <div className="flex items-center justify-between gap-2">
          <div className="grid grid-cols-[40px_1fr] gap-2.5 items-center flex-1 min-w-0">
            {/* Logo - Fixed position, vertically centered */}
            <div className="flex items-center justify-center">
              <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-blue-100 dark:bg-blue-900/30">
                <Play className="w-5 h-5 text-blue-600 dark:text-blue-400" />
              </div>
            </div>
            {/* Content - Flows independently */}
            <div className="min-w-0 pr-2">
              <div className="flex flex-col gap-1">
                <h3 className="text-lg font-semibold text-foreground whitespace-nowrap overflow-hidden text-ellipsis">
                  Action
                </h3>
                <p className="text-sm text-muted-foreground leading-snug line-clamp-1">
                  Select the action for your workflow to run
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Output Handle - allows adding more actions after this one */}
      <Handle
        type="source"
        position={Position.Bottom}
        className="!bg-blue-500 !w-3 !h-3 !border-2 !border-white dark:!border-gray-900"
        id="source"
        style={{
          left: "50%",
          transform: "translate(-50%, 50%)",
        }}
      />
    </div>
  )
}
