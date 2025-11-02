import { Suspense } from "react"
import { createSupabaseServerClient, createSupabaseServiceClient } from "@/utils/supabase/server"
import { redirect, notFound } from "next/navigation"
import { TeamMembersContent } from "@/components/teams/TeamMembersContent"
import { Loader2 } from "lucide-react"

// Force dynamic rendering
export const dynamic = 'force-dynamic'

interface Props {
  params: Promise<{ slug: string }>
}

export default async function TeamMembersPage({ params }: Props) {
  const { slug } = await params
  const supabase = await createSupabaseServerClient()

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser()

  if (userError || !user) {
    redirect("/auth/login")
  }

  // Use service client to bypass RLS for the join query
  // This is safe because we're explicitly filtering by user.id
  const serviceSupabase = await createSupabaseServiceClient()

  // Get team by slug first
  const { data: team } = await serviceSupabase
    .from("teams")
    .select("*")
    .eq("slug", slug)
    .single()

  if (!team) {
    notFound()
  }

  // Check if user is a member of this team
  const { data: membership } = await serviceSupabase
    .from("team_members")
    .select("role")
    .eq("team_id", team.id)
    .eq("user_id", user.id)
    .single()

  if (!membership) {
    notFound()
  }

  return (
    <Suspense fallback={
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
      </div>
    }>
      <TeamMembersContent team={team} userRole={membership.role} />
    </Suspense>
  )
}
