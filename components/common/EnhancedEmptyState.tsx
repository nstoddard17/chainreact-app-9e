"use client"

import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import {
  Workflow,
  Plug,
  Search,
  FolderOpen,
  FileText,
  Users,
  Zap,
  Sparkles,
  ArrowRight,
  Plus,
} from "lucide-react"

type EmptyStateType =
  | "workflows"
  | "apps"
  | "search"
  | "folder"
  | "templates"
  | "team"
  | "executions"
  | "notifications"

interface EmptyStateConfig {
  icon: React.ElementType
  iconColor: string
  iconBg: string
  title: string
  description: string
  primaryAction?: {
    label: string
    icon?: React.ElementType
  }
  secondaryAction?: {
    label: string
    icon?: React.ElementType
  }
  tip?: string
}

const EMPTY_STATE_CONFIGS: Record<EmptyStateType, EmptyStateConfig> = {
  workflows: {
    icon: Workflow,
    iconColor: "text-orange-500",
    iconBg: "bg-orange-100 dark:bg-orange-900/30",
    title: "No workflows yet",
    description: "Create your first workflow to automate tasks between your apps. Start from scratch or use a template.",
    primaryAction: {
      label: "Create Workflow",
      icon: Plus,
    },
    secondaryAction: {
      label: "Browse Templates",
      icon: Sparkles,
    },
    tip: "Tip: Connect your apps first to see available triggers and actions.",
  },
  apps: {
    icon: Plug,
    iconColor: "text-blue-500",
    iconBg: "bg-blue-100 dark:bg-blue-900/30",
    title: "No apps connected",
    description: "Connect your favorite apps to start building powerful automations. We support 20+ integrations.",
    primaryAction: {
      label: "Connect an App",
      icon: Plus,
    },
    tip: "Popular: Gmail, Slack, Notion, Airtable, HubSpot",
  },
  search: {
    icon: Search,
    iconColor: "text-gray-500",
    iconBg: "bg-gray-100 dark:bg-gray-800",
    title: "No results found",
    description: "We couldn't find anything matching your search. Try different keywords or clear filters.",
    primaryAction: {
      label: "Clear Search",
    },
  },
  folder: {
    icon: FolderOpen,
    iconColor: "text-yellow-500",
    iconBg: "bg-yellow-100 dark:bg-yellow-900/30",
    title: "This folder is empty",
    description: "Move workflows here to keep them organized, or create a new workflow in this folder.",
    primaryAction: {
      label: "Create Workflow",
      icon: Plus,
    },
    secondaryAction: {
      label: "Move Workflows Here",
    },
  },
  templates: {
    icon: FileText,
    iconColor: "text-purple-500",
    iconBg: "bg-purple-100 dark:bg-purple-900/30",
    title: "No templates available",
    description: "Templates help you get started quickly. Check back later or create your own from existing workflows.",
    primaryAction: {
      label: "Create from Scratch",
      icon: Plus,
    },
  },
  team: {
    icon: Users,
    iconColor: "text-green-500",
    iconBg: "bg-green-100 dark:bg-green-900/30",
    title: "No team members yet",
    description: "Invite colleagues to collaborate on workflows. Share automations and work together in real-time.",
    primaryAction: {
      label: "Invite Team Member",
      icon: Plus,
    },
    tip: "Team features are available on Pro plans and above.",
  },
  executions: {
    icon: Zap,
    iconColor: "text-cyan-500",
    iconBg: "bg-cyan-100 dark:bg-cyan-900/30",
    title: "No executions yet",
    description: "When your workflows run, you'll see execution history here. Activate a workflow to get started!",
    primaryAction: {
      label: "View Workflows",
      icon: ArrowRight,
    },
  },
  notifications: {
    icon: Sparkles,
    iconColor: "text-pink-500",
    iconBg: "bg-pink-100 dark:bg-pink-900/30",
    title: "All caught up!",
    description: "You have no new notifications. We'll let you know when something needs your attention.",
  },
}

interface EnhancedEmptyStateProps {
  type: EmptyStateType
  title?: string
  description?: string
  onPrimaryAction?: () => void
  onSecondaryAction?: () => void
  primaryActionLabel?: string
  secondaryActionLabel?: string
  showTip?: boolean
  className?: string
  compact?: boolean
}

/**
 * Enhanced empty state component with illustrations and CTAs
 * Used across the app for consistent empty state messaging
 */
