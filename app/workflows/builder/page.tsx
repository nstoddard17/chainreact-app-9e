import { createSupabaseServerClient } from "@/utils/supabase/server"
import { cookies } from "next/headers"
import { redirect } from "next/navigation"
import WorkflowBuilderClient from "@/components/workflows/WorkflowBuilderClient"

export default async function WorkflowBuilderPage() {
  const supabase = await createSupabaseServerClient()

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser()

  if (userError || !user) {
    redirect("/auth/login")
  }

  return <WorkflowBuilderClient />
}
