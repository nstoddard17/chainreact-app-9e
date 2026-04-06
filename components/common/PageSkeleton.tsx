"use client"

/**
 * Skeleton loading components that mimic page layouts.
 * Used by loading.tsx files to show grey placeholder blocks
 * that match the shape of the actual content, preventing pop-in.
 */

function SkeletonBlock({ className }: { className?: string }) {
  return (
    <div className={`animate-pulse rounded-lg bg-gray-200 dark:bg-gray-800 ${className ?? ""}`} />
  )
}

function SkeletonLine({ className }: { className?: string }) {
  return (
    <div className={`animate-pulse rounded bg-gray-200 dark:bg-gray-800 h-4 ${className ?? ""}`} />
  )
}

/** Header row: title + action button */
function SkeletonHeader() {
  return (
    <div className="flex items-center justify-between mb-6">
      <SkeletonBlock className="h-8 w-48" />
      <SkeletonBlock className="h-9 w-32 rounded-md" />
    </div>
  )
}

/** Card-style skeleton */
function SkeletonCard({ className }: { className?: string }) {
  return (
    <div className={`rounded-xl border border-gray-200 dark:border-gray-800 p-5 space-y-3 ${className ?? ""}`}>
      <SkeletonBlock className="h-5 w-2/5" />
      <SkeletonLine className="w-4/5" />
      <SkeletonLine className="w-3/5" />
    </div>
  )
}

/** Generic page skeleton — header + cards grid */
export function PageSkeleton() {
  return (
    <div className="p-6 space-y-6 w-full">
      <SkeletonHeader />
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        <SkeletonCard />
        <SkeletonCard />
        <SkeletonCard />
        <SkeletonCard />
        <SkeletonCard />
        <SkeletonCard />
      </div>
    </div>
  )
}

/** List-style skeleton — header + rows (workflows, teams, etc.) */
export function ListPageSkeleton() {
  return (
    <div className="p-6 space-y-6 w-full">
      <SkeletonHeader />
      {/* Search bar */}
      <SkeletonBlock className="h-10 w-full max-w-sm rounded-md" />
      {/* Table/list rows */}
      <div className="space-y-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="flex items-center gap-4 p-4 rounded-lg border border-gray-200 dark:border-gray-800">
            <SkeletonBlock className="h-10 w-10 rounded-full flex-shrink-0" />
            <div className="flex-1 space-y-2">
              <SkeletonLine className="w-1/3" />
              <SkeletonLine className="w-1/2" />
            </div>
            <SkeletonBlock className="h-8 w-20 rounded-md flex-shrink-0" />
          </div>
        ))}
      </div>
    </div>
  )
}

/** Settings-style skeleton — sidebar + content area */
export function SettingsPageSkeleton() {
  return (
    <div className="p-6 flex gap-6 w-full">
      {/* Sidebar nav */}
      <div className="w-48 space-y-2 flex-shrink-0">
        {Array.from({ length: 5 }).map((_, i) => (
          <SkeletonBlock key={i} className="h-9 w-full rounded-md" />
        ))}
      </div>
      {/* Content */}
      <div className="flex-1 space-y-6">
        <SkeletonBlock className="h-8 w-48" />
        <div className="space-y-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="space-y-2">
              <SkeletonLine className="w-24" />
              <SkeletonBlock className="h-10 w-full rounded-md" />
            </div>
          ))}
        </div>
        <SkeletonBlock className="h-10 w-32 rounded-md" />
      </div>
    </div>
  )
}

/** Builder-style skeleton — full canvas area */
export function BuilderPageSkeleton() {
  return (
    <div className="h-full w-full flex">
      {/* Canvas area */}
      <div className="flex-1 flex items-center justify-center">
        <div className="space-y-4 flex flex-col items-center">
          <SkeletonBlock className="h-16 w-48 rounded-xl" />
          <SkeletonBlock className="h-10 w-px bg-gray-300 dark:bg-gray-700" />
          <SkeletonBlock className="h-16 w-48 rounded-xl" />
          <SkeletonBlock className="h-10 w-px bg-gray-300 dark:bg-gray-700" />
          <SkeletonBlock className="h-16 w-48 rounded-xl" />
        </div>
      </div>
      {/* Right panel */}
      <div className="w-80 border-l border-gray-200 dark:border-gray-800 p-4 space-y-4">
        <SkeletonBlock className="h-6 w-32" />
        <SkeletonLine className="w-full" />
        <SkeletonLine className="w-4/5" />
        <SkeletonBlock className="h-10 w-full rounded-md" />
      </div>
    </div>
  )
}

/** Analytics-style skeleton — header + stat cards + chart */
export function AnalyticsPageSkeleton() {
  return (
    <div className="p-6 space-y-6 w-full">
      <SkeletonHeader />
      {/* Stat cards row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="rounded-xl border border-gray-200 dark:border-gray-800 p-4 space-y-2">
            <SkeletonLine className="w-20" />
            <SkeletonBlock className="h-8 w-24" />
          </div>
        ))}
      </div>
      {/* Chart area */}
      <SkeletonBlock className="h-64 w-full rounded-xl" />
    </div>
  )
}
