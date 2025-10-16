"use client"

import { TempPlaceholder } from "@/components/temp/TempPlaceholder"
import { TempButton } from "@/components/temp/TempButton"

export default function AuthLoginTempPage() {
  return (
    <TempPlaceholder
      type="marketing"
      title="Sign in"
      description="Authentication flows borrow the same calm visuals with clear trust markers and minimal friction."
      actions={<TempButton>Continue to app</TempButton>}
    />
  )
}

