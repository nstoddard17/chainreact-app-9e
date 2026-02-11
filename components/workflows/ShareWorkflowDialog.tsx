"use client"

import { useState, useEffect } from "react"
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Loader2, X, Shield, Settings, Eye, UserPlus, Users, Building, Check } from "lucide-react"
import { logger } from '@/lib/utils/logger'
import { useToast } from "@/hooks/use-toast"
import { usePlanRestrictions } from "@/hooks/use-plan-restrictions"

interface WorkflowPermission {
  id: string
  user_id: string
  permission: 'use' | 'manage' | 'admin'
  granted_at: string
  user: {
    id: string
    email: string
    username: string | null
    full_name: string | null
    avatar_url: string | null
  }
  granted_by_user: {
    username: string | null
    full_name: string | null
  }
}

interface Team {
  id: string
  name: string
  slug: string
  description: string | null
  member_count: number
  user_role: string
  isShared?: boolean
}

interface ShareWorkflowDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  workflowId: string
  workflowName: string
}

export default function ShareWorkflowDialog({
  open,
  onOpenChange,
  workflowId,
  workflowName
}: ShareWorkflowDialogProps) {
  const [permissions, setPermissions] = useState<WorkflowPermission[]>([])
  const [teams, setTeams] = useState<Team[]>([])
  const [sharedTeamIds, setSharedTeamIds] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(false)
  const [loadingTeams, setLoadingTeams] = useState(false)
  const [adding, setAdding] = useState(false)
  const [sharingTeam, setSharingTeam] = useState<string | null>(null)
  const [selectedUserId, setSelectedUserId] = useState<string>("")
  const [selectedPermission, setSelectedPermission] = useState<'use' | 'manage' | 'admin'>('use')
  const [activeTab, setActiveTab] = useState<"individuals" | "teams">("individuals")
  const { toast } = useToast()
  const { checkFeatureAccess } = usePlanRestrictions()

  // Check if user has team sharing access
  const teamSharingAccess = checkFeatureAccess("teamSharing")
  const canShareWithTeam = teamSharingAccess.allowed

  // Fetch permissions when dialog opens
  useEffect(() => {
    if (open) {
      fetchPermissions()
      fetchTeams()
      fetchSharedTeams()
    }
  }, [open, workflowId])

  const fetchPermissions = async () => {
    setLoading(true)
    try {
      const response = await fetch(`/api/workflows/${workflowId}/permissions`)

      if (!response.ok) {
        throw new Error('Failed to fetch permissions')
      }

      const data = await response.json()
      setPermissions(data.data?.permissions || [])

    } catch (error: any) {
      logger.error('[ShareWorkflowDialog] Error fetching permissions:', error)
      toast({
        title: "Error",
        description: error.message || "Failed to load permissions",
        variant: "destructive"
      })
    } finally {
      setLoading(false)
    }
  }

  const fetchTeams = async () => {
    setLoadingTeams(true)
    try {
      const response = await fetch('/api/teams/my-teams')
      if (!response.ok) {
        throw new Error('Failed to fetch teams')
      }
      const data = await response.json()
      setTeams(data.teams || [])
    } catch (error: any) {
      logger.error('[ShareWorkflowDialog] Error fetching teams:', error)
    } finally {
      setLoadingTeams(false)
    }
  }

  const fetchSharedTeams = async () => {
    try {
      const response = await fetch(`/api/workflows/${workflowId}/share`)
      if (response.ok) {
        const data = await response.json()
        const teamIds = new Set((data.teams || []).map((t: any) => t.team_id))
        setSharedTeamIds(teamIds as Set<string>)
      }
    } catch (error: any) {
      logger.error('[ShareWorkflowDialog] Error fetching shared teams:', error)
    }
  }

  const handleAddPermission = async () => {
    if (!selectedUserId) return

    setAdding(true)
    try {
      const response = await fetch(`/api/workflows/${workflowId}/permissions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: selectedUserId,
          permission: selectedPermission
        })
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to grant permission')
      }

      toast({
        title: "Success",
        description: `Permission granted successfully`
      })

      // Refresh permissions list
      await fetchPermissions()

      // Reset form
      setSelectedUserId("")
      setSelectedPermission('use')

    } catch (error: any) {
      logger.error('[ShareWorkflowDialog] Error granting permission:', error)
      toast({
        title: "Error",
        description: error.message || "Failed to grant permission",
        variant: "destructive"
      })
    } finally {
      setAdding(false)
    }
  }

  const handleRemovePermission = async (userId: string) => {
    try {
      const response = await fetch(`/api/workflows/${workflowId}/permissions?user_id=${userId}`, {
        method: 'DELETE'
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to revoke permission')
      }

      toast({
        title: "Success",
        description: "Permission revoked successfully"
      })

      // Refresh permissions list
      await fetchPermissions()

    } catch (error: any) {
      logger.error('[ShareWorkflowDialog] Error revoking permission:', error)
      toast({
        title: "Error",
        description: error.message || "Failed to revoke permission",
        variant: "destructive"
      })
    }
  }

  const handleUpdatePermission = async (userId: string, newPermission: 'use' | 'manage' | 'admin') => {
    try {
      const response = await fetch(`/api/workflows/${workflowId}/permissions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: userId,
          permission: newPermission
        })
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to update permission')
      }

      toast({
        title: "Success",
        description: "Permission updated successfully"
      })

      // Refresh permissions list
      await fetchPermissions()

    } catch (error: any) {
      logger.error('[ShareWorkflowDialog] Error updating permission:', error)
      toast({
        title: "Error",
        description: error.message || "Failed to update permission",
        variant: "destructive"
      })
    }
  }

  const handleShareWithTeam = async (teamId: string) => {
    setSharingTeam(teamId)
    try {
      const response = await fetch(`/api/workflows/${workflowId}/share`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ team_ids: [teamId] })
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to share with team')
      }

      toast({
        title: "Shared with team",
        description: "All team members can now access this workflow"
      })

      // Update shared teams
      setSharedTeamIds(prev => new Set([...prev, teamId]))

    } catch (error: any) {
      logger.error('[ShareWorkflowDialog] Error sharing with team:', error)
      toast({
        title: "Error",
        description: error.message || "Failed to share with team",
        variant: "destructive"
      })
    } finally {
      setSharingTeam(null)
    }
  }

  const handleUnshareWithTeam = async (teamId: string) => {
    setSharingTeam(teamId)
    try {
      const response = await fetch(`/api/workflows/${workflowId}/share?team_id=${teamId}`, {
        method: 'DELETE'
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to unshare from team')
      }

      toast({
        title: "Removed from team",
        description: "Team members no longer have access"
      })

      // Update shared teams
      setSharedTeamIds(prev => {
        const next = new Set(prev)
        next.delete(teamId)
        return next
      })

    } catch (error: any) {
      logger.error('[ShareWorkflowDialog] Error unsharing from team:', error)
      toast({
        title: "Error",
        description: error.message || "Failed to unshare from team",
        variant: "destructive"
      })
    } finally {
      setSharingTeam(null)
    }
  }

  const getPermissionIcon = (permission: string) => {
    switch (permission) {
      case 'admin':
        return <Shield className="w-4 h-4" />
      case 'manage':
        return <Settings className="w-4 h-4" />
      case 'use':
        return <Eye className="w-4 h-4" />
      default:
        return null
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle>Share Workflow</DialogTitle>
          <DialogDescription>
            Manage who has access to "{workflowName}"
          </DialogDescription>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)} className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="individuals" className="flex items-center gap-2">
              <UserPlus className="w-4 h-4" />
              Individuals
            </TabsTrigger>
            <TabsTrigger value="teams" className="flex items-center gap-2" disabled={!canShareWithTeam}>
              <Users className="w-4 h-4" />
              Teams
              {!canShareWithTeam && (
                <Badge variant="outline" className="ml-1 text-xs">Pro</Badge>
              )}
            </TabsTrigger>
          </TabsList>

          {/* Individual Sharing Tab */}
          <TabsContent value="individuals" className="space-y-4 mt-4">
            {/* Add New Permission */}
            <div className="space-y-3 p-4 border border-slate-200 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-900">
              <Label className="text-sm font-semibold">Add by Email</Label>
              <div className="flex gap-2">
                <Input
                  placeholder="Enter email address"
                  value={selectedUserId}
                  onChange={(e) => setSelectedUserId(e.target.value)}
                  className="flex-1"
                />
                <Select
                  value={selectedPermission}
                  onValueChange={(value) => setSelectedPermission(value as any)}
                >
                  <SelectTrigger className="w-32">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="use">
                      <div className="flex items-center gap-2">
                        <Eye className="w-4 h-4" />
                        <span>Use</span>
                      </div>
                    </SelectItem>
                    <SelectItem value="manage">
                      <div className="flex items-center gap-2">
                        <Settings className="w-4 h-4" />
                        <span>Manage</span>
                      </div>
                    </SelectItem>
                    <SelectItem value="admin">
                      <div className="flex items-center gap-2">
                        <Shield className="w-4 h-4" />
                        <span>Admin</span>
                      </div>
                    </SelectItem>
                  </SelectContent>
                </Select>
                <Button
                  onClick={handleAddPermission}
                  disabled={!selectedUserId || adding}
                  size="sm"
                >
                  {adding ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <>
                      <UserPlus className="w-4 h-4 mr-2" />
                      Add
                    </>
                  )}
                </Button>
              </div>
            </div>

            {/* Current Permissions List */}
            <div className="space-y-2">
              <Label className="text-sm font-semibold">Current Access</Label>
              {loading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
                </div>
              ) : permissions.length === 0 ? (
                <div className="text-center py-8 text-slate-500 text-sm">
                  No individual access granted yet
                </div>
              ) : (
                <div className="space-y-2 max-h-48 overflow-y-auto">
                  {permissions.map((perm) => (
                    <div
                      key={perm.id}
                      className="flex items-center justify-between p-3 border border-slate-200 dark:border-slate-700 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-900 transition-colors"
                    >
                      <div className="flex items-center gap-3">
                        <Avatar className="w-8 h-8">
                          <AvatarFallback className="bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300 text-xs">
                            {perm.user.full_name?.[0]?.toUpperCase() ||
                             perm.user.username?.[0]?.toUpperCase() ||
                             perm.user.email[0].toUpperCase()}
                          </AvatarFallback>
                        </Avatar>
                        <div>
                          <div className="text-sm font-medium">
                            {perm.user.full_name || perm.user.username || perm.user.email}
                          </div>
                          <div className="text-xs text-slate-500">
                            {perm.user.email}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Select
                          value={perm.permission}
                          onValueChange={(value) => handleUpdatePermission(perm.user_id, value as any)}
                        >
                          <SelectTrigger className="w-28 h-8">
                            <SelectValue>
                              <div className="flex items-center gap-2">
                                {getPermissionIcon(perm.permission)}
                                <span className="capitalize text-xs">{perm.permission}</span>
                              </div>
                            </SelectValue>
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="use">Use</SelectItem>
                            <SelectItem value="manage">Manage</SelectItem>
                            <SelectItem value="admin">Admin</SelectItem>
                          </SelectContent>
                        </Select>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 w-8 p-0 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-900/20"
                          onClick={() => handleRemovePermission(perm.user_id)}
                        >
                          <X className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </TabsContent>

          {/* Team Sharing Tab */}
          <TabsContent value="teams" className="space-y-4 mt-4">
            {!canShareWithTeam ? (
              <div className="text-center py-8 px-4 border border-dashed rounded-lg">
                <Users className="w-12 h-12 mx-auto text-slate-300 mb-3" />
                <h3 className="font-semibold mb-1">Team Sharing</h3>
                <p className="text-sm text-slate-500 mb-4">
                  Share workflows with entire teams. Available on Team plan and above.
                </p>
                <Button variant="outline" onClick={() => window.location.href = '/settings/billing'}>
                  Upgrade to Team
                </Button>
              </div>
            ) : loadingTeams ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
              </div>
            ) : teams.length === 0 ? (
              <div className="text-center py-8 px-4 border border-dashed rounded-lg">
                <Building className="w-12 h-12 mx-auto text-slate-300 mb-3" />
                <h3 className="font-semibold mb-1">No Teams Yet</h3>
                <p className="text-sm text-slate-500 mb-4">
                  Create or join a team to share workflows with your colleagues.
                </p>
                <Button variant="outline" onClick={() => window.location.href = '/teams'}>
                  Go to Teams
                </Button>
              </div>
            ) : (
              <div className="space-y-2">
                <Label className="text-sm font-semibold">Your Teams</Label>
                <p className="text-xs text-slate-500 mb-3">
                  Share this workflow with all members of a team
                </p>
                <div className="space-y-2 max-h-64 overflow-y-auto">
                  {teams.map((team) => {
                    const isShared = sharedTeamIds.has(team.id)
                    const isProcessing = sharingTeam === team.id

                    return (
                      <div
                        key={team.id}
                        className="flex items-center justify-between p-3 border border-slate-200 dark:border-slate-700 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-900 transition-colors"
                      >
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                            <Users className="w-5 h-5 text-primary" />
                          </div>
                          <div>
                            <div className="text-sm font-medium">{team.name}</div>
                            <div className="text-xs text-slate-500">
                              {team.member_count} member{team.member_count !== 1 ? 's' : ''}
                              {team.user_role && (
                                <span className="ml-2 text-primary">({team.user_role})</span>
                              )}
                            </div>
                          </div>
                        </div>
                        <Button
                          variant={isShared ? "secondary" : "outline"}
                          size="sm"
                          onClick={() => isShared ? handleUnshareWithTeam(team.id) : handleShareWithTeam(team.id)}
                          disabled={isProcessing}
                          className={isShared ? "bg-green-50 text-green-700 hover:bg-green-100 dark:bg-green-900/20 dark:text-green-400" : ""}
                        >
                          {isProcessing ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : isShared ? (
                            <>
                              <Check className="w-4 h-4 mr-1" />
                              Shared
                            </>
                          ) : (
                            "Share"
                          )}
                        </Button>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
          </TabsContent>
        </Tabs>

        {/* Permission Levels Explanation */}
        <div className="space-y-2 p-3 bg-slate-50 dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-700 mt-4">
          <Label className="text-xs font-semibold text-slate-700 dark:text-slate-300">Permission Levels:</Label>
          <div className="space-y-1 text-xs text-slate-600 dark:text-slate-400">
            <div className="flex items-start gap-2">
              <Shield className="w-3 h-3 mt-0.5 text-purple-600" />
              <div>
                <span className="font-semibold">Admin:</span> Full control - edit, manage permissions, delete
              </div>
            </div>
            <div className="flex items-start gap-2">
              <Settings className="w-3 h-3 mt-0.5 text-blue-600" />
              <div>
                <span className="font-semibold">Manage:</span> Can edit and execute workflow
              </div>
            </div>
            <div className="flex items-start gap-2">
              <Eye className="w-3 h-3 mt-0.5 text-gray-600" />
              <div>
                <span className="font-semibold">Use:</span> Can execute workflow (read-only)
              </div>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
