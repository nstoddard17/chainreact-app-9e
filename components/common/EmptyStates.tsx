"use client"

import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import {
  Workflow,
  Layers,
  Zap,
  FileText,
  Search,
  Inbox,
  Calendar,
  BarChart3,
  Bell,
  MessageSquare,
  Users,
  Settings,
  FolderOpen,
  PlusCircle,
} from "lucide-react"
import Link from "next/link"

interface EmptyStateProps {
  /** Title text */
  title: string
  /** Description text */
  description: string
  /** Icon component */
  icon?: React.ReactNode
  /** Primary action button */
  action?: {
    label: string
    href?: string
    onClick?: () => void
  }
  /** Secondary action */
  secondaryAction?: {
    label: string
    href?: string
    onClick?: () => void
  }
  /** Additional class name */
  className?: string
  /** Compact variant */
  compact?: boolean
}

/**
 * Base empty state component with customizable content
 */
export function EmptyState({
  title,
  description,
  icon,
  action,
  secondaryAction,
  className,
  compact = false,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center text-center",
        compact ? "py-8 px-4" : "py-16 px-6",
        className
      )}
    >
      {/* Illustration Container */}
      <div
        className={cn(
          "rounded-full bg-muted/50 flex items-center justify-center mb-4",
          compact ? "w-12 h-12" : "w-20 h-20"
        )}
      >
        {icon || (
          <FolderOpen
            className={cn(
              "text-muted-foreground",
              compact ? "w-6 h-6" : "w-10 h-10"
            )}
          />
        )}
      </div>

      {/* Text Content */}
      <h3
        className={cn(
          "font-semibold text-foreground",
          compact ? "text-base mb-1" : "text-lg mb-2"
        )}
      >
        {title}
      </h3>
      <p
        className={cn(
          "text-muted-foreground max-w-sm",
          compact ? "text-sm mb-4" : "text-base mb-6"
        )}
      >
        {description}
      </p>

      {/* Actions */}
      {(action || secondaryAction) && (
        <div className="flex items-center gap-3">
          {action && (
            action.href ? (
              <Button asChild size={compact ? "sm" : "default"}>
                <Link href={action.href}>
                  <PlusCircle className="w-4 h-4 mr-2" />
                  {action.label}
                </Link>
              </Button>
            ) : (
              <Button onClick={action.onClick} size={compact ? "sm" : "default"}>
                <PlusCircle className="w-4 h-4 mr-2" />
                {action.label}
              </Button>
            )
          )}
          {secondaryAction && (
            secondaryAction.href ? (
              <Button variant="outline" asChild size={compact ? "sm" : "default"}>
                <Link href={secondaryAction.href}>{secondaryAction.label}</Link>
              </Button>
            ) : (
              <Button
                variant="outline"
                onClick={secondaryAction.onClick}
                size={compact ? "sm" : "default"}
              >
                {secondaryAction.label}
              </Button>
            )
          )}
        </div>
      )}
    </div>
  )
}

/**
 * Empty state for no workflows
 */
export function NoWorkflowsEmptyState({
  onCreateClick,
  className,
}: {
  onCreateClick?: () => void
  className?: string
}) {
  return (
    <EmptyState
      icon={<Workflow className="w-10 h-10 text-blue-500" />}
      title="No workflows yet"
      description="Create your first workflow to automate tasks between your favorite apps."
      action={{
        label: "Create Workflow",
        onClick: onCreateClick,
        href: onCreateClick ? undefined : "/workflows/new",
      }}
      secondaryAction={{
        label: "Browse Templates",
        href: "/templates",
      }}
      className={className}
    />
  )
}

/**
 * Empty state for no templates
 */
export function NoTemplatesEmptyState({ className }: { className?: string }) {
  return (
    <EmptyState
      icon={<Layers className="w-10 h-10 text-purple-500" />}
      title="No templates found"
      description="Try adjusting your search or filters to find the template you're looking for."
      secondaryAction={{
        label: "Clear Filters",
        onClick: () => window.location.reload(),
      }}
      className={className}
    />
  )
}

/**
 * Empty state for no integrations
 */
export function NoIntegrationsEmptyState({ className }: { className?: string }) {
  return (
    <EmptyState
      icon={<Zap className="w-10 h-10 text-amber-500" />}
      title="No apps connected"
      description="Connect your favorite apps to start building powerful automations."
      action={{
        label: "Connect an App",
        href: "/integrations",
      }}
      className={className}
    />
  )
}

