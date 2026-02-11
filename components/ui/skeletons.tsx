"use client"

import { Skeleton } from "@/components/ui/skeleton"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { cn } from "@/lib/utils"

/**
 * Skeleton loader for workflow cards
 */
export function WorkflowCardSkeleton({ className }: { className?: string }) {
  return (
    <Card className={cn("overflow-hidden", className)}>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div className="space-y-2">
            <Skeleton className="h-5 w-40" />
            <Skeleton className="h-4 w-24" />
          </div>
          <Skeleton className="h-6 w-16 rounded-full" />
        </div>
      </CardHeader>
      <CardContent>
        <div className="flex items-center gap-4 text-sm">
          <Skeleton className="h-4 w-20" />
          <Skeleton className="h-4 w-24" />
        </div>
      </CardContent>
    </Card>
  )
}

/**
 * Skeleton loader for a list of workflow cards
 */
export function WorkflowListSkeleton({
  count = 3,
  className,
}: {
  count?: number
  className?: string
}) {
  return (
    <div className={cn("space-y-4", className)}>
      {Array.from({ length: count }).map((_, i) => (
        <WorkflowCardSkeleton key={i} />
      ))}
    </div>
  )
}

/**
 * Skeleton loader for workflow grid
 */
export function WorkflowGridSkeleton({
  count = 6,
  className,
}: {
  count?: number
  className?: string
}) {
  return (
    <div className={cn("grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4", className)}>
      {Array.from({ length: count }).map((_, i) => (
        <WorkflowCardSkeleton key={i} />
      ))}
    </div>
  )
}

/**
 * Skeleton loader for stats cards (dashboard metrics)
 */
export function StatsCardSkeleton({ className }: { className?: string }) {
  return (
    <Card className={cn("p-6", className)}>
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-8 w-16" />
        </div>
        <Skeleton className="h-10 w-10 rounded-lg" />
      </div>
    </Card>
  )
}

/**
 * Skeleton loader for stats grid
 */
export function StatsGridSkeleton({
  count = 4,
  className,
}: {
  count?: number
  className?: string
}) {
  return (
    <div className={cn("grid grid-cols-2 md:grid-cols-4 gap-4", className)}>
      {Array.from({ length: count }).map((_, i) => (
        <StatsCardSkeleton key={i} />
      ))}
    </div>
  )
}

/**
 * Skeleton loader for table rows
 */
export function TableRowSkeleton({
  columns = 4,
  className,
}: {
  columns?: number
  className?: string
}) {
  return (
    <div className={cn("flex items-center gap-4 py-4 border-b", className)}>
      {Array.from({ length: columns }).map((_, i) => (
        <Skeleton
          key={i}
          className={cn("h-4", i === 0 ? "w-48" : "w-24", "flex-shrink-0")}
        />
      ))}
    </div>
  )
}

/**
 * Skeleton loader for full table
 */
export function TableSkeleton({
  rows = 5,
  columns = 4,
  className,
}: {
  rows?: number
  columns?: number
  className?: string
}) {
  return (
    <div className={cn("space-y-0", className)}>
      {/* Header */}
      <div className="flex items-center gap-4 py-3 border-b-2">
        {Array.from({ length: columns }).map((_, i) => (
          <Skeleton
            key={i}
            className={cn("h-4", i === 0 ? "w-32" : "w-20", "flex-shrink-0")}
          />
        ))}
      </div>
      {/* Rows */}
      {Array.from({ length: rows }).map((_, i) => (
        <TableRowSkeleton key={i} columns={columns} />
      ))}
    </div>
  )
}

/**
 * Skeleton loader for integration/app card
 */
export function IntegrationCardSkeleton({ className }: { className?: string }) {
  return (
    <div className={cn("flex items-center gap-4 p-4 border rounded-lg", className)}>
      <Skeleton className="h-12 w-12 rounded-lg flex-shrink-0" />
      <div className="flex-1 space-y-2">
        <Skeleton className="h-5 w-32" />
        <Skeleton className="h-4 w-48" />
      </div>
      <Skeleton className="h-9 w-24 rounded-md" />
    </div>
  )
}

/**
 * Skeleton loader for integration list
 */
export function IntegrationListSkeleton({
  count = 4,
  className,
}: {
  count?: number
  className?: string
}) {
  return (
    <div className={cn("space-y-3", className)}>
      {Array.from({ length: count }).map((_, i) => (
        <IntegrationCardSkeleton key={i} />
      ))}
    </div>
  )
}

