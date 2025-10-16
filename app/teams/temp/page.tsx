"use client"

import { TempPlaceholder } from "@/components/temp/TempPlaceholder"
import { TempButton } from "@/components/temp/TempButton"

export default function TeamsTempPage() {
  return (
    <TempPlaceholder
      type="app"
      title="Teams"
      description="Workspace collaboration now emphasises ownership, accountability, and quick access to shared automations."
      actions={<TempButton>Invite teammate</TempButton>}
    />
  )
}

