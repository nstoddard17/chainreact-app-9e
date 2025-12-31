"use client"

import { useState, useEffect } from "react"
import { useAuthStore } from "@/stores/authStore"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
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
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import {
  Users,
  UserPlus,
  Crown,
  Shield,
  Briefcase,
  DollarSign,
  UserCog,
  Trash2,
  Loader2,
  MoreVertical,
  RefreshCw
} from "lucide-react"
import { toast } from "sonner"
import { Badge } from "@/components/ui/badge"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import type { OrgRole } from "@/lib/types/roles"
import { ORG_ROLE_DESCRIPTIONS } from "@/lib/types/roles"

interface OrganizationMember {
  id: string
  user_id: string
  role: OrgRole
  created_at: string
  user?: {
    email: string
    username?: string
  }
}

interface OrganizationMembersManagerProps {
  organizationId: string
  currentUserRole: OrgRole
}

export function OrganizationMembersManager({
  organizationId,
  currentUserRole
}: OrganizationMembersManagerProps) {
  const { user } = useAuthStore()
  const [members, setMembers] = useState<OrganizationMember[]>([])
  const [loading, setLoading] = useState(true)
  const [addDialogOpen, setAddDialogOpen] = useState(false)
  const [changeRoleDialogOpen, setChangeRoleDialogOpen] = useState(false)
  const [removeDialogOpen, setRemoveDialogOpen] = useState(false)
  const [transferOwnershipDialogOpen, setTransferOwnershipDialogOpen] = useState(false)
  const [selectedMember, setSelectedMember] = useState<OrganizationMember | null>(null)
  const [submitting, setSubmitting] = useState(false)

  // Add member form
  const [newMemberEmail, setNewMemberEmail] = useState("")
  const [newMemberRole, setNewMemberRole] = useState<OrgRole>("member")

  // Change role form
  const [newRole, setNewRole] = useState<OrgRole>("member")

  const canManageMembers = ['owner', 'admin'].includes(currentUserRole)
  const isOwner = currentUserRole === 'owner'

  useEffect(() => {
    fetchMembers()
  }, [organizationId])

  const fetchMembers = async () => {
    try {
      setLoading(true)
      const response = await fetch(`/api/organizations/${organizationId}/members`)
      if (!response.ok) throw new Error('Failed to fetch members')

      const data = await response.json()

      // Filter to only org-level members
      const orgMembers = data.members?.filter((m: any) => m.org_level_role) || []
      setMembers(orgMembers)
    } catch (error) {
      console.error('Error fetching members:', error)
      toast.error('Failed to load organization members')
    } finally {
      setLoading(false)
    }
  }

  const handleAddMember = async () => {
    if (!newMemberEmail || !newMemberRole) {
      toast.error('Email and role are required')
      return
    }

    try {
      setSubmitting(true)
      const response = await fetch(`/api/organizations/${organizationId}/members`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: newMemberEmail,
          role: newMemberRole
        })
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to add member')
      }

      toast.success('Member added successfully')
      setAddDialogOpen(false)
      setNewMemberEmail("")
      setNewMemberRole("admin")
      fetchMembers()
    } catch (error: any) {
      console.error('Error adding member:', error)
      toast.error(error.message || 'Failed to add member')
    } finally {
      setSubmitting(false)
    }
  }

  const handleChangeRole = async () => {
    if (!selectedMember || !newRole) return

    try {
      setSubmitting(true)
      const response = await fetch(
        `/api/organizations/${organizationId}/members/${selectedMember.user_id}`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ role: newRole })
        }
      )

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to change role')
      }

      toast.success('Role changed successfully')
      setChangeRoleDialogOpen(false)
      setSelectedMember(null)
      fetchMembers()
    } catch (error: any) {
      console.error('Error changing role:', error)
      toast.error(error.message || 'Failed to change role')
    } finally {
      setSubmitting(false)
    }
  }

  const handleRemoveMember = async () => {
    if (!selectedMember) return

    try {
      setSubmitting(true)
      const response = await fetch(
        `/api/organizations/${organizationId}/members/${selectedMember.user_id}`,
        {
          method: 'DELETE'
        }
      )

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to remove member')
      }

      toast.success('Member removed successfully')
      setRemoveDialogOpen(false)
      setSelectedMember(null)
      fetchMembers()
    } catch (error: any) {
      console.error('Error removing member:', error)
      toast.error(error.message || 'Failed to remove member')
    } finally {
      setSubmitting(false)
    }
  }

  const handleTransferOwnership = async () => {
    if (!selectedMember) return

    try {
      setSubmitting(true)
      const response = await fetch(
        `/api/organizations/${organizationId}/transfer-ownership`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ new_owner_id: selectedMember.user_id })
        }
      )

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to transfer ownership')
      }

      toast.success('Ownership transferred successfully')
      setTransferOwnershipDialogOpen(false)
      setSelectedMember(null)

      // Refresh the page to update current user's role
      window.location.reload()
    } catch (error: any) {
      console.error('Error transferring ownership:', error)
      toast.error(error.message || 'Failed to transfer ownership')
    } finally {
      setSubmitting(false)
    }
  }

  const getRoleIcon = (role: OrgRole) => {
    switch (role) {
      case 'owner':
        return <Crown className="w-4 h-4 text-yellow-500" />
      case 'admin':
        return <Shield className="w-4 h-4 text-orange-500" />
      case 'manager':
        return <Briefcase className="w-4 h-4 text-rose-500" />
      case 'hr':
        return <UserCog className="w-4 h-4 text-green-500" />
      case 'finance':
        return <DollarSign className="w-4 h-4 text-emerald-500" />
      default:
        return <Users className="w-4 h-4 text-muted-foreground" />
    }
  }

  const getRoleBadge = (role: OrgRole) => {
    const colors = {
      owner: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300",
      admin: "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-300",
      manager: "bg-rose-100 text-rose-800 dark:bg-rose-900 dark:text-rose-300",
      hr: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300",
      finance: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-300"
    }

    return (
      <Badge className={colors[role]} variant="outline">
        {role.charAt(0).toUpperCase() + role.slice(1)}
      </Badge>
    )
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>Organization Members</CardTitle>
            <CardDescription>
              Manage organization-level roles and permissions
            </CardDescription>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={fetchMembers}
              disabled={loading}
            >
              <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
            {canManageMembers && (
              <Button
                size="sm"
                onClick={() => setAddDialogOpen(true)}
              >
                <UserPlus className="w-4 h-4 mr-2" />
                Add Member
              </Button>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          {members.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Users className="w-12 h-12 mx-auto mb-4 opacity-50" />
              <p>No organization-level members yet</p>
              <p className="text-sm mt-1">Add members to assign organization-wide roles</p>
            </div>
          ) : (
            members.map((member) => {
              const isCurrentUser = member.user_id === user?.id
              const canModify = canManageMembers && !isCurrentUser

              return (
                <div
                  key={member.id}
                  className="flex items-center justify-between p-4 border rounded-lg hover:bg-accent/50 transition-colors"
                >
                  <div className="flex items-center gap-3 flex-1">
                    <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center">
                      {getRoleIcon(member.role)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate">
                        {member.user?.username || member.user?.email?.split('@')[0] || 'User'}
                        {isCurrentUser && (
                          <span className="text-muted-foreground ml-2">(You)</span>
                        )}
                      </p>
                      <p className="text-sm text-muted-foreground truncate">
                        {member.user?.email}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    {getRoleBadge(member.role)}

                    {canModify && (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="sm">
                            <MoreVertical className="w-4 h-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem
                            onClick={() => {
                              setSelectedMember(member)
                              setNewRole(member.role)
                              setChangeRoleDialogOpen(true)
                            }}
                          >
                            Change Role
                          </DropdownMenuItem>
                          {isOwner && member.role !== 'owner' && (
                            <DropdownMenuItem
                              onClick={() => {
                                setSelectedMember(member)
                                setTransferOwnershipDialogOpen(true)
                              }}
                            >
                              <Crown className="w-4 h-4 mr-2" />
                              Transfer Ownership
                            </DropdownMenuItem>
                          )}
                          <DropdownMenuItem
                            onClick={() => {
                              setSelectedMember(member)
                              setRemoveDialogOpen(true)
                            }}
                            className="text-destructive"
                          >
                            <Trash2 className="w-4 h-4 mr-2" />
                            Remove
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    )}
                  </div>
                </div>
              )
            })
          )}
        </div>
      </CardContent>

      {/* Add Member Dialog */}
      <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Organization Member</DialogTitle>
            <DialogDescription>
              Grant an organization-level role to a user. They will have permissions across all teams.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email Address *</Label>
              <Input
                id="email"
                type="email"
                placeholder="user@example.com"
                value={newMemberEmail}
                onChange={(e) => setNewMemberEmail(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="role">Organization Role *</Label>
              <Select
                value={newMemberRole}
                onValueChange={(value) => setNewMemberRole(value as OrgRole)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(['admin', 'manager', 'hr', 'finance'] as OrgRole[]).map((role) => (
                    <SelectItem key={role} value={role}>
                      <div className="flex items-center gap-2">
                        {getRoleIcon(role)}
                        <div>
                          <div className="font-medium capitalize">{role}</div>
                          <div className="text-xs text-muted-foreground">
                            {ORG_ROLE_DESCRIPTIONS[role]}
                          </div>
                        </div>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Note: Only current owners can add other owners
              </p>
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setAddDialogOpen(false)}
              disabled={submitting}
            >
              Cancel
            </Button>
            <Button onClick={handleAddMember} disabled={submitting}>
              {submitting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Add Member
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Change Role Dialog */}
      <Dialog open={changeRoleDialogOpen} onOpenChange={setChangeRoleDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Change Member Role</DialogTitle>
            <DialogDescription>
              Update the organization-level role for {selectedMember?.user?.email}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="new-role">New Role</Label>
              <Select
                value={newRole}
                onValueChange={(value) => setNewRole(value as OrgRole)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(isOwner
                    ? ['owner', 'admin', 'manager', 'hr', 'finance']
                    : ['admin', 'manager', 'hr', 'finance']
                  ).map((role) => (
                    <SelectItem key={role} value={role}>
                      <div className="flex items-center gap-2">
                        {getRoleIcon(role as OrgRole)}
                        <div>
                          <div className="font-medium capitalize">{role}</div>
                          <div className="text-xs text-muted-foreground">
                            {ORG_ROLE_DESCRIPTIONS[role as OrgRole]}
                          </div>
                        </div>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setChangeRoleDialogOpen(false)}
              disabled={submitting}
            >
              Cancel
            </Button>
            <Button onClick={handleChangeRole} disabled={submitting}>
              {submitting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Change Role
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Remove Member Dialog */}
      <AlertDialog open={removeDialogOpen} onOpenChange={setRemoveDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove Organization Member?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to remove <strong>{selectedMember?.user?.email}</strong> from the organization?
              They will lose their organization-level role but may still have access through team memberships.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={submitting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleRemoveMember}
              disabled={submitting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {submitting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Remove Member
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Transfer Ownership Dialog */}
      <AlertDialog open={transferOwnershipDialogOpen} onOpenChange={setTransferOwnershipDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Transfer Ownership?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to transfer ownership to <strong>{selectedMember?.user?.email}</strong>?
              <br /><br />
              <strong className="text-destructive">This action cannot be undone.</strong>
              <br />
              You will become an admin and lose owner privileges.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={submitting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleTransferOwnership}
              disabled={submitting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {submitting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Transfer Ownership
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  )
}