/**
 * Skeleton loader for form fields
 */
export function FormFieldSkeleton({ className }: { className?: string }) {
  return (
    <div className={cn("space-y-2", className)}>
      <Skeleton className="h-4 w-24" />
      <Skeleton className="h-10 w-full rounded-md" />
    </div>
  )
}

/**
 * Skeleton loader for form with multiple fields
 */
export function FormSkeleton({
  fields = 3,
  className,
}: {
  fields?: number
  className?: string
}) {
  return (
    <div className={cn("space-y-4", className)}>
      {Array.from({ length: fields }).map((_, i) => (
        <FormFieldSkeleton key={i} />
      ))}
      <div className="flex gap-3 pt-2">
        <Skeleton className="h-10 w-24 rounded-md" />
        <Skeleton className="h-10 w-20 rounded-md" />
      </div>
    </div>
  )
}

/**
 * Skeleton loader for activity/timeline items
 */
export function ActivityItemSkeleton({ className }: { className?: string }) {
  return (
    <div className={cn("flex gap-3 py-3", className)}>
      <Skeleton className="h-8 w-8 rounded-full flex-shrink-0" />
      <div className="flex-1 space-y-2">
        <Skeleton className="h-4 w-full max-w-xs" />
        <Skeleton className="h-3 w-24" />
      </div>
    </div>
  )
}

/**
 * Skeleton loader for activity list
 */
export function ActivityListSkeleton({
  count = 5,
  className,
}: {
  count?: number
  className?: string
}) {
  return (
    <div className={cn("divide-y", className)}>
      {Array.from({ length: count }).map((_, i) => (
        <ActivityItemSkeleton key={i} />
      ))}
    </div>
  )
}

/**
 * Skeleton loader for template card
 */
export function TemplateCardSkeleton({ className }: { className?: string }) {
  return (
    <Card className={cn("overflow-hidden", className)}>
      <CardHeader className="pb-2">
        <div className="flex items-start gap-3">
          <Skeleton className="h-10 w-10 rounded-lg flex-shrink-0" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-5 w-36" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-3/4" />
          </div>
        </div>
      </CardHeader>
      <CardContent className="pt-2">
        <div className="flex items-center gap-2">
          <Skeleton className="h-5 w-16 rounded-full" />
          <Skeleton className="h-5 w-20 rounded-full" />
        </div>
      </CardContent>
    </Card>
  )
}

/**
 * Skeleton loader for template grid
 */
export function TemplateGridSkeleton({
  count = 6,
  className,
}: {
  count?: number
  className?: string
}) {
  return (
    <div className={cn("grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4", className)}>
      {Array.from({ length: count }).map((_, i) => (
        <TemplateCardSkeleton key={i} />
      ))}
    </div>
  )
}

/**
 * Skeleton loader for sidebar navigation
 */
export function SidebarSkeleton({ className }: { className?: string }) {
  return (
    <div className={cn("space-y-1 p-2", className)}>
      {Array.from({ length: 6 }).map((_, i) => (
        <Skeleton
          key={i}
          className={cn("h-9 w-full rounded-md", i === 0 && "bg-primary/20")}
        />
      ))}
    </div>
  )
}

/**
 * Skeleton loader for profile/user card
 */
export function ProfileCardSkeleton({ className }: { className?: string }) {
  return (
    <div className={cn("flex items-center gap-3", className)}>
      <Skeleton className="h-10 w-10 rounded-full" />
      <div className="space-y-1">
        <Skeleton className="h-4 w-28" />
        <Skeleton className="h-3 w-36" />
      </div>
    </div>
  )
}

/**
 * Full page skeleton for loading states
 */
export function PageSkeleton({
  showStats = true,
  showGrid = true,
  className,
}: {
  showStats?: boolean
  showGrid?: boolean
  className?: string
}) {
  return (
    <div className={cn("space-y-6", className)}>
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-4 w-64" />
        </div>
        <Skeleton className="h-10 w-32 rounded-md" />
      </div>

      {/* Stats Cards */}
      {showStats && <StatsGridSkeleton />}

      {/* Content Grid */}
      {showGrid && <WorkflowGridSkeleton />}
    </div>
  )
}
