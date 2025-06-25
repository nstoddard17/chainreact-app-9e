import { createSupabaseServerClient } from "@/utils/supabase/server"
import { cookies } from "next/headers"
import { redirect } from "next/navigation"
import BillingContent from "@/components/billing/BillingContent"

export default async function BillingPage() {
  // Validate required environment variables
  const requiredEnvVars = {
    STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY,
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
  }

  const missingVars = Object.entries(requiredEnvVars)
    .filter(([key, value]) => !value)
    .map(([key]) => key)

  if (missingVars.length > 0) {
    console.warn(`Missing environment variables: ${missingVars.join(", ")}`)
  }

  const supabase = await createSupabaseServerClient()

  const {
    data: { session },
  } = await supabase.auth.getSession()

  if (!session) {
    redirect("/auth/login")
  }

  return <BillingContent />
}
