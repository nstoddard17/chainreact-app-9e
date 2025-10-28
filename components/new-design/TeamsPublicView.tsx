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
  Settings,
  Plus,
  MoreHorizontal,
  Check,
  X,
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
import { logger } from "@/lib/utils/logger"

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

interface Invitation {
  id: string
  team_id: string
  role: string
  status: string
  invited_at: string
  expires_at: string
  team: {
    id: string
    name: string
    description?: string
  }
}

export function TeamsPublicView() {
  const router = useRouter()
  const { user, profile } = useAuthStore()
  const [teams, setTeams] = useState<Team[]>([])
  const [invitations, setInvitations] = useState<Invitation[]>([])
  const [loading, setLoading] = useState(true)
  const [processingInvitation, setProcessingInvitation] = useState<string | null>(null)
  const [createTeamDialogOpen, setCreateTeamDialogOpen] = useState(false)

  useEffect(() => {
    if (user) {
      fetchUserTeams()
      fetchInvitations()
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
      logger.error('Error fetching teams:', error)
      toast.error('Failed to load teams')
      setTeams([])
    } finally {
      setLoading(false)
    }
  }

  const fetchInvitations = async () => {
    try {
      const response = await fetch('/api/teams/my-invitations')
      if (response.ok) {
        const { invitations: data } = await response.json()
        setInvitations(data || [])
      }
    } catch (error) {
      logger.error('Error fetching invitations:', error)
    }
  }

  const handleAcceptInvitation = async (invitationId: string, e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()

    try {
      setProcessingInvitation(invitationId)

      const response = await fetch(`/api/teams/invitations/${invitationId}`, {
        method: 'POST'
      })

      if (!response.ok) {
        const error = await response.json()

        // Check if error is due to free plan
        if (response.status === 403 && error.error?.includes('upgrade')) {
          toast.error('You need to upgrade to a Pro plan or higher to join teams')
          // Redirect to upgrade page
          router.push('/settings/billing')
          return
        }

        throw new Error(error.error || 'Failed to accept invitation')
      }

      const { team } = await response.json()
      toast.success(`Welcome to ${team.name}!`)

      // Refresh both lists
      fetchUserTeams()
      fetchInvitations()
    } catch (error) {
      logger.error('Error accepting invitation:', error)
      toast.error(error instanceof Error ? error.message : 'Failed to accept invitation')
    } finally {
      setProcessingInvitation(null)
    }
  }

  const handleDeclineInvitation = async (invitationId: string, e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()

    try {
      setProcessingInvitation(invitationId)

      const response = await fetch(`/api/teams/invitations/${invitationId}`, {
        method: 'DELETE'
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to decline invitation')
      }

      toast.success('Invitation declined')

      // Refresh invitations list
      fetchInvitations()
    } catch (error) {
      logger.error('Error declining invitation:', error)
      toast.error(error instanceof Error ? error.message : 'Failed to decline invitation')
    } finally {
      setProcessingInvitation(null)
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
      case 'manager':
        return <Badge className="bg-purple-500">Manager</Badge>
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

  // Show empty state if no teams and no invitations
  if (teams.length === 0 && invitations.length === 0) {
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
              {invitations.length > 0 && ` • ${invitations.length} pending ${invitations.length === 1 ? 'invitation' : 'invitations'}`}
            </p>
          </div>
          <Button onClick={() => setCreateTeamDialogOpen(true)}>
            <Plus className="w-4 h-4 mr-2" />
            Create Team
          </Button>
        </div>
      </div>

      {/* Teams List */}
      <div className="p-6 space-y-6">
        {/* Pending Invitations */}
        {invitations.length > 0 && (
          <div>
            <h2 className="text-lg font-semibold mb-3">Pending Invitations</h2>
            <div className="bg-white rounded-lg border">
              <table className="w-full">
                <thead>
                  <tr className="border-b bg-slate-50">
                    <th className="text-left p-4 font-semibold text-sm text-slate-600">Team</th>
                    <th className="text-left p-4 font-semibold text-sm text-slate-600">Description</th>
                    <th className="text-left p-4 font-semibold text-sm text-slate-600">Role</th>
                    <th className="text-left p-4 font-semibold text-sm text-slate-600">Status</th>
                    <th className="text-right p-4 font-semibold text-sm text-slate-600">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {invitations.map((invitation) => (
                    <tr
                      key={invitation.id}
                      className="border-b last:border-b-0 hover:bg-slate-50 transition-colors"
                    >
                      {/* Team Name & Icon */}
                      <td className="p-4">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-lg bg-blue-50 flex items-center justify-center flex-shrink-0">
                            <Users className="w-5 h-5 text-blue-600" />
                          </div>
                          <div>
                            <div className="font-semibold text-slate-900">{invitation.team.name}</div>
                          </div>
                        </div>
                      </td>

                      {/* Description */}
                      <td className="p-4">
                        <div className="text-sm text-slate-600 line-clamp-2 max-w-md">
                          {invitation.team.description || 'No description'}
                        </div>
                      </td>

                      {/* Role */}
                      <td className="p-4">
                        {getRoleBadge(invitation.role)}
                      </td>

                      {/* Status */}
                      <td className="p-4">
                        <Badge className="bg-yellow-500">Pending</Badge>
                      </td>

                      {/* Actions - Accept/Decline buttons instead of dropdown */}
                      <td className="p-4">
                        <div className="flex items-center justify-end gap-2">
                          <Button
                            size="sm"
                            variant="default"
                            className="h-8 text-xs bg-green-600 hover:bg-green-700"
                            onClick={(e) => handleAcceptInvitation(invitation.id, e)}
                            disabled={processingInvitation === invitation.id}
                          >
                            {processingInvitation === invitation.id ? (
                              <Loader2 className="w-3 h-3 animate-spin" />
                            ) : (
                              <>
                                <Check className="w-3 h-3 mr-1" />
                                Accept
                              </>
                            )}
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-8 text-xs border-red-300 text-red-600 hover:bg-red-50"
                            onClick={(e) => handleDeclineInvitation(invitation.id, e)}
                            disabled={processingInvitation === invitation.id}
                          >
                            <X className="w-3 h-3 mr-1" />
                            Decline
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* My Teams */}
        {teams.length > 0 && (
          <div>
            <h2 className="text-lg font-semibold mb-3">My Teams</h2>
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
        )}
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
