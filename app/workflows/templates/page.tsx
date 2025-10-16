import AppLayout from "@/components/layout/AppLayout"
import { TemplateGallery } from "@/components/templates/TemplateGallery"
import { requireUsername } from "@/utils/checkUsername"

// Force dynamic rendering since templates uses auth
export const dynamic = 'force-dynamic'

// Templates page component
export default async function WorkflowTemplatesPage() {
  // This will check for username and redirect if needed
  await requireUsername()

  return (
    <AppLayout title="Templates">
      <div className="p-6">
        <TemplateGallery />
      </div>
    </AppLayout>
  )
}
