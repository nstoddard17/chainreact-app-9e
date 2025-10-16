"use client"

import { TempPlaceholder } from "@/components/temp/TempPlaceholder"
import { TempButton } from "@/components/temp/TempButton"

export default function ApiDocsTempPage() {
  return (
    <TempPlaceholder
      type="marketing"
      title="Developer documentation"
      description="A glimpse at how the new documentation pages will feel — tighter layout, dark-friendly code blocks, and richer quickstart flows."
      actions={<TempButton>Open interactive docs</TempButton>}
    />
  )
}

