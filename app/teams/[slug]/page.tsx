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
  // Use service client to bypass RLS for performance
  const { createSupabaseServiceClient } = await import("@/utils/supabase/server")
  const serviceClient = await createSupabaseServiceClient()

  // First, get the team by slug
  const { data: team, error: teamError } = await serviceClient
    .from("teams")
    .select("id, name, slug, description, created_at, organization_id")
    .eq("slug", slug)
    .single()

  if (teamError || !team) {
    notFound()
  }

  // Then check if user is a member
  const { data: membership, error: membershipError } = await serviceClient
    .from("team_members")
    .select("role, joined_at")
    .eq("team_id", team.id)
    .eq("user_id", user.id)
    .single()

  if (membershipError || !membership) {
    notFound()
  }

  // Combine team data with user's membership info
  const teamWithMembership = {
    ...team,
    team_members: [membership]
  }

  return (
    <Suspense fallback={null}>
      <TeamDetailContent team={teamWithMembership} />
    </Suspense>
  )
}
