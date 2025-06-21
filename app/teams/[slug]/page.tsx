import { createSupabaseServerClient } from "@/utils/supabase/server"
import { cookies } from "next/headers"
import { redirect, notFound } from "next/navigation"
import OrganizationContent from "@/components/teams/OrganizationContent"

interface Props {
  params: { slug: string }
}

export default async function OrganizationPage({ params }: Props) {
  const supabase = createSupabaseServerClient()

  const {
    data: { session },
  } = await supabase.auth.getSession()

  if (!session) {
    redirect("/auth/login")
  }

  // Check if organization exists and user has access
  const { data: organization } = await supabase
    .from("organizations")
    .select(`
      *,
      members:organization_members!inner(role)
    `)
    .eq("slug", params.slug)
    .eq("organization_members.user_id", session.user.id)
    .single()

  if (!organization) {
    notFound()
  }

  return <OrganizationContent organization={organization} />
}
