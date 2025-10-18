"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { useWorkflowStore } from "@/stores/workflowStore"
import { useAuthStore } from "@/stores/authStore"
import { useIntegrationStore } from "@/stores/integrationStore"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Checkbox } from "@/components/ui/checkbox"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Label } from "@/components/ui/label"
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
  Plus,
  MoreVertical,
  PlayCircle,
  PauseCircle,
  Edit,
  Copy,
  Trash2,
  Zap,
  Sparkles,
  Layers,
  TrendingUp,
  Clock,
  Users,
  Share2,
  FileText,
  RefreshCw,
  User
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
  organization_id?: string
}

interface WorkflowShare {
  id: string
  workflow_id: string
  team_id: string
  shared_by: string
  shared_at: string
  team: Team
}

interface Organization {
  id: string
  name: string
  slug: string
  description?: string
  is_personal?: boolean
  role?: string
  member_count?: number
  team_count?: number
}

export function HomeContent() {
  const router = useRouter()
  const { workflows, fetchWorkflows, updateWorkflow, deleteWorkflow } = useWorkflowStore()
  const { user, profile } = useAuthStore()
  const { getConnectedProviders } = useIntegrationStore()
  const [searchQuery, setSearchQuery] = useState("")
  const [viewMode, setViewMode] = useState<'all' | 'active' | 'drafts'>('all')
  const [shareDialog, setShareDialog] = useState<{ open: boolean; workflowId: string | null }>({ open: false, workflowId: null })
  const [deleteDialog, setDeleteDialog] = useState<{ open: boolean; workflowId: string | null; workflowName: string }>({ open: false, workflowId: null, workflowName: '' })
  const [loading, setLoading] = useState<Record<string, boolean>>({})
  const [executionStats, setExecutionStats] = useState<Record<string, { total: number; today: number; success: number; failed: number }>>({})
  const [teams, setTeams] = useState<Team[]>([])
  const [workflowShares, setWorkflowShares] = useState<Record<string, WorkflowShare[]>>({})
  const [selectedTeamIds, setSelectedTeamIds] = useState<string[]>([])
  const [organizations, setOrganizations] = useState<Organization[]>([])
  const [currentOrganization, setCurrentOrganization] = useState<Organization | null>(null)
  const [createDialog, setCreateDialog] = useState(false)
  const [newWorkflowName, setNewWorkflowName] = useState("")
  const [newWorkflowDescription, setNewWorkflowDescription] = useState("")
  const [selectedOrgId, setSelectedOrgId] = useState<string>("")
  const [selectedCreateTeamIds, setSelectedCreateTeamIds] = useState<string[]>([])
  const { toast } = useToast()

  const connectedCount = getConnectedProviders().length
  const isInTeam = teams.length > 0

  useEffect(() => {
    if (user) {
      fetchWorkflows()
      fetchExecutionStats()
      fetchTeams()
      fetchOrganizations()
    }
  }, [user, fetchWorkflows])

  useEffect(() => {
    // Listen for organization changes
    const handleOrgChange = (event: CustomEvent) => {
      setCurrentOrganization(event.detail)
      setSelectedOrgId(event.detail.id)
    }
    window.addEventListener('organization-changed', handleOrgChange as EventListener)

    // Get initial organization from localStorage
    const storedOrgId = localStorage.getItem('current_organization_id')
    if (storedOrgId && organizations.length > 0) {
      const org = organizations.find(o => o.id === storedOrgId)
      if (org) {
        setCurrentOrganization(org)
        setSelectedOrgId(org.id)
      }
    }

    return () => {
      window.removeEventListener('organization-changed', handleOrgChange as EventListener)
    }
  }, [organizations])

  const fetchExecutionStats = async () => {
    try {
      const response = await fetch('/api/analytics/workflow-stats')
      const data = await response.json()
      if (data.success) {
        setExecutionStats(data.stats || {})
      }
    } catch (error) {
      logger.error('Failed to fetch execution stats:', error)
    }
  }

  const fetchTeams = async () => {
    try {
      const response = await fetch('/api/teams')
      const data = await response.json()
      if (data.success) {
        setTeams(data.teams || [])
      }
    } catch (error) {
      logger.error('Failed to fetch teams:', error)
    }
  }

  const fetchOrganizations = async () => {
    try {
      const response = await fetch('/api/organizations')
      const data = await response.json()
      if (Array.isArray(data)) {
        setOrganizations(data)

        // Set current org from localStorage or default to first
        const storedOrgId = localStorage.getItem('current_organization_id')
        if (storedOrgId) {
          const org = data.find((o: Organization) => o.id === storedOrgId)
          if (org) {
            setCurrentOrganization(org)
            setSelectedOrgId(org.id)
          }
        } else if (data.length > 0) {
          setCurrentOrganization(data[0])
          setSelectedOrgId(data[0].id)
        }
      }
    } catch (error) {
      logger.error('Failed to fetch organizations:', error)
    }
  }

  const fetchWorkflowShares = async (workflowId: string) => {
    try {
      const response = await fetch(`/api/workflows/${workflowId}/share`)
      const data = await response.json()
      if (data.success) {
        setWorkflowShares(prev => ({ ...prev, [workflowId]: data.shares || [] }))
        // Set selected teams based on current shares
        setSelectedTeamIds(data.shares?.map((s: WorkflowShare) => s.team_id) || [])
      }
    } catch (error) {
      logger.error('Failed to fetch workflow shares:', error)
    }
  }

  const filtered = workflows.filter(w => {
    const matchesSearch = w.name.toLowerCase().includes(searchQuery.toLowerCase())
    const matchesView = viewMode === 'all' ||
      (viewMode === 'active' && w.status === 'active') ||
      (viewMode === 'drafts' && w.status === 'draft')
    return matchesSearch && matchesView
  })

  const stats = {
    active: workflows.filter(w => w.status === 'active').length,
    total: workflows.length,
    drafts: workflows.filter(w => w.status === 'draft').length
  }

  const getCreatorName = (workflow: any) => {
    if (workflow.user_id === user?.id) return 'You'
    // Check if creator data is loaded
    if (workflow.creator) {
      return workflow.creator.username || workflow.creator.email?.split('@')[0] || 'Team Member'
    }
    return 'Unknown'
  }

  const formatDate = (date: string) => {
    try {
      return formatDistanceToNow(new Date(date), { addSuffix: true })
    } catch {
      return 'Recently'
    }
  }

  const handleDuplicate = async (workflow: any) => {
    setLoading(prev => ({ ...prev, [`duplicate-${workflow.id}`]: true }))

    try {
      const response = await fetch(`/api/workflows/${workflow.id}/duplicate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      })

      const data = await response.json()

      if (data.success) {
        toast({
          title: "Workflow Duplicated",
          description: `Created a copy of "${workflow.name}"`,
        })
        fetchWorkflows()
      } else {
        throw new Error(data.error || 'Failed to duplicate')
      }
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to duplicate workflow",
        variant: "destructive"
      })
    } finally {
      setLoading(prev => ({ ...prev, [`duplicate-${workflow.id}`]: false }))
    }
  }

  const handleDelete = async () => {
    if (!deleteDialog.workflowId) return

    setLoading(prev => ({ ...prev, [`delete-${deleteDialog.workflowId}`]: true }))

    try {
      await deleteWorkflow(deleteDialog.workflowId)
      toast({
        title: "Workflow Deleted",
        description: `"${deleteDialog.workflowName}" has been deleted.`,
      })
      setDeleteDialog({ open: false, workflowId: null, workflowName: '' })
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to delete workflow",
        variant: "destructive"
      })
    } finally {
      setLoading(prev => ({ ...prev, [`delete-${deleteDialog.workflowId}`]: false }))
    }
  }

  const handleToggleStatus = async (workflow: any) => {
    const newStatus = workflow.status === 'active' ? 'draft' : 'active'
    setLoading(prev => ({ ...prev, [`status-${workflow.id}`]: true }))

    try {
      await updateWorkflow(workflow.id, { status: newStatus })
      toast({
        title: newStatus === 'active' ? "Workflow Activated" : "Workflow Paused",
        description: `"${workflow.name}" is now ${newStatus}.`,
      })
      fetchWorkflows()
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to update workflow status",
        variant: "destructive"
      })
    } finally {
      setLoading(prev => ({ ...prev, [`status-${workflow.id}`]: false }))
    }
  }

  const handleOpenShareDialog = async (workflowId: string) => {
    setShareDialog({ open: true, workflowId })
    await fetchWorkflowShares(workflowId)
  }

  const handleShareToTeams = async () => {
    if (!shareDialog.workflowId || selectedTeamIds.length === 0) {
      toast({
        title: "No teams selected",
        description: "Please select at least one team to share with.",
        variant: "destructive"
      })
      return
    }

    setLoading(prev => ({ ...prev, [`share-${shareDialog.workflowId}`]: true }))

    try {
      const response = await fetch(`/api/workflows/${shareDialog.workflowId}/share`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ teamIds: selectedTeamIds })
      })

      const data = await response.json()

      if (data.success) {
        toast({
          title: "Shared to Teams",
          description: `Workflow has been shared with ${selectedTeamIds.length} team${selectedTeamIds.length > 1 ? 's' : ''}.`,
        })
        setShareDialog({ open: false, workflowId: null })
        setSelectedTeamIds([])
        fetchWorkflows()
      } else {
        throw new Error(data.error || 'Failed to share')
      }
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to share workflow",
        variant: "destructive"
      })
    } finally {
      setLoading(prev => ({ ...prev, [`share-${shareDialog.workflowId}`]: false }))
    }
  }

  const handleUnshareFromTeam = async (workflowId: string, teamId: string) => {
    setLoading(prev => ({ ...prev, [`unshare-${workflowId}-${teamId}`]: true }))

    try {
      const response = await fetch(`/api/workflows/${workflowId}/share?teamId=${teamId}`, {
        method: 'DELETE'
      })

      const data = await response.json()

      if (data.success) {
        toast({
          title: "Removed from Team",
          description: "Workflow has been unshared from the team.",
        })
        fetchWorkflowShares(workflowId)
        fetchWorkflows()
      } else {
        throw new Error(data.error || 'Failed to unshare')
      }
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to remove from team",
        variant: "destructive"
      })
    } finally {
      setLoading(prev => ({ ...prev, [`unshare-${workflowId}-${teamId}`]: false }))
    }
  }

  const toggleTeamSelection = (teamId: string) => {
    setSelectedTeamIds(prev =>
      prev.includes(teamId)
        ? prev.filter(id => id !== teamId)
        : [...prev, teamId]
    )
  }

  const toggleCreateTeamSelection = (teamId: string) => {
    setSelectedCreateTeamIds(prev =>
      prev.includes(teamId)
        ? prev.filter(id => id !== teamId)
        : [...prev, teamId]
    )
  }

  const handleCreateWorkflow = async () => {
    if (!newWorkflowName.trim()) {
      toast({
        title: "Name Required",
        description: "Please enter a name for your workflow.",
        variant: "destructive"
      })
      return
    }

    setLoading(prev => ({ ...prev, 'create-workflow': true }))

    try {
      // Create the workflow
      const response = await fetch('/api/workflows', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newWorkflowName.trim(),
          description: newWorkflowDescription.trim() || null,
          organization_id: selectedOrgId || null,
          status: 'draft'
        })
      })

      const data = await response.json()

      if (!data.success) {
        throw new Error(data.error || 'Failed to create workflow')
      }

      const workflowId = data.workflow.id

      // Share with teams if any selected
      if (selectedCreateTeamIds.length > 0) {
        await fetch(`/api/workflows/${workflowId}/share`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ teamIds: selectedCreateTeamIds })
        })
      }

      toast({
        title: "Workflow Created",
        description: `"${newWorkflowName}" has been created successfully.`,
      })

      // Reset form
      setNewWorkflowName("")
      setNewWorkflowDescription("")
      setSelectedCreateTeamIds([])
      setCreateDialog(false)

      // Navigate to new builder
      router.push(`/workflow/${workflowId}/builder`)
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to create workflow",
        variant: "destructive"
      })
    } finally {
      setLoading(prev => ({ ...prev, 'create-workflow': false }))
    }
  }

  return (
    <div className="space-y-6">
      {/* Header Bar */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 px-3 py-1.5 bg-muted rounded-lg">
            <div className="flex items-center gap-1.5">
              <div className="w-2 h-2 bg-green-500 rounded-full"></div>
              <span className="text-sm font-medium">{stats.active} active</span>
            </div>
            <div className="w-px h-4 bg-border"></div>
            <span className="text-sm text-muted-foreground">{stats.total} total</span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => router.push('/templates')}>
            <Sparkles className="w-4 h-4 mr-2" />
            Browse Templates
          </Button>
          <Button onClick={() => setCreateDialog(true)}>
            <Plus className="w-4 h-4 mr-2" />
            New Workflow
          </Button>
        </div>
      </div>

      {/* Search and Filters */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1">
          <Input
            placeholder="Search workflows..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="h-9"
          />
        </div>

        <div className="flex items-center gap-2 border rounded-lg p-1">
          <Button
            variant={viewMode === 'all' ? 'secondary' : 'ghost'}
            size="sm"
            onClick={() => setViewMode('all')}
            className="h-7 text-xs"
          >
            All
          </Button>
          <Button
            variant={viewMode === 'active' ? 'secondary' : 'ghost'}
            size="sm"
            onClick={() => setViewMode('active')}
            className="h-7 text-xs"
          >
            Active
          </Button>
          <Button
            variant={viewMode === 'drafts' ? 'secondary' : 'ghost'}
            size="sm"
            onClick={() => setViewMode('drafts')}
            className="h-7 text-xs"
          >
            Drafts
          </Button>
        </div>
      </div>

      {/* Empty State */}
      {filtered.length === 0 && workflows.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 px-4">
          <div className="w-16 h-16 bg-primary/10 rounded-2xl flex items-center justify-center mb-4">
            <Zap className="w-8 h-8 text-primary" />
          </div>
          <h3 className="text-2xl font-semibold mb-2">Create your first workflow</h3>
          <p className="text-muted-foreground text-center max-w-md mb-6">
            Automate tasks by connecting your apps and services. Start from scratch or use a template.
          </p>
          <div className="flex gap-3">
            <Button variant="outline" onClick={() => router.push('/templates')}>
              <Layers className="w-4 h-4 mr-2" />
              Explore Templates
            </Button>
            <Button onClick={() => setCreateDialog(true)}>
              <Plus className="w-4 h-4 mr-2" />
              Build From Scratch
            </Button>
          </div>

          {connectedCount === 0 && (
            <div className="mt-8 p-4 bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-900 rounded-lg max-w-md">
              <p className="text-sm text-center text-blue-900 dark:text-blue-100">
                <strong>Tip:</strong> Connect your apps first to see available actions
              </p>
              <Button
                variant="link"
                size="sm"
                onClick={() => router.push('/apps')}
                className="mt-2 w-full"
              >
                Connect Apps →
              </Button>
            </div>
          )}
        </div>
      )}

      {/* Workflows List */}
      {filtered.length > 0 && (
        <div className="space-y-2">
          {filtered.map((workflow: any) => {
            const stats = executionStats[workflow.id] || { total: 0, today: 0, success: 0, failed: 0 }

            return (
              <div
                key={workflow.id}
                className="group flex items-center gap-4 p-4 border rounded-xl hover:bg-accent/50 transition-all cursor-pointer"
                onClick={() => router.push(`/workflow/${workflow.id}/builder`)}
              >
                {/* Status Indicator */}
                <div className="flex-shrink-0">
                  {workflow.status === 'active' ? (
                    <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                  ) : (
                    <div className="w-2 h-2 bg-gray-300 dark:bg-gray-700 rounded-full"></div>
                  )}
                </div>

                {/* Workflow Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className="font-medium truncate">{workflow.name}</h3>

                    {/* Status Badge */}
                    <Badge variant={workflow.status === 'active' ? 'default' : 'secondary'} className="text-xs">
                      {((workflow.status || 'draft').charAt(0).toUpperCase() + (workflow.status || 'draft').slice(1))}
                    </Badge>

                    {/* Template Badge */}
                    {workflow.source_template_id && (
                      <Badge variant="outline" className="text-xs">
                        <FileText className="w-3 h-3 mr-1" />
                        From Template
                      </Badge>
                    )}

                    {/* Team Badge */}
                    {workflow.organization_id && (
                      <Badge variant="outline" className="text-xs">
                        <Users className="w-3 h-3 mr-1" />
                        Team
                      </Badge>
                    )}
                  </div>

                  <div className="flex items-center gap-4 text-xs text-muted-foreground">
                    {/* Creator */}
                    <div className="flex items-center gap-1.5">
                      <div className="w-4 h-4 rounded-full bg-muted flex items-center justify-center">
                        <User className="w-2.5 h-2.5 text-muted-foreground" />
                      </div>
                      <span>{getCreatorName(workflow)}</span>
                    </div>

                    {/* Last Updated */}
                    <div className="flex items-center gap-1.5">
                      <Clock className="w-3 h-3" />
                      <span>Updated {formatDate(workflow.updated_at || workflow.created_at)}</span>
                    </div>

                    {/* Execution Stats */}
                    {workflow.status === 'active' && stats.total > 0 && (
                      <div className="flex items-center gap-1.5">
                        <TrendingUp className="w-3 h-3" />
                        <span>{stats.today} runs today</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Team Share Button (if has teams) */}
                {isInTeam && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="opacity-0 group-hover:opacity-100"
                    onClick={(e) => {
                      e.stopPropagation()
                      handleOpenShareDialog(workflow.id)
                    }}
                  >
                    <Share2 className="w-4 h-4 mr-2" />
                    Share to Teams
                  </Button>
                )}

                {/* Actions */}
                <DropdownMenu>
                  <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                    <Button variant="ghost" size="sm" className="opacity-0 group-hover:opacity-100">
                      <MoreVertical className="w-4 h-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={(e) => { e.stopPropagation(); router.push(`/workflow/${workflow.id}/builder`) }}>
                      <Edit className="w-4 h-4 mr-2" />
                      Edit Workflow
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDuplicate(workflow)
                      }}
                      disabled={loading[`duplicate-${workflow.id}`]}
                    >
                      {loading[`duplicate-${workflow.id}`] ? (
                        <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                      ) : (
                        <Copy className="w-4 h-4 mr-2" />
                      )}
                      Duplicate
                    </DropdownMenuItem>

                    {isInTeam && (
                      <>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem onClick={(e) => {
                          e.stopPropagation()
                          handleOpenShareDialog(workflow.id)
                        }}>
                          <Share2 className="w-4 h-4 mr-2" />
                          Manage Team Sharing
                        </DropdownMenuItem>
                      </>
                    )}

                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      onClick={(e) => {
                        e.stopPropagation();
                        handleToggleStatus(workflow)
                      }}
                      disabled={loading[`status-${workflow.id}`]}
                    >
                      {workflow.status === 'active' ? (
                        <>
                          <PauseCircle className="w-4 h-4 mr-2" />
                          Pause Workflow
                        </>
                      ) : (
                        <>
                          <PlayCircle className="w-4 h-4 mr-2" />
                          Activate Workflow
                        </>
                      )}
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      className="text-destructive"
                      onClick={(e) => {
                        e.stopPropagation();
                        setDeleteDialog({ open: true, workflowId: workflow.id, workflowName: workflow.name })
                      }}
                    >
                      <Trash2 className="w-4 h-4 mr-2" />
                      Delete
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            )
          })}
        </div>
      )}

      {/* No Results */}
      {filtered.length === 0 && workflows.length > 0 && (
        <div className="text-center py-12">
          <p className="text-muted-foreground">No workflows match your filters</p>
          <Button variant="link" onClick={() => { setSearchQuery(''); setViewMode('all'); }}>
            Clear filters
          </Button>
        </div>
      )}

      {/* Share to Teams Dialog */}
      <Dialog open={shareDialog.open} onOpenChange={(open) => {
        if (!open) {
          setShareDialog({ open, workflowId: null })
          setSelectedTeamIds([])
        }
      }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Share Workflow with Teams</DialogTitle>
            <DialogDescription>
              Select teams to share this workflow with. Team members will be able to view, edit, and run the workflow.
            </DialogDescription>
          </DialogHeader>

          <div className="py-4">
            {teams.length === 0 ? (
              <div className="text-center py-8">
                <Users className="w-12 h-12 mx-auto text-muted-foreground mb-3" />
                <p className="text-sm text-muted-foreground mb-4">
                  You're not a member of any teams yet.
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setShareDialog({ open: false, workflowId: null })
                    router.push('/organization-settings?tab=teams')
                  }}
                >
                  Create or Join a Team
                </Button>
              </div>
            ) : (
              <ScrollArea className="max-h-[300px] pr-4">
                <div className="space-y-3">
                  {teams.map((team) => (
                    <div
                      key={team.id}
                      className="flex items-start gap-3 p-3 border rounded-lg hover:bg-accent/50 cursor-pointer transition-colors"
                      onClick={() => toggleTeamSelection(team.id)}
                    >
                      <Checkbox
                        checked={selectedTeamIds.includes(team.id)}
                        onCheckedChange={() => toggleTeamSelection(team.id)}
                        className="mt-0.5"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <Users className="w-4 h-4 text-primary flex-shrink-0" />
                          <span className="font-medium text-sm truncate">{team.name}</span>
                        </div>
                        {team.description && (
                          <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                            {team.description}
                          </p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            )}

            {/* Currently Shared With */}
            {shareDialog.workflowId && workflowShares[shareDialog.workflowId]?.length > 0 && (
              <div className="mt-4 pt-4 border-t">
                <p className="text-xs font-medium text-muted-foreground mb-2">Currently shared with:</p>
                <div className="space-y-2">
                  {workflowShares[shareDialog.workflowId].map((share) => (
                    <div key={share.id} className="flex items-center justify-between text-xs p-2 bg-muted rounded">
                      <span className="flex items-center gap-2">
                        <Users className="w-3 h-3" />
                        {share.team.name}
                      </span>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 px-2"
                        onClick={(e) => {
                          e.stopPropagation()
                          handleUnshareFromTeam(shareDialog.workflowId!, share.team_id)
                        }}
                        disabled={loading[`unshare-${shareDialog.workflowId}-${share.team_id}`]}
                      >
                        {loading[`unshare-${shareDialog.workflowId}-${share.team_id}`] ? (
                          <RefreshCw className="w-3 h-3 animate-spin" />
                        ) : (
                          <Trash2 className="w-3 h-3" />
                        )}
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setShareDialog({ open: false, workflowId: null })
                setSelectedTeamIds([])
              }}
            >
              Cancel
            </Button>
            <Button
              onClick={handleShareToTeams}
              disabled={loading[`share-${shareDialog.workflowId}`] || selectedTeamIds.length === 0}
            >
              {loading[`share-${shareDialog.workflowId}`] ? (
                <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Share2 className="w-4 h-4 mr-2" />
              )}
              Share to {selectedTeamIds.length} Team{selectedTeamIds.length !== 1 ? 's' : ''}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Create Workflow Dialog */}
      <Dialog open={createDialog} onOpenChange={setCreateDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Create New Workflow</DialogTitle>
            <DialogDescription>
              Set up your workflow details and optionally share it with teams.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            {/* Workflow Name */}
            <div className="space-y-2">
              <Label htmlFor="workflow-name">Workflow Name *</Label>
              <Input
                id="workflow-name"
                placeholder="e.g., Send daily summary email"
                value={newWorkflowName}
                onChange={(e) => setNewWorkflowName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleCreateWorkflow()}
              />
            </div>

            {/* Workflow Description */}
            <div className="space-y-2">
              <Label htmlFor="workflow-description">Description</Label>
              <Textarea
                id="workflow-description"
                placeholder="What does this workflow do?"
                value={newWorkflowDescription}
                onChange={(e) => setNewWorkflowDescription(e.target.value)}
                rows={3}
              />
            </div>

            {/* Organization Selection (if multiple orgs) */}
            {organizations.filter(org => !org.is_personal).length > 0 && (
              <div className="space-y-2">
                <Label>Organization</Label>
                <div className="space-y-2">
                  {/* Personal Workspace */}
                  {organizations.find(org => org.is_personal) && (
                    <div
                      className={`flex items-center gap-3 p-3 border rounded-lg cursor-pointer transition-colors ${
                        selectedOrgId === organizations.find(org => org.is_personal)?.id
                          ? 'border-primary bg-primary/5'
                          : 'hover:bg-accent/50'
                      }`}
                      onClick={() => setSelectedOrgId(organizations.find(org => org.is_personal)!.id)}
                    >
                      <User className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                      <div className="flex-1">
                        <p className="text-sm font-medium">
                          {organizations.find(org => org.is_personal)?.name}
                        </p>
                        <p className="text-xs text-muted-foreground">Personal workspace</p>
                      </div>
                      <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${
                        selectedOrgId === organizations.find(org => org.is_personal)?.id
                          ? 'border-primary'
                          : 'border-muted-foreground'
                      }`}>
                        {selectedOrgId === organizations.find(org => org.is_personal)?.id && (
                          <div className="w-2 h-2 rounded-full bg-primary" />
                        )}
                      </div>
                    </div>
                  )}

                  {/* Team Organizations */}
                  {organizations.filter(org => !org.is_personal).map((org) => (
                    <div
                      key={org.id}
                      className={`flex items-center gap-3 p-3 border rounded-lg cursor-pointer transition-colors ${
                        selectedOrgId === org.id
                          ? 'border-primary bg-primary/5'
                          : 'hover:bg-accent/50'
                      }`}
                      onClick={() => setSelectedOrgId(org.id)}
                    >
                      <Users className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                      <div className="flex-1">
                        <p className="text-sm font-medium">{org.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {org.member_count} {org.member_count === 1 ? 'member' : 'members'}
                        </p>
                      </div>
                      <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${
                        selectedOrgId === org.id
                          ? 'border-primary'
                          : 'border-muted-foreground'
                      }`}>
                        {selectedOrgId === org.id && (
                          <div className="w-2 h-2 rounded-full bg-primary" />
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Team Sharing */}
            <div className="space-y-2 pt-2 border-t">
              <Label>Share with Teams (Optional)</Label>
              <p className="text-xs text-muted-foreground">
                {teams.length > 0
                  ? "Select teams that should have access to this workflow."
                  : "Create a team to collaborate and share workflows with others."}
              </p>

              {teams.length > 0 ? (
                <ScrollArea className="max-h-[200px] pr-2">
                  <div className="space-y-2">
                    {teams.map((team) => (
                      <div
                        key={team.id}
                        className="flex items-start gap-3 p-2 border rounded-lg hover:bg-accent/50 cursor-pointer transition-colors"
                        onClick={() => toggleCreateTeamSelection(team.id)}
                      >
                        <Checkbox
                          checked={selectedCreateTeamIds.includes(team.id)}
                          onCheckedChange={() => toggleCreateTeamSelection(team.id)}
                          className="mt-0.5"
                        />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <Users className="w-3 h-3 text-primary flex-shrink-0" />
                            <span className="text-sm font-medium truncate">{team.name}</span>
                          </div>
                          {team.description && (
                            <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">
                              {team.description}
                            </p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              ) : (
                <div className="flex flex-col items-center justify-center p-6 border rounded-lg bg-muted/30">
                  <Users className="w-8 h-8 text-muted-foreground mb-2" />
                  <p className="text-sm text-muted-foreground text-center mb-3">
                    No teams available yet
                  </p>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setCreateDialog(false)
                      router.push('/organization-settings?tab=teams')
                    }}
                  >
                    Create a Team
                  </Button>
                </div>
              )}
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setCreateDialog(false)
                setNewWorkflowName("")
                setNewWorkflowDescription("")
                setSelectedCreateTeamIds([])
              }}
              disabled={loading['create-workflow']}
            >
              Cancel
            </Button>
            <Button onClick={handleCreateWorkflow} disabled={loading['create-workflow']}>
              {loading['create-workflow'] ? (
                <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Plus className="w-4 h-4 mr-2" />
              )}
              Create Workflow
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialog.open} onOpenChange={(open) => setDeleteDialog({ open, workflowId: null, workflowName: '' })}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete "{deleteDialog.workflowName}". This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={loading[`delete-${deleteDialog.workflowId}`]}
            >
              {loading[`delete-${deleteDialog.workflowId}`] ? (
                <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Trash2 className="w-4 h-4 mr-2" />
              )}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
