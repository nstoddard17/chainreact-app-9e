"use client"

import React, { useState } from 'react'
import { ChevronDown, ChevronUp, MoreVertical } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

interface PathLabelPillProps {
  pathId: string
  label: string
  position: { x: number; y: number }
  isCollapsed: boolean
  onToggleCollapse: () => void
  onRename: () => void
  onDuplicate: () => void
  onCopy: () => void
  onAddNote: () => void
  onDelete: () => void
}

export function PathLabelPill({
  pathId,
  label,
  position,
  isCollapsed,
  onToggleCollapse,
  onRename,
  onDuplicate,
  onCopy,
  onAddNote,
  onDelete,
}: PathLabelPillProps) {
  return (
    <div
      className="absolute noDrag noPan"
      style={{
        left: `${position.x}px`,
        top: `${position.y}px`,
        transform: 'translate(-50%, -50%)',
        zIndex: 1000,
      }}
    >
      <div className="flex items-center gap-1 bg-background border-2 border-primary rounded-full px-3 py-1.5 shadow-md">
        {/* Path Label */}
        <span className="text-sm font-semibold text-primary whitespace-nowrap">
          {label}
        </span>

        {/* Collapse/Expand Dropdown */}
        <Button
          variant="ghost"
          size="sm"
          className="h-5 w-5 p-0 hover:bg-primary/10 rounded-full"
          onClick={(e) => {
            e.stopPropagation()
            onToggleCollapse()
          }}
        >
          {isCollapsed ? (
            <ChevronUp className="h-3.5 w-3.5 text-primary" />
          ) : (
            <ChevronDown className="h-3.5 w-3.5 text-primary" />
          )}
        </Button>

        {/* Three Dots Menu */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className="h-5 w-5 p-0 hover:bg-primary/10 rounded-full"
              onClick={(e) => e.stopPropagation()}
            >
              <MoreVertical className="h-3.5 w-3.5 text-primary" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-40">
            <DropdownMenuItem onClick={onRename}>
              Rename
            </DropdownMenuItem>
            <DropdownMenuItem onClick={onDuplicate}>
              Duplicate path
            </DropdownMenuItem>
            <DropdownMenuItem onClick={onCopy}>
              Copy path
            </DropdownMenuItem>
            <DropdownMenuItem onClick={onAddNote}>
              Add note
            </DropdownMenuItem>
            <DropdownMenuItem onClick={onDelete} className="text-destructive">
              Delete path
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  )
}
