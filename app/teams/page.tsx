import { createSupabaseServerClient } from "@/utils/supabase/server"
import { cookies } from "next/headers"
import { redirect } from "next/navigation"
import TeamsContent from "@/components/teams/TeamsContent"

export default async function TeamsPage() {
  const supabase = await createSupabaseServerClient()

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser()

  if (userError || !user) {
    redirect("/auth/login")
  }

  return <TeamsContent />
}
