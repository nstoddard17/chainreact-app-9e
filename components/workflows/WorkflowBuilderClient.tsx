"use client"

import { lazy, Suspense } from "react"
import { ReactFlowProvider } from "@xyflow/react"
import { Skeleton } from "@/components/ui/skeleton"

// Lazy load the heavy workflow builder component
const LazyCollaborativeWorkflowBuilder = lazy(() => import("@/components/workflows/CollaborativeWorkflowBuilder"))

// Loading skeleton for the workflow builder
const WorkflowBuilderSkeleton = () => (
  <div className="h-screen flex flex-col">
    <div className="flex items-center justify-between p-4 border-b">
      <Skeleton className="h-6 w-48" />
      <div className="flex space-x-2">
        <Skeleton className="h-8 w-16" />
        <Skeleton className="h-8 w-20" />
      </div>
    </div>
    <div className="flex-1 flex">
      <div className="w-1/4 border-r p-4">
        <Skeleton className="h-8 w-full mb-4" />
        <div className="space-y-2">
          {[...Array(5)].map((_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      </div>
      <div className="flex-1 p-4">
        <Skeleton className="h-full w-full rounded-lg" />
      </div>
    </div>
  </div>
)

export default function WorkflowBuilderClient() {
  return (
    <ReactFlowProvider>
      <Suspense fallback={<WorkflowBuilderSkeleton />}>
        <LazyCollaborativeWorkflowBuilder />
      </Suspense>
    </ReactFlowProvider>
  )
}
