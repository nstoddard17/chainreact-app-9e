"use client"

import { TempPlaceholder } from "@/components/temp/TempPlaceholder"
import { TempButton } from "@/components/temp/TempButton"

export default function TemplatesTempPage() {
  return (
    <TempPlaceholder
      type="marketing"
      title="Template gallery"
      description="See how the gallery will emphasise real outcomes, recommended integrations, and implementation guidance."
      actions={<TempButton>Browse templates</TempButton>}
    />
  )
}

