"use client"

import { TempAppLayout } from "@/components/temp-redesign/layout/TempAppLayout"
import { AccessGuard } from "@/components/common/AccessGuard"
import { OrganizationPublicView } from "@/components/new-design/OrganizationPublicView"

export default function OrganizationTempPage() {
  return (
    <TempAppLayout title="Organization">
      <AccessGuard pathname="/organization">
        <OrganizationPublicView />
      </AccessGuard>
    </TempAppLayout>
  )
}
