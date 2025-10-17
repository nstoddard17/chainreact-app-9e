import AppLayout from "@/components/layout/AppLayout"
import { TemplateGalleryRedesign } from "@/components/templates/TemplateGalleryRedesign"
import { requireUsername } from "@/utils/checkUsername"

// Force dynamic rendering since templates uses auth
export const dynamic = 'force-dynamic'

export default async function WorkflowTemplatesNewPage() {
  await requireUsername()

  return (
    <AppLayout
      title="Workflow Templates"
      subtitle="Browse and customize professional automation templates"
    >
      <TemplateGalleryRedesign />
    </AppLayout>
  )
}
