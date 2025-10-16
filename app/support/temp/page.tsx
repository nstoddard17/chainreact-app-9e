"use client"

import { TempPlaceholder } from "@/components/temp/TempPlaceholder"
import { TempButton } from "@/components/temp/TempButton"

export default function SupportTempPage() {
  return (
    <TempPlaceholder
      type="marketing"
      title="Support center"
      description="Support will feature guided triage, proactive incident notices, and personalisation in the refreshed experience."
      actions={<TempButton>Contact support</TempButton>}
    />
  )
}

