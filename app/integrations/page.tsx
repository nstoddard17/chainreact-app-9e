"use client"

import { AuthGuard } from "@/components/auth/AuthGuard"
import IntegrationsContent from "@/components/integrations/IntegrationsContent"

export default function IntegrationsPage() {
  return (
    <AuthGuard>
      <IntegrationsContent />
    </AuthGuard>
  )
}
