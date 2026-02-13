import { NewAppLayout } from "@/components/new-design/layout/NewAppLayout"
import { PageLoadingSpinner } from "@/components/common/PageLoadingSpinner"

export default function Loading() {
  return (
    <NewAppLayout title="Workflows" subtitle="Your automation workflows">
      <PageLoadingSpinner message="Loading workflows..." />
    </NewAppLayout>
  )
}
