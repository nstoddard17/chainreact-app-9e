"use client"

import React, { useState } from "react"
import { Handle, Position } from "@xyflow/react"
import { Zap, TestTube, Play, Snowflake, StopCircle, Trash2, MoreHorizontal, Edit2, Copy, FileText } from "lucide-react"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

interface TriggerPlaceholderNodeProps {
  id: string
  data: {
    onConfigure?: (nodeId: string) => void
    onDelete?: (nodeId: string) => void
    onTestNode?: (nodeId: string) => void
    onRename?: (nodeId: string, newTitle: string) => void
    onDuplicate?: (nodeId: string) => void
    onAddNote?: (nodeId: string) => void
    onFreeze?: (nodeId: string) => void
    onStop?: (nodeId: string) => void
    title?: string
    isPlaceholder?: boolean
  }
  selected?: boolean
}

/**
 * TriggerPlaceholderNode - Zapier-style
 *
 * Empty placeholder node shown when workflow is created without AI agent.
 * Guides users to configure a trigger as the first step in building a workflow.
 * Matches Zapier's UX pattern for workflow creation.
 */
export function TriggerPlaceholderNode({ id, data, selected }: TriggerPlaceholderNodeProps) {
  const handleClick = () => {
    if (data.onConfigure) {
      data.onConfigure(id)
    }
  }

  const handleRename = () => {
    const newName = prompt('Enter new trigger name:', data.title || 'Trigger')
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

  const handleStop = () => {
    if (data.onStop) {
      data.onStop(id)
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
        rounded-lg p-3 w-[360px]
        shadow-sm hover:shadow-md hover:border-gray-400 dark:hover:border-gray-500
        transition-all duration-200
        cursor-pointer
        ${selected ? 'ring-2 ring-blue-500 ring-offset-2 dark:ring-offset-gray-900' : 'animate-pulse-subtle'}
      `}
      data-testid="trigger-placeholder"
      role="button"
      aria-label="Configure workflow trigger"
      tabIndex={0}
      onKeyPress={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          handleClick()
        }
      }}
    >
      <style jsx>{`
        @keyframes pulse-subtle {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.92; }
        }
        .animate-pulse-subtle {
          animation: pulse-subtle 3s cubic-bezier(0.4, 0, 0.6, 1) infinite;
        }
        @media (prefers-reduced-motion: reduce) {
          .animate-pulse-subtle {
            animation: none;
          }
        }
      `}</style>

      {/* Header with icon and title */}
      <div className="flex items-center gap-3 mb-3">
        <div className="flex items-center justify-center w-7 h-7 rounded-full bg-gray-800 dark:bg-gray-700">
          <Zap className="w-4 h-4 text-white" />
        </div>
        <span className="font-semibold text-gray-900 dark:text-gray-100">
          Trigger
        </span>
      </div>

      {/* Step description */}
      <div className="space-y-1">
        <div className="text-sm font-medium text-gray-700 dark:text-gray-300">
          Select the event that starts your workflow
        </div>
      </div>

      {/* Three dots menu */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <div
            className="absolute top-4 right-4 flex gap-0.5 p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors cursor-pointer"
            onClick={(e) => {
              e.stopPropagation()
            }}
          >
            <div className="w-1 h-1 rounded-full bg-gray-400 dark:bg-gray-600"></div>
            <div className="w-1 h-1 rounded-full bg-gray-400 dark:bg-gray-600"></div>
            <div className="w-1 h-1 rounded-full bg-gray-400 dark:bg-gray-600"></div>
          </div>
        </DropdownMenuTrigger>
        <DropdownMenuContent className="w-56" align="end">
          <DropdownMenuItem onClick={handleRename} disabled={isPlaceholder}>
            <Edit2 className="w-4 h-4 mr-2" />
            Rename
          </DropdownMenuItem>
          <DropdownMenuItem onClick={handleDuplicate} disabled={isPlaceholder}>
            <Copy className="w-4 h-4 mr-2" />
            Duplicate
          </DropdownMenuItem>
          {!isPlaceholder && (
            <DropdownMenuItem onClick={handleAddNote}>
              <FileText className="w-4 h-4 mr-2" />
              Add Note
            </DropdownMenuItem>
          )}
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={handleTestNode} disabled={isPlaceholder}>
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
          <DropdownMenuItem disabled>
            <StopCircle className="w-4 h-4 mr-2" />
            Stop
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={handleDelete} disabled={isPlaceholder} className="text-destructive focus:text-destructive">
            <Trash2 className="w-4 h-4 mr-2" />
            Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Output Handle - connects to action */}
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
