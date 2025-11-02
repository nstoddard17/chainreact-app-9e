import { Suspense } from "react"
import { createSupabaseServerClient } from "@/utils/supabase/server"
import { redirect, notFound } from "next/navigation"
import TeamDetailContent from "@/components/teams/TeamDetailContent"

// Force dynamic rendering since teams uses auth and real-time data
export const dynamic = 'force-dynamic'

interface Props {
  params: Promise<{ slug: string }>
}

export default async function TeamDetailPage({ params }: Props) {
  const { slug } = await params
  const supabase = await createSupabaseServerClient()

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser()

  if (userError || !user) {
    redirect("/auth/login")
  }

  // Check if team exists and user has access
  const { data: team } = await supabase
    .from("teams")
    .select(`
      *,
      team_members!inner(role, joined_at)
    `)
    .eq("slug", slug)
    .eq("team_members.user_id", user.id)
    .single()

  if (!team) {
    notFound()
  }

  return (
    <Suspense fallback={null}>
      <TeamDetailContent team={team} />
    </Suspense>
  )
}
