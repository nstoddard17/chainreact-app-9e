import { NewAppLayout } from "@/components/new-design/layout/NewAppLayout"
import { PageLoadingSpinner } from "@/components/common/PageLoadingSpinner"

export default function Loading() {
  return (
    <NewAppLayout title="Organization" subtitle="View your organization details">
      <PageLoadingSpinner message="Loading organization..." />
    </NewAppLayout>
  )
}
