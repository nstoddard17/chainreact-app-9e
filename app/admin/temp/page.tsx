"use client"

import { TempPlaceholder } from "@/components/temp/TempPlaceholder"
import { TempButton } from "@/components/temp/TempButton"

export default function AdminTempPage() {
  return (
    <TempPlaceholder
      type="app"
      title="Admin control center"
      description="Concept layout for global workspace governance, release rollouts, and audit observability."
      actions={<TempButton>Review governance</TempButton>}
    />
  )
}

