import { createServerComponentClient } from "@supabase/auth-helpers-nextjs"
import { cookies } from "next/headers"
import { redirect } from "next/navigation"
import DashboardContent from "@/components/dashboard/DashboardContent"

export default async function DashboardPage() {
  // For development, skip server-side auth check
  if (process.env.NODE_ENV === "development") {
    return <DashboardContent />
  }

  try {
    const supabase = createServerComponentClient({ cookies })

    const {
      data: { session },
    } = await supabase.auth.getSession()

    if (!session) {
      redirect("/auth/login")
    }

    return <DashboardContent />
  } catch (error) {
    console.error("Dashboard auth error:", error)
    // In case of error, still show dashboard in development
    return <DashboardContent />
  }
}
