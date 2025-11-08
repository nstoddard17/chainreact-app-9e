"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import Image from "next/image"
import { useWorkflowStore } from "@/stores/workflowStore"
import { useAuthStore } from "@/stores/authStore"
import { useIntegrationStore } from "@/stores/integrationStore"
import { usePlanRestrictions } from "@/hooks/use-plan-restrictions"
import { LockedFeature, UpgradePlanModal } from "@/components/plan-restrictions"
import { Button } from "@/components/ui/button"
import { ProfessionalSearch } from "@/components/ui/professional-search"
import { Badge } from "@/components/ui/badge"
import { Checkbox } from "@/components/ui/checkbox"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
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
  User,
  AlertTriangle,
  CheckCircle2,
  Circle,
  Pause,
  Plug,
  BarChart3,
  Settings,
  Search,
  Check,
  X
} from "lucide-react"
import { formatDistanceToNow } from "date-fns"
import { useToast } from "@/hooks/use-toast"
import { logger } from "@/lib/utils/logger"
import { INTEGRATION_CONFIGS } from "@/lib/integrations/availableIntegrations"

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
  const { workflows, loadingList, fetchWorkflows, updateWorkflow, deleteWorkflow } = useWorkflowStore()
  const { user, profile } = useAuthStore()
  const { getConnectedProviders } = useIntegrationStore()
  const { checkFeatureAccess, checkActionLimit } = usePlanRestrictions()
  const [searchQuery, setSearchQuery] = useState("")
  const [viewMode, setViewMode] = useState<'all' | 'active' | 'drafts' | 'incomplete'>('all')
  const [connectAppsDialog, setConnectAppsDialog] = useState(false)
  const [appSearchQuery, setAppSearchQuery] = useState("")
  const [connectingApp, setConnectingApp] = useState<string | null>(null)
  const [newlyConnectedApp, setNewlyConnectedApp] = useState<string | null>(null)
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
  const [upgradeModalOpen, setUpgradeModalOpen] = useState(false)
  const [requiredPlan, setRequiredPlan] = useState<'free' | 'starter' | 'professional' | 'team' | 'enterprise' | undefined>()
  const { toast } = useToast()

  const connectedProviders = getConnectedProviders()
  const connectedCount = connectedProviders.length
  const isInTeam = teams.length > 0

  // Load additional data that wasn't preloaded (execution stats and teams)
  // Workflows and organizations are already loaded by the preloader
  useEffect(() => {
    if (user) {
      // These are optional/supplementary data, load them in the background
      fetchExecutionStats()
      fetchTeams()
    }
  }, [user])

  useEffect(() => {
    // Listen for organization changes
    const handleOrgChange = (event: CustomEvent) => {
      setCurrentOrganization(event.detail)
      setSelectedOrgId(event.detail.id)
    }
    window.addEventListener('organization-changed', handleOrgChange as EventListener)

    // Get initial organization from localStorage
    const storedOrgId = localStorage.getItem('current_workspace_id')
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

  // Check for newly connected app and show green highlight that fades
  useEffect(() => {
    const newlyConnected = localStorage.getItem('newly_connected_app')
    if (newlyConnected) {
      setNewlyConnectedApp(newlyConnected)
      // Clear from localStorage
      localStorage.removeItem('newly_connected_app')

      // Fade out after 2 seconds
      const fadeTimeout = setTimeout(() => {
        setNewlyConnectedApp(null)
      }, 2000)

      return () => clearTimeout(fadeTimeout)
    }
  }, [])

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
        const storedOrgId = localStorage.getItem('current_workspace_id')
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

  // Check if workflow is complete and ready to activate
  const validateWorkflow = (workflow: any) => {
    const issues: string[] = []

    // Parse nodes from workflow_json
    let nodes = []
    try {
      const workflowData = typeof workflow.workflow_json === 'string'
        ? JSON.parse(workflow.workflow_json)
        : workflow.workflow_json
      nodes = workflowData?.nodes || []
    } catch (e) {
      issues.push('Invalid workflow configuration')
      return { isValid: false, issues }
    }

    // Must have at least one trigger
    const hasTrigger = nodes.some((node: any) => node.data?.isTrigger === true)
    if (!hasTrigger) {
      issues.push('No trigger node')
    }

    // Must have at least one action
    const hasAction = nodes.some((node: any) => node.data?.isTrigger !== true && node.type === 'custom')
    if (!hasAction) {
      issues.push('No action nodes')
    }

    // Check for unconfigured nodes
    const unconfiguredNodes = nodes.filter((node: any) => {
      if (node.type !== 'custom') return false
      const config = node.data?.config || {}
      const configKeys = Object.keys(config)
      return configKeys.length === 0 || configKeys.every(key => !config[key])
    })
    if (unconfiguredNodes.length > 0) {
      issues.push(`${unconfiguredNodes.length} unconfigured node${unconfiguredNodes.length > 1 ? 's' : ''}`)
    }

    return { isValid: issues.length === 0, issues }
  }

  const filtered = workflows.filter(w => {
    const matchesSearch = w.name.toLowerCase().includes(searchQuery.toLowerCase())
    const matchesView = viewMode === 'all' ||
      (viewMode === 'active' && w.status === 'active') ||
      (viewMode === 'drafts' && w.status === 'draft') ||
      (viewMode === 'incomplete' && (() => {
        const validation = validateWorkflow(w)
        return !validation.isValid && w.status !== 'active'
      })())
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

  // Get status icon and color
  const getStatusDisplay = (workflow: any) => {
    const validation = validateWorkflow(workflow)
    const status = workflow.status || 'draft'

    if (status === 'active') {
      return {
        icon: CheckCircle2,
        iconColor: 'text-green-500',
        bgColor: 'bg-green-500/10',
        borderColor: 'border-green-500/20',
        dotColor: 'bg-green-500',
        label: 'Active',
        labelColor: 'text-green-600 dark:text-green-500'
      }
    }

    if (status === 'paused') {
      return {
        icon: Pause,
        iconColor: 'text-orange-500',
        bgColor: 'bg-orange-500/10',
        borderColor: 'border-orange-500/20',
        dotColor: 'bg-orange-500',
        label: 'Paused',
        labelColor: 'text-orange-600 dark:text-orange-500'
      }
    }

    // Draft status
    if (!validation.isValid) {
      return {
        icon: AlertTriangle,
        iconColor: 'text-yellow-500',
        bgColor: 'bg-yellow-500/10',
        borderColor: 'border-yellow-500/20',
        dotColor: 'bg-yellow-500',
        label: 'Incomplete',
        labelColor: 'text-yellow-600 dark:text-yellow-500',
        warning: true,
        issues: validation.issues
      }
    }

    return {
      icon: Circle,
      iconColor: 'text-gray-400',
      bgColor: 'bg-gray-500/10',
      borderColor: 'border-gray-500/20',
      dotColor: 'bg-gray-400',
      label: 'Draft',
      labelColor: 'text-gray-600 dark:text-gray-400'
    }
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

    const workflowId = deleteDialog.workflowId
    const workflowName = deleteDialog.workflowName

    // Close dialog immediately
    setDeleteDialog({ open: false, workflowId: null, workflowName: '' })

    // Show success toast immediately (optimistic)
    toast({
      title: "Workflow Deleted",
      description: `"${workflowName}" has been deleted.`,
    })

    try {
      // Deletion happens in background (optimistic update already applied)
      await deleteWorkflow(workflowId)
    } catch (error: any) {
      // If deletion fails, workflow will be restored by store rollback
      toast({
        title: "Failed to Delete",
        description: error.message || "Failed to delete workflow. It has been restored.",
        variant: "destructive"
      })
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

  // Handle New Workflow button click - routes based on AI agent preference
  const handleNewWorkflowClick = () => {
    const aiPref = profile?.ai_agent_preference || 'always_show'

    if (aiPref === 'always_skip') {
      // User prefers to skip AI - show create dialog directly
      setCreateDialog(true)
    } else {
      // User prefers AI or wants to be asked - go to AI agent page
      router.push('/workflows/ai-agent')
    }
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

    // Check workflow creation limit
    const workflowLimit = checkActionLimit('createWorkflow', workflows.length)
    if (!workflowLimit.allowed) {
      setRequiredPlan(workflowLimit.minimumPlan)
      setUpgradeModalOpen(true)
      toast({
        title: "Workflow Limit Reached",
        description: workflowLimit.reason,
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
      router.push(`/workflows/builder/${workflowId}`)
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

  // Workflows are already loaded by the preloader - no need for loading screen here!

  // Calculate additional stats for dashboard
  const totalExecutions = Object.values(executionStats).reduce((sum, stat) => sum + stat.total, 0)
  const todayExecutions = Object.values(executionStats).reduce((sum, stat) => sum + stat.today, 0)
  const successRate = totalExecutions > 0
    ? Math.round((Object.values(executionStats).reduce((sum, stat) => sum + stat.success, 0) / totalExecutions) * 100)
    : 0
  const incompleteCount = workflows.filter(w => {
    const validation = validateWorkflow(w)
    return !validation.isValid && w.status !== 'active'
  }).length

  return (
    <>
    <div className="h-full w-full grid grid-cols-1 xl:grid-cols-4 gap-6">
      {/* Main Content Area - 3 columns */}
      <div className="xl:col-span-3 space-y-6">

        {/* Dashboard Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Active Workflows */}
          <div className="relative overflow-hidden rounded-xl border bg-card p-6 shadow-sm hover:shadow-md transition-shadow">
            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <p className="text-sm font-medium text-muted-foreground">Active</p>
                <p className="text-3xl font-bold">{stats.active}</p>
                <p className="text-xs text-muted-foreground">Workflows Running</p>
              </div>
              <div className="rounded-full bg-green-500/10 p-3">
                <PlayCircle className="h-6 w-6 text-green-500" />
              </div>
            </div>
            <div className="absolute bottom-0 left-0 right-0 h-1 bg-green-500/20">
              <div className="h-full bg-green-500" style={{ width: `${(stats.active / stats.total) * 100}%` }} />
            </div>
          </div>

          {/* Total Workflows */}
          <div className="relative overflow-hidden rounded-xl border bg-card p-6 shadow-sm hover:shadow-md transition-shadow">
            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <p className="text-sm font-medium text-muted-foreground">Total</p>
                <p className="text-3xl font-bold">{stats.total}</p>
                <p className="text-xs text-muted-foreground">All Workflows</p>
              </div>
              <div className="rounded-full bg-blue-500/10 p-3">
                <Layers className="h-6 w-6 text-blue-500" />
              </div>
            </div>
            <div className="absolute bottom-0 left-0 right-0 h-1 bg-blue-500/20">
              <div className="h-full bg-blue-500" style={{ width: '100%' }} />
            </div>
          </div>

          {/* Executions Today */}
          <div className="relative overflow-hidden rounded-xl border bg-card p-6 shadow-sm hover:shadow-md transition-shadow">
            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <p className="text-sm font-medium text-muted-foreground">Today</p>
                <p className="text-3xl font-bold">{todayExecutions}</p>
                <p className="text-xs text-muted-foreground">Executions</p>
              </div>
              <div className="rounded-full bg-purple-500/10 p-3">
                <TrendingUp className="h-6 w-6 text-purple-500" />
              </div>
            </div>
            <div className="absolute bottom-0 left-0 right-0 h-1 bg-purple-500/20">
              <div className="h-full bg-purple-500" style={{ width: `${Math.min((todayExecutions / 100) * 100, 100)}%` }} />
            </div>
          </div>

          {/* Success Rate */}
          <div className="relative overflow-hidden rounded-xl border bg-card p-6 shadow-sm hover:shadow-md transition-shadow">
            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <p className="text-sm font-medium text-muted-foreground">Success</p>
                <p className="text-3xl font-bold">{successRate}%</p>
                <p className="text-xs text-muted-foreground">Success Rate</p>
              </div>
              <div className="rounded-full bg-emerald-500/10 p-3">
                <CheckCircle2 className="h-6 w-6 text-emerald-500" />
              </div>
            </div>
            <div className="absolute bottom-0 left-0 right-0 h-1 bg-emerald-500/20">
              <div className="h-full bg-emerald-500" style={{ width: `${successRate}%` }} />
            </div>
          </div>
        </div>

        {/* Action Bar */}
        <div className="flex items-center gap-3">
          <ProfessionalSearch
            placeholder="Search workflows..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onClear={() => setSearchQuery('')}
            className="flex-1 h-9"
          />
          <div className="flex items-center gap-1 border rounded-lg p-1">
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
            <Button
              variant={viewMode === 'incomplete' ? 'secondary' : 'ghost'}
              size="sm"
              onClick={() => setViewMode('incomplete')}
              className="h-7 text-xs"
            >
              Incomplete
            </Button>
          </div>

          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={() => router.push('/templates')}>
              <Sparkles className="w-4 h-4 mr-2" />
              Templates
            </Button>
            <Button onClick={handleNewWorkflowClick}>
              <Plus className="w-4 h-4 mr-2" />
              New Workflow
            </Button>
          </div>
        </div>

      {/* Loading State */}
      {loadingList && workflows.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 px-4">
          <RefreshCw className="w-8 h-8 text-primary animate-spin mb-4" />
          <h3 className="text-xl font-semibold mb-2">Loading workflows...</h3>
          <p className="text-muted-foreground text-center max-w-md">
            Fetching your automations
          </p>
        </div>
      )}

      {/* Empty State */}
      {!loadingList && filtered.length === 0 && workflows.length === 0 && (
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
            <Button onClick={handleNewWorkflowClick}>
              <Plus className="w-4 h-4 mr-2" />
              New Workflow
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
            const statusDisplay = getStatusDisplay(workflow)
            const StatusIcon = statusDisplay.icon

            return (
              <div
                key={workflow.id}
                className="group flex items-center gap-4 p-4 border rounded-xl bg-white dark:bg-gray-900 hover:bg-gray-50 dark:hover:bg-gray-800 transition-all cursor-pointer"
                onClick={() => router.push(`/workflows/builder/${workflow.id}`)}
              >
                {/* Status Icon with Color */}
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <div className="flex-shrink-0">
                        <div className={`p-2 rounded-lg ${statusDisplay.bgColor} border ${statusDisplay.borderColor}`}>
                          <StatusIcon className={`w-4 h-4 ${statusDisplay.iconColor}`} />
                        </div>
                      </div>
                    </TooltipTrigger>
                    {statusDisplay.warning && statusDisplay.issues && (
                      <TooltipContent side="right" className="max-w-xs">
                        <p className="font-semibold mb-1">Cannot activate workflow:</p>
                        <ul className="text-xs space-y-1">
                          {statusDisplay.issues.map((issue, idx) => (
                            <li key={idx}>• {issue}</li>
                          ))}
                        </ul>
                      </TooltipContent>
                    )}
                    {!statusDisplay.warning && (
                      <TooltipContent side="right">
                        <p className="text-xs">{statusDisplay.label}</p>
                      </TooltipContent>
                    )}
                  </Tooltip>
                </TooltipProvider>

                {/* Workflow Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className="font-medium truncate">{workflow.name}</h3>

                    {/* Status Badge with Custom Color */}
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <div className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${statusDisplay.bgColor} ${statusDisplay.labelColor} border ${statusDisplay.borderColor} cursor-help`}>
                            {statusDisplay.warning && <AlertTriangle className="w-3 h-3 mr-1" />}
                            {statusDisplay.label}
                          </div>
                        </TooltipTrigger>
                        {statusDisplay.warning && statusDisplay.issues && (
                          <TooltipContent className="max-w-xs">
                            <p className="font-semibold mb-1">Issues preventing activation:</p>
                            <ul className="text-xs space-y-1">
                              {statusDisplay.issues.map((issue, idx) => (
                                <li key={idx}>• {issue}</li>
                              ))}
                            </ul>
                            <p className="text-xs mt-2 text-muted-foreground">Click to edit and fix these issues</p>
                          </TooltipContent>
                        )}
                      </Tooltip>
                    </TooltipProvider>

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
                    <DropdownMenuItem onClick={(e) => { e.stopPropagation(); router.push(`/workflows/builder/${workflow.id}`) }}>
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

      </div>
      {/* End Main Content Area */}

      {/* Right Sidebar - Quick Actions & Activity */}
      <div className="xl:col-span-1 space-y-6">
        {/* Quick Actions Card */}
        <div className="rounded-xl border bg-card p-6 shadow-sm">
          <h3 className="font-semibold mb-4 flex items-center gap-2">
            <Zap className="w-4 h-4 text-primary" />
            Quick Actions
          </h3>
          <div className="space-y-2">
            <Button
              variant="outline"
              className="w-full justify-start"
              onClick={() => setConnectAppsDialog(true)}
            >
              <Plug className="w-4 h-4 mr-2" />
              Connect Apps
            </Button>
            <Button
              variant="outline"
              className="w-full justify-start"
              onClick={() => router.push('/analytics')}
            >
              <BarChart3 className="w-4 h-4 mr-2" />
              View Analytics
            </Button>
            <Button
              variant="outline"
              className="w-full justify-start"
              onClick={() => router.push('/settings')}
            >
              <Settings className="w-4 h-4 mr-2" />
              Manage Settings
            </Button>
          </div>
        </div>

        {/* Stats Summary */}
        <div className="rounded-xl border bg-card p-6 shadow-sm">
          <h3 className="font-semibold mb-4">Overview</h3>
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Connected Apps</span>
              <span className="text-sm font-medium">{connectedCount}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Total Executions</span>
              <span className="text-sm font-medium">{totalExecutions}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Success Rate</span>
              <div className="flex items-center gap-2">
                <div className="w-16 h-2 bg-muted rounded-full overflow-hidden">
                  <div className="h-full bg-emerald-500" style={{ width: `${successRate}%` }} />
                </div>
                <span className="text-sm font-medium">{successRate}%</span>
              </div>
            </div>
          </div>
        </div>

        {/* Recent Activity Card */}
        <div className="rounded-xl border bg-gradient-to-br from-primary/10 to-primary/5 p-6 shadow-sm">
          <h3 className="font-semibold mb-4 flex items-center gap-2">
            <Clock className="w-4 h-4 text-primary" />
            Recent Activity
          </h3>
          <div className="space-y-3 text-sm">
            {workflows.slice(0, 3).map((workflow) => (
              <div key={workflow.id} className="flex items-start gap-2 pb-3 border-b last:border-0 last:pb-0">
                <div className="flex-1 min-w-0">
                  <p className="font-medium truncate">{workflow.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {workflow.updated_at ? new Date(workflow.updated_at).toLocaleDateString() : 'Recently'}
                  </p>
                </div>
                <div className={`w-2 h-2 rounded-full mt-1.5 flex-shrink-0 ${
                  workflow.status === 'active' ? 'bg-green-500' : 'bg-gray-400'
                }`} />
              </div>
            ))}
            {workflows.length === 0 && (
              <p className="text-xs text-muted-foreground text-center py-4">
                No workflows yet. Create one to get started!
              </p>
            )}
          </div>
        </div>
      </div>
      {/* End Right Sidebar */}

    </div>
    {/* End Grid Layout */}

    {/* Dialogs Section */}
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
            <LockedFeature
              feature="teamSharing"
              showLockIcon={true}
              fallbackMessage="Team sharing is available on the Team plan. Upgrade to collaborate with your team."
            >
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
            </LockedFeature>
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
            >
              <Trash2 className="w-4 h-4 mr-2" />
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Connect Apps Dialog */}
      <Dialog open={connectAppsDialog} onOpenChange={setConnectAppsDialog}>
        <DialogContent className="max-w-2xl max-h-[80vh]">
          <DialogHeader>
            <DialogTitle>Connect an App</DialogTitle>
            <DialogDescription>
              Search for and connect the apps you want to use in your workflows
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {/* Search Bar */}
            <ProfessionalSearch
              placeholder="Search for an app..."
              value={appSearchQuery}
              onChange={(e) => setAppSearchQuery(e.target.value)}
              onClear={() => setAppSearchQuery('')}
            />

            {/* Apps Grid */}
            <ScrollArea className="h-[400px] pr-4">
              <div className="grid grid-cols-2 gap-3">
                {Object.values(INTEGRATION_CONFIGS)
                  .filter(app => {
                    const searchLower = appSearchQuery.toLowerCase()
                    return (
                      app.name.toLowerCase().includes(searchLower) ||
                      app.description.toLowerCase().includes(searchLower) ||
                      app.category.toLowerCase().includes(searchLower)
                    )
                  })
                  .map(app => {
                    const isConnected = getConnectedProviders().includes(app.id)
                    const isConnecting = connectingApp === app.id
                    const isNewlyConnected = newlyConnectedApp === app.id

                    return (
                      <button
                        key={app.id}
                        onClick={async () => {
                          if (isConnected || isConnecting) return

                          setConnectingApp(app.id)

                          let cleanup: (() => void) | null = null
                          let checkPopupInterval: NodeJS.Timeout | null = null

                          try {
                            // Generate OAuth URL
                            const response = await fetch('/api/integrations/auth/generate-url', {
                              method: 'POST',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({ provider: app.id })
                            })

                            const data = await response.json()

                            if (data.authUrl) {
                              // Open OAuth flow in popup
                              const width = 600
                              const height = 700
                              const left = window.screen.width / 2 - width / 2
                              const top = window.screen.height / 2 - height / 2

                              const popup = window.open(
                                data.authUrl,
                                'oauth',
                                `width=${width},height=${height},left=${left},top=${top}`
                              )

                              let messageReceived = false
                              let broadcastChannel: BroadcastChannel | null = null

                              // Cleanup function
                              cleanup = () => {
                                window.removeEventListener('message', handleOAuthMessage)
                                if (broadcastChannel) {
                                  broadcastChannel.close()
                                }
                                if (checkPopupInterval) {
                                  clearInterval(checkPopupInterval)
                                }
                              }

                              // Listen for OAuth completion message
                              const handleOAuthMessage = (event: MessageEvent) => {
                                if (event.data?.type === 'oauth-complete') {
                                  messageReceived = true
                                  cleanup?.()

                                  if (event.data.success) {
                                    // Store newly connected app in localStorage
                                    localStorage.setItem('newly_connected_app', app.id)
                                    // Success - refresh integrations
                                    window.location.reload()
                                  } else {
                                    // Only show error toast - popup already showed visual feedback
                                    toast({
                                      title: "Connection Failed",
                                      description: event.data.error || "Failed to connect. Please try again.",
                                      variant: "destructive",
                                    })
                                    setConnectingApp(null)
                                  }

                                  popup?.close()
                                }
                              }

                              window.addEventListener('message', handleOAuthMessage)

                              // Also listen via BroadcastChannel (more reliable for same-origin)
                              try {
                                broadcastChannel = new BroadcastChannel('oauth_channel')
                                broadcastChannel.onmessage = handleOAuthMessage
                              } catch (e) {
                                // BroadcastChannel not supported
                              }

                              // Check if popup was blocked
                              if (!popup || popup.closed) {
                                cleanup?.()
                                toast({
                                  title: "Popup Blocked",
                                  description: "Please allow popups for this site and try again.",
                                  variant: "destructive",
                                })
                                setConnectingApp(null)
                                return
                              }

                              // Handle popup closed without OAuth completion message
                              checkPopupInterval = setInterval(() => {
                                if (popup?.closed) {
                                  clearInterval(checkPopupInterval!)
                                  cleanup?.()

                                  // If no message received, user likely cancelled
                                  if (!messageReceived) {
                                    setConnectingApp(null)
                                    // No toast needed - user intentionally closed the window
                                  }
                                }
                              }, 500)
                            } else {
                              throw new Error('Failed to generate auth URL')
                            }
                          } catch (error) {
                            logger.error('Failed to connect app:', error)
                            toast({
                              title: "Error",
                              description: `Failed to connect ${app.name}. Please try again.`,
                              variant: "destructive"
                            })
                            setConnectingApp(null)
                          } finally {
                            // Ensure cleanup happens even if error occurs
                            // Don't clear connecting state here - let the popup handlers do it
                          }
                        }}
                        className={`flex flex-col items-start gap-3 p-4 rounded-lg border text-left transition-all duration-500 ${
                          isNewlyConnected
                            ? 'bg-green-100 dark:bg-green-900/40 border-green-400 dark:border-green-600 shadow-lg shadow-green-500/20'
                            : isConnected
                            ? 'bg-green-50 dark:bg-green-950/20 border-green-200 dark:border-green-800'
                            : isConnecting
                            ? 'bg-muted/50 border-muted-foreground/20 cursor-wait'
                            : 'hover:bg-accent border-border hover:border-primary/50 cursor-pointer'
                        }`}
                        disabled={isConnected || isConnecting}
                      >
                        <div className="flex items-center justify-between w-full">
                          <div className="w-10 h-10 rounded-lg flex items-center justify-center bg-white dark:bg-gray-100 p-1.5 border border-gray-200 dark:border-gray-300">
                            <Image
                              src={`/integrations/${app.id}.svg`}
                              alt={`${app.name} logo`}
                              width={40}
                              height={40}
                              className="w-full h-full object-contain"
                            />
                          </div>
                          {isNewlyConnected && (
                            <div className="flex items-center gap-1.5 px-2 py-1 rounded-full bg-green-500 dark:bg-green-600 text-white text-xs font-bold animate-pulse">
                              <Check className="w-3 h-3" />
                              New!
                            </div>
                          )}
                          {isConnected && !isNewlyConnected && (
                            <div className="flex items-center gap-1 text-xs font-medium text-green-600 dark:text-green-500">
                              <Check className="w-3 h-3" />
                              Connected
                            </div>
                          )}
                          {isConnecting && (
                            <RefreshCw className="w-4 h-4 animate-spin text-muted-foreground" />
                          )}
                        </div>
                        <div className="space-y-1">
                          <h4 className="font-semibold text-sm">{app.name}</h4>
                          <p className="text-xs text-muted-foreground line-clamp-2">
                            {app.description}
                          </p>
                        </div>
                      </button>
                    )
                  })}
              </div>
            </ScrollArea>

            {Object.values(INTEGRATION_CONFIGS).filter(app => {
              const searchLower = appSearchQuery.toLowerCase()
              return (
                app.name.toLowerCase().includes(searchLower) ||
                app.description.toLowerCase().includes(searchLower) ||
                app.category.toLowerCase().includes(searchLower)
              )
            }).length === 0 && (
              <div className="text-center py-8 text-muted-foreground">
                <p className="text-sm">No apps found matching "{appSearchQuery}"</p>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setConnectAppsDialog(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Upgrade Plan Modal */}
      <UpgradePlanModal
        open={upgradeModalOpen}
        onOpenChange={setUpgradeModalOpen}
        requiredPlan={requiredPlan}
      />
    </>
  )
}

// Export with preloader wrapper
import { PagePreloader } from "@/components/common/PagePreloader"

export function HomeContentWithPreloader() {
  return (
    <PagePreloader
      pageType="workflows"
      loadingTitle="Loading Workflows"
      loadingDescription="Fetching your workflows and connected integrations..."
    >
      <HomeContent />
    </PagePreloader>
  )
}
