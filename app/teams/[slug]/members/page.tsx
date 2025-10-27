import { Suspense } from "react"
import { createSupabaseServerClient } from "@/utils/supabase/server"
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

  // Get team by slug and check user access
  const { data: team } = await supabase
    .from("teams")
    .select(`
      *,
      members:team_members!inner(role)
    `)
    .eq("slug", slug)
    .eq("team_members.user_id", user.id)
    .single()

  if (!team) {
    notFound()
  }

  return (
    <Suspense fallback={
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
      </div>
    }>
      <TeamMembersContent team={team} userRole={team.members[0]?.role} />
    </Suspense>
  )
}
