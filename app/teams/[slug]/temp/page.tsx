"use client"

import { TempPlaceholder } from "@/components/temp/TempPlaceholder"
import { useParams } from "next/navigation"

export default function TeamDetailTempPage() {
  const params = useParams<{ slug: string }>()
  const teamName = params?.slug?.replace(/-/g, " ") ?? "Team detail"

  return (
    <TempPlaceholder
      type="app"
      title={`Team • ${teamName}`}
      description="Team detail pages in the new system highlight shared automations, approvals, and workload balance."
    />
  )
}

