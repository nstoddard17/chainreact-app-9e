"use client"

import { TempPlaceholder } from "@/components/temp/TempPlaceholder"
import { TempButton } from "@/components/temp/TempButton"

export default function WaitlistTempPage() {
  return (
    <TempPlaceholder
      type="marketing"
      title="Join the waitlist"
      description="Waitlist flows adopt the new hero styling with trust-building proof points and social validation."
      actions={<TempButton>Reserve spot</TempButton>}
    />
  )
}

