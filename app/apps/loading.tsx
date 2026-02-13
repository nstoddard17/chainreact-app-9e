import { NewAppLayout } from "@/components/new-design/layout/NewAppLayout"
import { PageLoadingSpinner } from "@/components/common/PageLoadingSpinner"

export default function Loading() {
  return (
    <NewAppLayout title="Apps & Integrations" subtitle="Connect your favorite tools">
      <PageLoadingSpinner message="Loading apps..." />
    </NewAppLayout>
  )
}
