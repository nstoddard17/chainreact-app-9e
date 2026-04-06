import { Suspense } from "react"
import BillingContent from "@/components/billing/BillingContent"

import { logger } from '@/lib/utils/logger'

// Force dynamic rendering since billing uses auth and real-time data
export const dynamic = 'force-dynamic'

export default async function PaymentsPage() {
  // Validate required environment variables
  const requiredEnvVars = {
    STRIPE_CLIENT_SECRET: process.env.STRIPE_CLIENT_SECRET,
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
    NEXT_PUBLIC_BASE_URL: process.env.NEXT_PUBLIC_BASE_URL,
  }

  const missingVars = Object.entries(requiredEnvVars)
    .filter(([key, value]) => !value)
    .map(([key]) => key)

  if (missingVars.length > 0) {
    logger.warn(`Missing environment variables: ${missingVars.join(", ")}`)
  }

  return (
    <Suspense fallback={null}>
      <BillingContent />
    </Suspense>
  )
}
