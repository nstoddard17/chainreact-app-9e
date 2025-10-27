"use client"

import { useEffect, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { useAuthStore } from "@/stores/authStore"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { AlertDialog } from "@/components/ui/alert-dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Users,
  Loader2,
  User as UserIcon,
  Shield,
  Trash2,
  Save
} from "lucide-react"
import { toast } from "sonner"
import { CreateTeamDialog } from "./CreateTeamDialog"

interface Team {
  id: string
  name: string
  slug: string
  description?: string
  organization_id?: string
  member_count: number
  user_role?: string
}

export function TeamSettingsContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { user } = useAuthStore()
  const [selectedTeamId, setSelectedTeamId] = useState<string | null>(null)
  const [teams, setTeams] = useState<Team[]>([])
  const [currentTeam, setCurrentTeam] = useState<Team | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [createTeamDialogOpen, setCreateTeamDialogOpen] = useState(false)

  // Form state
  const [teamName, setTeamName] = useState("")
  const [teamDescription, setTeamDescription] = useState("")

  useEffect(() => {
    if (user) {
      fetchTeams()
    }
  }, [user])

  // Handle team parameter from URL
  useEffect(() => {
    const teamId = searchParams.get('team')
    if (teamId && teams.length > 0) {
      setSelectedTeamId(teamId)
      fetchTeam(teamId)
    } else if (teams.length > 0 && !selectedTeamId) {
      // Select first team by default (any management role)
      const firstTeam = teams[0] // Already filtered to management roles in fetchTeams
      if (firstTeam) {
        setSelectedTeamId(firstTeam.id)
        fetchTeam(firstTeam.id)
      }
    }
  }, [searchParams, teams])

  const fetchTeams = async () => {
    try {
      setLoading(true)

      // Fetch all teams where user is a member with management roles
      const response = await fetch('/api/teams/my-teams')
      if (!response.ok) throw new Error('Failed to fetch teams')

      const data = await response.json()
      // Filter to only teams where user has management roles
      const managementTeams = (data.teams || []).filter(
        (t: Team) => t.user_role && ['owner', 'admin', 'manager', 'hr', 'finance'].includes(t.user_role)
      )
      setTeams(managementTeams)
    } catch (error) {
      console.error('Error fetching teams:', error)
      toast.error('Failed to load teams')
    } finally {
      setLoading(false)
    }
  }

  const fetchTeam = async (teamId: string) => {
    try {
      const response = await fetch(`/api/teams/${teamId}`)
      if (!response.ok) throw new Error('Failed to fetch team')

      const data = await response.json()
      setCurrentTeam(data)
      setTeamName(data.name || "")
      setTeamDescription(data.description || "")
    } catch (error) {
      console.error('Error fetching team:', error)
      toast.error('Failed to load team details')
    }
  }

  const handleSaveSettings = async () => {
    if (!currentTeam) return

    if (!teamName.trim()) {
      toast.error('Team name is required')
      return
    }

    try {
      setSaving(true)
      const response = await fetch(`/api/teams/${currentTeam.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: teamName.trim(),
          description: teamDescription.trim() || null,
        }),
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to update team')
      }

      toast.success('Team updated successfully')
      fetchTeam(currentTeam.id)
      fetchTeams()
    } catch (error: any) {
      console.error('Error updating team:', error)
      toast.error(error.message || 'Failed to update team')
    } finally {
      setSaving(false)
    }
  }

  const handleDeleteTeam = async () => {
    if (!currentTeam) return

    try {
      const response = await fetch(`/api/teams/${currentTeam.id}`, {
        method: 'DELETE',
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to delete team')
      }

      toast.success('Team deleted successfully')
      setDeleteDialogOpen(false)
      router.push('/teams')
    } catch (error: any) {
      console.error('Error deleting team:', error)
      toast.error(error.message || 'Failed to delete team')
    }
  }

  const isOwner = currentTeam?.user_role === 'owner'
  // Management roles that can edit: owner, admin, manager, hr, finance
  const canManage = currentTeam?.user_role && ['owner', 'admin', 'manager', 'hr', 'finance'].includes(currentTeam.user_role)

  if (loading && teams.length === 0) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (teams.length === 0) {
    return (
      <>
        <div className="h-full w-full flex items-center justify-center p-6">
          <Card className="max-w-2xl w-full border-2">
            <CardHeader className="text-center">
              <div className="mx-auto w-12 h-12 rounded-full bg-muted flex items-center justify-center mb-4">
                <Users className="w-6 h-6 text-muted-foreground" />
              </div>
              <CardTitle className="text-2xl">No Teams</CardTitle>
              <CardDescription className="text-base mt-2">
                You're currently not part of any team. Join a team or create an organization to collaborate with teams.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Feature Benefits */}
              <div className="space-y-4">
                <div className="flex items-start gap-3 p-4 bg-muted/50 rounded-lg">
                  <Users className="w-5 h-5 text-primary mt-0.5 flex-shrink-0" />
                  <div>
                    <h3 className="font-semibold text-sm mb-1">Collaborate with Teams</h3>
                    <p className="text-sm text-muted-foreground">
                      Work together with team members and share workflows
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3 p-4 bg-muted/50 rounded-lg">
                  <Shield className="w-5 h-5 text-primary mt-0.5 flex-shrink-0" />
                  <div>
                    <h3 className="font-semibold text-sm mb-1">Manage Permissions</h3>
                    <p className="text-sm text-muted-foreground">
                      Control access levels and manage team member permissions
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3 p-4 bg-muted/50 rounded-lg">
                  <UserIcon className="w-5 h-5 text-primary mt-0.5 flex-shrink-0" />
                  <div>
                    <h3 className="font-semibold text-sm mb-1">Organized Workflows</h3>
                    <p className="text-sm text-muted-foreground">
                      Keep workflows organized by team and department
                    </p>
                  </div>
                </div>
              </div>

              {/* Action Button */}
              <div className="flex justify-center pt-2">
                <Button
                  size="lg"
                  onClick={() => setCreateTeamDialogOpen(true)}
                >
                  <Users className="w-4 h-4 mr-2" />
                  Create Team
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Create Team Dialog */}
        <CreateTeamDialog
          open={createTeamDialogOpen}
          onOpenChange={setCreateTeamDialogOpen}
          onTeamCreated={fetchTeams}
        />
      </>
    )
  }

  if (!currentTeam) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="h-full w-full space-y-6 max-w-5xl mx-auto">
      {/* Team Selector */}
      {teams.length > 1 && (
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <Label htmlFor="team-select" className="text-sm font-medium whitespace-nowrap">
                Select Team:
              </Label>
              <Select
                value={selectedTeamId || ''}
                onValueChange={(value) => {
                  setSelectedTeamId(value)
                  router.push(`/team-settings?team=${value}`)
                }}
              >
                <SelectTrigger id="team-select" className="flex-1">
                  <SelectValue placeholder="Select a team" />
                </SelectTrigger>
                <SelectContent>
                  {teams.map((team) => (
                    <SelectItem key={team.id} value={team.id}>
                      {team.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Team Details */}
      <Card>
        <CardHeader>
          <CardTitle>Team Details</CardTitle>
          <CardDescription>Update your team's basic information</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="team-name">Team Name *</Label>
            <Input
              id="team-name"
              value={teamName}
              onChange={(e) => setTeamName(e.target.value)}
              disabled={!canManage}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="team-slug">URL Slug</Label>
            <Input
              id="team-slug"
              value={currentTeam.slug}
              disabled
              className="bg-muted"
            />
            <p className="text-xs text-muted-foreground">
              The URL slug cannot be changed
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="team-description">Description</Label>
            <Textarea
              id="team-description"
              value={teamDescription}
              onChange={(e) => setTeamDescription(e.target.value)}
              rows={3}
              disabled={!canManage}
              placeholder="What does your team work on?"
            />
          </div>

          {canManage && (
            <Button onClick={handleSaveSettings} disabled={saving}>
              {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              {!saving && <Save className="w-4 h-4 mr-2" />}
              Save Changes
            </Button>
          )}
        </CardContent>
      </Card>

      {/* Danger Zone */}
      {isOwner && (
        <Card className="border-destructive">
          <CardHeader>
            <CardTitle className="text-destructive">Danger Zone</CardTitle>
            <CardDescription>
              Irreversible and destructive actions
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between p-4 border border-destructive rounded-lg">
              <div>
                <h4 className="font-semibold">Delete Team</h4>
                <p className="text-sm text-muted-foreground mt-1">
                  Permanently delete this team. This action cannot be undone.
                </p>
              </div>
              <Button
                variant="destructive"
                onClick={() => setDeleteDialogOpen(true)}
              >
                <Trash2 className="w-4 h-4 mr-2" />
                Delete
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete <strong>{currentTeam.name}</strong> and remove all
              member access. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteTeam}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              <Trash2 className="w-4 h-4 mr-2" />
              Delete Team
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
