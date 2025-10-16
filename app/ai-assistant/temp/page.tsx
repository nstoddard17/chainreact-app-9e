"use client"

import { TempPlaceholder } from "@/components/temp/TempPlaceholder"
import { TempButton } from "@/components/temp/TempButton"

export default function AIAssistantTempPage() {
  return (
    <TempPlaceholder
      type="app"
      title="AI assistants"
      description="Concept for the new assistant builder with explicit guardrails, testing sandboxes, and prompt versioning."
      actions={<TempButton>Create assistant</TempButton>}
    />
  )
}

