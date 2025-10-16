"use client"

import { TempPlaceholder } from "@/components/temp/TempPlaceholder"
import { TempButton } from "@/components/temp/TempButton"

export default function SettingsBillingTempPage() {
  return (
    <TempPlaceholder
      type="app"
      title="Billing & usage"
      description="Billing surfaces will get clearer renewal timelines, quiet alerts, and contextual upgrade guidance."
      actions={<TempButton>Review plan</TempButton>}
    />
  )
}

