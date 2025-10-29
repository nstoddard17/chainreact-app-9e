import { LoadingScreen } from "@/components/ui/loading-screen"

export default function Loading() {
  return (
    <div className="min-h-screen flex items-center justify-center">
      <LoadingScreen
        title="Loading Billing"
        description="Preparing your billing information..."
        size="lg"
      />
    </div>
  )
}
