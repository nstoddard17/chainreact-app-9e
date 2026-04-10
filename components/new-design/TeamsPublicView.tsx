"use client"

import { useEffect, useState, useRef } from "react"
import { useRouter } from "next/navigation"
import { useAuthStore } from "@/stores/authStore"
import { Button } from "@/components/ui/button"
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
import { useDebugStore } from "@/stores/debugStore"

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
  const { logApiCall, logApiResponse, logApiError, logEvent } = useDebugStore()
  const [teams, setTeams] = useState<Team[]>([])
  const [invitations, setInvitations] = useState<Invitation[]>([])
  const [loading, setLoading] = useState(true)
  const [processingInvitation, setProcessingInvitation] = useState<string | null>(null)
  const [createTeamDialogOpen, setCreateTeamDialogOpen] = useState(false)

  // Prevent double-fetch on mount (React 18 Strict Mode calls effects twice)
  const hasFetchedRef = useRef(false)

  useEffect(() => {
    if (user && !hasFetchedRef.current) {
      hasFetchedRef.current = true
      fetchTeamsOverview()
    }
  }, [user])

  // Combined fetch for teams and invitations in ONE API call (performance optimization)
  const fetchTeamsOverview = async () => {
    setLoading(true)
    const MAX_RETRIES = 2
    const INITIAL_TIMEOUT = 8000
    let lastError: Error | null = null

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      const isRetry = attempt > 0
      const timeoutMs = INITIAL_TIMEOUT + (attempt * 2000) // Increase timeout on retries: 8s, 10s, 12s
      const startTime = Date.now()
      const requestId = logApiCall('GET', '/api/teams/overview')

      try {
        if (isRetry) {
          logEvent('info', 'Teams', `Retry attempt ${attempt}/${MAX_RETRIES} (timeout: ${timeoutMs}ms)`)
          await new Promise(resolve => setTimeout(resolve, attempt * 1000))
        } else {
          logEvent('info', 'Teams', 'Fetching teams overview (teams + invitations)...')
        }

        const controller = new AbortController()
        const timeoutId = setTimeout(() => controller.abort(), timeoutMs)

        try {
          const response = await fetch('/api/teams/overview', { signal: controller.signal })
          const duration = Date.now() - startTime

          logEvent('info', 'Teams', `Response status: ${response.status}`, {
            status: response.status,
            attempt: attempt + 1
          })

          if (!response.ok) {
            const errorData = await response.json().catch(() => ({ error: 'Unknown error' }))
            logApiError(requestId, new Error(errorData.error || 'Failed to fetch teams'), duration)
            logEvent('error', 'Teams', 'API error response', errorData)

            if (response.status >= 400 && response.status < 500 && response.status !== 408) {
              throw new Error(errorData.error || `Failed to fetch teams (${response.status})`)
            }

            lastError = new Error(errorData.error || `Server error (${response.status})`)
            throw lastError
          }

          const data = await response.json()
          logApiResponse(requestId, response.status, {
            teamsCount: data.teams?.length || 0,
            invitationsCount: data.invitations?.length || 0
          }, duration)

          if (isRetry) {
            logEvent('info', 'Teams', `✓ Retry successful! Fetched ${data.teams?.length || 0} teams and ${data.invitations?.length || 0} invitations on attempt ${attempt + 1}`)
          } else {
            logEvent('info', 'Teams', `Successfully fetched ${data.teams?.length || 0} teams and ${data.invitations?.length || 0} invitations`)
          }

          setTeams(data.teams || [])
          setInvitations(data.invitations || [])
          setLoading(false)
          return // Success!

        } catch (error: any) {
          const duration = Date.now() - startTime

          if (error.name === 'AbortError') {
            logApiError(requestId, new Error('Request timed out'), duration)
            logEvent('error', 'Teams', `Request timed out after ${timeoutMs}ms (attempt ${attempt + 1})`)
            lastError = new Error('Request timed out')
          } else {
            logApiError(requestId, error, duration)
            logEvent('error', 'Teams', 'Fetch error', {
              message: error?.message,
              name: error?.name,
              attempt: attempt + 1
            })
            lastError = error
          }

          if (attempt === MAX_RETRIES) {
            throw lastError
          }
        } finally {
          clearTimeout(timeoutId)
        }
      } catch (error: any) {
        if (attempt === MAX_RETRIES) {
          logEvent('error', 'Teams', `All ${MAX_RETRIES + 1} attempts failed`, {
            message: error?.message,
            name: error?.name
          })
          toast.error(error.message || 'Failed to load teams after multiple attempts')
          setTeams([])
          setInvitations([])
          setLoading(false)
          return
        }
      }
    }
  }

  // Keep old function for backward compatibility (now calls overview endpoint)
  const fetchUserTeams = async () => {
    await fetchTeamsOverview()
  }

  const fetchInvitations = async () => {
    // No-op - invitations are now fetched with teams in fetchTeamsOverview()
    // Kept for backward compatibility with callbacks
    try {
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 8000) // 8 second timeout

      try {
        const response = await fetch('/api/teams/my-invitations', { signal: controller.signal })
        if (response.ok) {
          const { invitations: data } = await response.json()
          setInvitations(data || [])
        }
      } finally {
        clearTimeout(timeoutId)
      }
    } catch (error: any) {
      if (error.name !== 'AbortError') {
        logger.error('Error fetching invitations:', error)
      }
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
          router.push('/subscription')
          return
        }

        throw new Error(error.error || 'Failed to accept invitation')
      }

      const { team } = await response.json()
      toast.success(`Welcome to ${team.name}!`)

      // Refresh overview (teams + invitations)
      fetchTeamsOverview()
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

      // Refresh overview (teams + invitations)
      fetchTeamsOverview()
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

  // No separate empty state — handled inline in the teams table below

  // Show teams list
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-100">Teams</h1>
          <p className="text-sm text-gray-500 dark:text-gray-200 mt-1">
            {teams.length} {teams.length === 1 ? 'team' : 'teams'}
            {invitations.length > 0 && ` · ${invitations.length} pending ${invitations.length === 1 ? 'invitation' : 'invitations'}`}
          </p>
        </div>
        <Button onClick={() => setCreateTeamDialogOpen(true)} size="sm">
          <Plus className="w-4 h-4 mr-2" />
          Create Team
        </Button>
      </div>

      {/* Pending Invitations */}
      {invitations.length > 0 && (
        <div>
          <h2 className="text-sm font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-3">Pending Invitations</h2>
          <div className="bg-white dark:bg-gray-900/50 rounded-xl border border-gray-200 dark:border-gray-700/50 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200 dark:border-gray-700">
                    <th className="text-left px-5 py-3 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Team</th>
                    <th className="text-left px-5 py-3 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Description</th>
                    <th className="text-left px-5 py-3 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Role</th>
                    <th className="text-left px-5 py-3 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Status</th>
                    <th className="text-right px-5 py-3 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                  {invitations.map((invitation) => (
                    <tr
                      key={invitation.id}
                      className="hover:bg-gray-50 dark:hover:bg-gray-800/30 transition-colors"
                    >
                      <td className="px-5 py-3.5">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-lg bg-blue-100 dark:bg-blue-500/20 flex items-center justify-center flex-shrink-0">
                            <Users className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                          </div>
                          <span className="font-medium text-gray-900 dark:text-gray-100">{invitation.team.name}</span>
                        </div>
                      </td>
                      <td className="px-5 py-3.5">
                        <span className="text-gray-500 dark:text-gray-400 line-clamp-1 max-w-[200px] block">
                          {invitation.team.description || '-'}
                        </span>
                      </td>
                      <td className="px-5 py-3.5">
                        {getRoleBadge(invitation.role)}
                      </td>
                      <td className="px-5 py-3.5">
                        <Badge variant="outline" className="text-xs bg-yellow-100 text-yellow-700 border-yellow-200 dark:bg-yellow-500/20 dark:text-yellow-300 dark:border-yellow-500/30">Pending</Badge>
                      </td>
                      <td className="px-5 py-3.5">
                        <div className="flex items-center justify-end gap-2">
                          <Button
                            size="sm"
                            variant="default"
                            className="h-7 text-xs bg-green-600 hover:bg-green-700"
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
                            className="h-7 text-xs border-red-300 dark:border-red-500/30 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-500/10"
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
        </div>
      )}

      {/* Teams Table */}
      <div className="bg-white dark:bg-gray-900/50 rounded-xl border border-gray-200 dark:border-gray-700/50 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 dark:border-gray-700">
                <th className="text-left px-5 py-3 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Team</th>
                <th className="text-left px-5 py-3 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Description</th>
                <th className="text-left px-5 py-3 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Members</th>
                <th className="text-left px-5 py-3 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Role</th>
                <th className="text-right px-5 py-3 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
              {teams.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-5 py-12 text-center">
                    <Users className="w-10 h-10 text-gray-300 dark:text-gray-600 mx-auto mb-3" />
                    <p className="text-sm font-medium text-gray-900 dark:text-gray-100 mb-1">No teams yet</p>
                    <p className="text-xs text-gray-500 dark:text-gray-200">Create a team to start collaborating.</p>
                  </td>
                </tr>
              ) : (
                teams.map((team) => {
                  const canAccessSettings = team.user_role && ['owner', 'admin', 'manager', 'hr', 'finance'].includes(team.user_role)

                  return (
                    <tr
                      key={team.id}
                      className="hover:bg-gray-50 dark:hover:bg-gray-800/30 cursor-pointer transition-colors"
                      onClick={() => router.push(`/teams/${team.slug}`)}
                    >
                      <td className="px-5 py-3.5">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-lg bg-blue-100 dark:bg-blue-500/20 flex items-center justify-center flex-shrink-0">
                            <Users className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                          </div>
                          <div>
                            <div className="font-medium text-gray-900 dark:text-gray-100">{team.name}</div>
                            <div className="text-xs text-gray-400 dark:text-gray-500">{team.slug}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-5 py-3.5">
                        <span className="text-gray-500 dark:text-gray-400 line-clamp-1 block max-w-[200px]">
                          {team.description || '-'}
                        </span>
                      </td>
                      <td className="px-5 py-3.5">
                        <div className="flex items-center gap-1.5 text-gray-500 dark:text-gray-400">
                          <UserIcon className="w-3.5 h-3.5" />
                          <span>{team.member_count}</span>
                        </div>
                      </td>
                      <td className="px-5 py-3.5">
                        {team.user_role && getRoleBadge(team.user_role)}
                      </td>
                      <td className="px-5 py-3.5" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-end">
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
                })
              )}
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
