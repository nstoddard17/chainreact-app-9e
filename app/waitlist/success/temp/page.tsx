"use client"

import { TempPlaceholder } from "@/components/temp/TempPlaceholder"
import { TempButton } from "@/components/temp/TempButton"

export default function WaitlistSuccessTempPage() {
  return (
    <TempPlaceholder
      type="marketing"
      title="You’re on the list!"
      description="Success confirmations in the redesign pair celebratory copy with clear next steps and shareable CTAs."
      actions={<TempButton>Share with team</TempButton>}
    />
  )
}

