"use client"

import { TempPlaceholder } from "@/components/temp/TempPlaceholder"
import { TempButton } from "@/components/temp/TempButton"

export default function InviteSignupTempPage() {
  return (
    <TempPlaceholder
      type="marketing"
      title="Complete your signup"
      description="A softer signup experience with clear next steps, security messaging, and subtle motion."
      actions={<TempButton>Continue</TempButton>}
    />
  )
}

