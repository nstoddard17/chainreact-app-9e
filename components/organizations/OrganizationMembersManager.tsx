"use client"

import { useState, useEffect } from "react"
import { useAuthStore } from "@/stores/authStore"
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
  RefreshCw,
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

  // Add member form — supports bulk with per-member roles
  const [bulkMode, setBulkMode] = useState(false)
  const [newMemberEmail, setNewMemberEmail] = useState("")
  const [newMemberRole, setNewMemberRole] = useState<OrgRole>("admin")
  const [bulkEntries, setBulkEntries] = useState<{ email: string; role: OrgRole }[]>([{ email: "", role: "admin" }])

  // Change role form
  const [newRole, setNewRole] = useState<OrgRole>("admin")

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
    const entries = bulkMode
      ? bulkEntries.filter(e => e.email.trim() && e.email.includes('@'))
      : newMemberEmail.trim() ? [{ email: newMemberEmail.trim(), role: newMemberRole }] : []

    if (entries.length === 0) {
      toast.error('Please enter at least one valid email')
      return
    }

    try {
      setSubmitting(true)
      let successCount = 0
      let failCount = 0

      for (const entry of entries) {
        try {
          const response = await fetch(`/api/organizations/${organizationId}/members`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: entry.email, role: entry.role })
          })
          if (response.ok) successCount++
          else failCount++
        } catch {
          failCount++
        }
      }

      if (successCount > 0) toast.success(`${successCount} member${successCount > 1 ? 's' : ''} added`)
      if (failCount > 0) toast.error(`${failCount} failed to add`)

      setAddDialogOpen(false)
      setNewMemberEmail("")
      setNewMemberRole("admin")
      setBulkEntries([{ email: "", role: "admin" }])
      setBulkMode(false)
      fetchMembers()
    } catch (error: any) {
      toast.error(error.message || 'Failed to add members')
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
        { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ role: newRole }) }
      )
      if (!response.ok) { const e = await response.json(); throw new Error(e.error || 'Failed') }
      toast.success('Role changed')
      setChangeRoleDialogOpen(false)
      setSelectedMember(null)
      fetchMembers()
    } catch (error: any) {
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
        { method: 'DELETE' }
      )
      if (!response.ok) { const e = await response.json(); throw new Error(e.error || 'Failed') }
      toast.success('Member removed')
      setRemoveDialogOpen(false)
      setSelectedMember(null)
      fetchMembers()
    } catch (error: any) {
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
        { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ new_owner_id: selectedMember.user_id }) }
      )
      if (!response.ok) { const e = await response.json(); throw new Error(e.error || 'Failed') }
      toast.success('Ownership transferred')
      setTransferOwnershipDialogOpen(false)
      setSelectedMember(null)
      window.location.reload()
    } catch (error: any) {
      toast.error(error.message || 'Failed to transfer ownership')
    } finally {
      setSubmitting(false)
    }
  }

  const getRoleIcon = (role: OrgRole) => {
    switch (role) {
      case 'owner': return <Crown className="w-3.5 h-3.5 text-yellow-500" />
      case 'admin': return <Shield className="w-3.5 h-3.5 text-orange-500" />
      case 'manager': return <Briefcase className="w-3.5 h-3.5 text-rose-500" />
      case 'hr': return <UserCog className="w-3.5 h-3.5 text-green-500" />
      case 'finance': return <DollarSign className="w-3.5 h-3.5 text-emerald-500" />
      default: return <Users className="w-3.5 h-3.5 text-muted-foreground" />
    }
  }

  const getRoleBadgeClass = (role: OrgRole) => {
    const colors: Record<string, string> = {
      owner: "border-amber-300 text-amber-700 dark:border-amber-700 dark:text-amber-400",
      admin: "border-orange-300 text-orange-700 dark:border-orange-700 dark:text-orange-400",
      manager: "border-rose-300 text-rose-700 dark:border-rose-700 dark:text-rose-400",
      hr: "border-green-300 text-green-700 dark:border-green-700 dark:text-green-400",
      finance: "border-emerald-300 text-emerald-700 dark:border-emerald-700 dark:text-emerald-400",
    }
    return colors[role] || ""
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="w-full">
      {/* Header with title + buttons on same line */}
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-semibold">Members</h2>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={fetchMembers} disabled={loading}>
            <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
          {canManageMembers && (
            <Button size="sm" onClick={() => setAddDialogOpen(true)} className="bg-orange-500 hover:bg-orange-600 text-white">
              <UserPlus className="w-3.5 h-3.5 mr-1.5" />
              Add Member
            </Button>
          )}
        </div>
      </div>

      {/* Member list — pill-style rows */}
      {members.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <Users className="w-10 h-10 mx-auto mb-3 opacity-40" />
          <p className="text-sm">No organization members yet</p>
          <p className="text-xs mt-1">Add members to assign organization-wide roles</p>
        </div>
      ) : (
        <div className="space-y-2">
          {members.map((member, i) => {
            const isCurrentUser = member.user_id === user?.id
            const canModify = canManageMembers && !isCurrentUser

            return (
              <div
                key={member.id}
                className="flex items-center gap-4 px-5 py-3.5 rounded-xl border bg-card hover:bg-muted/50 transition-colors animate-fade-in-up"
                style={{ animationDelay: `${i * 40}ms`, animationFillMode: "both" }}
              >
                {/* Avatar */}
                <div className="w-9 h-9 rounded-full bg-muted flex items-center justify-center flex-shrink-0 text-sm font-medium">
                  {(member.user?.username || member.user?.email || "?")[0]?.toUpperCase()}
                </div>

                {/* Name + email */}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">
                    {member.user?.username || member.user?.email?.split('@')[0] || 'User'}
                    {isCurrentUser && <span className="text-muted-foreground ml-1.5">(you)</span>}
                  </p>
                  <p className="text-xs text-muted-foreground truncate">{member.user?.email}</p>
                </div>

                {/* Role pill */}
                <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium border ${getRoleBadgeClass(member.role)}`}>
                  {getRoleIcon(member.role)}
                  {member.role.charAt(0).toUpperCase() + member.role.slice(1)}
                </span>

                {/* Actions */}
                {canModify && (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                        <MoreVertical className="w-4 h-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => { setSelectedMember(member); setNewRole(member.role); setChangeRoleDialogOpen(true) }}>
                        Change Role
                      </DropdownMenuItem>
                      {isOwner && member.role !== 'owner' && (
                        <DropdownMenuItem onClick={() => { setSelectedMember(member); setTransferOwnershipDialogOpen(true) }}>
                          <Crown className="w-4 h-4 mr-2" />
                          Transfer Ownership
                        </DropdownMenuItem>
                      )}
                      <DropdownMenuItem onClick={() => { setSelectedMember(member); setRemoveDialogOpen(true) }} className="text-destructive">
                        <Trash2 className="w-4 h-4 mr-2" />
                        Remove
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Add Member Dialog — supports single + bulk */}
      <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Members</DialogTitle>
            <DialogDescription>
              Invite people to your organization with a specific role.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {/* Toggle single/bulk */}
            <div className="flex items-center gap-2">
              <button
                onClick={() => setBulkMode(false)}
                className={`text-xs px-3 py-1 rounded-full transition-colors ${!bulkMode ? 'bg-orange-500 text-white' : 'bg-muted text-muted-foreground hover:text-foreground'}`}
              >
                Single
              </button>
              <button
                onClick={() => setBulkMode(true)}
                className={`text-xs px-3 py-1 rounded-full transition-colors ${bulkMode ? 'bg-orange-500 text-white' : 'bg-muted text-muted-foreground hover:text-foreground'}`}
              >
                Bulk Invite
              </button>
            </div>

            {bulkMode ? (
              <div className="space-y-3">
                <Label>Members</Label>
                {bulkEntries.map((entry, idx) => (
                  <div key={idx} className="flex items-center gap-2">
                    <Input
                      type="email"
                      placeholder="user@example.com"
                      value={entry.email}
                      onChange={(e) => {
                        const next = [...bulkEntries]
                        next[idx] = { ...next[idx], email: e.target.value }
                        setBulkEntries(next)
                      }}
                      className="flex-1"
                    />
                    <Select
                      value={entry.role}
                      onValueChange={(v) => {
                        const next = [...bulkEntries]
                        next[idx] = { ...next[idx], role: v as OrgRole }
                        setBulkEntries(next)
                      }}
                    >
                      <SelectTrigger className="w-[130px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {(['admin', 'manager', 'hr', 'finance'] as OrgRole[]).map((role) => (
                          <SelectItem key={role} value={role}>
                            <span className="capitalize">{role}</span>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {bulkEntries.length > 1 && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-9 w-9 p-0 text-muted-foreground hover:text-destructive"
                        onClick={() => setBulkEntries(bulkEntries.filter((_, i) => i !== idx))}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    )}
                  </div>
                ))}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setBulkEntries([...bulkEntries, { email: "", role: "admin" }])}
                  className="w-full"
                >
                  + Add another
                </Button>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label>Email Address</Label>
                  <Input
                    type="email"
                    placeholder="user@example.com"
                    value={newMemberEmail}
                    onChange={(e) => setNewMemberEmail(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Role</Label>
                  <Select value={newMemberRole} onValueChange={(v) => setNewMemberRole(v as OrgRole)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {(['admin', 'manager', 'hr', 'finance'] as OrgRole[]).map((role) => (
                        <SelectItem key={role} value={role}>
                          <div className="flex items-center gap-2">
                            {getRoleIcon(role)}
                            <span className="capitalize">{role}</span>
                            <span className="text-xs text-muted-foreground ml-1">— {ORG_ROLE_DESCRIPTIONS[role]}</span>
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setAddDialogOpen(false)} disabled={submitting}>
              Cancel
            </Button>
            <Button onClick={handleAddMember} disabled={submitting} className="bg-orange-500 hover:bg-orange-600 text-white">
              {submitting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              {bulkMode ? 'Add All' : 'Add Member'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Change Role Dialog */}
      <Dialog open={changeRoleDialogOpen} onOpenChange={setChangeRoleDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Change Role</DialogTitle>
            <DialogDescription>Update the role for {selectedMember?.user?.email}</DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <Select value={newRole} onValueChange={(v) => setNewRole(v as OrgRole)}>
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
                      <span className="capitalize">{role}</span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setChangeRoleDialogOpen(false)} disabled={submitting}>Cancel</Button>
            <Button onClick={handleChangeRole} disabled={submitting} className="bg-orange-500 hover:bg-orange-600 text-white">
              {submitting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Save Role
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Remove Member Dialog */}
      <AlertDialog open={removeDialogOpen} onOpenChange={setRemoveDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove member?</AlertDialogTitle>
            <AlertDialogDescription>
              Remove <strong>{selectedMember?.user?.email}</strong> from the organization? They will lose their organization-level role.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={submitting}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleRemoveMember} disabled={submitting} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {submitting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Transfer Ownership Dialog */}
      <AlertDialog open={transferOwnershipDialogOpen} onOpenChange={setTransferOwnershipDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Transfer ownership?</AlertDialogTitle>
            <AlertDialogDescription>
              Transfer ownership to <strong>{selectedMember?.user?.email}</strong>? You will become an admin. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={submitting}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleTransferOwnership} disabled={submitting} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {submitting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Transfer Ownership
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
