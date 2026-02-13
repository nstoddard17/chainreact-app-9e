import { NewAppLayout } from "@/components/new-design/layout/NewAppLayout"
import { PageLoadingSpinner } from "@/components/common/PageLoadingSpinner"

export default function Loading() {
  return (
    <NewAppLayout title="Settings" subtitle="Manage your account and preferences">
      <PageLoadingSpinner message="Loading settings..." />
    </NewAppLayout>
  )
}
