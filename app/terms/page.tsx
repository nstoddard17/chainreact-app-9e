"use client"

import { PublicPageHeader } from '@/components/layout/PublicPageHeader'
import { TempFooter } from '@/components/temp-landing/TempFooter'
import { TermsOfService } from '@/components/legal/TermsOfService'

export default function TermsPage() {
  return (
    <div className="min-h-screen bg-white">
      <PublicPageHeader breadcrumb="Terms of Service" />
      <TermsOfService />
      <TempFooter />
    </div>
  )
}
