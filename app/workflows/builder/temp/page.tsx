"use client"

import { TempPlaceholder } from "@/components/temp/TempPlaceholder"
import { TempButton } from "@/components/temp/TempButton"

export default function WorkflowBuilderTempPage() {
  return (
    <TempPlaceholder
      type="app"
      title="Workflow builder"
      description="Canvas tooling in the redesign gets better spacing, contextual action bars, and live guardrail feedback."
      actions={<TempButton>Open designer</TempButton>}
    />
  )
}

