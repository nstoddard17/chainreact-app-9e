'use client'

import React, { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useWorkflowStore } from '@/stores/workflowStore'
import { useAuthStore } from '@/stores/authStore'
import { useIntegrationStore } from '@/stores/integrationStore'
import { usePlanRestrictions } from '@/hooks/use-plan-restrictions'
import { UpgradePlanModal } from '@/components/plan-restrictions'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Switch } from '@/components/ui/switch'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import {
  Plus,
  MoreHorizontal,
  Edit,
  Copy,
  Trash2,
  Folder,
  FolderPlus,
  RefreshCw,
  AlertTriangle,
  Workflow,
  FolderInput,
  ChevronDown,
  ChevronUp,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  RotateCcw,
  Share2,
  Lock,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { formatDistanceToNow } from 'date-fns'
import { useToast } from '@/hooks/use-toast'
import { logger } from '@/lib/utils/logger'
import { PagePreloader } from '@/components/common/PagePreloader'
import { NewAppLayout } from '@/components/new-design/layout/NewAppLayout'
import type { Workflow as WorkflowRecord } from '@/stores/workflowStore'

type ViewTab = 'workflows' | 'folders'
type OwnershipFilter = 'all' | 'owned' | 'shared'
type SortField = 'name' | 'updated_at' | 'status'
type SortOrder = 'asc' | 'desc'

interface TrashedWorkflowEntry {
  workflow: {
    id: string
    name: string
    description: string | null
    user_id: string
    organization_id?: string | null
    folder_id?: string | null
    nodes?: any[]
    connections?: any[]
    workflow_json?: any
    status?: string
    visibility?: string | null
    source_template_id?: string | null
    created_at?: string
    updated_at?: string
  }
  deletedAt: string
}

interface WorkflowFolder {
  id: string
  name: string
  description: string | null
  user_id: string
  organization_id: string | null
  parent_folder_id: string | null
  color: string
  icon: string
  is_default?: boolean
  created_at: string
  updated_at: string
  workflow_count?: number
}

// Workflow validation function
const validateWorkflow = (workflow: any) => {
  const issues: string[] = []

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

  const hasTrigger = nodes.some((node: any) => node.data?.isTrigger === true)
  if (!hasTrigger) {
    issues.push('No trigger node configured')
  }

  const hasAction = nodes.some((node: any) => node.data?.isTrigger !== true && node.type === 'custom')
  if (!hasAction) {
    issues.push('No action nodes configured')
  }

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

function WorkflowsContent() {
  const router = useRouter()
  const { workflows, loadingList, fetchWorkflows, updateWorkflow, deleteWorkflow } = useWorkflowStore()
  const { user, profile } = useAuthStore()
  const { getConnectedProviders } = useIntegrationStore()
  const { checkActionLimit } = usePlanRestrictions()
  const { toast } = useToast()

  // Version update: No dropdowns, tabs properly aligned - v4
  useEffect(() => {
    console.log('🎯 WorkflowsContent mounted - Version: No dropdowns, tabs properly aligned - v4')
  }, [])

  const [activeTab, setActiveTab] = useState<ViewTab>('workflows')
  const [searchQuery, setSearchQuery] = useState('')
  const [ownershipFilter, setOwnershipFilter] = useState<OwnershipFilter>('all')
  const [ownershipMenuOpen, setOwnershipMenuOpen] = useState(false)
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [selectedFolderFilter, setSelectedFolderFilter] = useState<string | null>(null)
  const [deleteDialog, setDeleteDialog] = useState<{ open: boolean; workflowIds: string[]; contextLabel: string }>({
    open: false,
    workflowIds: [],
    contextLabel: ''
  })
  const [loading, setLoading] = useState<Record<string, boolean>>({})
  const [executionStats, setExecutionStats] = useState<Record<string, { total: number; today: number; success: number; failed: number }>>({})
  // Create workflow dialog removed - now navigates directly to /workflows/ai-agent
  const [upgradeModalOpen, setUpgradeModalOpen] = useState(false)
  const [requiredPlan, setRequiredPlan] = useState<'free' | 'starter' | 'professional' | 'team' | 'enterprise' | undefined>()
  const [trashedWorkflows, setTrashedWorkflows] = useState<TrashedWorkflowEntry[]>([])
  const [trashDialogOpen, setTrashDialogOpen] = useState(false)
  const [restoringTrashId, setRestoringTrashId] = useState<string | null>(null)

  // Rename workflow state
  const [renameDialog, setRenameDialog] = useState<{ open: boolean; workflowId: string | null; currentName: string }>({
    open: false,
    workflowId: null,
    currentName: ''
  })
  const [renameValue, setRenameValue] = useState('')

  // Move to folder state
  const [moveFolderDialog, setMoveFolderDialog] = useState<{ open: boolean; workflowIds: string[] }>({
    open: false,
    workflowIds: []
  })
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null)

  // Folder state
  const [folders, setFolders] = useState<WorkflowFolder[]>([])
  const [createFolderDialog, setCreateFolderDialog] = useState(false)
  const [newFolderName, setNewFolderName] = useState('')
  const [newFolderDescription, setNewFolderDescription] = useState('')
  const [deleteFolderDialog, setDeleteFolderDialog] = useState<{ open: boolean; folderId: string | null; folderName: string }>({
    open: false,
    folderId: null,
    folderName: ''
  })
  const [renameFolderDialog, setRenameFolderDialog] = useState<{ open: boolean; folderId: string | null; currentName: string }>({
    open: false,
    folderId: null,
    currentName: ''
  })
  const [renameFolderValue, setRenameFolderValue] = useState('')

  // Sorting state
  const [sortField, setSortField] = useState<SortField>('updated_at')
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc')
  const [shareDialog, setShareDialog] = useState<{ open: boolean; workflowIds: string[] }>({
    open: false,
    workflowIds: []
  })
  const [availableTeams, setAvailableTeams] = useState<any[]>([])
  const [loadingTeams, setLoadingTeams] = useState(false)
  const [selectedTeamIds, setSelectedTeamIds] = useState<string[]>([])
  const [shareLoading, setShareLoading] = useState(false)

  const updateLoadingState = (key: string, value: boolean) => {
    setLoading(prev => {
      const next = { ...prev }
      if (value) {
        next[key] = true
      } else {
        delete next[key]
      }
      return next
    })
  }

  useEffect(() => {
    if (user) {
      fetchWorkflows()
      fetchExecutionStats()
      fetchFolders()
    }
  }, [user])

  useEffect(() => {
    if (typeof window === 'undefined') return
    try {
      const stored = window.localStorage.getItem('workflow_trash')
      if (stored) {
        const parsed = JSON.parse(stored)
        if (Array.isArray(parsed)) {
          const normalized = parsed.filter(
            (item: any) => item && item.workflow && typeof item.workflow.id === 'string'
          )
          setTrashedWorkflows(normalized as TrashedWorkflowEntry[])
        }
      }
    } catch (error) {
      logger.warn('Failed to load trashed workflows from storage', error)
    }
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined') return
    try {
      window.localStorage.setItem('workflow_trash', JSON.stringify(trashedWorkflows))
    } catch (error) {
      logger.warn('Failed to persist trashed workflows to storage', error)
    }
  }, [trashedWorkflows])

  useEffect(() => {
    if (activeTab !== 'workflows') {
      setOwnershipMenuOpen(false)
    }
  }, [activeTab])

  useEffect(() => {
    if (shareDialog.open && availableTeams.length === 0 && !loadingTeams) {
      fetchTeamsList()
    }
    if (!shareDialog.open) {
      setSelectedTeamIds([])
    }
  }, [shareDialog.open, availableTeams.length, loadingTeams])

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

  const fetchFolders = async () => {
    try {
      // First ensure the user has a default folder
      await fetch('/api/workflows/folders/ensure-default', { method: 'POST' }).catch(() => {
        // Silently fail - folder creation is not critical
      })

      // Then fetch all folders
      const response = await fetch('/api/workflows/folders')
      const data = await response.json()
      if (data.success) {
        setFolders(data.folders || [])
      }
    } catch (error) {
      logger.error('Failed to fetch folders:', error)
    }
  }

  const fetchTeamsList = async () => {
    try {
      setLoadingTeams(true)
      const response = await fetch('/api/teams')
      const data = await response.json()
      if (data?.teams) {
        setAvailableTeams(data.teams)
      } else if (data?.success === false) {
        toast({
          title: 'Unable to load teams',
          description: data.error || 'An unexpected error occurred.',
          variant: 'destructive'
        })
      }
    } catch (error) {
      logger.error('Failed to fetch teams:', error)
      toast({
        title: 'Unable to load teams',
        description: 'Please try again later.',
        variant: 'destructive'
      })
    } finally {
      setLoadingTeams(false)
    }
  }

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')
    } else {
      setSortField(field)
      setSortOrder('asc')
    }
  }

  const filteredAndSortedWorkflows = workflows
    .filter((w) => {
      const matchesSearch = w.name.toLowerCase().includes(searchQuery.toLowerCase())

      let matchesOwnership = true
      if (ownershipFilter === 'owned') {
        matchesOwnership = w.user_id === user?.id
      } else if (ownershipFilter === 'shared') {
        matchesOwnership = w.user_id !== user?.id
      }

      let matchesFolder = true
      if (selectedFolderFilter) {
        matchesFolder = w.folder_id === selectedFolderFilter
      }

      return matchesSearch && matchesOwnership && matchesFolder
    })
    .sort((a, b) => {
      let comparison = 0

      switch (sortField) {
        case 'name':
          comparison = a.name.localeCompare(b.name)
          break
        case 'updated_at':
          comparison = new Date(a.updated_at || a.created_at).getTime() -
                      new Date(b.updated_at || b.created_at).getTime()
          break
        case 'status':
          comparison = (a.status || 'draft').localeCompare(b.status || 'draft')
          break
        default:
          comparison = 0
      }

      return sortOrder === 'asc' ? comparison : -comparison
    })

  const stats = {
    total: workflows.length,
    active: workflows.filter(w => w.status === 'active').length,
    totalExecutions: Object.values(executionStats).reduce((sum, stat) => sum + stat.total, 0),
    successRate: Object.values(executionStats).reduce((sum, stat) => sum + stat.total, 0) > 0
      ? Math.round((Object.values(executionStats).reduce((sum, stat) => sum + stat.success, 0) /
          Object.values(executionStats).reduce((sum, stat) => sum + stat.total, 0)) * 100)
      : 0
  }
  const moveDialogLoading = moveFolderDialog.workflowIds.length > 1
    ? !!loading['move-multi']
    : !!(moveFolderDialog.workflowIds[0] && loading[`move-${moveFolderDialog.workflowIds[0]}`])
  const deleteDialogLabel = deleteDialog.workflowIds.length > 1
    ? `${deleteDialog.workflowIds.length} workflows`
    : deleteDialog.contextLabel
      ? `"${deleteDialog.contextLabel}"`
      : 'this workflow'
  const bulkDuplicateLoading = selectedIds.length > 1
    ? !!loading['duplicate-multi']
    : selectedIds.length === 1
      ? !!loading[`duplicate-${selectedIds[0]}`]
      : false

  const prepareWorkflowForTrash = (workflow: WorkflowRecord | (WorkflowRecord & Record<string, any>) | null): TrashedWorkflowEntry['workflow'] | null => {
    if (!workflow) return null
    const {
      creator,
      executionStats: _executionStats,
      runCounts,
      ...rest
    } = workflow as WorkflowRecord & Record<string, any>

    return {
      id: rest.id,
      name: rest.name,
      description: rest.description ?? null,
      user_id: rest.user_id,
      organization_id: rest.organization_id ?? null,
      folder_id: rest.folder_id ?? null,
      nodes: rest.nodes ?? [],
      connections: rest.connections ?? [],
      workflow_json: rest.workflow_json ?? null,
      status: rest.status ?? 'draft',
      visibility: rest.visibility ?? null,
      source_template_id: rest.source_template_id ?? null,
      created_at: rest.created_at ?? new Date().toISOString(),
      updated_at: rest.updated_at ?? new Date().toISOString()
    }
  }

  const addWorkflowToTrash = (workflow: WorkflowRecord | (WorkflowRecord & Record<string, any>) | null) => {
    const entry = prepareWorkflowForTrash(workflow)
    if (!entry) return
    setTrashedWorkflows(prev => {
      const filtered = prev.filter(item => item.workflow.id !== entry.id)
      return [{ workflow: entry, deletedAt: new Date().toISOString() }, ...filtered]
    })
  }

  const removeWorkflowFromTrash = (workflowId: string) => {
    setTrashedWorkflows(prev => prev.filter(item => item.workflow.id !== workflowId))
  }

  const toggleTeamSelection = (teamId: string) => {
    setSelectedTeamIds(prev =>
      prev.includes(teamId) ? prev.filter(id => id !== teamId) : [...prev, teamId]
    )
  }

  const handleShareWorkflows = async () => {
    if (selectedTeamIds.length === 0 || shareDialog.workflowIds.length === 0) {
      toast({
        title: 'Select teams',
        description: 'Choose at least one team to share with.',
        variant: 'destructive'
      })
      return
    }

    setShareLoading(true)
    const failures: string[] = []

    for (const workflowId of shareDialog.workflowIds) {
      try {
        const response = await fetch(`/api/workflows/${workflowId}/share`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ teamIds: selectedTeamIds })
        })

        const data = await response.json().catch(() => ({}))

        if (!response.ok || data?.success === false) {
          throw new Error(data?.error || 'Failed to share')
        }
      } catch (error) {
        logger.error('Failed to share workflow', error)
        failures.push(workflowId)
      }
    }

    setShareLoading(false)

    if (failures.length === shareDialog.workflowIds.length) {
      toast({
        title: 'Share failed',
        description: 'Unable to share the selected workflows. Please try again later.',
        variant: 'destructive'
      })
      return
    }

    if (failures.length > 0) {
      toast({
        title: 'Partially shared',
        description: `${shareDialog.workflowIds.length - failures.length} workflows shared successfully. ${failures.length} failed.`,
        variant: 'destructive'
      })
    } else {
      toast({
        title: 'Workflows shared',
        description: shareDialog.workflowIds.length > 1
          ? 'All selected workflows are now shared with the selected teams.'
          : 'Workflow shared successfully.',
      })
    }

    setShareDialog({ open: false, workflowIds: [] })
    setSelectedTeamIds([])
  }

  const duplicateWorkflowRequest = async (workflowId: string) => {
    const response = await fetch(`/api/workflows/${workflowId}/duplicate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    })

    const data = await response.json().catch(() => ({}))
    if (!response.ok || data?.success === false) {
      throw new Error(data?.error || 'Failed to duplicate workflow')
    }
  }

  const handleBulkDuplicate = async (workflowIds: string[]) => {
    if (workflowIds.length === 0) return

    const loadingKey = workflowIds.length > 1 ? 'duplicate-multi' : `duplicate-${workflowIds[0]}`
    updateLoadingState(loadingKey, true)

    let failures = 0
    let successes = 0
    for (const workflowId of workflowIds) {
      try {
        await duplicateWorkflowRequest(workflowId)
        successes += 1
      } catch (error) {
        failures += 1
        logger.error('Bulk duplicate failed', error)
      }
    }

    updateLoadingState(loadingKey, false)
    if (successes > 0) {
      fetchWorkflows()
    }

    if (failures === workflowIds.length) {
      toast({
        title: 'Duplicate failed',
        description: 'Unable to duplicate the selected workflows.',
        variant: 'destructive'
      })
    } else if (failures > 0) {
      toast({
        title: 'Partial duplicate',
        description: `${successes} workflows duplicated successfully. ${failures} failed.`,
        variant: 'destructive'
      })
    } else {
      toast({
        title: successes > 1 ? 'Workflows duplicated' : 'Workflow duplicated',
        description: successes > 1
          ? 'All selected workflows were duplicated successfully.'
          : 'A copy of the workflow has been created.',
      })
    }
  }

  const handleBulkMove = (workflowIds: string[]) => {
    if (workflowIds.length === 0) return
    const firstWorkflow = workflows.find(w => w.id === workflowIds[0])
    openMoveDialogForWorkflows(workflowIds, workflowIds.length === 1 ? firstWorkflow?.folder_id ?? null : null)
  }

  const handleBulkShare = (workflowIds: string[]) => {
    if (workflowIds.length === 0) return
    openShareDialogForWorkflows(workflowIds)
  }

  const handleBulkDelete = (workflowIds: string[]) => {
    if (workflowIds.length === 0) return
    openDeleteDialogForWorkflows(workflowIds)
  }

  const handleSelectAll = () => {
    if (activeTab === 'workflows') {
      if (selectedIds.length === filteredAndSortedWorkflows.length) {
        setSelectedIds([])
      } else {
        setSelectedIds(filteredAndSortedWorkflows.map((w) => w.id))
      }
    }
  }

  const handleSelectOne = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]
    )
  }

  const openRenameDialogForWorkflow = (workflow: any) => {
    setRenameDialog({ open: true, workflowId: workflow.id, currentName: workflow.name })
    setRenameValue(workflow.name)
  }

  const openMoveDialogForWorkflows = (workflowIds: string[], defaultFolderId?: string | null) => {
    if (workflowIds.length === 0) return
    setMoveFolderDialog({ open: true, workflowIds })
    // If no folder is specified, default to the default folder
    const targetFolderId = defaultFolderId ?? folders.find(f => f.is_default)?.id ?? null
    setSelectedFolderId(targetFolderId)
  }

  const openShareDialogForWorkflows = (workflowIds: string[]) => {
    if (workflowIds.length === 0) return
    setSelectedTeamIds([])
    setShareDialog({ open: true, workflowIds })
  }

  const openDeleteDialogForWorkflows = (workflowIds: string[]) => {
    if (workflowIds.length === 0) return
    const label = workflowIds.length === 1
      ? (workflows.find(w => w.id === workflowIds[0])?.name || 'this workflow')
      : `${workflowIds.length} workflows`
    setDeleteDialog({ open: true, workflowIds, contextLabel: label })
  }

  const handleRestoreFromTrash = async (workflowId: string) => {
    const trashed = trashedWorkflows.find(item => item.workflow.id === workflowId)
    if (!trashed) return

    setRestoringTrashId(workflowId)
    try {
      const response = await fetch('/api/workflows/restore', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workflow: trashed.workflow })
      })

      const data = await response.json().catch(() => ({}))

      if (!response.ok || data?.success === false) {
        throw new Error(data?.error || 'Failed to restore workflow')
      }

      const restored = (data as any)?.workflow
      const restoredName = restored?.name ?? trashed.workflow.name

      toast({
        title: 'Workflow Restored',
        description: `${restoredName} has been restored.`,
      })

      removeWorkflowFromTrash(workflowId)
      await fetchWorkflows()
    } catch (error: any) {
      toast({
        title: 'Restore failed',
        description: error?.message || 'Unable to restore workflow. Please try again.',
        variant: 'destructive'
      })
    } finally {
      setRestoringTrashId(null)
    }
  }

  const handleRemoveFromTrash = (workflowId: string) => {
    removeWorkflowFromTrash(workflowId)
    toast({
      title: 'Removed from Trash',
      description: 'Workflow permanently removed from trash.',
    })
  }

  const getCreatorInfo = (workflow: any) => {
    const enrichedCreator = workflow.creator ?? (workflow.user_id === user?.id ? {
      full_name: profile?.full_name,
      username: profile?.username,
      email: profile?.email,
      avatar_url: profile?.avatar_url
    } : null)

    if (enrichedCreator) {
      const { full_name, username, email, secondary_email, avatar_url } = enrichedCreator
      const rawEmail = email || secondary_email || ''
      const fallbackEmail = rawEmail ? rawEmail.split('@')[0] : ''
      const displayName = full_name || username || fallbackEmail || 'Team Member'
      const name = workflow.user_id === user?.id ? 'You' : displayName
      const initialsSource = displayName || 'TM'

      return {
        name,
        initials: initialsSource.substring(0, 2).toUpperCase() || 'TM',
        avatar: avatar_url || null
      }
    }

    return {
      name: 'Unknown',
      initials: 'UN',
      avatar: null
    }
  }

  const getFolderName = (workflow: any) => {
    if (workflow.folder_id) {
      const folder = folders.find(f => f.id === workflow.folder_id)
      return folder?.name || 'Unknown Folder'
    }
    if (workflow.organization_id) {
      return 'Team Workflows'
    }
    return 'My Workflows'
  }

  const handleToggleStatus = async (workflow: any, e?: React.MouseEvent) => {
    if (e) {
      e.stopPropagation()
    }

    if (workflow.status !== 'active') {
      const validation = validateWorkflow(workflow)
      if (!validation.isValid) {
        toast({
          title: "Cannot Activate Workflow",
          description: validation.issues.join(', '),
          variant: "destructive"
        })
        return
      }
    }

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

  const handleRenameWorkflow = async () => {
    if (!renameDialog.workflowId || !renameValue.trim()) {
      toast({
        title: "Name Required",
        description: "Please enter a workflow name.",
        variant: "destructive"
      })
      return
    }

    setLoading(prev => ({ ...prev, [`rename-${renameDialog.workflowId}`]: true }))

    try {
      await updateWorkflow(renameDialog.workflowId, { name: renameValue.trim() })
      toast({
        title: "Workflow Renamed",
        description: `Workflow renamed to "${renameValue}".`,
      })
      setRenameDialog({ open: false, workflowId: null, currentName: '' })
      setRenameValue('')
      fetchWorkflows()
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to rename workflow",
        variant: "destructive"
      })
    } finally {
      setLoading(prev => ({ ...prev, [`rename-${renameDialog.workflowId}`]: false }))
    }
  }

  const handleMoveToFolder = async () => {
    if (moveFolderDialog.workflowIds.length === 0) return

    const workflowIds = moveFolderDialog.workflowIds
    const loadingKey = workflowIds.length > 1 ? 'move-multi' : `move-${workflowIds[0]}`
    updateLoadingState(loadingKey, true)

    try {
      for (const workflowId of workflowIds) {
        await updateWorkflow(workflowId, { folder_id: selectedFolderId })
      }
      toast({
        title: workflowIds.length > 1 ? "Workflows moved" : "Workflow moved",
        description: selectedFolderId
          ? workflowIds.length > 1
            ? 'Selected workflows were moved to the folder.'
            : 'Workflow moved to the selected folder.'
          : 'Moved to My Workflows.',
      })
      setMoveFolderDialog({ open: false, workflowIds: [] })
      setSelectedFolderId(null)
      fetchWorkflows()
    } catch (error: any) {
      toast({
        title: "Error",
        description: error?.message || "Failed to move workflow",
        variant: "destructive"
      })
    } finally {
      updateLoadingState(loadingKey, false)
    }
  }

  const handleDuplicate = async (workflow: any) => {
    const loadingKey = `duplicate-${workflow.id}`
    updateLoadingState(loadingKey, true)

    try {
      await duplicateWorkflowRequest(workflow.id)
      toast({
        title: "Workflow duplicated",
        description: `Created a copy of "${workflow.name}"`,
      })
      fetchWorkflows()
    } catch (error: any) {
      toast({
        title: "Error",
        description: error?.message || "Failed to duplicate workflow",
        variant: "destructive"
      })
    } finally {
      updateLoadingState(loadingKey, false)
    }
  }

  const handleDelete = async () => {
    if (deleteDialog.workflowIds.length === 0) return

    const workflowIds = deleteDialog.workflowIds
    const loadingKey = workflowIds.length > 1 ? 'delete-multi' : `delete-${workflowIds[0]}`

    setDeleteDialog({ open: false, workflowIds: [], contextLabel: '' })
    setSelectedIds(prev => prev.filter(id => !workflowIds.includes(id)))
    updateLoadingState(loadingKey, true)

    let failures = 0

    for (const workflowId of workflowIds) {
      const workflowRecord = workflows.find(w => w.id === workflowId) as (WorkflowRecord & Record<string, any>) | undefined
      try {
        await deleteWorkflow(workflowId)
        if (workflowRecord) {
          addWorkflowToTrash(workflowRecord)
        }
      } catch (error) {
        failures += 1
        logger.error('Failed to delete workflow', error)
      }
    }

    updateLoadingState(loadingKey, false)

    // Only show toast for errors, not for successful deletions
    if (failures === workflowIds.length) {
      toast({
        title: 'Failed to delete workflows',
        description: 'Unable to delete the selected workflows. Please try again.',
        variant: 'destructive'
      })
    } else if (failures > 0) {
      toast({
        title: 'Some workflows were not deleted',
        description: `${workflowIds.length - failures} workflows deleted. ${failures} could not be deleted.`,
        variant: 'destructive'
      })
    }

    // Don't refresh workflows - the UI is already updated optimistically
    // fetchWorkflows() removed to prevent deleted workflows from reappearing
  }

  // handleCreateWorkflow removed - now navigates directly to /workflows/ai-agent

  const handleCreateFolder = async () => {
    if (!newFolderName.trim()) {
      toast({
        title: "Name Required",
        description: "Please enter a name for your folder.",
        variant: "destructive"
      })
      return
    }

    setLoading(prev => ({ ...prev, 'create-folder': true }))

    try {
      const response = await fetch('/api/workflows/folders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newFolderName.trim(),
          description: newFolderDescription.trim() || null,
        })
      })

      const data = await response.json()

      if (!data.success) {
        throw new Error(data.error || 'Failed to create folder')
      }

      toast({
        title: "Folder Created",
        description: `"${newFolderName}" has been created successfully.`,
      })

      setNewFolderName("")
      setNewFolderDescription("")
      setCreateFolderDialog(false)
      fetchFolders()
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to create folder",
        variant: "destructive"
      })
    } finally {
      setLoading(prev => ({ ...prev, 'create-folder': false }))
    }
  }

  const handleRenameFolder = async () => {
    if (!renameFolderDialog.folderId || !renameFolderValue.trim()) return

    const folderId = renameFolderDialog.folderId

    setLoading(prev => ({ ...prev, [`rename-folder-${folderId}`]: true }))

    try {
      const response = await fetch(`/api/workflows/folders/${folderId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: renameFolderValue.trim() })
      })

      const data = await response.json()

      if (!data.success) {
        throw new Error(data.error || 'Failed to rename folder')
      }

      toast({
        title: "Folder Renamed",
        description: `Folder renamed to "${renameFolderValue}".`,
      })

      setRenameFolderDialog({ open: false, folderId: null, currentName: '' })
      setRenameFolderValue('')
      fetchFolders()
    } catch (error: any) {
      toast({
        title: "Failed to Rename",
        description: error.message || "Failed to rename folder.",
        variant: "destructive"
      })
    } finally {
      setLoading(prev => ({ ...prev, [`rename-folder-${folderId}`]: false }))
    }
  }

  const handleSetDefaultFolder = async (folderId: string, folderName: string) => {
    try {
      const response = await fetch(`/api/workflows/folders/${folderId}/set-default`, {
        method: 'POST'
      })

      const data = await response.json()

      if (!data.success) {
        throw new Error(data.error || 'Failed to set default folder')
      }

      toast({
        title: "Default Folder Updated",
        description: `"${folderName}" is now your default folder.`,
      })

      fetchFolders()
    } catch (error: any) {
      toast({
        title: "Failed to Update",
        description: error.message || "Failed to set default folder.",
        variant: "destructive"
      })
    }
  }

  const handleDeleteFolder = async () => {
    if (!deleteFolderDialog.folderId) return

    const folderId = deleteFolderDialog.folderId
    const folderName = deleteFolderDialog.folderName

    setDeleteFolderDialog({ open: false, folderId: null, folderName: '' })

    toast({
      title: "Folder Deleted",
      description: `"${folderName}" has been deleted.`,
    })

    try {
      const response = await fetch(`/api/workflows/folders/${folderId}`, {
        method: 'DELETE'
      })

      const data = await response.json()

      if (!data.success) {
        throw new Error(data.error || 'Failed to delete folder')
      }

      fetchFolders()
      fetchWorkflows()
    } catch (error: any) {
      toast({
        title: "Failed to Delete",
        description: error.message || "Failed to delete folder.",
        variant: "destructive"
      })
    }
  }

  const ownershipOptions: Array<{ value: OwnershipFilter; label: string }> = [
    { value: 'all', label: 'All Workflows' },
    { value: 'owned', label: 'Owned by Me' },
    { value: 'shared', label: 'Shared with Me' }
  ]

  const handleFolderClick = (folderId: string | null, e: React.MouseEvent) => {
    e.stopPropagation()
    setSelectedFolderFilter(folderId)
    setActiveTab('workflows')
  }

  return (
    <>
      <NewAppLayout title="Workflows" subtitle="Build and manage your automations">
        <div className="h-full flex flex-col">
          {/* Command Bar */}
          <div className="h-14 border-b border-slate-200 flex items-center px-6">
            <div className="flex items-center gap-3 w-full">
              {/* Tabs - aligned with table checkbox */}
              <div className="flex items-center gap-1 p-1 border border-slate-200 rounded-lg bg-white">
                <button
                  onClick={() => setActiveTab('workflows')}
                  className={cn(
                    'px-3 py-1.5 text-sm font-medium rounded-md transition-colors',
                    activeTab === 'workflows'
                    ? 'bg-slate-100 text-slate-900'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
                )}
              >
                Workflows
              </button>
              <button
                onClick={() => setActiveTab('folders')}
                className={cn(
                  'px-3 py-1.5 text-sm font-medium rounded-md transition-colors',
                  activeTab === 'folders'
                    ? 'bg-slate-100 text-slate-900'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
                )}
              >
                Folders
              </button>
            </div>

            {/* Search Bar - expandable */}
            <div className="flex-1 px-3">
              <Input
                placeholder={activeTab === 'workflows' ? "Search workflows..." : "Search folders..."}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="h-9 w-full"
              />
            </div>

            {/* Ownership Filter */}
            {activeTab === 'workflows' && (
              <DropdownMenu open={ownershipMenuOpen} onOpenChange={setOwnershipMenuOpen}>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    className={cn(
                      "h-9 px-3 justify-between border-2 bg-white text-slate-700",
                      ownershipMenuOpen ? "border-indigo-500" : "border-indigo-400"
                    )}
                  >
                    <span className="mr-2">{ownershipOptions.find(option => option.value === ownershipFilter)?.label}</span>
                    <span className="flex flex-col leading-none text-slate-600 text-[10px]">
                      <ChevronUp className="w-3 h-3 -mb-[2px]" />
                      <ChevronDown className="w-3 h-3 -mt-[2px]" />
                    </span>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-48">
                  {ownershipOptions.map(option => (
                    <DropdownMenuItem
                      key={option.value}
                      onClick={() => setOwnershipFilter(option.value)}
                    >
                      {option.label}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            )}

            {/* Trash Button */}
            <Button
              variant="outline"
              size="sm"
              className="h-9 gap-2 whitespace-nowrap"
              onClick={() => setTrashDialogOpen(true)}
            >
              <Trash2 className="w-4 h-4" />
              Trash
            </Button>

            {/* Create Button */}
            <Button
              size="sm"
              className="h-9 gap-2 whitespace-nowrap"
              onClick={() => {
                if (activeTab === 'workflows') {
                  router.push('/workflows/ai-agent')
                } else {
                  setCreateFolderDialog(true)
                }
              }}
            >
              <Plus className="w-4 h-4" />
              {activeTab === 'workflows' ? 'Create workflow' : 'Create folder'}
            </Button>
            </div>
          </div>

          {/* Batch Actions Bar */}
          {selectedIds.length > 0 && activeTab === 'workflows' && (
            <div className="border-b border-slate-200 bg-indigo-50 px-6 py-2 flex items-center justify-between">
              <div className="text-sm font-medium text-indigo-900">
                {selectedIds.length} selected
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-indigo-700 hover:bg-indigo-100 h-8"
                  onClick={() => handleBulkDuplicate([...selectedIds])}
                  disabled={bulkDuplicateLoading}
                >
                  {bulkDuplicateLoading ? (
                    <RefreshCw className="w-4 h-4 mr-1.5 animate-spin" />
                  ) : (
                    <Copy className="w-4 h-4 mr-1.5" />
                  )}
                  Duplicate
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-indigo-700 hover:bg-indigo-100 h-8"
                  onClick={() => handleBulkMove([...selectedIds])}
                >
                  <FolderInput className="w-4 h-4 mr-1.5" />
                  Move
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-indigo-700 hover:bg-indigo-100 h-8"
                  onClick={() => handleBulkShare([...selectedIds])}
                >
                  <Share2 className="w-4 h-4 mr-1.5" />
                  Share
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-red-600 hover:bg-red-50 h-8"
                  onClick={() => handleBulkDelete([...selectedIds])}
                >
                  <Trash2 className="w-4 h-4 mr-1.5" />
                  Delete
                </Button>
              </div>
            </div>
          )}

          {/* Content Area */}
          <div className="flex-1 overflow-auto">
            {activeTab === 'workflows' ? (
              <table className="w-full">
                <thead className="sticky top-0 bg-slate-50 border-b border-slate-200 z-10">
                  <tr>
                    <th className="w-12 px-6 py-3 text-left">
                      <Checkbox
                        checked={selectedIds.length === filteredAndSortedWorkflows.length && filteredAndSortedWorkflows.length > 0}
                        onCheckedChange={handleSelectAll}
                      />
                    </th>
                    <th className="px-3 py-3 text-left">
                      <button
                        onClick={() => handleSort('name')}
                        className="flex items-center gap-1 text-xs font-semibold text-slate-600 uppercase tracking-wider hover:text-slate-900 transition-colors"
                      >
                        Name
                        {sortField === 'name' ? (
                          sortOrder === 'asc' ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />
                        ) : (
                          <ArrowUpDown className="w-3 h-3 opacity-40" />
                        )}
                      </button>
                    </th>
                    <th className="px-3 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">
                      Folder
                    </th>
                    <th className="px-3 py-3 text-left">
                      <button
                        onClick={() => handleSort('updated_at')}
                        className="flex items-center gap-1 text-xs font-semibold text-slate-600 uppercase tracking-wider hover:text-slate-900 transition-colors"
                      >
                        Last Modified
                        {sortField === 'updated_at' ? (
                          sortOrder === 'asc' ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />
                        ) : (
                          <ArrowUpDown className="w-3 h-3 opacity-40" />
                        )}
                      </button>
                    </th>
                    <th className="px-3 py-3 text-left">
                      <button
                        onClick={() => handleSort('status')}
                        className="flex items-center gap-1 text-xs font-semibold text-slate-600 uppercase tracking-wider hover:text-slate-900 transition-colors"
                      >
                        Status
                        {sortField === 'status' ? (
                          sortOrder === 'asc' ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />
                        ) : (
                          <ArrowUpDown className="w-3 h-3 opacity-40" />
                        )}
                      </button>
                    </th>
                    <th className="px-3 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">
                      Owner
                    </th>
                    <th className="px-3 py-3 text-right text-xs font-semibold text-slate-600 uppercase tracking-wider">
                      Runs
                    </th>
                    <th className="w-12 px-3 py-3 text-right text-xs font-semibold text-slate-600 uppercase tracking-wider">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredAndSortedWorkflows.map((workflow) => {
                    const creatorInfo = getCreatorInfo(workflow)
                    const folderName = getFolderName(workflow)
                    const validation = validateWorkflow(workflow)
                    const stats = executionStats[workflow.id] || { total: 0, today: 0, success: 0, failed: 0 }

                    return (
                      <tr
                        key={workflow.id}
                        className={cn(
                          'group hover:bg-slate-50 transition-colors',
                          selectedIds.includes(workflow.id) && 'bg-indigo-50 hover:bg-indigo-100 [&>td]:!text-slate-900 [&>td>*]:!text-slate-900 [&>td>div]:!text-slate-700 [&>td>span]:!text-slate-900'
                        )}
                      >
                        <td className="px-6 py-4">
                          <Checkbox
                            checked={selectedIds.includes(workflow.id)}
                            onCheckedChange={() => handleSelectOne(workflow.id)}
                          />
                        </td>
                        <td className="px-3 py-4">
                          <span
                            onClick={() => router.push(`/workflows/builder/${workflow.id}`)}
                            className="font-medium text-sm cursor-pointer hover:underline"
                          >
                            {workflow.name}
                          </span>
                        </td>
                        <td className="px-3 py-4">
                          <div
                            onClick={(e) => handleFolderClick(workflow.folder_id, e)}
                            className="flex items-center gap-1.5 text-xs cursor-pointer hover:underline w-fit"
                          >
                            <Folder className="w-3.5 h-3.5" />
                            {folderName}
                          </div>
                        </td>
                        <td className="px-3 py-4">
                          <span className="text-sm">
                            {formatDistanceToNow(new Date(workflow.updated_at || workflow.created_at), { addSuffix: true })}
                          </span>
                        </td>
                        <td className="px-3 py-4">
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <div className="flex items-center gap-2">
                                  <Switch
                                    checked={workflow.status === 'active'}
                                    onCheckedChange={() => handleToggleStatus(workflow)}
                                    disabled={loading[`status-${workflow.id}`] || !validation.isValid}
                                    className={cn(
                                      !validation.isValid && "opacity-50 cursor-not-allowed"
                                    )}
                                  />
                                  {!validation.isValid && (
                                    <AlertTriangle className="w-4 h-4 text-amber-500" />
                                  )}
                                </div>
                              </TooltipTrigger>
                              {!validation.isValid && (
                                <TooltipContent side="top">
                                  <p className="text-sm">Workflow setup is incomplete and cannot be activated</p>
                                </TooltipContent>
                              )}
                              {validation.isValid && (
                                <TooltipContent side="top">
                                  <p className="text-xs">
                                    {workflow.status === 'active' ? 'Deactivate workflow' : 'Activate workflow'}
                                  </p>
                                </TooltipContent>
                              )}
                            </Tooltip>
                          </TooltipProvider>
                        </td>
                        <td className="px-3 py-4">
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <div className="flex items-center">
                                  <Avatar className="h-7 w-7">
                                    {creatorInfo.avatar && (
                                      <AvatarImage src={creatorInfo.avatar} alt={creatorInfo.name} />
                                    )}
                                    <AvatarFallback className="text-xs bg-slate-200 text-slate-700">
                                      {creatorInfo.initials}
                                    </AvatarFallback>
                                  </Avatar>
                                </div>
                              </TooltipTrigger>
                              <TooltipContent side="top">
                                <p className="text-xs">{creatorInfo.name}</p>
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        </td>
                        <td className="px-3 py-4 text-right text-sm font-medium">
                          {stats.total.toLocaleString()}
                        </td>
                        <td className="px-3 py-4 text-right">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-slate-500 hover:text-slate-800"
                                onClick={(event) => event.stopPropagation()}
                                aria-label={`Workflow options for ${workflow.name}`}
                              >
                                <MoreHorizontal className="w-4 h-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-48">
                              <DropdownMenuItem
                                onSelect={(event) => {
                                  event.preventDefault()
                                  handleDuplicate(workflow)
                                }}
                                disabled={!!loading[`duplicate-${workflow.id}`]}
                              >
                                {loading[`duplicate-${workflow.id}`] ? (
                                  <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                                ) : (
                                  <Copy className="w-4 h-4 mr-2" />
                                )}
                                Duplicate
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onSelect={(event) => {
                                  event.preventDefault()
                                  openRenameDialogForWorkflow(workflow)
                                }}
                              >
                                <Edit className="w-4 h-4 mr-2" />
                                Rename
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onSelect={(event) => {
                                  event.preventDefault()
                                  openMoveDialogForWorkflows([workflow.id], workflow.folder_id ?? null)
                                }}
                              >
                                <FolderInput className="w-4 h-4 mr-2" />
                                Move to folder
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onSelect={(event) => {
                                  event.preventDefault()
                                  openShareDialogForWorkflows([workflow.id])
                                }}
                              >
                                <Share2 className="w-4 h-4 mr-2" />
                                Share
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                onSelect={(event) => {
                                  event.preventDefault()
                                  openDeleteDialogForWorkflows([workflow.id])
                                }}
                                className="text-destructive focus:bg-destructive/10"
                              >
                                <Trash2 className="w-4 h-4 mr-2" />
                                Delete
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            ) : (
              /* Folders View */
              <div className="p-6">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                  {folders.map((folder) => {
                    const workflowCount = workflows.filter(w => w.folder_id === folder.id).length
                    const isDefaultFolder = folder.is_default === true
                    return (
                      <div
                        key={folder.id}
                        className="group relative bg-white rounded-xl border-2 border-slate-200 p-5 hover:shadow-lg hover:border-blue-300 transition-all cursor-pointer"
                        onClick={() => {
                          setSelectedFolderFilter(folder.id)
                          setActiveTab('workflows')
                        }}
                      >
                        <div className="flex items-start justify-between mb-3">
                          <div className="flex items-center gap-3">
                            <div
                              className="w-10 h-10 rounded-lg flex items-center justify-center relative"
                              style={{ backgroundColor: `${folder.color}20` }}
                            >
                              <Folder
                                className="w-5 h-5"
                                style={{ color: folder.color }}
                              />
                              {isDefaultFolder && (
                                <div className="absolute -top-1 -right-1 bg-slate-700 rounded-full p-0.5">
                                  <Lock className="w-2.5 h-2.5 text-white" />
                                </div>
                              )}
                            </div>
                            <div>
                              <h3 className="font-semibold text-slate-900 flex items-center gap-2">
                                {folder.name}
                              </h3>
                              <p className="text-xs text-slate-600">{workflowCount} workflows</p>
                            </div>
                          </div>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-8 w-8 p-0 opacity-0 group-hover:opacity-100 transition-opacity"
                                onClick={(e) => e.stopPropagation()}
                              >
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem
                                onClick={(e) => {
                                  e.stopPropagation()
                                  setRenameFolderDialog({
                                    open: true,
                                    folderId: folder.id,
                                    currentName: folder.name
                                  })
                                  setRenameFolderValue(folder.name)
                                }}
                              >
                                <Edit className="w-4 h-4 mr-2" />
                                Rename
                              </DropdownMenuItem>
                              {!isDefaultFolder && (
                                <>
                                  <DropdownMenuItem
                                    onClick={(e) => {
                                      e.stopPropagation()
                                      handleSetDefaultFolder(folder.id, folder.name)
                                    }}
                                  >
                                    <Lock className="w-4 h-4 mr-2" />
                                    Set as Default
                                  </DropdownMenuItem>
                                  <DropdownMenuSeparator />
                                  <DropdownMenuItem
                                    onClick={(e) => {
                                      e.stopPropagation()
                                      setDeleteFolderDialog({
                                        open: true,
                                        folderId: folder.id,
                                        folderName: folder.name
                                      })
                                    }}
                                    className="text-red-600 focus:text-red-600"
                                  >
                                    <Trash2 className="w-4 h-4 mr-2" />
                                    Delete Folder
                                  </DropdownMenuItem>
                                </>
                              )}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                        {folder.description && (
                          <p className="text-sm text-slate-600 line-clamp-2">{folder.description}</p>
                        )}
                      </div>
                    )
                  })}
                </div>

                {folders.length === 0 && (
                  <div className="text-center py-16">
                    <div className="w-16 h-16 bg-slate-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
                      <Folder className="w-8 h-8 text-slate-400" />
                    </div>
                    <h3 className="text-xl font-semibold text-slate-900 mb-2">No folders yet</h3>
                    <p className="text-slate-600 mb-6">
                      Create folders to organize your workflows
                    </p>
                    <Button onClick={() => setCreateFolderDialog(true)}>
                      <FolderPlus className="w-4 h-4 mr-2" />
                      Create Folder
                    </Button>
                  </div>
                )}
              </div>
            )}

            {activeTab === 'workflows' && filteredAndSortedWorkflows.length === 0 && (
              <div className="text-center py-12">
                <div className="text-slate-400 mb-2">
                  <Workflow className="w-12 h-12 mx-auto" />
                </div>
                <h3 className="text-base font-semibold text-slate-900 mb-1">No workflows found</h3>
                <p className="text-sm text-slate-600">
                  {searchQuery
                    ? 'Try adjusting your search'
                    : 'Create your first workflow to get started'}
                </p>
                {!searchQuery && (
                  <Button className="mt-4" onClick={() => router.push('/workflows/ai-agent')}>
                    <Plus className="w-4 h-4 mr-2" />
                    Create Workflow
                  </Button>
                )}
              </div>
            )}
          </div>
        </div>
      </NewAppLayout>

      {/* Create Workflow Dialog removed - now navigates directly to /workflows/ai-agent */}

      {/* Trash Dialog */}
      <Dialog open={trashDialogOpen} onOpenChange={setTrashDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Trash</DialogTitle>
            <DialogDescription>
              Recently deleted workflows are stored here. Restore them to bring them back to your workspace or remove them permanently from this list.
            </DialogDescription>
          </DialogHeader>
          {trashedWorkflows.length === 0 ? (
            <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 py-10 text-center">
              <p className="text-sm text-slate-500">No workflows in trash yet.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {trashedWorkflows.map((item) => (
                <div
                  key={`${item.workflow.id}-${item.deletedAt}`}
                  className="flex items-center justify-between rounded-lg border border-slate-200 bg-white px-4 py-3 shadow-sm"
                >
                  <div className="space-y-1">
                    <p className="text-sm font-medium text-slate-900">{item.workflow.name}</p>
                    <p className="text-xs text-slate-500">
                      Deleted {formatDistanceToNow(new Date(item.deletedAt), { addSuffix: true })}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleRestoreFromTrash(item.workflow.id)}
                      disabled={restoringTrashId === item.workflow.id}
                      className="h-8"
                    >
                      {restoringTrashId === item.workflow.id ? (
                        <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                      ) : (
                        <RotateCcw className="w-4 h-4 mr-2" />
                      )}
                      Restore
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => handleRemoveFromTrash(item.workflow.id)}
                      className="h-8 text-slate-600 hover:text-slate-900"
                    >
                      <Trash2 className="w-4 h-4 mr-2" />
                      Remove
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Rename Workflow Dialog */}
      <Dialog
        open={renameDialog.open}
        onOpenChange={(open) => {
          setRenameDialog({ open, workflowId: null, currentName: '' })
          if (!open) {
            setRenameValue('')
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rename Workflow</DialogTitle>
            <DialogDescription>
              Enter a new name for your workflow.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="rename-workflow">Workflow Name *</Label>
              <Input
                id="rename-workflow"
                placeholder="Enter workflow name"
                value={renameValue}
                onChange={(e) => setRenameValue(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleRenameWorkflow()}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setRenameDialog({ open: false, workflowId: null, currentName: '' })
                setRenameValue('')
              }}
              disabled={loading[`rename-${renameDialog.workflowId}`]}
            >
              Cancel
            </Button>
            <Button onClick={handleRenameWorkflow} disabled={loading[`rename-${renameDialog.workflowId}`]}>
              {loading[`rename-${renameDialog.workflowId}`] ? (
                <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Edit className="w-4 h-4 mr-2" />
              )}
              Rename
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Move to Folder Dialog */}
      <Dialog
        open={moveFolderDialog.open}
        onOpenChange={(open) => {
          setMoveFolderDialog({ open, workflowIds: [] })
          if (!open) {
            setSelectedFolderId(null)
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              Move {moveFolderDialog.workflowIds.length > 1 ? `${moveFolderDialog.workflowIds.length} workflows` : 'workflow'}
            </DialogTitle>
            <DialogDescription>
              Select a folder to move {moveFolderDialog.workflowIds.length > 1 ? 'these workflows' : 'this workflow'} to.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Select Folder</Label>
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {folders.map((folder) => (
                  <div
                    key={folder.id}
                    className={cn(
                      "p-3 border rounded-lg cursor-pointer transition-colors",
                      selectedFolderId === folder.id
                        ? "border-primary bg-primary/5"
                        : "border-slate-200 hover:bg-slate-50"
                    )}
                    onClick={() => setSelectedFolderId(folder.id)}
                  >
                    <div className="flex items-center gap-2">
                      <Folder className="w-4 h-4" style={{ color: folder.color }} />
                      <span className="text-sm font-medium">{folder.name}</span>
                      {folder.is_default && (
                        <Lock className="w-3 h-3 text-slate-500 ml-1" />
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setMoveFolderDialog({ open: false, workflowIds: [] })
                setSelectedFolderId(null)
              }}
              disabled={moveDialogLoading}
            >
              Cancel
            </Button>
            <Button onClick={handleMoveToFolder} disabled={moveDialogLoading}>
              {moveDialogLoading ? (
                <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <FolderInput className="w-4 h-4 mr-2" />
              )}
              Move
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Share Workflows Dialog */}
      <Dialog
        open={shareDialog.open}
        onOpenChange={(open) => {
          setShareDialog({ open, workflowIds: [] })
          if (!open) {
            setSelectedTeamIds([])
            setShareLoading(false)
          }
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              Share {shareDialog.workflowIds.length > 1 ? `${shareDialog.workflowIds.length} workflows` : 'workflow'}
            </DialogTitle>
            <DialogDescription>
              Choose the teams that should have access. Sharing will add each workflow to the selected teams.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            {loadingTeams ? (
              <div className="flex items-center justify-center py-8 text-sm text-slate-600">
                <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                Loading teams…
              </div>
            ) : availableTeams.length === 0 ? (
              <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-6 text-center text-sm text-slate-600">
                You’re not a member of any teams yet. Create or join a team to share workflows.
              </div>
            ) : (
              <div className="space-y-2 max-h-64 overflow-y-auto pr-2">
                {availableTeams.map((team) => (
                  <label
                    key={team.id}
                    className={cn(
                      "flex items-center gap-3 rounded-lg border p-3 cursor-pointer transition-colors",
                      selectedTeamIds.includes(team.id)
                        ? "border-indigo-500 bg-indigo-50"
                        : "border-slate-200 hover:bg-slate-50"
                    )}
                  >
                    <Checkbox
                      checked={selectedTeamIds.includes(team.id)}
                      onCheckedChange={() => toggleTeamSelection(team.id)}
                    />
                    <div className="flex-1">
                      <p className="text-sm font-medium text-slate-900">{team.name}</p>
                      {team.description && (
                        <p className="text-xs text-slate-600 mt-0.5">{team.description}</p>
                      )}
                    </div>
                  </label>
                ))}
              </div>
            )}
            {shareDialog.workflowIds.length > 1 && (
              <p className="text-xs text-slate-500">
                These workflows will be shared with the selected teams. Existing permissions will be kept.
              </p>
            )}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setShareDialog({ open: false, workflowIds: [] })
                setSelectedTeamIds([])
              }}
            >
              Cancel
            </Button>
            <Button
              onClick={handleShareWorkflows}
              disabled={shareLoading || selectedTeamIds.length === 0 || availableTeams.length === 0}
            >
              {shareLoading ? (
                <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Share2 className="w-4 h-4 mr-2" />
              )}
              Share
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Create Folder Dialog */}
      <Dialog open={createFolderDialog} onOpenChange={setCreateFolderDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create New Folder</DialogTitle>
            <DialogDescription>
              Organize your workflows with folders.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="folder-name">Folder Name *</Label>
              <Input
                id="folder-name"
                placeholder="e.g., Marketing Automations"
                value={newFolderName}
                onChange={(e) => setNewFolderName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleCreateFolder()}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="folder-description">Description</Label>
              <Textarea
                id="folder-description"
                placeholder="What's this folder for?"
                value={newFolderDescription}
                onChange={(e) => setNewFolderDescription(e.target.value)}
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setCreateFolderDialog(false)
                setNewFolderName("")
                setNewFolderDescription("")
              }}
              disabled={loading['create-folder']}
            >
              Cancel
            </Button>
            <Button onClick={handleCreateFolder} disabled={loading['create-folder']}>
              {loading['create-folder'] ? (
                <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <FolderPlus className="w-4 h-4 mr-2" />
              )}
              Create Folder
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Workflow Dialog */}
      <AlertDialog
        open={deleteDialog.open}
        onOpenChange={(open) => {
          setDeleteDialog({ open, workflowIds: [], contextLabel: '' })
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete {deleteDialogLabel}. This action cannot be undone.
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

      {/* Rename Folder Dialog */}
      <Dialog
        open={renameFolderDialog.open}
        onOpenChange={(open) => {
          setRenameFolderDialog({ open, folderId: null, currentName: '' })
          if (!open) {
            setRenameFolderValue('')
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rename Folder</DialogTitle>
            <DialogDescription>
              Enter a new name for your folder.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="rename-folder">Folder Name *</Label>
              <Input
                id="rename-folder"
                placeholder="Enter folder name"
                value={renameFolderValue}
                onChange={(e) => setRenameFolderValue(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleRenameFolder()}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setRenameFolderDialog({ open: false, folderId: null, currentName: '' })
                setRenameFolderValue('')
              }}
              disabled={loading[`rename-folder-${renameFolderDialog.folderId}`]}
            >
              Cancel
            </Button>
            <Button
              onClick={handleRenameFolder}
              disabled={loading[`rename-folder-${renameFolderDialog.folderId}`] || !renameFolderValue.trim()}
            >
              {loading[`rename-folder-${renameFolderDialog.folderId}`] ? (
                <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Edit className="w-4 h-4 mr-2" />
              )}
              Rename
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Folder Dialog */}
      <AlertDialog open={deleteFolderDialog.open} onOpenChange={(open) => setDeleteFolderDialog({ open, folderId: null, folderName: '' })}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete "{deleteFolderDialog.folderName}". Workflows in this folder will be moved to "My Workflows".
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteFolder}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              <Trash2 className="w-4 h-4 mr-2" />
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Upgrade Plan Modal */}
      <UpgradePlanModal
        open={upgradeModalOpen}
        onOpenChange={setUpgradeModalOpen}
        requiredPlan={requiredPlan}
      />
    </>
  )
}

export function WorkflowsPageContent() {
  return (
    <PagePreloader
      pageType="workflows"
      loadingTitle="Loading Workflows"
      loadingDescription="Fetching your workflows and execution stats..."
    >
      <WorkflowsContent />
    </PagePreloader>
  )
}
