import { createSupabaseServerClient } from "@/utils/supabase/server"
import { cookies } from "next/headers"
import { redirect } from "next/navigation"
import WorkflowBuilderClient from "@/components/workflows/WorkflowBuilderClient"

export default async function WorkflowBuilderPage() {
  const supabase = createSupabaseServerClient()

  const {
    data: { session },
  } = await supabase.auth.getSession()

  if (!session) {
    redirect("/auth/login")
  }

  return <WorkflowBuilderClient />
}
