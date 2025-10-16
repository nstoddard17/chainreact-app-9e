"use client"

import { TempPlaceholder } from "@/components/temp/TempPlaceholder"
import { TempButton } from "@/components/temp/TempButton"

export default function EnterpriseTempPage() {
  return (
    <TempPlaceholder
      type="marketing"
      title="Enterprise"
      description="Enterprise pages leverage the premium palette with proof points, security backing, and customer references."
      actions={<TempButton>Talk to sales</TempButton>}
    />
  )
}

