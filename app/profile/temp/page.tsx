"use client"

import { TempPlaceholder } from "@/components/temp/TempPlaceholder"
import { TempButton } from "@/components/temp/TempButton"

export default function ProfileTempPage() {
  return (
    <TempPlaceholder
      type="app"
      title="Profile"
      description="Account settings will gain richer personalisation, notification controls, and security signals."
      actions={<TempButton>Update profile</TempButton>}
    />
  )
}

