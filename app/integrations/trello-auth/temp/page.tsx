"use client"

import { TempPlaceholder } from "@/components/temp/TempPlaceholder"
import { TempButton } from "@/components/temp/TempButton"

export default function TrelloAuthTempPage() {
  return (
    <TempPlaceholder
      type="marketing"
      title="Trello authorisation"
      description="A preview of the streamlined OAuth handoff — concise copy, clear security messaging, and instant status feedback."
      actions={<TempButton>Connect Trello</TempButton>}
    />
  )
}

