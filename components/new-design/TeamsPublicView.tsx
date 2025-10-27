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
  Plus,
  MoreHorizontal
} from "lucide-react"
import { toast } from "sonner"
import { Badge } from "@/components/ui/badge"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
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

  const handleViewMembers = (team: Team) => {
    router.push(`/teams/${team.slug}/members`)
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
      <>
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

        {/* Create Team Dialog */}
        <CreateTeamDialog
          open={createTeamDialogOpen}
          onOpenChange={setCreateTeamDialogOpen}
          onTeamCreated={fetchUserTeams}
        />
      </>
    )
  }

  // Show teams list
  return (
    <div className="h-full w-full">
      {/* Header */}
      <div className="px-6 py-4 border-b bg-white">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">My Teams</h1>
            <p className="text-muted-foreground text-sm mt-1">
              {teams.length} {teams.length === 1 ? 'team' : 'teams'}
            </p>
          </div>
          <Button onClick={() => setCreateTeamDialogOpen(true)}>
            <Plus className="w-4 h-4 mr-2" />
            Create Team
          </Button>
        </div>
      </div>

      {/* Teams List */}
      <div className="p-6">
        <div className="bg-white rounded-lg border">
          <table className="w-full">
            <thead>
              <tr className="border-b bg-slate-50">
                <th className="text-left p-4 font-semibold text-sm text-slate-600">Team</th>
                <th className="text-left p-4 font-semibold text-sm text-slate-600">Description</th>
                <th className="text-left p-4 font-semibold text-sm text-slate-600">Members</th>
                <th className="text-left p-4 font-semibold text-sm text-slate-600">Role</th>
                <th className="text-right p-4 font-semibold text-sm text-slate-600">Actions</th>
              </tr>
            </thead>
            <tbody>
              {teams.map((team) => {
                // Roles that can access settings: owner, admin, manager, hr, finance
                const canAccessSettings = team.user_role && ['owner', 'admin', 'manager', 'hr', 'finance'].includes(team.user_role)

                return (
                  <tr
                    key={team.id}
                    className="border-b last:border-b-0 hover:bg-slate-50 cursor-pointer transition-colors"
                    onClick={() => router.push(`/teams/${team.slug}`)}
                  >
                    {/* Team Name & Icon */}
                    <td className="p-4">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-lg bg-blue-50 flex items-center justify-center flex-shrink-0">
                          <Users className="w-5 h-5 text-blue-600" />
                        </div>
                        <div>
                          <div className="font-semibold text-slate-900">{team.name}</div>
                          <div className="text-xs text-slate-500">{team.slug}</div>
                        </div>
                      </div>
                    </td>

                    {/* Description */}
                    <td className="p-4">
                      <div className="text-sm text-slate-600 line-clamp-2 max-w-md">
                        {team.description || 'No description'}
                      </div>
                    </td>

                    {/* Members */}
                    <td className="p-4">
                      <div className="flex items-center gap-2 text-sm text-slate-600">
                        <UserIcon className="w-4 h-4" />
                        <span>{team.member_count} {team.member_count === 1 ? 'member' : 'members'}</span>
                      </div>
                    </td>

                    {/* Role */}
                    <td className="p-4">
                      {team.user_role && getRoleBadge(team.user_role)}
                    </td>

                    {/* Actions */}
                    <td className="p-4" onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center justify-end gap-2">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-8 w-8 p-0"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <MoreHorizontal className="w-4 h-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-48">
                            <DropdownMenuItem
                              onSelect={(e) => {
                                e.preventDefault()
                                handleViewMembers(team)
                              }}
                            >
                              <UserIcon className="w-4 h-4 mr-2" />
                              View Members
                            </DropdownMenuItem>
                            {canAccessSettings && (
                              <DropdownMenuItem
                                onSelect={(e) => {
                                  e.preventDefault()
                                  router.push(`/team-settings?team=${team.id}`)
                                }}
                              >
                                <Settings className="w-4 h-4 mr-2" />
                                Settings
                              </DropdownMenuItem>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Create Team Dialog */}
      <CreateTeamDialog
        open={createTeamDialogOpen}
        onOpenChange={setCreateTeamDialogOpen}
        organizationId={teams[0]?.organization_id}
        onTeamCreated={fetchUserTeams}
      />
    </div>
  )
}
