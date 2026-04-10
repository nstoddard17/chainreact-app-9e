import { TemplateGallery } from "@/components/templates/TemplateGallery"

// Force dynamic rendering since templates uses auth
export const dynamic = 'force-dynamic'

// Templates page component
export default async function WorkflowTemplatesPage() {
  return (
    <div className="p-6">
      <TemplateGallery />
    </div>
  )
}
