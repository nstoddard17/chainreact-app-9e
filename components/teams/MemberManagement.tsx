"use client"

import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { UserPlus, MoreVertical, Crown, Shield, Eye, Mail, Trash2, Loader2, Users, Clock } from "lucide-react"
import { toast } from "sonner"

interface Member {
  id: string
  organization_id: string
  user_id: string
  role: string
  joined_at?: string
  created_at: string
  user: {
    email: string
    full_name?: string
    username?: string
  }
}

interface Invitation {
  id: string
  organization_id: string
  email: string
  role: string
  token: string
  expires_at: string
  created_at: string
  invited_by: string
}

interface Props {
  organizationId: string
  userRole: string
}

export default function MemberManagement({ organizationId, userRole }: Props) {
  const [members, setMembers] = useState<Member[]>([])
  const [invitations, setInvitations] = useState<Invitation[]>([])
  const [loading, setLoading] = useState(true)
  const [showInviteDialog, setShowInviteDialog] = useState(false)
  const [inviteEmail, setInviteEmail] = useState("")
  const [inviteRole, setInviteRole] = useState("viewer")
  const [inviteLoading, setInviteLoading] = useState(false)

  useEffect(() => {
    fetchMembers()
    if (userRole === "admin") {
      fetchInvitations()
    }
  }, [organizationId, userRole])

  const fetchMembers = async () => {
    try {
      setLoading(true)
      const response = await fetch(`/api/organizations/${organizationId}/members`)
      if (!response.ok) {
        throw new Error('Failed to fetch members')
      }
      const data = await response.json()
      setMembers(data)
    } catch (error) {
      console.error('Error fetching members:', error)
      toast.error('Failed to load members')
    } finally {
      setLoading(false)
    }
  }

  const fetchInvitations = async () => {
    try {
      console.log('MemberManagement: Fetching invitations for organization:', organizationId)
      console.log('MemberManagement: User role:', userRole)
      
      const response = await fetch(`/api/organizations/${organizationId}/invitations`)
      console.log('MemberManagement: Response status:', response.status)
      
      if (!response.ok) {
        const errorData = await response.json()
        console.log('MemberManagement: Error response:', errorData)
        
        // Don't show error for non-admin users, just don't fetch invitations
        if (response.status === 403 && errorData.error === "Insufficient permissions") {
          console.log('User is not admin, skipping invitations fetch')
          return
        }
        throw new Error(errorData.error || 'Failed to fetch invitations')
      }
      const data = await response.json()
      console.log('MemberManagement: Invitations data:', data)
      setInvitations(data)
    } catch (error) {
      console.error('Error fetching invitations:', error)
      // Only show error toast for actual errors, not permission issues
      if (error instanceof Error && !error.message.includes('Insufficient permissions')) {
        toast.error('Failed to load invitations')
      }
    }
  }

  const handleInviteMember = async () => {
    if (!inviteEmail.trim()) return

    setInviteLoading(true)
    try {
      // Send email invitation
      const response = await fetch(`/api/organizations/${organizationId}/invite`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: inviteEmail.trim(),
          role: inviteRole
        })
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to send invitation')
      }

      setShowInviteDialog(false)
      setInviteEmail("")
      setInviteRole("viewer")
      toast.success('Invitation sent successfully! The user will receive an email with a link to join.')
      
      // Refresh invitations list
      await fetchInvitations()
    } catch (error) {
      console.error("Failed to send invitation:", error)
      toast.error(error instanceof Error ? error.message : 'Failed to send invitation')
    } finally {
      setInviteLoading(false)
    }
  }

  const handleCancelInvitation = async (invitationId: string) => {
    try {
      const response = await fetch(`/api/organizations/${organizationId}/invitations?invitationId=${invitationId}`, {
        method: 'DELETE'
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to cancel invitation')
      }

      toast.success('Invitation cancelled successfully')
      await fetchInvitations()
    } catch (error) {
      console.error("Failed to cancel invitation:", error)
      toast.error(error instanceof Error ? error.message : 'Failed to cancel invitation')
    }
  }

  const handleUpdateMemberRole = async (memberId: string, newRole: string) => {
    try {
      const response = await fetch(`/api/organizations/${organizationId}/members/${memberId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: newRole })
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to update member role')
      }

      await fetchMembers()
      toast.success('Member role updated successfully')
    } catch (error) {
      console.error("Failed to update member role:", error)
      toast.error(error instanceof Error ? error.message : 'Failed to update member role')
    }
  }

  const handleRemoveMember = async (memberId: string) => {
    try {
      const response = await fetch(`/api/organizations/${organizationId}/members/${memberId}`, {
        method: 'DELETE'
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to remove member')
      }

      await fetchMembers()
      toast.success('Member removed successfully')
    } catch (error) {
      console.error("Failed to remove member:", error)
      toast.error(error instanceof Error ? error.message : 'Failed to remove member')
    }
  }

  const getRoleIcon = (role: string) => {
    switch (role) {
      case "admin":
        return <Crown className="w-4 h-4 text-yellow-600" />
      case "editor":
        return <Shield className="w-4 h-4 text-blue-600" />
      case "viewer":
        return <Eye className="w-4 h-4 text-gray-600" />
      default:
        return null
    }
  }

  const getRoleBadgeColor = (role: string) => {
    switch (role) {
      case "admin":
        return "bg-yellow-100 text-yellow-700 border-yellow-200"
      case "editor":
        return "bg-blue-100 text-blue-700 border-blue-200"
      case "viewer":
        return "bg-gray-100 text-gray-700 border-gray-200"
      default:
        return "bg-gray-100 text-gray-700 border-gray-200"
    }
  }

  const formatDate = (dateString: string) => {
    try {
      const date = new Date(dateString)
      if (isNaN(date.getTime())) {
        return "Unknown date"
      }
      return date.toLocaleDateString()
    } catch (error) {
      return "Unknown date"
    }
  }

  const isExpired = (expiresAt: string) => {
    return new Date() > new Date(expiresAt)
  }

  const canManageMembers = userRole === "admin"

  return (
    <div className="space-y-6">
      {/* Members Section */}
      <Card className="bg-white rounded-2xl shadow-lg border border-slate-200">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-xl font-semibold text-slate-900">Team Members</CardTitle>
            {canManageMembers && (
              <Button
                onClick={() => setShowInviteDialog(true)}
                className="bg-blue-600 hover:bg-blue-700 text-white"
              >
                <UserPlus className="w-4 h-4 mr-2" />
                Invite Member
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin text-blue-500" />
            </div>
          ) : members.length === 0 ? (
            <div className="text-center py-8">
              <Users className="w-12 h-12 text-slate-400 mx-auto mb-4" />
              <h3 className="text-lg font-semibold text-slate-900 mb-2">No members yet</h3>
              <p className="text-slate-600 mb-4">Add members to your organization to start collaborating</p>
              {canManageMembers && (
                <Button 
                  onClick={() => setShowInviteDialog(true)}
                  className="bg-blue-600 hover:bg-blue-700 text-white"
                >
                  Add Your First Member
                </Button>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              {members.map((member) => (
                <div
                  key={member.id}
                  className="flex items-center justify-between p-4 bg-slate-50 rounded-lg border border-slate-200"
                >
                  <div className="flex items-center space-x-3">
                    <Avatar>
                      <AvatarFallback className="bg-gradient-to-r from-blue-500 to-purple-600 text-white">
                        {member.user?.email?.charAt(0).toUpperCase() || "U"}
                      </AvatarFallback>
                    </Avatar>
                    <div>
                      <div className="font-medium text-slate-900">
                        {member.user?.full_name || member.user?.email || "Unknown User"}
                      </div>
                      <div className="text-sm text-slate-500">{member.user?.email}</div>
                      <div className="text-xs text-slate-400">
                        Joined {formatDate(member.joined_at || member.created_at)}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center space-x-3">
                    <Badge className={`flex items-center space-x-1 ${getRoleBadgeColor(member.role)}`}>
                      {getRoleIcon(member.role)}
                      <span className="capitalize">{member.role}</span>
                    </Badge>
                    {canManageMembers && member.role !== "admin" && (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="sm" className="bg-white text-black hover:bg-slate-100">
                            <MoreVertical className="w-4 h-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => handleUpdateMemberRole(member.id, "admin")}>
                            Make Admin
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => handleUpdateMemberRole(member.id, "editor")}>
                            Make Editor
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => handleUpdateMemberRole(member.id, "viewer")}>
                            Make Viewer
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => handleRemoveMember(member.id)}
                            className="text-red-600 focus:text-red-600"
                          >
                            <Trash2 className="w-4 h-4 mr-2" />
                            Remove Member
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Pending Invitations Section */}
      {canManageMembers && invitations.length > 0 && (
        <Card className="bg-white rounded-2xl shadow-lg border border-slate-200">
          <CardHeader>
            <CardTitle className="text-xl font-semibold text-slate-900">Pending Invitations</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {invitations.map((invitation) => (
                <div
                  key={invitation.id}
                  className={`flex items-center justify-between p-4 rounded-lg border ${
                    isExpired(invitation.expires_at) 
                      ? 'bg-red-50 border-red-200' 
                      : 'bg-slate-50 border-slate-200'
                  }`}
                >
                  <div className="flex items-center space-x-3">
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                      isExpired(invitation.expires_at) ? 'bg-red-100' : 'bg-blue-100'
                    }`}>
                      <Mail className={`w-5 h-5 ${
                        isExpired(invitation.expires_at) ? 'text-red-600' : 'text-blue-600'
                      }`} />
                    </div>
                    <div>
                      <div className="font-semibold text-slate-900 text-base">{invitation.email}</div>
                      <div className="text-sm text-slate-700 mt-1">
                        Invited as <span className="font-medium text-slate-900">{invitation.role}</span> • Expires {formatDate(invitation.expires_at)}
                      </div>
                      <div className="text-xs text-slate-600 mt-1">
                        Sent {formatDate(invitation.created_at)}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center space-x-3">
                    <Badge variant="outline" className={
                      isExpired(invitation.expires_at) 
                        ? 'bg-red-100 text-red-700 border-red-300 font-medium' 
                        : 'bg-blue-100 text-blue-700 border-blue-300 font-medium'
                    }>
                      {isExpired(invitation.expires_at) ? 'Expired' : 'Pending'}
                    </Badge>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleCancelInvitation(invitation.id)}
                      className={`border-2 hover:bg-red-50 hover:border-red-300 transition-colors ${
                        isExpired(invitation.expires_at) 
                          ? 'border-red-300 text-red-600 hover:text-red-700' 
                          : 'border-slate-300 text-slate-600 hover:text-red-600'
                      }`}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Invite Member Dialog */}
      <Dialog open={showInviteDialog} onOpenChange={setShowInviteDialog}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Invite Team Member</DialogTitle>
            <DialogDescription>Send an email invitation to join your organization. The user will receive a link to sign up or sign in and automatically join your organization.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email Address</Label>
              <Input
                id="email"
                type="email"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                placeholder="Enter email address"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="role">Role</Label>
              <Select value={inviteRole} onValueChange={setInviteRole}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="viewer">
                    <div className="flex items-center space-x-2">
                      <Eye className="w-4 h-4" />
                      <span>Viewer - Can view workflows</span>
                    </div>
                  </SelectItem>
                  <SelectItem value="editor">
                    <div className="flex items-center space-x-2">
                      <Shield className="w-4 h-4" />
                      <span>Editor - Can create and edit workflows</span>
                    </div>
                  </SelectItem>
                  <SelectItem value="admin">
                    <div className="flex items-center space-x-2">
                      <Crown className="w-4 h-4" />
                      <span>Admin - Full access</span>
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setShowInviteDialog(false)}
              className="border-slate-300 text-slate-700 hover:bg-slate-50"
            >
              Cancel
            </Button>
            <Button
              onClick={handleInviteMember}
              disabled={inviteLoading || !inviteEmail.trim()}
              className="bg-blue-600 hover:bg-blue-700 text-white"
            >
              {inviteLoading ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Sending...
                </>
              ) : (
                "Send Invitation"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
