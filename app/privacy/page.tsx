"use client"

import { PublicPageHeader } from '@/components/layout/PublicPageHeader'
import { TempFooter } from '@/components/temp-landing/TempFooter'
import { PrivacyPolicy } from '@/components/legal/PrivacyPolicy'

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-white">
      <PublicPageHeader breadcrumb="Privacy Policy" />
      <PrivacyPolicy />
      <TempFooter />
    </div>
  )
}
