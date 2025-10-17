"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { useAuthStore } from "@/stores/authStore"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Textarea } from "@/components/ui/textarea"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Users,
  Plus,
  MoreVertical,
  Edit,
  Trash2,
  Settings,
  UserPlus,
  Crown,
  Shield,
  User as UserIcon,
  RefreshCw,
  Mail
} from "lucide-react"
import { formatDistanceToNow } from "date-fns"
import { useToast } from "@/hooks/use-toast"
import { logger } from "@/lib/utils/logger"

interface Team {
  id: string
  name: string
  description: string | null
  created_by: string
  created_at: string
  updated_at: string
  team_members?: TeamMember[]
}

interface TeamMember {
  id: string
  team_id: string
  user_id: string
  role: 'owner' | 'admin' | 'member'
  joined_at: string
  user?: {
    user_id: string
    username: string | null
    email: string
  }
}

export function TeamContent() {
  const router = useRouter()
  const { user } = useAuthStore()
  const [teams, setTeams] = useState<Team[]>([])
  const [loading, setLoading] = useState(false)
  const [createDialog, setCreateDialog] = useState(false)
  const [editDialog, setEditDialog] = useState<{ open: boolean; team: Team | null }>({ open: false, team: null })
  const [deleteDialog, setDeleteDialog] = useState<{ open: boolean; team: Team | null }>({ open: false, team: null })
  const [membersDialog, setMembersDialog] = useState<{ open: boolean; team: Team | null }>({ open: false, team: null })
  const [newTeam, setNewTeam] = useState({ name: '', description: '' })
  const [editTeamData, setEditTeamData] = useState({ name: '', description: '' })
  const [currentOrgId, setCurrentOrgId] = useState<string | null>(null)
  const { toast } = useToast()

  useEffect(() => {
    if (user) {
      // Get current organization from localStorage
      const orgId = localStorage.getItem('current_organization_id')
      setCurrentOrgId(orgId)
      fetchTeams(orgId)
    }
  }, [user])

  // Listen for organization changes
  useEffect(() => {
    const handleOrgChange = (event: CustomEvent) => {
      const org = event.detail
      setCurrentOrgId(org.id)
      fetchTeams(org.id)
    }

    window.addEventListener('organization-changed', handleOrgChange as EventListener)
    return () => {
      window.removeEventListener('organization-changed', handleOrgChange as EventListener)
    }
  }, [])

  const fetchTeams = async (organizationId?: string | null) => {
    setLoading(true)
    try {
      const url = organizationId
        ? `/api/teams?organization_id=${organizationId}`
        : '/api/teams'
      const response = await fetch(url)
      const data = await response.json()
      if (data.success !== undefined) {
        // Old API format
        setTeams(data.teams || [])
      } else {
        // New API format
        setTeams(data.teams || [])
      }
    } catch (error) {
      logger.error('Failed to fetch teams:', error)
      toast({
        title: "Error",
        description: "Failed to load teams",
        variant: "destructive"
      })
    } finally {
      setLoading(false)
    }
  }

  const fetchTeamDetails = async (teamId: string) => {
    try {
      const response = await fetch(`/api/teams/${teamId}`)
      const data = await response.json()
      if (data.success) {
        return data.team
      }
    } catch (error) {
      logger.error('Failed to fetch team details:', error)
    }
    return null
  }

  const handleCreateTeam = async () => {
    if (!newTeam.name.trim()) {
      toast({
        title: "Name required",
        description: "Please enter a team name",
        variant: "destructive"
      })
      return
    }

    if (!currentOrgId) {
      toast({
        title: "No organization selected",
        description: "Please select an organization first",
        variant: "destructive"
      })
      return
    }

    setLoading(true)
    try {
      const response = await fetch('/api/teams', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...newTeam,
          organization_id: currentOrgId
        })
      })

      const data = await response.json()

      if (data.success || data.team) {
        toast({
          title: "Team Created",
          description: `"${newTeam.name}" has been created successfully.`,
        })
        setCreateDialog(false)
        setNewTeam({ name: '', description: '' })
        fetchTeams(currentOrgId)
      } else {
        throw new Error(data.error || 'Failed to create team')
      }
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to create team",
        variant: "destructive"
      })
    } finally {
      setLoading(false)
    }
  }

  const handleUpdateTeam = async () => {
    if (!editDialog.team || !editTeamData.name.trim()) {
      toast({
        title: "Name required",
        description: "Please enter a team name",
        variant: "destructive"
      })
      return
    }

    setLoading(true)
    try {
      const response = await fetch(`/api/teams/${editDialog.team.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editTeamData)
      })

      const data = await response.json()

      if (data.success) {
        toast({
          title: "Team Updated",
          description: `"${editTeamData.name}" has been updated.`,
        })
        setEditDialog({ open: false, team: null })
        fetchTeams(currentOrgId)
      } else {
        throw new Error(data.error || 'Failed to update team')
      }
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to update team",
        variant: "destructive"
      })
    } finally {
      setLoading(false)
    }
  }

  const handleDeleteTeam = async () => {
    if (!deleteDialog.team) return

    setLoading(true)
    try {
      const response = await fetch(`/api/teams/${deleteDialog.team.id}`, {
        method: 'DELETE'
      })

      const data = await response.json()

      if (data.success) {
        toast({
          title: "Team Deleted",
          description: `"${deleteDialog.team.name}" has been deleted.`,
        })
        setDeleteDialog({ open: false, team: null })
        fetchTeams(currentOrgId)
      } else {
        throw new Error(data.error || 'Failed to delete team')
      }
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to delete team",
        variant: "destructive"
      })
    } finally {
      setLoading(false)
    }
  }

  const handleOpenMembersDialog = async (team: Team) => {
    const teamDetails = await fetchTeamDetails(team.id)
    if (teamDetails) {
      setMembersDialog({ open: true, team: teamDetails })
    }
  }

  const getUserRole = (team: Team): 'owner' | 'admin' | 'member' | null => {
    if (!team.team_members) return null
    const member = team.team_members.find(m => m.user_id === user?.id)
    return member?.role || null
  }

  const canManageTeam = (team: Team): boolean => {
    const role = getUserRole(team)
    return role === 'owner' || role === 'admin'
  }

  const getRoleIcon = (role: string) => {
    switch (role) {
      case 'owner':
        return <Crown className="w-3 h-3 text-yellow-500" />
      case 'admin':
        return <Shield className="w-3 h-3 text-blue-500" />
      default:
        return <UserIcon className="w-3 h-3 text-muted-foreground" />
    }
  }

  const getRoleBadge = (role: string) => {
    switch (role) {
      case 'owner':
        return <Badge variant="default" className="text-xs">Owner</Badge>
      case 'admin':
        return <Badge variant="secondary" className="text-xs">Admin</Badge>
      default:
        return <Badge variant="outline" className="text-xs">Member</Badge>
    }
  }

  const formatDate = (date: string) => {
    try {
      return formatDistanceToNow(new Date(date), { addSuffix: true })
    } catch {
      return 'Recently'
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Teams</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Collaborate with your team by sharing workflows and resources
          </p>
        </div>
        <Button onClick={() => setCreateDialog(true)}>
          <Plus className="w-4 h-4 mr-2" />
          Create Team
        </Button>
      </div>

      {/* Teams List */}
      {loading && teams.length === 0 ? (
        <div className="flex items-center justify-center py-12">
          <RefreshCw className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      ) : teams.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 px-4 border rounded-xl">
          <div className="w-16 h-16 bg-primary/10 rounded-2xl flex items-center justify-center mb-4">
            <Users className="w-8 h-8 text-primary" />
          </div>
          <h3 className="text-xl font-semibold mb-2">No teams yet</h3>
          <p className="text-muted-foreground text-center max-w-md mb-6">
            Create a team to collaborate with others and share workflows across your organization.
          </p>
          <Button onClick={() => setCreateDialog(true)}>
            <Plus className="w-4 h-4 mr-2" />
            Create Your First Team
          </Button>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {teams.map((team) => {
            const role = getUserRole(team)
            const memberCount = team.team_members?.length || 0

            return (
              <div
                key={team.id}
                className="group relative flex flex-col p-6 border rounded-xl hover:bg-accent/50 transition-all"
              >
                {/* Header */}
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 bg-primary/10 rounded-xl flex items-center justify-center">
                      <Users className="w-6 h-6 text-primary" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-lg">{team.name}</h3>
                      {role && getRoleBadge(role)}
                    </div>
                  </div>

                  {canManageTeam(team) && (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="sm" className="opacity-0 group-hover:opacity-100">
                          <MoreVertical className="w-4 h-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem
                          onClick={() => {
                            setEditTeamData({ name: team.name, description: team.description || '' })
                            setEditDialog({ open: true, team })
                          }}
                        >
                          <Edit className="w-4 h-4 mr-2" />
                          Edit Team
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => handleOpenMembersDialog(team)}>
                          <UserPlus className="w-4 h-4 mr-2" />
                          Manage Members
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          className="text-destructive"
                          onClick={() => setDeleteDialog({ open: true, team })}
                        >
                          <Trash2 className="w-4 h-4 mr-2" />
                          Delete Team
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  )}
                </div>

                {/* Description */}
                {team.description && (
                  <p className="text-sm text-muted-foreground mb-4 line-clamp-2">
                    {team.description}
                  </p>
                )}

                {/* Stats */}
                <div className="mt-auto pt-4 border-t space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Members</span>
                    <span className="font-medium">{memberCount}</span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Created</span>
                    <span className="font-medium">{formatDate(team.created_at)}</span>
                  </div>
                </div>

                {/* View Members Button */}
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-4 w-full"
                  onClick={() => handleOpenMembersDialog(team)}
                >
                  <Users className="w-4 h-4 mr-2" />
                  View Members
                </Button>
              </div>
            )
          })}
        </div>
      )}

      {/* Create Team Dialog */}
      <Dialog open={createDialog} onOpenChange={setCreateDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create New Team</DialogTitle>
            <DialogDescription>
              Create a team to collaborate with others and share workflows.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Team Name</label>
              <Input
                placeholder="Engineering Team"
                value={newTeam.name}
                onChange={(e) => setNewTeam({ ...newTeam, name: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Description (Optional)</label>
              <Textarea
                placeholder="Describe what this team does..."
                value={newTeam.description}
                onChange={(e) => setNewTeam({ ...newTeam, description: e.target.value })}
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleCreateTeam} disabled={loading}>
              {loading ? (
                <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Plus className="w-4 h-4 mr-2" />
              )}
              Create Team
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Team Dialog */}
      <Dialog open={editDialog.open} onOpenChange={(open) => setEditDialog({ open, team: null })}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Team</DialogTitle>
            <DialogDescription>
              Update team name and description.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Team Name</label>
              <Input
                placeholder="Engineering Team"
                value={editTeamData.name}
                onChange={(e) => setEditTeamData({ ...editTeamData, name: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Description (Optional)</label>
              <Textarea
                placeholder="Describe what this team does..."
                value={editTeamData.description}
                onChange={(e) => setEditTeamData({ ...editTeamData, description: e.target.value })}
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditDialog({ open: false, team: null })}>
              Cancel
            </Button>
            <Button onClick={handleUpdateTeam} disabled={loading}>
              {loading ? (
                <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Edit className="w-4 h-4 mr-2" />
              )}
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Members Dialog */}
      <Dialog open={membersDialog.open} onOpenChange={(open) => setMembersDialog({ open, team: null })}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{membersDialog.team?.name} - Members</DialogTitle>
            <DialogDescription>
              Manage team members and their roles.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            {membersDialog.team?.team_members && membersDialog.team.team_members.length > 0 ? (
              <div className="space-y-2">
                {membersDialog.team.team_members.map((member) => (
                  <div key={member.id} className="flex items-center justify-between p-3 border rounded-lg">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center">
                        <UserIcon className="w-5 h-5 text-muted-foreground" />
                      </div>
                      <div>
                        <p className="font-medium">
                          {member.user?.username || member.user?.email?.split('@')[0] || 'User'}
                        </p>
                        <p className="text-xs text-muted-foreground">{member.user?.email}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {getRoleIcon(member.role)}
                      {getRoleBadge(member.role)}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                No members in this team yet.
              </div>
            )}
          </div>
          <DialogFooter>
            {canManageTeam(membersDialog.team!) && (
              <Button variant="outline">
                <UserPlus className="w-4 h-4 mr-2" />
                Invite Members
              </Button>
            )}
            <Button onClick={() => setMembersDialog({ open: false, team: null })}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialog.open} onOpenChange={(open) => setDeleteDialog({ open, team: null })}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete "{deleteDialog.team?.name}". All team members will lose access to shared workflows. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteTeam}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={loading}
            >
              {loading ? (
                <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Trash2 className="w-4 h-4 mr-2" />
              )}
              Delete Team
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