export function EnhancedEmptyState({
  type,
  title,
  description,
  onPrimaryAction,
  onSecondaryAction,
  primaryActionLabel,
  secondaryActionLabel,
  showTip = true,
  className,
  compact = false,
}: EnhancedEmptyStateProps) {
  const config = EMPTY_STATE_CONFIGS[type]
  const Icon = config.icon

  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center text-center",
        compact ? "py-8 px-4" : "py-16 px-6",
        className
      )}
    >
      {/* Illustration / Icon */}
      <div
        className={cn(
          "rounded-2xl flex items-center justify-center mb-6",
          compact ? "w-14 h-14" : "w-20 h-20",
          config.iconBg
        )}
      >
        <Icon
          className={cn(
            config.iconColor,
            compact ? "w-7 h-7" : "w-10 h-10"
          )}
        />
      </div>

      {/* Title */}
      <h3
        className={cn(
          "font-semibold text-foreground mb-2",
          compact ? "text-lg" : "text-xl"
        )}
      >
        {title || config.title}
      </h3>

      {/* Description */}
      <p
        className={cn(
          "text-muted-foreground max-w-md mb-6",
          compact ? "text-sm" : "text-base"
        )}
      >
        {description || config.description}
      </p>

      {/* Actions */}
      {(onPrimaryAction || onSecondaryAction) && (
        <div className="flex flex-wrap items-center justify-center gap-3 mb-6">
          {onPrimaryAction && config.primaryAction && (
            <Button onClick={onPrimaryAction} size={compact ? "sm" : "default"}>
              {config.primaryAction.icon && (
                <config.primaryAction.icon className="w-4 h-4 mr-2" />
              )}
              {primaryActionLabel || config.primaryAction.label}
            </Button>
          )}
          {onSecondaryAction && config.secondaryAction && (
            <Button
              variant="outline"
              onClick={onSecondaryAction}
              size={compact ? "sm" : "default"}
            >
              {config.secondaryAction.icon && (
                <config.secondaryAction.icon className="w-4 h-4 mr-2" />
              )}
              {secondaryActionLabel || config.secondaryAction.label}
            </Button>
          )}
        </div>
      )}

      {/* Tip */}
      {showTip && config.tip && (
        <p className="text-xs text-muted-foreground/70 max-w-sm">
          {config.tip}
        </p>
      )}
    </div>
  )
}

/**
 * Search-specific empty state with query display
 */
interface SearchEmptyStateProps {
  query: string
  onClear: () => void
  className?: string
}

export function SearchEmptyState({ query, onClear, className }: SearchEmptyStateProps) {
  return (
    <div className={cn("flex flex-col items-center justify-center py-12 px-4", className)}>
      <div className="w-16 h-16 rounded-2xl bg-gray-100 dark:bg-gray-800 flex items-center justify-center mb-4">
        <Search className="w-8 h-8 text-gray-400" />
      </div>
      <h3 className="text-lg font-semibold mb-2">No results for "{query}"</h3>
      <p className="text-sm text-muted-foreground mb-4 max-w-md text-center">
        We couldn't find anything matching your search. Check your spelling or try different keywords.
      </p>
      <Button variant="outline" size="sm" onClick={onClear}>
        Clear Search
      </Button>
    </div>
  )
}

/**
 * Folder-specific empty state
 */
interface FolderEmptyStateProps {
  folderName: string
  onCreateWorkflow?: () => void
  onMoveWorkflows?: () => void
  className?: string
}

export function FolderEmptyState({
  folderName,
  onCreateWorkflow,
  onMoveWorkflows,
  className,
}: FolderEmptyStateProps) {
  return (
    <div className={cn("flex flex-col items-center justify-center py-12 px-4", className)}>
      <div className="w-16 h-16 rounded-2xl bg-yellow-100 dark:bg-yellow-900/30 flex items-center justify-center mb-4">
        <FolderOpen className="w-8 h-8 text-yellow-500" />
      </div>
      <h3 className="text-lg font-semibold mb-2">"{folderName}" is empty</h3>
      <p className="text-sm text-muted-foreground mb-4 max-w-md text-center">
        Add workflows to this folder to keep your automations organized.
      </p>
      <div className="flex gap-3">
        {onCreateWorkflow && (
          <Button size="sm" onClick={onCreateWorkflow}>
            <Plus className="w-4 h-4 mr-2" />
            Create Workflow
          </Button>
        )}
        {onMoveWorkflows && (
          <Button variant="outline" size="sm" onClick={onMoveWorkflows}>
            Move Workflows Here
          </Button>
        )}
      </div>
    </div>
  )
}
