import { Suspense } from "react"
import { OrganizationSettingsContent } from "@/components/new-design/OrganizationSettingsContent"
import { SettingsPageSkeleton } from "@/components/common/PageSkeleton"

export const dynamic = 'force-dynamic'

export default async function OrganizationSettingsPage({
  params,
}: {
  params: Promise<{ slug: string; section?: string[] }>
}) {
  const { slug, section } = await params

  return (
    <Suspense fallback={<SettingsPageSkeleton />}>
      <OrganizationSettingsContent slugParam={slug} sectionParam={section?.[0] || 'general'} />
    </Suspense>
  )
}
