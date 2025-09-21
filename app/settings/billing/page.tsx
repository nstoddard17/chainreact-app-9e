import { Suspense } from "react"
import { requireUsername } from "@/utils/checkUsername"
import BillingContent from "@/components/billing/BillingContent"
import { getBaseUrl } from "@/lib/utils/getBaseUrl"

export default async function BillingPage() {
  // Validate required environment variables
  const requiredEnvVars = {
    STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY,
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
    NEXT_PUBLIC_BASE_URL: process.env.NEXT_PUBLIC_BASE_URL,
  }

  const missingVars = Object.entries(requiredEnvVars)
    .filter(([key, value]) => !value)
    .map(([key]) => key)

  if (missingVars.length > 0) {
    console.warn(`Missing environment variables: ${missingVars.join(", ")}`)
  }

  // This will check for username and redirect if needed
  await requireUsername()

  return (
    <Suspense fallback={null}>
      <BillingContent />
    </Suspense>
  )
}