/**
 * Empty state for no search results
 */
export function NoSearchResultsEmptyState({
  searchTerm,
  onClear,
  className,
}: {
  searchTerm?: string
  onClear?: () => void
  className?: string
}) {
  return (
    <EmptyState
      icon={<Search className="w-10 h-10 text-muted-foreground" />}
      title="No results found"
      description={
        searchTerm
          ? `We couldn't find anything matching "${searchTerm}". Try a different search term.`
          : "Try adjusting your search or filters."
      }
      secondaryAction={
        onClear
          ? {
              label: "Clear Search",
              onClick: onClear,
            }
          : undefined
      }
      className={className}
    />
  )
}

/**
 * Empty state for empty inbox/notifications
 */
export function NoNotificationsEmptyState({ className }: { className?: string }) {
  return (
    <EmptyState
      icon={<Bell className="w-10 h-10 text-green-500" />}
      title="All caught up!"
      description="You have no new notifications. We'll let you know when something needs your attention."
      compact
      className={className}
    />
  )
}

/**
 * Empty state for no comments
 */
export function NoCommentsEmptyState({
  onAddClick,
  className,
}: {
  onAddClick?: () => void
  className?: string
}) {
  return (
    <EmptyState
      icon={<MessageSquare className="w-8 h-8 text-blue-500" />}
      title="No comments yet"
      description="Start the conversation by adding a comment."
      action={
        onAddClick
          ? {
              label: "Add Comment",
              onClick: onAddClick,
            }
          : undefined
      }
      compact
      className={className}
    />
  )
}

/**
 * Empty state for no team members
 */
export function NoTeamMembersEmptyState({
  onInviteClick,
  className,
}: {
  onInviteClick?: () => void
  className?: string
}) {
  return (
    <EmptyState
      icon={<Users className="w-10 h-10 text-indigo-500" />}
      title="No team members"
      description="Invite your teammates to collaborate on workflows together."
      action={{
        label: "Invite Team Member",
        onClick: onInviteClick,
      }}
      className={className}
    />
  )
}

/**
 * Empty state for no activity/history
 */
export function NoActivityEmptyState({ className }: { className?: string }) {
  return (
    <EmptyState
      icon={<Inbox className="w-10 h-10 text-muted-foreground" />}
      title="No activity yet"
      description="Activity will appear here once you start running workflows."
      compact
      className={className}
    />
  )
}

/**
 * Empty state for no scheduled runs
 */
export function NoScheduledRunsEmptyState({ className }: { className?: string }) {
  return (
    <EmptyState
      icon={<Calendar className="w-10 h-10 text-orange-500" />}
      title="No scheduled runs"
      description="Set up a schedule to run your workflows automatically."
      action={{
        label: "Set Up Schedule",
        href: "/settings/schedules",
      }}
      compact
      className={className}
    />
  )
}

/**
 * Empty state for no analytics data
 */
export function NoAnalyticsEmptyState({ className }: { className?: string }) {
  return (
    <EmptyState
      icon={<BarChart3 className="w-10 h-10 text-cyan-500" />}
      title="No data available"
      description="Analytics will appear once your workflows start running."
      secondaryAction={{
        label: "View Workflows",
        href: "/workflows",
      }}
      className={className}
    />
  )
}

/**
 * Empty state for access denied/permission issues
 */
export function AccessDeniedEmptyState({
  className,
}: {
  className?: string
}) {
  return (
    <EmptyState
      icon={<Settings className="w-10 h-10 text-red-500" />}
      title="Access Denied"
      description="You don't have permission to view this content. Contact your administrator if you believe this is an error."
      secondaryAction={{
        label: "Go to Dashboard",
        href: "/dashboard",
      }}
      className={className}
    />
  )
}

/**
 * Empty state for error states
 */
export function ErrorEmptyState({
  title = "Something went wrong",
  description = "An unexpected error occurred. Please try again.",
  onRetry,
  className,
}: {
  title?: string
  description?: string
  onRetry?: () => void
  className?: string
}) {
  return (
    <EmptyState
      icon={
        <div className="w-10 h-10 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center">
          <span className="text-2xl">!</span>
        </div>
      }
      title={title}
      description={description}
      action={
        onRetry
          ? {
              label: "Try Again",
              onClick: onRetry,
            }
          : undefined
      }
      secondaryAction={{
        label: "Go Back",
        onClick: () => window.history.back(),
      }}
      className={className}
    />
  )
}
