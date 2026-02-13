import { NewAppLayout } from "@/components/new-design/layout/NewAppLayout"
import { PageLoadingSpinner } from "@/components/common/PageLoadingSpinner"

export default function Loading() {
  return (
    <NewAppLayout title="Template Library" subtitle="Pre-built workflows ready to use">
      <PageLoadingSpinner message="Loading templates..." />
    </NewAppLayout>
  )
}
