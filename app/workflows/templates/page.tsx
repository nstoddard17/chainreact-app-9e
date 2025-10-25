import { NewAppLayout } from "@/components/new-design/layout/NewAppLayout"
import { TemplateGallery } from "@/components/templates/TemplateGallery"
import { requireUsername } from "@/utils/checkUsername"

// Force dynamic rendering since templates uses auth
export const dynamic = 'force-dynamic'

// Templates page component
export default async function WorkflowTemplatesPage() {
  // This will check for username and redirect if needed
  await requireUsername()

  return (
    <NewAppLayout title="Templates" subtitle="Pre-built workflows ready to use">
      <div className="p-6">
        <TemplateGallery />
      </div>
    </NewAppLayout>
  )
}
