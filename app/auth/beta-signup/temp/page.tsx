"use client"

import { TempPlaceholder } from "@/components/temp/TempPlaceholder"
import { TempButton } from "@/components/temp/TempButton"

export default function BetaSignupTempPage() {
  return (
    <TempPlaceholder
      type="marketing"
      title="Beta signup"
      description="Show potential customers a premium, high-trust beta experience aligned with the overall redesign."
      actions={<TempButton>Apply for beta</TempButton>}
    />
  )
}

