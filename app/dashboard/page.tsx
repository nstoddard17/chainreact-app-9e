import { Suspense } from "react"
import DashboardContent from "@/components/dashboard/DashboardContent"

export default function DashboardPage() {
  // Temporarily removed server-side auth check to debug loading issue
  // The client-side AppLayout will handle auth

  return (
    <Suspense fallback={null}>
      <DashboardContent />
    </Suspense>
  )
}
