import { NewAppLayout } from "@/components/new-design/layout/NewAppLayout"
import { PageLoadingSpinner } from "@/components/common/PageLoadingSpinner"

export default function Loading() {
  return (
    <NewAppLayout title="Analytics" subtitle="Monitor your workflow performance">
      <PageLoadingSpinner message="Loading analytics..." />
    </NewAppLayout>
  )
}
