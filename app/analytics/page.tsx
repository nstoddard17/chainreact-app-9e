import { createSupabaseServerClient } from "@/utils/supabase/server"
import { cookies } from "next/headers"
import { redirect } from "next/navigation"
import AnalyticsContent from "@/components/analytics/AnalyticsContent"

export default async function AnalyticsPage() {
  cookies()
  const supabase = await createSupabaseServerClient()

  const {
    data: { session },
  } = await supabase.auth.getSession()

  if (!session) {
    redirect("/auth/login")
  }

  return <AnalyticsContent />
}
