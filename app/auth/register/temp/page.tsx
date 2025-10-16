"use client"

import { TempPlaceholder } from "@/components/temp/TempPlaceholder"
import { TempButton } from "@/components/temp/TempButton"

export default function RegisterTempPage() {
  return (
    <TempPlaceholder
      type="marketing"
      title="Create account"
      description="Sign-up in the refreshed system highlights benefits, trust signals, and clearly delineated fields."
      actions={<TempButton>Finish signup</TempButton>}
    />
  )
}

