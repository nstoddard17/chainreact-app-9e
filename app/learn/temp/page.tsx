"use client"

import { TempPlaceholder } from "@/components/temp/TempPlaceholder"
import { TempButton } from "@/components/temp/TempButton"

export default function LearnTempPage() {
  return (
    <TempPlaceholder
      type="marketing"
      title="Learning center"
      description="Educational content will use the same refined hierarchy with playlists, certification callouts, and quick wins."
      actions={<TempButton>Explore lessons</TempButton>}
    />
  )
}

