"use client"

import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  Copy,
  Trash2,
  FolderInput,
  Share2,
  RotateCcw,
  X,
  RefreshCw,
  ToggleRight,
} from "lucide-react"
import { cn } from "@/lib/utils"

interface ActionConfig {
  id: string
  label: string
  icon: React.ElementType
  onClick: () => void
  loading?: boolean
  disabled?: boolean
  variant?: 'default' | 'destructive' | 'success'
}

interface FloatingActionBarProps {
  selectedCount: number
  onDeselect: () => void
  actions: ActionConfig[]
  className?: string
}

/**
 * Floating action bar that appears at the bottom of the screen
 * when items are selected. More discoverable than inline bars.
 */
export function FloatingActionBar({
  selectedCount,
  onDeselect,
  actions,
  className
}: FloatingActionBarProps) {
  const [isVisible, setIsVisible] = useState(false)

  // Animate in when items are selected
  useEffect(() => {
    if (selectedCount > 0) {
      // Small delay for smoother animation
      const timer = setTimeout(() => setIsVisible(true), 50)
      return () => clearTimeout(timer)
    } else {
      setIsVisible(false)
    }
  }, [selectedCount])

  if (selectedCount === 0) {
    return null
  }

  return (
    <div
      className={cn(
        "fixed bottom-6 left-1/2 -translate-x-1/2 z-50",
        "transition-all duration-300 ease-out",
        isVisible
          ? "translate-y-0 opacity-100"
          : "translate-y-4 opacity-0 pointer-events-none",
        className
      )}
    >
      <div className="flex items-center gap-2 px-4 py-3 bg-slate-900 dark:bg-slate-800 rounded-xl shadow-2xl border border-slate-700">
        {/* Selection Count */}
        <div className="flex items-center gap-2 pr-3 border-r border-slate-700">
          <Badge
            variant="secondary"
            className="bg-primary/20 text-primary-foreground border-0 font-semibold"
          >
            {selectedCount}
          </Badge>
          <span className="text-sm text-slate-300 font-medium">
            {selectedCount === 1 ? 'item' : 'items'} selected
          </span>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1">
          {actions.map((action) => {
            const Icon = action.icon
            const isDestructive = action.variant === 'destructive'
            const isSuccess = action.variant === 'success'

            return (
              <Button
                key={action.id}
                variant="ghost"
                size="sm"
                onClick={action.onClick}
                disabled={action.loading || action.disabled}
                className={cn(
                  "h-9 px-3 gap-2 text-slate-300 hover:text-white",
                  isDestructive && "hover:bg-red-500/20 hover:text-red-400",
                  isSuccess && "hover:bg-green-500/20 hover:text-green-400",
                  !isDestructive && !isSuccess && "hover:bg-slate-700"
                )}
              >
                {action.loading ? (
                  <RefreshCw className="w-4 h-4 animate-spin" />
                ) : (
                  <Icon className="w-4 h-4" />
                )}
                <span className="text-sm">{action.label}</span>
              </Button>
            )
          })}
        </div>

        {/* Deselect Button */}
        <div className="pl-2 border-l border-slate-700">
          <Button
            variant="ghost"
            size="sm"
            onClick={onDeselect}
            className="h-9 w-9 p-0 text-slate-400 hover:text-white hover:bg-slate-700"
          >
            <X className="w-4 h-4" />
          </Button>
        </div>
      </div>
    </div>
  )
}

/**
 * Pre-configured floating action bar for workflows
 */
interface WorkflowFloatingActionBarProps {
  selectedIds: string[]
  onDeselect: () => void
  onDuplicate: () => void
  onMove: () => void
  onShare: () => void
  onDelete: () => void
  onRestore?: () => void
  onToggleStatus?: () => void
  isTrashView?: boolean
  loading?: Record<string, boolean>
}

export function WorkflowFloatingActionBar({
  selectedIds,
  onDeselect,
  onDuplicate,
  onMove,
  onShare,
  onDelete,
  onRestore,
  onToggleStatus,
  isTrashView = false,
  loading = {}
}: WorkflowFloatingActionBarProps) {
  const trashActions: ActionConfig[] = [
    {
      id: 'restore',
      label: 'Restore',
      icon: RotateCcw,
      onClick: onRestore || (() => {}),
      loading: loading['restore-multi'],
      variant: 'success'
    },
    {
      id: 'delete-forever',
      label: 'Delete Forever',
      icon: Trash2,
      onClick: onDelete,
      variant: 'destructive'
    }
  ]

  const normalActions: ActionConfig[] = [
    {
      id: 'duplicate',
      label: 'Duplicate',
      icon: Copy,
      onClick: onDuplicate,
      loading: loading['duplicate-multi'] || (selectedIds.length === 1 && loading[`duplicate-${selectedIds[0]}`])
    },
    {
      id: 'move',
      label: 'Move',
      icon: FolderInput,
      onClick: onMove
    },
    {
      id: 'share',
      label: 'Share',
      icon: Share2,
      onClick: onShare
    },
    ...(onToggleStatus && selectedIds.length === 1 ? [{
      id: 'toggle-status',
      label: 'Toggle Status',
      icon: ToggleRight,
      onClick: onToggleStatus,
      loading: loading[`status-${selectedIds[0]}`]
    }] : []),
    {
      id: 'delete',
      label: 'Delete',
      icon: Trash2,
      onClick: onDelete,
      variant: 'destructive' as const
    }
  ]

  return (
    <FloatingActionBar
      selectedCount={selectedIds.length}
      onDeselect={onDeselect}
      actions={isTrashView ? trashActions : normalActions}
    />
  )
}
