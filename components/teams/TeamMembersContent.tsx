"use client"

import { useEffect, useState, useRef } from "react"
import { useRouter } from "next/navigation"
import { NewAppLayout } from "@/components/new-design/layout/NewAppLayout"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  Users,
  Loader2,
  User as UserIcon,
  Mail,
  UserPlus,
  ArrowLeft,
  Trash2,
  RefreshCw,
  Clock,
} from "lucide-react"
import { toast } from "sonner"
import { logger } from '@/lib/utils/logger'

interface TeamMember {
  user_id: string
  role: string
  joined_at: string
  user: {
    id: string
    email: string
    full_name?: string
    username?: string
  }
}

interface PendingInvitation {
  id: string
  role: string
  status: string
  invited_at: string
  expires_at: string
  invitee: {
    id: string
    email: string
    full_name?: string
    username?: string
  }
}

interface Team {
  id: string
  name: string
  slug: string
  description?: string
}

interface TeamMembersContentProps {
  team: Team
  userRole: string
}

export function TeamMembersContent({ team, userRole }: TeamMembersContentProps) {
  const router = useRouter()
  const [activeTab, setActiveTab] = useState<"members" | "invitations">("members")
  const [members, setMembers] = useState<TeamMember[]>([])
  const [invitations, setInvitations] = useState<PendingInvitation[]>([])
  const [loading, setLoading] = useState(true)
  const [invitationsLoading, setInvitationsLoading] = useState(false)
  const [inviteDialogOpen, setInviteDialogOpen] = useState(false)
  const [inviteEmail, setInviteEmail] = useState("")
  const [inviteRole, setInviteRole] = useState("member")
  const [inviting, setInviting] = useState(false)
  const [removingMember, setRemovingMember] = useState<string | null>(null)
  const [resendingInvitation, setResendingInvitation] = useState<string | null>(null)

  const canManageMembers = ['owner', 'admin', 'manager'].includes(userRole)

  // Prevent double-fetch on mount (React 18 Strict Mode)
  const hasFetchedRef = useRef(false)

  useEffect(() => {
    if (!hasFetchedRef.current) {
      hasFetchedRef.current = true
      fetchMembersAndInvitations()
    }
  }, [team.id, canManageMembers])

  const fetchMembersAndInvitations = async () => {
    try {
      setLoading(true)
      setInvitationsLoading(true)

      // Fetch both members and invitations in a single API call
      const url = canManageMembers
        ? `/api/teams/${team.id}/members?include_invitations=true`
        : `/api/teams/${team.id}/members`

      const response = await fetch(url)
      if (!response.ok) throw new Error('Failed to fetch team data')

      const data = await response.json()
      setMembers(data.members || [])

      // Set invitations only if they were included in the response
      if (data.invitations) {
        setInvitations(data.invitations)
      }
    } catch (error) {
      logger.error('Error fetching team data:', error)
      toast.error('Failed to load team data')
      setMembers([])
      setInvitations([])
    } finally {
      setLoading(false)
      setInvitationsLoading(false)
    }
  }

  // Keep separate fetch functions for refresh actions
  const fetchMembers = async () => {
    await fetchMembersAndInvitations()
  }

  const fetchInvitations = async () => {
    await fetchMembersAndInvitations()
  }

  const handleInviteMember = async () => {
    if (!inviteEmail.trim()) {
      toast.error('Please enter an email address')
      return
    }

    setInviting(true)

    try {
      // First, find user by email
      const userResponse = await fetch(`/api/users/search?email=${encodeURIComponent(inviteEmail)}`)

      if (!userResponse.ok) {
        setInviting(false)
        toast.error('User not found with that email. They need to create a ChainReact account first.')
        return
      }

      const { user } = await userResponse.json()

      if (!user) {
        setInviting(false)
        toast.error('User not found with that email. They need to create a ChainReact account first.')
        return
      }

      // Send invitation - backend will check permissions
      const response = await fetch(`/api/teams/${team.id}/members`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: user.id,
          role: inviteRole
        })
      })

      if (!response.ok) {
        setInviting(false)
        const errorData = await response.json()
        const errorMessage = errorData.error || errorData.message || 'Failed to send invitation'

        // Show user-friendly error notification
        toast.error(errorMessage)

        // Log for debugging
        logger.debug('Invitation failed:', { status: response.status, error: errorMessage })
        return
      }

      // Success!
      setInviting(false)
      toast.success('Invitation sent! The user will receive a notification.')
      setInviteDialogOpen(false)
      setInviteEmail("")
      setInviteRole("member")

      // Refresh invitations list
      fetchInvitations()

    } catch (error) {
      // Only catch unexpected errors (network issues, etc)
      setInviting(false)
      logger.error('Unexpected error inviting member:', error)
      toast.error('An unexpected error occurred. Please try again.')
    }
  }

  const handleRemoveMember = async (userId: string) => {
    if (!confirm('Are you sure you want to remove this member?')) return

    try {
      setRemovingMember(userId)
      const response = await fetch(`/api/teams/${team.id}/members/${userId}`, {
        method: 'DELETE'
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to remove member')
      }

      toast.success('Member removed successfully')
      fetchMembers()
    } catch (error) {
      logger.error('Error removing member:', error)
      toast.error(error instanceof Error ? error.message : 'Failed to remove member')
    } finally {
      setRemovingMember(null)
    }
  }

  const handleResendInvitation = async (invitationId: string) => {
    try {
      setResendingInvitation(invitationId)
      const response = await fetch(`/api/teams/invitations/${invitationId}/resend`, {
        method: 'POST'
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to resend invitation')
      }

      toast.success('Invitation resent successfully')
    } catch (error) {
      logger.error('Error resending invitation:', error)
      toast.error(error instanceof Error ? error.message : 'Failed to resend invitation')
    } finally {
      setResendingInvitation(null)
    }
  }

  const getRoleBadge = (role: string) => {
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

  return (
    <NewAppLayout
      title={`${team.name} - Members`}
      subtitle="Manage team members and permissions"
    >
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <Button
            variant="ghost"
            onClick={() => router.push('/teams')}
            className="gap-2"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Teams
          </Button>
          {canManageMembers && (
            <Button
              onClick={() => setInviteDialogOpen(true)}
              className="gap-2"
            >
              <UserPlus className="w-4 h-4" />
              Invite Member
            </Button>
          )}
        </div>

        {/* Tabs for Members and Invitations */}
        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as "members" | "invitations")}>
          <TabsList>
            <TabsTrigger value="members">
              Active Members ({members.length})
            </TabsTrigger>
            {canManageMembers && (
              <TabsTrigger value="invitations">
                Pending Invitations ({invitations.length})
              </TabsTrigger>
            )}
          </TabsList>

          {/* Active Members Tab */}
          <TabsContent value="members">
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
              </div>
            ) : members.length === 0 ? (
              <div className="text-center py-12 bg-white rounded-lg border">
                <Users className="w-16 h-16 text-slate-300 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-slate-900 mb-2">No members yet</h3>
                <p className="text-slate-500 mb-6">Invite members to start collaborating</p>
                {canManageMembers && (
                  <Button onClick={() => setInviteDialogOpen(true)}>
                    <UserPlus className="w-4 h-4 mr-2" />
                    Invite Member
                  </Button>
                )}
              </div>
            ) : (
              <div className="bg-white rounded-lg border">
                <table className="w-full">
                  <thead>
                    <tr className="border-b bg-slate-50">
                      <th className="text-left p-4 font-semibold text-sm text-slate-600">Member</th>
                      <th className="text-left p-4 font-semibold text-sm text-slate-600">Email</th>
                      <th className="text-left p-4 font-semibold text-sm text-slate-600">Role</th>
                      <th className="text-left p-4 font-semibold text-sm text-slate-600">Joined</th>
                      {canManageMembers && (
                        <th className="text-right p-4 font-semibold text-sm text-slate-600">Actions</th>
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {members.map((member) => (
                      <tr
                        key={member.user_id}
                        className="border-b last:border-b-0 hover:bg-slate-50 transition-colors"
                      >
                        {/* Member Name */}
                        <td className="p-4">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0">
                              <UserIcon className="w-5 h-5 text-blue-600" />
                            </div>
                            <div>
                              <div className="font-semibold text-slate-900">
                                {member.user.full_name || member.user.username || 'Unknown User'}
                              </div>
                              {member.user.username && member.user.full_name && (
                                <div className="text-xs text-slate-500">@{member.user.username}</div>
                              )}
                            </div>
                          </div>
                        </td>

                        {/* Email */}
                        <td className="p-4">
                          <div className="flex items-center gap-2 text-sm text-slate-600">
                            <Mail className="w-4 h-4" />
                            {member.user.email}
                          </div>
                        </td>

                        {/* Role */}
                        <td className="p-4">
                          {getRoleBadge(member.role)}
                        </td>

                        {/* Joined Date */}
                        <td className="p-4">
                          <div className="text-sm text-slate-600">
                            {new Date(member.joined_at).toLocaleDateString()}
                          </div>
                        </td>

                        {/* Actions */}
                        {canManageMembers && (
                          <td className="p-4">
                            <div className="flex items-center justify-end">
                              {member.role !== 'owner' && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => handleRemoveMember(member.user_id)}
                                  disabled={removingMember === member.user_id}
                                  className="text-red-600 hover:text-red-700 hover:bg-red-50"
                                >
                                  {removingMember === member.user_id ? (
                                    <Loader2 className="w-4 h-4 animate-spin" />
                                  ) : (
                                    <Trash2 className="w-4 h-4" />
                                  )}
                                </Button>
                              )}
                            </div>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </TabsContent>

          {/* Pending Invitations Tab */}
          {canManageMembers && (
            <TabsContent value="invitations">
              {invitationsLoading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
                </div>
              ) : invitations.length === 0 ? (
                <div className="text-center py-12 bg-white rounded-lg border">
                  <Clock className="w-16 h-16 text-slate-300 mx-auto mb-4" />
                  <h3 className="text-lg font-medium text-slate-900 mb-2">No pending invitations</h3>
                  <p className="text-slate-500 mb-6">All invitations have been accepted or declined</p>
                  <Button onClick={() => setInviteDialogOpen(true)}>
                    <UserPlus className="w-4 h-4 mr-2" />
                    Invite Member
                  </Button>
                </div>
              ) : (
                <div className="bg-white rounded-lg border">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b bg-slate-50">
                        <th className="text-left p-4 font-semibold text-sm text-slate-600">Invitee</th>
                        <th className="text-left p-4 font-semibold text-sm text-slate-600">Email</th>
                        <th className="text-left p-4 font-semibold text-sm text-slate-600">Role</th>
                        <th className="text-left p-4 font-semibold text-sm text-slate-600">Status</th>
                        <th className="text-left p-4 font-semibold text-sm text-slate-600">Invited</th>
                        <th className="text-right p-4 font-semibold text-sm text-slate-600">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {invitations.map((invitation) => (
                        <tr
                          key={invitation.id}
                          className="border-b last:border-b-0 hover:bg-slate-50 transition-colors"
                        >
                          {/* Invitee Name */}
                          <td className="p-4">
                            <div className="flex items-center gap-3">
                              <div className="w-10 h-10 rounded-full bg-yellow-100 flex items-center justify-center flex-shrink-0">
                                <Clock className="w-5 h-5 text-yellow-600" />
                              </div>
                              <div>
                                <div className="font-semibold text-slate-900">
                                  {invitation.invitee.full_name || invitation.invitee.username || 'Unknown User'}
                                </div>
                                {invitation.invitee.username && invitation.invitee.full_name && (
                                  <div className="text-xs text-slate-500">@{invitation.invitee.username}</div>
                                )}
                              </div>
                            </div>
                          </td>

                          {/* Email */}
                          <td className="p-4">
                            <div className="flex items-center gap-2 text-sm text-slate-600">
                              <Mail className="w-4 h-4" />
                              {invitation.invitee.email}
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

                          {/* Invited Date */}
                          <td className="p-4">
                            <div className="text-sm text-slate-600">
                              {new Date(invitation.invited_at).toLocaleDateString()}
                            </div>
                          </td>

                          {/* Actions */}
                          <td className="p-4">
                            <div className="flex items-center justify-end">
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleResendInvitation(invitation.id)}
                                disabled={resendingInvitation === invitation.id}
                                className="text-blue-600 hover:text-blue-700 hover:bg-blue-50"
                              >
                                {resendingInvitation === invitation.id ? (
                                  <Loader2 className="w-4 h-4 animate-spin" />
                                ) : (
                                  <>
                                    <RefreshCw className="w-4 h-4 mr-1" />
                                    Resend
                                  </>
                                )}
                              </Button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </TabsContent>
          )}
        </Tabs>
      </div>

      {/* Invite Member Dialog */}
      <Dialog open={inviteDialogOpen} onOpenChange={setInviteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Invite Team Member</DialogTitle>
            <DialogDescription>
              Invite a new member to join {team.name}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email Address</Label>
              <Input
                id="email"
                type="email"
                placeholder="member@example.com"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="role">Role</Label>
              <Select value={inviteRole} onValueChange={setInviteRole}>
                <SelectTrigger id="role">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="member">Member</SelectItem>
                  <SelectItem value="manager">Manager</SelectItem>
                  <SelectItem value="admin">Admin</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setInviteDialogOpen(false)}
              disabled={inviting}
            >
              Cancel
            </Button>
            <Button onClick={handleInviteMember} disabled={inviting}>
              {inviting ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Inviting...
                </>
              ) : (
                <>
                  <UserPlus className="w-4 h-4 mr-2" />
                  Invite Member
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </NewAppLayout>
  )
}
