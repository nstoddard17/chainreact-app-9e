import { NewAppLayout } from "@/components/new-design/layout/NewAppLayout"
import { PageLoadingSpinner } from "@/components/common/PageLoadingSpinner"

export default function Loading() {
  return (
    <NewAppLayout title="Teams" subtitle="Browse Teams">
      <PageLoadingSpinner message="Loading teams..." />
    </NewAppLayout>
  )
}
