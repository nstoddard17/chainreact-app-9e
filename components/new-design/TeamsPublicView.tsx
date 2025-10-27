"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { useAuthStore } from "@/stores/authStore"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Users,
  Loader2,
  User as UserIcon,
  Shield,
  Settings,
  Plus
} from "lucide-react"
import { toast } from "sonner"
import { Badge } from "@/components/ui/badge"
import { CreateTeamDialog } from "./CreateTeamDialog"

interface Team {
  id: string
  name: string
  slug: string
  description?: string
  organization_id?: string
  workspace_id?: string
  member_count: number
  user_role?: string
  created_at: string
}

export function TeamsPublicView() {
  const router = useRouter()
  const { user } = useAuthStore()
  const [teams, setTeams] = useState<Team[]>([])
  const [loading, setLoading] = useState(true)
  const [createTeamDialogOpen, setCreateTeamDialogOpen] = useState(false)

  useEffect(() => {
    if (user) {
      fetchUserTeams()
    }
  }, [user])

  const fetchUserTeams = async () => {
    try {
      setLoading(true)

      // Fetch teams where user is a member directly from team_members
      const response = await fetch('/api/teams/my-teams')
      if (!response.ok) {
        // If endpoint doesn't exist yet, fallback to fetching all orgs and getting teams
        const orgsResponse = await fetch('/api/organizations')
        if (!orgsResponse.ok) throw new Error('Failed to fetch data')

        const { organizations } = await orgsResponse.json()

        // Filter to real organizations only
        const realOrgs = organizations.filter((org: any) =>
          !org.is_workspace && org.team_count > 0
        )

        if (realOrgs.length === 0) {
          setTeams([])
          setLoading(false)
          return
        }

        // Fetch teams for each organization
        const allTeams: Team[] = []
        for (const org of realOrgs) {
          const teamsResponse = await fetch(`/api/organizations/${org.id}/teams`)
          if (teamsResponse.ok) {
            const { teams: orgTeams } = await teamsResponse.json()
            allTeams.push(...(orgTeams || []))
          }
        }

        setTeams(allTeams)
      } else {
        const { teams } = await response.json()
        setTeams(teams || [])
      }
    } catch (error) {
      console.error('Error fetching teams:', error)
      toast.error('Failed to load teams')
      setTeams([])
    } finally {
      setLoading(false)
    }
  }

  const getRoleBadge = (role?: string) => {
    if (!role) return null

    switch (role) {
      case 'owner':
        return <Badge className="bg-yellow-500">Owner</Badge>
      case 'admin':
        return <Badge variant="secondary">Admin</Badge>
      case 'member':
        return <Badge variant="outline">Member</Badge>
      default:
        return <Badge variant="outline">Viewer</Badge>
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  // Show empty state if no teams
  if (teams.length === 0) {
    return (
      <div className="h-full w-full flex items-center justify-center">
        <Card className="max-w-2xl w-full">
          <CardHeader className="text-center">
            <div className="mx-auto w-12 h-12 rounded-full bg-muted flex items-center justify-center mb-4">
              <Users className="w-6 h-6 text-muted-foreground" />
            </div>
            <CardTitle>No Teams Yet</CardTitle>
            <CardDescription>
              You are not a member of any teams. Create a team to start collaborating.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button
              className="w-full"
              onClick={() => setCreateTeamDialogOpen(true)}
            >
              <Plus className="w-4 h-4 mr-2" />
              Create Team
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  // Show teams list
  return (
    <div className="h-full w-full space-y-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Teams</h1>
          <p className="text-muted-foreground mt-1">
            Browse and manage teams in your organization
          </p>
        </div>
        <Button onClick={() => setCreateTeamDialogOpen(true)}>
          <Plus className="w-4 h-4 mr-2" />
          Create Team
        </Button>
      </div>

      {/* Teams Grid */}
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {teams.map((team) => {
          const isAdmin = team.user_role === 'owner' || team.user_role === 'admin'

          return (
            <Card key={team.id} className="hover:shadow-lg transition-shadow">
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center mb-3">
                    <Users className="w-5 h-5 text-primary" />
                  </div>
                  {team.user_role && getRoleBadge(team.user_role)}
                </div>
                <CardTitle className="text-xl">{team.name}</CardTitle>
                <CardDescription className="line-clamp-2">
                  {team.description || 'No description provided'}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <UserIcon className="w-4 h-4" />
                    <span>{team.member_count} {team.member_count === 1 ? 'member' : 'members'}</span>
                  </div>
                </div>

                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex-1"
                    onClick={() => router.push(`/teams/${team.id}`)}
                  >
                    View Team
                  </Button>
                  {isAdmin && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => router.push(`/team-settings?team=${team.id}`)}
                    >
                      <Settings className="w-4 h-4" />
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          )
        })}
      </div>

      {/* Create Team Dialog */}
      <CreateTeamDialog
        open={createTeamDialogOpen}
        onOpenChange={setCreateTeamDialogOpen}
        organizationId={teams[0]?.organization_id}
      />
    </div>
  )
}
