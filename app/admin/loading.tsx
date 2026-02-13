import { NewAppLayout } from "@/components/new-design/layout/NewAppLayout"
import { PageLoadingSpinner } from "@/components/common/PageLoadingSpinner"

export default function Loading() {
  return (
    <NewAppLayout title="Admin Panel" subtitle="System administration and user management">
      <PageLoadingSpinner message="Loading admin panel..." />
    </NewAppLayout>
  )
}
