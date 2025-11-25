import type { ReactNode } from "react"
import { Skeleton } from "@/components/ui/skeleton"

interface DashboardLoadingProps {
  title?: string
  subtitle?: string
  showFilters?: boolean
  statCards?: number
  children?: ReactNode
}

export function DashboardLoading({
  title = "Loading dashboard",
  subtitle = "Preparing your workspace...",
  showFilters = false,
  statCards = 3,
  children,
}: DashboardLoadingProps) {
  return (
    <div className="flex min-h-screen bg-gray-50 dark:bg-gray-950">
      <aside className="hidden md:flex w-64 flex-col gap-4 border-r bg-white/80 px-4 py-6 shadow-sm">
        <Skeleton className="h-10 w-32" />
        <div className="space-y-3">
          {Array.from({ length: 6 }).map((_, index) => (
            <Skeleton key={index} className="h-10 w-full rounded-lg" />
          ))}
        </div>
        <div className="mt-auto space-y-3">
          <Skeleton className="h-10 w-full rounded-lg" />
          <Skeleton className="h-10 w-full rounded-lg" />
        </div>
      </aside>

      <div className="flex-1 overflow-hidden">
        <div className="sr-only" aria-live="polite">
          {title} – {subtitle}
        </div>
        <header className="border-b bg-white/80 px-6 py-4 backdrop-blur">
          <div className="space-y-2">
            <Skeleton className="h-5 w-48" />
            <Skeleton className="h-4 w-72" />
          </div>
        </header>

        <main className="flex-1 overflow-y-auto px-6 py-6">
          <div className="space-y-6">
            <div className="space-y-2">
              <Skeleton className="h-6 w-56" />
              <Skeleton className="h-4 w-72" />
            </div>

            {showFilters && (
              <div className="flex flex-wrap gap-3">
                <Skeleton className="h-10 w-48" />
                <Skeleton className="h-10 w-32" />
                <Skeleton className="h-10 w-32" />
                <Skeleton className="h-10 w-24" />
              </div>
            )}

            {children ?? (
              <>
                <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                  {Array.from({ length: statCards }).map((_, index) => (
                    <div key={index} className="rounded-xl border bg-white/80 p-4 shadow-sm">
                      <Skeleton className="h-4 w-24" />
                      <Skeleton className="mt-3 h-8 w-16" />
                      <Skeleton className="mt-2 h-3 w-20" />
                    </div>
                  ))}
                </div>

                <div className="rounded-xl border bg-white/80 p-6 shadow-sm">
                  <div className="space-y-4">
                    {Array.from({ length: 4 }).map((_, index) => (
                      <div
                        key={index}
                        className="flex items-center justify-between gap-4 border-b pb-4 last:border-0 last:pb-0"
                      >
                        <div className="flex items-center gap-4">
                          <Skeleton className="h-12 w-12 rounded-lg" />
                          <div className="space-y-2">
                            <Skeleton className="h-4 w-44" />
                            <Skeleton className="h-4 w-32" />
                          </div>
                        </div>
                        <Skeleton className="h-9 w-24" />
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}
          </div>
        </main>
      </div>
    </div>
  )
}

export function BuilderLoadingSkeleton() {
  return (
    <DashboardLoading title="Loading builder" subtitle="Setting up your canvas..." showFilters>
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-3">
          {Array.from({ length: 4 }).map((_, index) => (
            <Skeleton key={index} className="h-10 w-28 rounded-lg" />
          ))}
        </div>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_320px]">
          <div className="rounded-xl border bg-white/80 p-4 shadow-sm">
            <div className="flex items-center justify-between">
              <Skeleton className="h-5 w-40" />
              <Skeleton className="h-8 w-24 rounded-lg" />
            </div>
            <div className="relative mt-4 h-[520px] overflow-hidden rounded-lg border bg-gradient-to-br from-gray-100 to-white">
              {Array.from({ length: 5 }).map((_, index) => (
                <div
                  key={index}
                  className="absolute flex items-center gap-3 rounded-lg border bg-white/80 p-3 shadow-sm"
                  style={{
                    top: 40 + index * 70,
                    left: 40 + (index % 2) * 120,
                  }}
                >
                  <Skeleton className="h-10 w-10 rounded-md" />
                  <div className="space-y-2">
                    <Skeleton className="h-4 w-28" />
                    <Skeleton className="h-3 w-20" />
                  </div>
                </div>
              ))}
              <Skeleton className="absolute inset-x-10 top-10 h-4 opacity-60" />
              <Skeleton className="absolute inset-x-20 bottom-10 h-4 opacity-60" />
            </div>
          </div>

          <div className="rounded-xl border bg-white/80 p-4 shadow-sm space-y-4">
            <Skeleton className="h-5 w-32" />
            {Array.from({ length: 5 }).map((_, index) => (
              <div key={index} className="space-y-2 rounded-lg border px-3 py-3">
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-3 w-24" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </DashboardLoading>
  )
}
