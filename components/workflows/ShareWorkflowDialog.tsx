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
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Loader2, X, Shield, Settings, Eye, UserPlus } from "lucide-react"
import { logger } from '@/lib/utils/logger'
import { useToast } from "@/hooks/use-toast"

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

interface TeamMember {
  user_id: string
  email: string
  username: string | null
  full_name: string | null
  avatar_url: string | null
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
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([])
  const [loading, setLoading] = useState(false)
  const [adding, setAdding] = useState(false)
  const [selectedUserId, setSelectedUserId] = useState<string>("")
  const [selectedPermission, setSelectedPermission] = useState<'use' | 'manage' | 'admin'>('use')
  const { toast } = useToast()

  // Fetch permissions when dialog opens
  useEffect(() => {
    if (open) {
      fetchPermissions()
      fetchTeamMembers()
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

  const fetchTeamMembers = async () => {
    try {
      // TODO: Fetch team members from the workflow's workspace (team/org)
      // For now, we'll just use an empty array
      // In a real implementation, you'd call /api/teams/[teamId]/members
      setTeamMembers([])

    } catch (error: any) {
      logger.error('[ShareWorkflowDialog] Error fetching team members:', error)
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

  const getPermissionBadgeColor = (permission: string) => {
    switch (permission) {
      case 'admin':
        return 'bg-purple-100 text-purple-800'
      case 'manage':
        return 'bg-blue-100 text-blue-800'
      case 'use':
        return 'bg-gray-100 text-gray-800'
      default:
        return 'bg-gray-100 text-gray-800'
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[550px]">
        <DialogHeader>
          <DialogTitle>Share Workflow</DialogTitle>
          <DialogDescription>
            Manage who has access to "{workflowName}"
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Add New Permission */}
          <div className="space-y-3 p-4 border border-slate-200 rounded-lg bg-slate-50">
            <Label className="text-sm font-semibold">Add Team Member</Label>
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
            <p className="text-xs text-slate-500">
              Note: Currently only supports user IDs. Team member selector coming soon.
            </p>
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
                No shared access yet
              </div>
            ) : (
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {permissions.map((perm) => (
                  <div
                    key={perm.id}
                    className="flex items-center justify-between p-3 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <Avatar className="w-8 h-8">
                        <AvatarFallback className="bg-slate-200 text-slate-700 text-xs">
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
                        <SelectTrigger className="w-32 h-8">
                          <SelectValue>
                            <div className="flex items-center gap-2">
                              {getPermissionIcon(perm.permission)}
                              <span className="capitalize">{perm.permission}</span>
                            </div>
                          </SelectValue>
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
                        variant="ghost"
                        size="sm"
                        className="h-8 w-8 p-0 hover:bg-red-50 hover:text-red-600"
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

          {/* Permission Levels Explanation */}
          <div className="space-y-2 p-3 bg-slate-50 rounded-lg border border-slate-200">
            <Label className="text-xs font-semibold text-slate-700">Permission Levels:</Label>
            <div className="space-y-1 text-xs text-slate-600">
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
