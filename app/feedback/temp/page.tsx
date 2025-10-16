"use client"

import { TempPlaceholder } from "@/components/temp/TempPlaceholder"
import { TempButton } from "@/components/temp/TempButton"

export default function FeedbackTempPage() {
  return (
    <TempPlaceholder
      type="marketing"
      title="Share feedback"
      description="See how the refreshed system invites product ideas with a warmer palette and contextual examples."
      actions={<TempButton>Send idea</TempButton>}
    />
  )
}

