"use client"

import { TempAppLayout } from "@/components/temp-redesign/layout/TempAppLayout"
import { AccessGuard } from "@/components/common/AccessGuard"
import { TeamsPublicView } from "@/components/new-design/TeamsPublicView"

export default function TeamsTempPage() {
  return (
    <TempAppLayout title="Teams">
      <AccessGuard pathname="/teams">
        <TeamsPublicView />
      </AccessGuard>
    </TempAppLayout>
  )
}
