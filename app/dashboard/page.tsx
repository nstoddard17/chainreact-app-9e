import { Suspense } from "react"
import DashboardContent from "@/components/dashboard/DashboardContent"
import { PageLoader } from "@/components/ui/page-loader"

// Force dynamic rendering since dashboard uses auth and real-time data
export const dynamic = 'force-dynamic'

export default function DashboardPage() {
  // Client-side AppLayout will handle auth
  return (
    <Suspense fallback={<PageLoader message="Loading dashboard..." />}>
      <DashboardContent />
    </Suspense>
  )
}
