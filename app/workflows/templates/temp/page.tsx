"use client"

import { TempPlaceholder } from "@/components/temp/TempPlaceholder"
import { TempButton } from "@/components/temp/TempButton"

export default function WorkflowTemplatesTempPage() {
  return (
    <TempPlaceholder
      type="app"
      title="Workflow templates"
      description="Template browsing in the redesign provides richer previews, integration requirements, and expected effort."
      actions={<TempButton>Use template</TempButton>}
    />
  )
}

