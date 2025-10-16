"use client"

import { TempPlaceholder } from "@/components/temp/TempPlaceholder"
import { TempButton } from "@/components/temp/TempButton"

export default function AboutTempPage() {
  return (
    <TempPlaceholder
      type="marketing"
      title="About ChainReact"
      description="Meet the updated storytelling style — bold typography, purposeful color, and crisp photography placeholders."
      actions={<TempButton>See our story</TempButton>}
    />
  )
}

