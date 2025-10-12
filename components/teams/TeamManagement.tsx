"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { 
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
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
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { 
  Plus, 
  Users, 
  Settings, 
  Crown, 
  Edit, 
  Eye, 
  Trash2, 
  Workflow, 
  FileText,
  Loader2,
  UserPlus
} from "lucide-react"
import { toast } from "sonner"

import { logger } from '@/lib/utils/logger'

interface Team {
  id: string
  name: string
  description?: string
  slug: string
  color: string
  member_count: number
  user_role: string
  created_at: string
}

interface TeamMember {
  id: string
  user_id: string
  role: string
  joined_at: string
  user: {
    email: string
    full_name?: string
    username?: string
  }
}

interface Props {
  organizationId: string
  userRole: string
}

export default function TeamManagement({ organizationId, userRole }: Props) {
  const [teams, setTeams] = useState<Team[]>([])
  const [loading, setLoading] = useState(true)
  const [showCreateDialog, setShowCreateDialog] = useState(false)
  const [showAddMemberDialog, setShowAddMemberDialog] = useState(false)
  const [selectedTeam, setSelectedTeam] = useState<Team | null>(null)
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([])
  const [organizationMembers, setOrganizationMembers] = useState<any[]>([])

  // Form states
  const [newTeam, setNewTeam] = useState({
    name: "",
    description: "",
    slug: "",
    color: "#3B82F6"
  })

  const [newMember, setNewMember] = useState({
    user_id: "",
    role: "member"
  })

  useEffect(() => {
    fetchTeams()
    fetchOrganizationMembers()
  }, [organizationId])

  const fetchTeams = async () => {
    try {
      const response = await fetch(`/api/organizations/${organizationId}/teams`)
      if (!response.ok) throw new Error('Failed to fetch teams')
      const data = await response.json()
      setTeams(data)
    } catch (error) {
      logger.error('Error fetching teams:', error)
      toast.error('Failed to load teams')
    } finally {
      setLoading(false)
    }
  }

  const fetchOrganizationMembers = async () => {
    try {
      const response = await fetch(`/api/organizations/${organizationId}/members`)
      if (!response.ok) throw new Error('Failed to fetch organization members')
      const data = await response.json()
      setOrganizationMembers(data)
    } catch (error) {
      logger.error('Error fetching organization members:', error)
    }
  }

  const fetchTeamMembers = async (teamId: string) => {
    try {
      const response = await fetch(`/api/teams/${teamId}/members`)
      if (!response.ok) throw new Error('Failed to fetch team members')
      const data = await response.json()
      setTeamMembers(data)
    } catch (error) {
      logger.error('Error fetching team members:', error)
      toast.error('Failed to load team members')
    }
  }

  const handleCreateTeam = async () => {
    try {
      const response = await fetch(`/api/organizations/${organizationId}/teams`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newTeam)
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to create team')
      }

      const team = await response.json()
      setTeams([...teams, team])
      setShowCreateDialog(false)
      setNewTeam({ name: "", description: "", slug: "", color: "#3B82F6" })
      toast.success(`Team "${team.name}" created successfully`)
    } catch (error) {
      logger.error('Error creating team:', error)
      toast.error(error instanceof Error ? error.message : 'Failed to create team')
    }
  }

  const handleAddMember = async () => {
    if (!selectedTeam) return

    try {
      const response = await fetch(`/api/teams/${selectedTeam.id}/members`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newMember)
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to add member')
      }

      const member = await response.json()
      setTeamMembers([...teamMembers, member])
      setShowAddMemberDialog(false)
      setNewMember({ user_id: "", role: "member" })
      toast.success('Member added successfully')
    } catch (error) {
      logger.error('Error adding member:', error)
      toast.error(error instanceof Error ? error.message : 'Failed to add member')
    }
  }

  const handleDeleteTeam = async (team: Team) => {
    try {
      const response = await fetch(`/api/teams/${team.id}`, {
        method: 'DELETE'
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to delete team')
      }

      setTeams(teams.filter(t => t.id !== team.id))
      toast.success(`Team "${team.name}" deleted successfully`)
    } catch (error) {
      logger.error('Error deleting team:', error)
      toast.error(error instanceof Error ? error.message : 'Failed to delete team')
    }
  }

  const getRoleColor = (role: string) => {
    switch (role) {
      case 'admin': return 'bg-red-100 text-red-700'
      case 'editor': return 'bg-blue-100 text-blue-700'
      case 'member': return 'bg-green-100 text-green-700'
      case 'viewer': return 'bg-gray-100 text-gray-700'
      default: return 'bg-gray-100 text-gray-700'
    }
  }

  const getRoleIcon = (role: string) => {
    switch (role) {
      case 'admin': return <Crown className="w-3 h-3" />
      case 'editor': return <Edit className="w-3 h-3" />
      case 'member': return <Users className="w-3 h-3" />
      case 'viewer': return <Eye className="w-3 h-3" />
      default: return <Users className="w-3 h-3" />
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="w-6 h-6 animate-spin" />
        <span className="ml-2">Loading teams...</span>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Teams</h2>
          <p className="text-slate-600">Manage teams within your organization</p>
        </div>
        {userRole === "admin" && (
          <Button onClick={() => setShowCreateDialog(true)} className="flex items-center space-x-2">
            <Plus className="w-4 h-4" />
            <span>Create Team</span>
          </Button>
        )}
      </div>

      {/* Teams Grid */}
      {teams.length === 0 ? (
        <Card className="bg-white rounded-2xl shadow-lg border border-slate-200">
          <CardContent className="p-8 text-center">
            <Users className="w-12 h-12 text-slate-400 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-slate-900 mb-2">No teams yet</h3>
            <p className="text-slate-600 mb-4">Create your first team to start organizing your workflows</p>
            {userRole === "admin" && (
              <Button onClick={() => setShowCreateDialog(true)}>
                Create Your First Team
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {teams.map((team) => (
            <Card key={team.id} className="bg-white rounded-2xl shadow-lg border border-slate-200 hover:shadow-xl transition-shadow">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-3">
                    <div 
                      className="w-8 h-8 rounded-full flex items-center justify-center text-white font-semibold"
                      style={{ backgroundColor: team.color }}
                    >
                      {team.name.charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <CardTitle className="text-lg font-semibold text-slate-900">{team.name}</CardTitle>
                      <p className="text-sm text-slate-500">{team.member_count} members</p>
                    </div>
                  </div>
                  <div className="flex items-center space-x-2">
                    {userRole === "admin" && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setSelectedTeam(team)
                          setShowAddMemberDialog(true)
                        }}
                      >
                        <UserPlus className="w-4 h-4" />
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setSelectedTeam(team)
                        fetchTeamMembers(team.id)
                      }}
                    >
                      <Users className="w-4 h-4" />
                    </Button>
                    {userRole === "admin" && (
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button variant="ghost" size="sm">
                            <Trash2 className="w-4 h-4 text-red-500" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Delete Team</AlertDialogTitle>
                            <AlertDialogDescription>
                              Are you sure you want to delete "{team.name}"? This action cannot be undone.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction onClick={() => handleDeleteTeam(team)}>
                              Delete
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    )}
                  </div>
                </div>
                {team.description && (
                  <p className="text-sm text-slate-600 mt-2">{team.description}</p>
                )}
              </CardHeader>
            </Card>
          ))}
        </div>
      )}

      {/* Create Team Dialog */}
      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Create New Team</DialogTitle>
            <DialogDescription>
              Create a new team to organize your workflows and collaborate with specific members.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="team-name">Team Name</Label>
              <Input
                id="team-name"
                value={newTeam.name}
                onChange={(e) => setNewTeam({ ...newTeam, name: e.target.value })}
                placeholder="Enter team name"
              />
            </div>
            <div>
              <Label htmlFor="team-description">Description (Optional)</Label>
              <Textarea
                id="team-description"
                value={newTeam.description}
                onChange={(e) => setNewTeam({ ...newTeam, description: e.target.value })}
                placeholder="Enter team description"
                rows={3}
              />
            </div>
            <div>
              <Label htmlFor="team-color">Team Color</Label>
              <Input
                id="team-color"
                type="color"
                value={newTeam.color}
                onChange={(e) => setNewTeam({ ...newTeam, color: e.target.value })}
                className="w-full h-10"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreateDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleCreateTeam} disabled={!newTeam.name}>
              Create Team
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Member Dialog */}
      <Dialog open={showAddMemberDialog} onOpenChange={setShowAddMemberDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add Member to Team</DialogTitle>
            <DialogDescription>
              Add a member from your organization to this team.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="member-select">Select Member</Label>
              <Select value={newMember.user_id} onValueChange={(value) => setNewMember({ ...newMember, user_id: value })}>
                <SelectTrigger>
                  <SelectValue placeholder="Choose a member" />
                </SelectTrigger>
                <SelectContent>
                  {organizationMembers.map((member) => (
                    <SelectItem key={member.user_id} value={member.user_id}>
                      {member.user?.full_name || member.user?.email || 'Unknown User'}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="member-role">Role</Label>
              <Select value={newMember.role} onValueChange={(value) => setNewMember({ ...newMember, role: value })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="member">Member</SelectItem>
                  <SelectItem value="editor">Editor</SelectItem>
                  <SelectItem value="admin">Admin</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddMemberDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleAddMember} disabled={!newMember.user_id}>
              Add Member
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
} 