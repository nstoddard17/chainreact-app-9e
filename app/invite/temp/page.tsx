"use client"

import { TempPlaceholder } from "@/components/temp/TempPlaceholder"
import { TempButton } from "@/components/temp/TempButton"

export default function InviteTempPage() {
  return (
    <TempPlaceholder
      type="marketing"
      title="Invite preview"
      description="This concept shows how invited teammates will experience a polished onboarding flow aligned with the new brand."
      actions={<TempButton>Accept invite</TempButton>}
    />
  )
}

