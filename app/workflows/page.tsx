import { Suspense } from "react"
import WorkflowsContent from "@/components/workflows/WorkflowsContent"
import { requireUsername } from "@/utils/checkUsername"

// Server component that handles auth check
async function WorkflowsPageContent() {
  // This will check for username and redirect if needed
  await requireUsername()

  return <WorkflowsContent />
}

// Main page component - not async to fix navigation
export default function WorkflowsPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-gradient-to-br from-gray-50 via-white to-gray-100">
        <div className="p-8 max-w-7xl mx-auto">
          <div className="animate-pulse">
            <div className="h-10 w-48 bg-gray-200 rounded mb-2" />
            <div className="h-6 w-96 bg-gray-200 rounded" />
          </div>
        </div>
      </div>
    }>
      <WorkflowsPageContent />
    </Suspense>
  )
}
