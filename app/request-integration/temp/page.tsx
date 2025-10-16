"use client"

import { TempPlaceholder } from "@/components/temp/TempPlaceholder"
import { TempButton } from "@/components/temp/TempButton"

export default function RequestIntegrationTempPage() {
  return (
    <TempPlaceholder
      type="marketing"
      title="Request an integration"
      description="Here’s how the streamlined request flow will look — focused questions, transparent timelines, and status tracking."
      actions={<TempButton>Submit request</TempButton>}
    />
  )
}

