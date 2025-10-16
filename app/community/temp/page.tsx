"use client"

import { TempPlaceholder } from "@/components/temp/TempPlaceholder"
import { TempButton } from "@/components/temp/TempButton"

export default function CommunityTempPage() {
  return (
    <TempPlaceholder
      type="marketing"
      title="Community hub"
      description="Preview of the community surface — curated resources, upcoming events, and spotlighted automations from teams like yours."
      actions={<TempButton>Join the forum</TempButton>}
    />
  )
}

