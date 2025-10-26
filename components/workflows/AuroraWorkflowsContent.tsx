"use client"

import { useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { formatDistanceToNow } from "date-fns"
import {
  ArrowUpRight,
  Bookmark,
  CheckCircle2,
  Clock,
  Copy,
  Edit,
  Flame,
  Link2,
  LogOut,
  MoreHorizontal,
  PauseCircle,
  PlayCircle,
  Plus,
  RefreshCw,
  Search,
  Settings,
  Share2,
  Sparkles,
  Trash2,
  User,
  Users,
} from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Skeleton } from "@/components/ui/skeleton"
import { Textarea } from "@/components/ui/textarea"
import { useToast } from "@/hooks/use-toast"
import { useAuthStore } from "@/stores/authStore"
import { useIntegrationStore } from "@/stores/integrationStore"
import { useWorkflowStore } from "@/stores/workflowStore"
import { logger } from "@/lib/utils/logger"
import { cn } from "@/lib/utils"

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

const quickFilters: Array<{ id: "all" | "active" | "drafts"; label: string }> = [
  { id: "all", label: "All" },
  { id: "active", label: "Active" },
  { id: "drafts", label: "Drafts" },
]

export function AuroraWorkflowsContent() {
  const router = useRouter()
  const { toast } = useToast()
  const { user } = useAuthStore()
  const { getConnectedProviders } = useIntegrationStore()
  const { workflows, loadingList, fetchWorkflows, updateWorkflow, deleteWorkflow } = useWorkflowStore()

  const [searchQuery, setSearchQuery] = useState("")
  const [viewMode, setViewMode] = useState<"all" | "active" | "drafts">("all")

  const [teams, setTeams] = useState<Team[]>([])
  const [organizations, setOrganizations] = useState<Organization[]>([])
  const [currentOrganization, setCurrentOrganization] = useState<Organization | null>(null)
  const [selectedOrgId, setSelectedOrgId] = useState<string>("")

  const [selectedTeamIds, setSelectedTeamIds] = useState<string[]>([])
  const [selectedCreateTeamIds, setSelectedCreateTeamIds] = useState<string[]>([])
  const [workflowShares, setWorkflowShares] = useState<Record<string, WorkflowShare[]>>({})

  const [shareDialog, setShareDialog] = useState<{ open: boolean; workflowId: string | null }>({ open: false, workflowId: null })
  const [deleteDialog, setDeleteDialog] = useState<{ open: boolean; workflowId: string | null; workflowName: string }>({
    open: false,
    workflowId: null,
    workflowName: "",
  })
  const [createDialog, setCreateDialog] = useState(false)

  const [newWorkflowName, setNewWorkflowName] = useState("")
  const [newWorkflowDescription, setNewWorkflowDescription] = useState("")

  const [executionStats, setExecutionStats] = useState<Record<string, { total: number; today: number; success: number; failed: number }>>({})
  const [loading, setLoading] = useState<Record<string, boolean>>({})

  const connectedCount = getConnectedProviders().length
  const isInTeam = teams.length > 0

  useEffect(() => {
    if (!user) return

    Promise.all([fetchWorkflows(), fetchExecutionStats(), fetchTeams(), fetchOrganizations()]).catch((error) => {
      logger.error("[AuroraWorkflowsContent] Failed initial load", error)
    })
  }, [user, fetchWorkflows])

  useEffect(() => {
    const handleOrgChange = (event: CustomEvent<Organization>) => {
      setCurrentOrganization(event.detail)
      setSelectedOrgId(event.detail.id)
    }

    window.addEventListener("organization-changed", handleOrgChange as EventListener)

    const storedOrgId = typeof window !== "undefined" ? localStorage.getItem("current_workspace_id") : null
    if (storedOrgId && organizations.length > 0) {
      const org = organizations.find((item) => item.id === storedOrgId)
      if (org) {
        setCurrentOrganization(org)
        setSelectedOrgId(org.id)
      }
    } else if (organizations.length > 0 && !currentOrganization) {
      setCurrentOrganization(organizations[0])
      setSelectedOrgId(organizations[0].id)
    }

    return () => {
      window.removeEventListener("organization-changed", handleOrgChange as EventListener)
    }
  }, [organizations, currentOrganization])

  const fetchExecutionStats = async () => {
    try {
      const response = await fetch("/api/analytics/workflow-stats")
      const data = await response.json()
      if (data.success) {
        setExecutionStats(data.stats || {})
      }
    } catch (error) {
      logger.error("[AuroraWorkflowsContent] Failed to fetch execution stats", error)
    }
  }

  const fetchTeams = async () => {
    try {
      const response = await fetch("/api/teams")
      const data = await response.json()
      if (data.success) {
        setTeams(data.teams || [])
      }
    } catch (error) {
      logger.error("[AuroraWorkflowsContent] Failed to fetch teams", error)
    }
  }

  const fetchOrganizations = async () => {
    try {
      const response = await fetch("/api/organizations")
      const data = await response.json()

      if (Array.isArray(data)) {
        setOrganizations(data)

        const storedOrgId = typeof window !== "undefined" ? localStorage.getItem("current_workspace_id") : null
        if (storedOrgId) {
          const org = data.find((item: Organization) => item.id === storedOrgId)
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
      logger.error("[AuroraWorkflowsContent] Failed to fetch organizations", error)
    }
  }

  const fetchWorkflowShares = async (workflowId: string) => {
    try {
      const response = await fetch(`/api/workflows/${workflowId}/share`)
      const data = await response.json()
      if (data.success) {
        setWorkflowShares((prev) => ({ ...prev, [workflowId]: data.shares || [] }))
        setSelectedTeamIds(data.shares?.map((share: WorkflowShare) => share.team_id) || [])
      }
    } catch (error) {
      logger.error("[AuroraWorkflowsContent] Failed to fetch workflow shares", error)
    }
  }

  const toggleTeamSelection = (teamId: string) => {
    setSelectedTeamIds((prev) => (prev.includes(teamId) ? prev.filter((id) => id !== teamId) : [...prev, teamId]))
  }

  const toggleCreateTeamSelection = (teamId: string) => {
    setSelectedCreateTeamIds((prev) => (prev.includes(teamId) ? prev.filter((id) => id !== teamId) : [...prev, teamId]))
  }

  const filteredWorkflows = workflows.filter((workflow) => {
    const matchesSearch = workflow.name.toLowerCase().includes(searchQuery.toLowerCase())
    const matchesView =
      viewMode === "all" ||
      (viewMode === "active" && workflow.status === "active") ||
      (viewMode === "drafts" && workflow.status === "draft")

    return matchesSearch && matchesView
  })

  const stats = useMemo(
    () => ({
      total: workflows.length,
      active: workflows.filter((workflow) => workflow.status === "active").length,
      drafts: workflows.filter((workflow) => workflow.status === "draft").length,
    }),
    [workflows]
  )

  const executionOverview = useMemo(() => {
    return Object.values(executionStats).reduce(
      (acc, value) => {
        acc.totalRuns += value.total || 0
        acc.todayRuns += value.today || 0
        acc.success += value.success || 0
        acc.failed += value.failed || 0
        return acc
      },
      { totalRuns: 0, todayRuns: 0, success: 0, failed: 0 }
    )
  }, [executionStats])

  const topActiveWorkflows = useMemo(() => {
    return [...workflows]
      .filter((workflow) => workflow.status === "active")
      .sort((a, b) => (executionStats[b.id]?.today || 0) - (executionStats[a.id]?.today || 0))
      .slice(0, 3)
  }, [workflows, executionStats])

  const getCreatorName = (workflow: any) => {
    if (workflow.user_id === user?.id) return "You"
    if (workflow.creator) {
      return workflow.creator.username || workflow.creator.email?.split("@")[0] || "Team member"
    }
    return "Unknown"
  }

  const formatDate = (value: string) => {
    try {
      return formatDistanceToNow(new Date(value), { addSuffix: true })
    } catch {
      return "Recently"
    }
  }

  const handleDuplicate = async (workflow: any) => {
    setLoading((prev) => ({ ...prev, [`duplicate-${workflow.id}`]: true }))

    try {
      const response = await fetch(`/api/workflows/${workflow.id}/duplicate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      })
      const data = await response.json()
      if (!data.success) {
        throw new Error(data.error || "Failed to duplicate workflow")
      }

      toast({
        title: "Workflow duplicated",
        description: `Created a copy of "${workflow.name}".`,
      })
      fetchWorkflows()
    } catch (error: any) {
      toast({
        title: "Unable to duplicate workflow",
        description: error.message || "Please try again shortly.",
        variant: "destructive",
      })
    } finally {
      setLoading((prev) => ({ ...prev, [`duplicate-${workflow.id}`]: false }))
    }
  }

  const handleDelete = async () => {
    if (!deleteDialog.workflowId) return

    setLoading((prev) => ({ ...prev, [`delete-${deleteDialog.workflowId}`]: true }))

    try {
      await deleteWorkflow(deleteDialog.workflowId)
      toast({
        title: "Workflow deleted",
        description: `"${deleteDialog.workflowName}" has been removed.`,
      })
      setDeleteDialog({ open: false, workflowId: null, workflowName: "" })
    } catch (error: any) {
      toast({
        title: "Unable to delete workflow",
        description: error.message || "Please try again shortly.",
        variant: "destructive",
      })
    } finally {
      setLoading((prev) => ({ ...prev, [`delete-${deleteDialog.workflowId}`]: false }))
    }
  }

  const handleToggleStatus = async (workflow: any) => {
    const nextStatus = workflow.status === "active" ? "draft" : "active"
    setLoading((prev) => ({ ...prev, [`status-${workflow.id}`]: true }))

    try {
      await updateWorkflow(workflow.id, { status: nextStatus })
      toast({
        title: nextStatus === "active" ? "Workflow activated" : "Workflow paused",
        description: `"${workflow.name}" is now ${nextStatus}.`,
      })
      fetchWorkflows()
    } catch (error: any) {
      toast({
        title: "Unable to update workflow",
        description: error.message || "Please try again shortly.",
        variant: "destructive",
      })
    } finally {
      setLoading((prev) => ({ ...prev, [`status-${workflow.id}`]: false }))
    }
  }

  const handleOpenShareDialog = async (workflowId: string) => {
    setShareDialog({ open: true, workflowId })
    await fetchWorkflowShares(workflowId)
  }

  const handleShareToTeams = async () => {
    if (!shareDialog.workflowId || selectedTeamIds.length === 0) {
      toast({
        title: "Select at least one team",
        description: "Choose the teams that should collaborate on this workflow.",
        variant: "destructive",
      })
      return
    }

    setLoading((prev) => ({ ...prev, [`share-${shareDialog.workflowId}`]: true }))

    try {
      const response = await fetch(`/api/workflows/${shareDialog.workflowId}/share`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ teamIds: selectedTeamIds }),
      })
      const data = await response.json()
      if (!data.success) {
        throw new Error(data.error || "Failed to share workflow")
      }

      toast({
        title: "Workflow shared",
        description: `Shared with ${selectedTeamIds.length} team${selectedTeamIds.length === 1 ? "" : "s"}.`,
      })

      setShareDialog({ open: false, workflowId: null })
      setSelectedTeamIds([])
      fetchWorkflows()
    } catch (error: any) {
      toast({
        title: "Unable to share workflow",
        description: error.message || "Please try again shortly.",
        variant: "destructive",
      })
    } finally {
      setLoading((prev) => ({ ...prev, [`share-${shareDialog.workflowId}`]: false }))
    }
  }

  const handleUnshareFromTeam = async (workflowId: string, teamId: string) => {
    setLoading((prev) => ({ ...prev, [`unshare-${workflowId}-${teamId}`]: true }))

    try {
      const response = await fetch(`/api/workflows/${workflowId}/share?teamId=${teamId}`, { method: "DELETE" })
      const data = await response.json()
      if (!data.success) {
        throw new Error(data.error || "Failed to remove team access")
      }

      toast({
        title: "Team removed",
        description: "Access revoked for the selected team.",
      })
      fetchWorkflowShares(workflowId)
      fetchWorkflows()
    } catch (error: any) {
      toast({
        title: "Unable to remove team",
        description: error.message || "Please try again shortly.",
        variant: "destructive",
      })
    } finally {
      setLoading((prev) => ({ ...prev, [`unshare-${workflowId}-${teamId}`]: false }))
    }
  }

  const handleCreateWorkflow = async () => {
    if (!newWorkflowName.trim()) {
      toast({
        title: "Add a name",
        description: "Name your workflow to continue.",
        variant: "destructive",
      })
      return
    }

    setLoading((prev) => ({ ...prev, "create-workflow": true }))

    try {
      const response = await fetch("/api/workflows", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newWorkflowName.trim(),
          description: newWorkflowDescription.trim() || null,
          organization_id: selectedOrgId || null,
          status: "draft",
        }),
      })

      const data = await response.json()
      if (!data.success) {
        throw new Error(data.error || "Failed to create workflow")
      }

      const workflowId = data.workflow.id

      if (selectedCreateTeamIds.length > 0) {
        await fetch(`/api/workflows/${workflowId}/share`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ teamIds: selectedCreateTeamIds }),
        })
      }

      toast({
        title: "Workflow created",
        description: `"${newWorkflowName}" is ready in drafts.`,
      })

      setNewWorkflowName("")
      setNewWorkflowDescription("")
      setSelectedCreateTeamIds([])
      setCreateDialog(false)

      router.push(`/workflows/builder/${workflowId}`)
    } catch (error: any) {
      toast({
        title: "Unable to create workflow",
        description: error.message || "Please try again shortly.",
        variant: "destructive",
      })
    } finally {
      setLoading((prev) => ({ ...prev, "create-workflow": false }))
    }
  }

  const renderSkeleton = () => (
    <div className="rounded-3xl border border-white/10 bg-white/5 p-6">
      <Skeleton className="h-5 w-40 bg-white/20" />
      <Skeleton className="mt-3 h-4 w-64 bg-white/20" />
      <Skeleton className="mt-6 h-8 w-full bg-white/20" />
    </div>
  )

  return (
    <>
      <div className="relative min-h-screen overflow-hidden bg-gradient-to-br from-[#060a17] via-[#0d1428] to-[#05070f] text-slate-100">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(56,189,248,0.24),transparent_55%)]" />
        <header className="sticky top-0 z-20 border-b border-white/10 bg-slate-900/40 backdrop-blur">
          <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-6 py-6 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.4em] text-slate-300/70">Workflow console</p>
              <div className="mt-2 flex flex-wrap items-center gap-3 text-white">
                <h1 className="text-3xl font-semibold tracking-tight lg:text-4xl">Automations</h1>
                <span className="rounded-full border border-white/20 px-3 py-1 text-xs font-medium uppercase tracking-[0.25em] text-slate-200/80">
                  {currentOrganization?.name ?? "Personal"}
                </span>
              </div>
              <p className="mt-3 max-w-xl text-sm text-slate-300/80">
                Shape, launch, and monitor every workflow in a single focused view. Keep your operators confident and your systems in sync.
              </p>
            </div>
            <div className="flex items-center gap-3">
              <Button
                variant="ghost"
                className="rounded-full border border-white/10 bg-white/10 px-4 py-2 text-sm font-medium text-white transition hover:bg-white/20"
                onClick={() => router.push("/templates")}
              >
                <Bookmark className="mr-2 h-4 w-4" />
                Templates
              </Button>
              <Button
                className="rounded-full bg-white px-4 py-2 text-sm font-semibold text-slate-900 transition hover:bg-slate-100"
                onClick={() => setCreateDialog(true)}
              >
                <Plus className="mr-2 h-4 w-4" />
                New workflow
              </Button>
            </div>
          </div>
        </header>

        <main className="relative mx-auto flex w-full max-w-7xl flex-1 flex-col gap-10 px-6 py-10">
          <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-3xl border border-white/10 bg-white/10 p-5 shadow-xl shadow-cyan-500/10">
              <p className="text-xs uppercase tracking-[0.3em] text-slate-200/70">Live workflows</p>
              <p className="mt-3 text-3xl font-semibold">{stats.active}</p>
              <p className="mt-1 text-xs text-slate-300/80">Currently running in production</p>
            </div>
            <div className="rounded-3xl border border-white/10 bg-white/5 p-5">
              <p className="text-xs uppercase tracking-[0.3em] text-slate-200/70">Drafts</p>
              <p className="mt-3 text-3xl font-semibold">{stats.drafts}</p>
              <p className="mt-1 text-xs text-slate-300/80">Awaiting launch or review</p>
            </div>
            <div className="rounded-3xl border border-white/10 bg-white/5 p-5">
              <p className="text-xs uppercase tracking-[0.3em] text-slate-200/70">Runs today</p>
              <p className="mt-3 text-3xl font-semibold">{executionOverview.todayRuns}</p>
              <p className="mt-1 text-xs text-slate-300/80">
                {executionOverview.totalRuns > 0 ? `${executionOverview.success} successful · ${executionOverview.failed} flagged` : "Awaiting activity"}
              </p>
            </div>
            <div className="rounded-3xl border border-white/10 bg-gradient-to-br from-indigo-500/20 via-cyan-400/20 to-transparent p-5">
              <p className="text-xs uppercase tracking-[0.3em] text-slate-200/70">Integrations</p>
              <p className="mt-3 text-3xl font-semibold">{connectedCount}</p>
              <p className="mt-1 text-xs text-slate-300/80">Connected systems across teams</p>
            </div>
          </section>

          <section className="grid gap-8 lg:grid-cols-[minmax(0,1.25fr),minmax(0,0.75fr)]">
            <div className="space-y-6">
              <div className="rounded-3xl border border-white/10 bg-white/10 p-6 shadow-lg shadow-slate-900/30">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-center">
                  <div className="relative flex-1">
                    <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-white/60" />
                    <Input
                      className="h-12 rounded-full border-white/10 bg-white/10 pl-10 pr-4 text-sm text-white placeholder:text-white/60 focus-visible:ring-white/40"
                      placeholder="Search workflows by name, owner, or team..."
                      value={searchQuery}
                      onChange={(event) => setSearchQuery(event.target.value)}
                    />
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {quickFilters.map((filter) => (
                      <Button
                        key={filter.id}
                        variant="ghost"
                        className={cn(
                          "rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm font-medium text-white/80 transition hover:bg-white/15 whitespace-nowrap",
                          viewMode === filter.id && "border-white/60 bg-white/20 text-white"
                        )}
                        onClick={() => setViewMode(filter.id)}
                      >
                        {filter.label}
                        <span className="ml-2 rounded-full bg-white/20 px-2 py-0.5 text-xs text-white/80">
                          {filter.id === "all" ? stats.total : filter.id === "active" ? stats.active : stats.drafts}
                        </span>
                      </Button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="space-y-4">
                {loadingList && (
                  <div className="space-y-4">
                    {Array.from({ length: 3 }).map((_, index) => (
                      <div key={index}>{renderSkeleton()}</div>
                    ))}
                  </div>
                )}

                {!loadingList && filteredWorkflows.length === 0 && workflows.length === 0 && (
                  <div className="rounded-3xl border border-dashed border-white/20 bg-white/5 p-12 text-center shadow-inner shadow-slate-900/50">
                    <Sparkles className="mx-auto h-8 w-8 text-white/70" />
                    <h2 className="mt-4 text-lg font-semibold text-white">No workflows yet</h2>
                    <p className="mt-2 text-sm text-slate-200/80">Create your first automation and watch live telemetry populate here.</p>
                    <Button
                      className="mt-6 rounded-full bg-white px-5 py-2 text-sm font-medium text-slate-900 hover:bg-slate-100"
                      onClick={() => setCreateDialog(true)}
                    >
                      <Plus className="mr-2 h-4 w-4" />
                      Create workflow
                    </Button>
                  </div>
                )}

                {!loadingList && filteredWorkflows.length === 0 && workflows.length > 0 && (
                  <div className="rounded-3xl border border-white/10 bg-white/5 p-10 text-center shadow-lg shadow-slate-900/40">
                    <h2 className="text-lg font-semibold text-white">No workflows match your filters</h2>
                    <p className="mt-2 text-sm text-slate-200/80">Reset your search or switch the view to see more runs.</p>
                    <Button
                      variant="ghost"
                      className="mt-4 rounded-full border border-white/10 bg-white/10 px-4 py-2 text-sm text-white/80 hover:bg-white/20"
                      onClick={() => {
                        setSearchQuery("")
                        setViewMode("all")
                      }}
                    >
                      Reset filters
                    </Button>
                  </div>
                )}

                {!loadingList &&
                  filteredWorkflows.map((workflow: any) => {
                    const statsForWorkflow = executionStats[workflow.id] || { total: 0, today: 0, success: 0, failed: 0 }
                    const successRate =
                      statsForWorkflow.total > 0 ? Math.round((statsForWorkflow.success / statsForWorkflow.total) * 100) : null

                    return (
                      <div
                        key={workflow.id}
                        className="group relative overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-br from-white/10 via-white/5 to-white/0 p-6 shadow-xl shadow-slate-950/50 transition hover:border-white/30 hover:shadow-2xl"
                      >
                        <div className="pointer-events-none absolute -top-10 right-0 h-32 w-32 rounded-full bg-cyan-400/20 blur-3xl transition group-hover:bg-cyan-300/30" />
                        <button
                          type="button"
                          className="absolute inset-0"
                          aria-label={`Open ${workflow.name}`}
                          onClick={() => router.push(`/workflows/builder/${workflow.id}`)}
                        />

                        <div className="relative flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                          <div className="space-y-3">
                            <div className="flex flex-wrap items-center gap-2">
                              <Badge
                                variant={workflow.status === "active" ? "default" : "secondary"}
                                className={cn(
                                  "rounded-full border border-white/20 px-3 py-1 text-[11px] font-medium uppercase tracking-[0.2em]",
                                  workflow.status === "active"
                                    ? "bg-emerald-500/20 text-emerald-200"
                                    : "bg-white/10 text-white/70"
                                )}
                              >
                                {workflow.status === "active" ? "Live" : "Draft"}
                              </Badge>
                              {workflow.source_template_id && (
                                <Badge variant="outline" className="rounded-full border-white/20 text-[11px] uppercase tracking-[0.2em] text-white/70">
                                  Template
                                </Badge>
                              )}
                              {workflow.organization_id && (
                                <Badge variant="outline" className="rounded-full border-white/20 text-[11px] uppercase tracking-[0.2em] text-white/70">
                                  Shared
                                </Badge>
                              )}
                              <span className="text-xs text-slate-200/70">Updated {formatDate(workflow.updated_at || workflow.created_at)}</span>
                            </div>

                            <div>
                              <h3 className="text-lg font-semibold text-white">{workflow.name}</h3>
                              <p className="mt-2 text-sm text-slate-200/80">
                                {workflow.description || "Add a short description so stakeholders understand the outcome and guardrails."}
                              </p>
                            </div>

                            <div className="flex flex-wrap items-center gap-3 text-xs text-slate-200/70">
                              <span className="inline-flex items-center gap-1.5">
                                <User className="h-3.5 w-3.5 text-white/60" />
                                {getCreatorName(workflow)}
                              </span>
                              {workflow.status === "active" && (
                                <span className="inline-flex items-center gap-1.5">
                                  <Flame className="h-3.5 w-3.5 text-orange-300" />
                                  {statsForWorkflow.today} runs today
                                </span>
                              )}
                              {successRate !== null && (
                                <span className="inline-flex items-center gap-1.5">
                                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-300" />
                                  {successRate}% success
                                </span>
                              )}
                            </div>
                          </div>

                          <div className="relative z-10 flex flex-shrink-0 items-center gap-2">
                            {isInTeam && (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="rounded-full border border-white/10 bg-white/10 px-4 py-2 text-xs font-medium text-white/80 hover:bg-white/20"
                                onClick={(event) => {
                                  event.stopPropagation()
                                  handleOpenShareDialog(workflow.id)
                                }}
                              >
                                <Share2 className="mr-2 h-3.5 w-3.5" />
                                Share
                              </Button>
                            )}

                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-9 w-9 rounded-full border border-white/10 bg-white/10 text-white/80 hover:bg-white/20"
                                  onClick={(event) => event.stopPropagation()}
                                >
                                  <MoreHorizontal className="h-4 w-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end" className="w-52 rounded-2xl border border-slate-200/10 bg-[#0f172a] text-slate-100">
                                <DropdownMenuItem
                                  onClick={(event) => {
                                    event.stopPropagation()
                                    router.push(`/workflows/builder/${workflow.id}`)
                                  }}
                                >
                                  <Edit className="mr-2 h-4 w-4" />
                                  Edit workflow
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  onClick={(event) => {
                                    event.stopPropagation()
                                    handleDuplicate(workflow)
                                  }}
                                  disabled={loading[`duplicate-${workflow.id}`]}
                                >
                                  {loading[`duplicate-${workflow.id}`] ? (
                                    <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                                  ) : (
                                    <Copy className="mr-2 h-4 w-4" />
                                  )}
                                  Duplicate
                                </DropdownMenuItem>
                                {isInTeam && (
                                  <>
                                    <DropdownMenuSeparator />
                                    <DropdownMenuItem
                                      onClick={(event) => {
                                        event.stopPropagation()
                                        handleOpenShareDialog(workflow.id)
                                      }}
                                    >
                                      <Share2 className="mr-2 h-4 w-4" />
                                      Manage sharing
                                    </DropdownMenuItem>
                                  </>
                                )}
                                <DropdownMenuSeparator />
                                <DropdownMenuItem
                                  onClick={(event) => {
                                    event.stopPropagation()
                                    handleToggleStatus(workflow)
                                  }}
                                  disabled={loading[`status-${workflow.id}`]}
                                >
                                  {workflow.status === "active" ? (
                                    <>
                                      <PauseCircle className="mr-2 h-4 w-4" />
                                      Pause workflow
                                    </>
                                  ) : (
                                    <>
                                      <PlayCircle className="mr-2 h-4 w-4" />
                                      Activate workflow
                                    </>
                                  )}
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem
                                  className="text-destructive"
                                  onClick={(event) => {
                                    event.stopPropagation()
                                    setDeleteDialog({ open: true, workflowId: workflow.id, workflowName: workflow.name })
                                  }}
                                >
                                  <Trash2 className="mr-2 h-4 w-4" />
                                  Delete
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </div>
                        </div>

                        <div className="relative mt-6 grid gap-3 sm:grid-cols-3">
                          <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                            <p className="text-[10px] uppercase tracking-[0.35em] text-white/50">Total runs</p>
                            <p className="mt-2 text-lg font-semibold text-white">{statsForWorkflow.total}</p>
                            <p className="text-xs text-white/60">Lifetime executions</p>
                          </div>
                          <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                            <p className="text-[10px] uppercase tracking-[0.35em] text-white/50">Success</p>
                            <p className="mt-2 text-lg font-semibold text-emerald-300">{statsForWorkflow.success}</p>
                            <p className="text-xs text-white/60">Last 7 days</p>
                          </div>
                          <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                            <p className="text-[10px] uppercase tracking-[0.35em] text-white/50">Alerts</p>
                            <p className="mt-2 text-lg font-semibold text-orange-300">{statsForWorkflow.failed}</p>
                            <p className="text-xs text-white/60">Requires review</p>
                          </div>
                        </div>
                      </div>
                    )
                  })}
              </div>
            </div>

            <aside className="space-y-6">
              <div className="rounded-3xl border border-white/10 bg-white/10 p-6 shadow-lg shadow-slate-900/40">
                <div className="flex items-center justify-between">
                  <p className="text-xs uppercase tracking-[0.3em] text-white/60">Observability</p>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="rounded-full border border-white/10 bg-white/10 text-xs text-white/80 hover:bg-white/20"
                    onClick={() => router.push("/analytics")}
                  >
                    View analytics
                    <ArrowUpRight className="ml-2 h-3 w-3" />
                  </Button>
                </div>
                <div className="mt-5 space-y-3 text-sm text-white/80">
                  <div className="flex items-center justify-between rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
                    <span className="flex items-center gap-2 text-white">
                      <Clock className="h-4 w-4 text-cyan-300" />
                      Live executions
                    </span>
                    <span className="font-semibold text-white">{executionOverview.todayRuns}</span>
                  </div>
                  <div className="flex items-center justify-between rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
                    <span className="flex items-center gap-2 text-white">
                      <CheckCircle2 className="h-4 w-4 text-emerald-300" />
                      Success rate
                    </span>
                    <span className="font-semibold text-white">
                      {executionOverview.totalRuns > 0 ? `${Math.round((executionOverview.success / executionOverview.totalRuns) * 100)}%` : "—"}
                    </span>
                  </div>
                  <div className="flex items-center justify-between rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
                    <span className="flex items-center gap-2 text-white">
                      <Link2 className="h-4 w-4 text-slate-200" />
                      Connected systems
                    </span>
                    <span className="font-semibold text-white">{connectedCount}</span>
                  </div>
                </div>
              </div>

              <div className="rounded-3xl border border-white/10 bg-white/5 p-6 shadow-lg shadow-slate-900/40">
                <p className="text-xs uppercase tracking-[0.3em] text-white/60">Top performers</p>
                <div className="mt-4 space-y-3">
                  {topActiveWorkflows.length === 0 && (
                    <div className="rounded-2xl border border-dashed border-white/20 bg-white/5 p-4 text-xs text-white/70">
                      Activate workflows to surface real-time performance insights.
                    </div>
                  )}
                  {topActiveWorkflows.map((workflow) => {
                    const statsForWorkflow = executionStats[workflow.id] || { today: 0, success: 0 }
                    return (
                      <div
                        key={workflow.id}
                        className="flex items-center justify-between rounded-2xl border border-white/10 bg-white/10 px-4 py-3 text-sm text-white/80"
                      >
                        <div>
                          <p className="font-medium text-white">{workflow.name}</p>
                          <div className="mt-1 flex items-center gap-2 text-xs text-white/60">
                            <Flame className="h-3 w-3 text-orange-300" />
                            {statsForWorkflow.today} runs today
                          </div>
                        </div>
                        <Badge variant="outline" className="rounded-full border-white/20 bg-white/5 text-xs text-emerald-200">
                          {statsForWorkflow.success} passed
                        </Badge>
                      </div>
                    )
                  })}
                </div>
              </div>

              <div className="rounded-3xl border border-white/10 bg-white/5 p-6 shadow-lg shadow-slate-900/40">
                <p className="text-xs uppercase tracking-[0.3em] text-white/60">Team access</p>
                <p className="mt-3 text-sm text-white/70">
                  {isInTeam
                    ? "Control visibility and collaboration across delivery squads."
                    : "Create a team to collaborate on automations with your stakeholders."}
                </p>
                <div className="mt-5 space-y-3">
                  {isInTeam
                    ? teams.slice(0, 3).map((team) => (
                        <div key={team.id} className="rounded-2xl border border-white/10 bg-white/10 px-4 py-3 text-sm text-white/80">
                          <p className="font-medium text-white">{team.name}</p>
                          {team.description && <p className="mt-1 text-xs text-white/60">{team.description}</p>}
                        </div>
                      ))
                    : (
                      <div className="rounded-2xl border border-dashed border-white/20 bg-white/5 p-4 text-xs text-white/70">
                        No teams yet. Start one from organization settings to share workflows.
                      </div>
                    )}
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="mt-5 w-full rounded-full border border-white/10 bg-white/10 text-xs font-medium text-white/80 hover:bg-white/20"
                  onClick={() => router.push("/organization-settings?tab=teams")}
                >
                  Manage teams
                </Button>
              </div>
            </aside>
          </section>
        </main>

        <footer className="border-t border-white/10 bg-slate-900/40 backdrop-blur">
          <div className="mx-auto flex w-full max-w-7xl items-center justify-between px-6 py-4 text-xs text-slate-200/70">
            <span>Last synced moments ago</span>
            <div className="flex items-center gap-3">
              <button
                type="button"
                className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/10 px-3 py-1 hover:bg-white/20"
                onClick={() => router.push("/settings")}
              >
                <Settings className="h-3.5 w-3.5" />
                Settings
              </button>
              <button
                type="button"
                className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/10 px-3 py-1 hover:bg-white/20"
                onClick={() => router.push("/logout")}
              >
                <LogOut className="h-3.5 w-3.5" />
                Sign out
              </button>
            </div>
          </div>
        </footer>
      </div>

      <Dialog
        open={shareDialog.open}
        onOpenChange={(open) => {
          if (!open) {
            setShareDialog({ open: false, workflowId: null })
            setSelectedTeamIds([])
          }
        }}
      >
        <DialogContent className="max-w-md rounded-3xl border border-slate-900/20 bg-slate-950 text-slate-100">
          <DialogHeader>
            <DialogTitle>Share workflow</DialogTitle>
            <DialogDescription className="text-slate-300">
              Select teams that should collaborate on this workflow. You can adjust access later.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-5 py-4">
            {teams.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-white/10 bg-white/5 p-8 text-center text-white/70">
                <Users className="mx-auto h-10 w-10 text-white/70" />
                <p className="mt-3 text-sm">No teams yet. Create one to collaborate with your teammates.</p>
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-4 rounded-full border-white/30 text-white"
                  onClick={() => {
                    setShareDialog({ open: false, workflowId: null })
                    router.push("/organization-settings?tab=teams")
                  }}
                >
                  Create team
                </Button>
              </div>
            ) : (
              <ScrollArea className="max-h-80 rounded-2xl border border-white/10 bg-white/5">
                <div className="space-y-2 p-3">
                  {teams.map((team) => (
                    <button
                      type="button"
                      key={team.id}
                      className={cn(
                        "flex w-full cursor-pointer items-start gap-3 rounded-xl border border-transparent px-3 py-2 text-left text-sm text-white/80 transition hover:border-white/20 hover:bg-white/10",
                        selectedTeamIds.includes(team.id) && "border-white/40 bg-white/15 text-white"
                      )}
                      onClick={() => toggleTeamSelection(team.id)}
                    >
                      <Checkbox
                        checked={selectedTeamIds.includes(team.id)}
                        onCheckedChange={() => toggleTeamSelection(team.id)}
                        className="mt-0.5 border-white/40 data-[state=checked]:bg-white data-[state=checked]:text-slate-900"
                      />
                      <div>
                        <p className="font-medium text-white">{team.name}</p>
                        {team.description && <p className="mt-1 text-xs text-white/70">{team.description}</p>}
                      </div>
                    </button>
                  ))}
                </div>
              </ScrollArea>
            )}

            {shareDialog.workflowId && workflowShares[shareDialog.workflowId]?.length > 0 && (
              <div className="rounded-2xl border border-white/10 bg-white/5 p-4 text-xs text-white/70">
                <p className="font-medium text-white/80">Currently shared with</p>
                <div className="mt-3 space-y-2">
                  {workflowShares[shareDialog.workflowId].map((share) => (
                    <div key={share.id} className="flex items-center justify-between rounded-xl border border-white/10 bg-white/10 px-3 py-2">
                      <span className="flex items-center gap-2 text-white">
                        <Users className="h-3.5 w-3.5 text-white/70" />
                        {share.team.name}
                      </span>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 rounded-full border border-white/10 bg-white/10 px-2 text-xs text-white hover:bg-white/20"
                        onClick={(event) => {
                          event.stopPropagation()
                          handleUnshareFromTeam(shareDialog.workflowId!, share.team_id)
                        }}
                        disabled={loading[`unshare-${shareDialog.workflowId}-${share.team_id}`]}
                      >
                        {loading[`unshare-${shareDialog.workflowId}-${share.team_id}`] ? (
                          <RefreshCw className="h-3 w-3 animate-spin" />
                        ) : (
                          "Remove"
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
              className="rounded-full border-white/30 text-white"
              onClick={() => {
                setShareDialog({ open: false, workflowId: null })
                setSelectedTeamIds([])
              }}
            >
              Cancel
            </Button>
            <Button
              className="rounded-full bg-white px-4 py-2 text-sm font-semibold text-slate-900 hover:bg-slate-100"
              onClick={handleShareToTeams}
              disabled={loading[`share-${shareDialog.workflowId}`] || selectedTeamIds.length === 0}
            >
              {loading[`share-${shareDialog.workflowId}`] ? (
                <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Share2 className="mr-2 h-4 w-4" />
              )}
              Share
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={createDialog} onOpenChange={setCreateDialog}>
        <DialogContent className="max-w-2xl rounded-3xl border border-white/10 bg-slate-950 text-slate-100">
          <DialogHeader>
            <DialogTitle>Launch a new workflow</DialogTitle>
            <DialogDescription className="text-slate-300">
              Define the basics and optionally share with teams. You can refine everything inside the builder.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-6 py-4 lg:grid-cols-2">
            <div className="space-y-3">
              <Label htmlFor="workflow-name" className="text-sm text-white/80">
                Workflow name
              </Label>
              <Input
                id="workflow-name"
                placeholder="e.g., Customer onboarding handoff"
                value={newWorkflowName}
                onChange={(event) => setNewWorkflowName(event.target.value)}
                className="rounded-xl border-white/10 bg-white/10 text-white placeholder:text-white/50 focus-visible:ring-white/40"
              />

              <Label htmlFor="workflow-description" className="text-sm text-white/80">
                Description
              </Label>
              <Textarea
                id="workflow-description"
                placeholder="What outcome should this automation deliver? Who depends on it?"
                value={newWorkflowDescription}
                onChange={(event) => setNewWorkflowDescription(event.target.value)}
                className="min-h-[120px] rounded-xl border-white/10 bg-white/10 text-white placeholder:text-white/50 focus-visible:ring-white/40"
              />
            </div>

            <div className="space-y-4">
              <div className="space-y-2">
                <Label className="text-sm text-white/80">Organization</Label>
                <div className="rounded-xl border border-white/10 bg-white/5">
                  <ScrollArea className="h-36 rounded-xl">
                    <div className="space-y-2 p-2">
                      {organizations.length === 0 && (
                        <div className="rounded-lg border border-dashed border-white/15 bg-white/5 p-4 text-xs text-white/70">
                          Add an organization in settings to collaborate across workspaces.
                        </div>
                      )}
                      {organizations.map((org) => (
                        <button
                          type="button"
                          key={org.id}
                          onClick={() => {
                            setSelectedOrgId(org.id)
                            localStorage.setItem("current_workspace_id", org.id)
                          }}
                          className={cn(
                            "flex w-full items-center justify-between rounded-lg border border-transparent bg-white/5 px-3 py-2 text-left text-sm font-medium text-white/80 transition hover:border-white/20 hover:bg-white/10",
                            selectedOrgId === org.id && "border-white/40 bg-white/15 text-white"
                          )}
                        >
                          {org.name}
                          {selectedOrgId === org.id && <CheckCircle2 className="h-4 w-4 text-emerald-300" />}
                        </button>
                      ))}
                    </div>
                  </ScrollArea>
                </div>
              </div>

              <div className="space-y-2">
                <Label className="text-sm text-white/80">Share with teams</Label>
                {teams.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-white/15 bg-white/5 p-6 text-center text-sm text-white/70">
                    No teams yet. Share later from the workflow header.
                  </div>
                ) : (
                  <ScrollArea className="h-36 rounded-xl border border-white/10 bg-white/5">
                    <div className="space-y-2 p-3">
                      {teams.map((team) => (
                        <button
                          type="button"
                          key={team.id}
                          className={cn(
                            "flex w-full cursor-pointer items-start gap-3 rounded-lg border border-transparent px-3 py-2 text-left text-sm text-white/80 transition hover:border-white/20 hover:bg-white/10",
                            selectedCreateTeamIds.includes(team.id) && "border-white/40 bg-white/15 text-white"
                          )}
                          onClick={() => toggleCreateTeamSelection(team.id)}
                        >
                          <Checkbox
                            checked={selectedCreateTeamIds.includes(team.id)}
                            onCheckedChange={() => toggleCreateTeamSelection(team.id)}
                            className="mt-0.5 border-white/40 data-[state=checked]:bg-white data-[state=checked]:text-slate-900"
                          />
                          <div>
                            <p className="font-medium text-white">{team.name}</p>
                            {team.description && <p className="mt-1 text-xs text-white/70">{team.description}</p>}
                          </div>
                        </button>
                      ))}
                    </div>
                  </ScrollArea>
                )}
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              className="rounded-full border-white/30 text-white"
              onClick={() => {
                setCreateDialog(false)
                setNewWorkflowName("")
                setNewWorkflowDescription("")
                setSelectedCreateTeamIds([])
              }}
              disabled={loading["create-workflow"]}
            >
              Cancel
            </Button>
            <Button
              className="rounded-full bg-white px-4 py-2 text-sm font-semibold text-slate-900 hover:bg-slate-100"
              onClick={handleCreateWorkflow}
              disabled={loading["create-workflow"]}
            >
              {loading["create-workflow"] ? (
                <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Plus className="mr-2 h-4 w-4" />
              )}
              Create workflow
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={deleteDialog.open}
        onOpenChange={(open) => setDeleteDialog({ open, workflowId: null, workflowName: "" })}
      >
        <AlertDialogContent className="max-w-sm rounded-3xl border border-white/10 bg-slate-950 text-slate-100">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete workflow</AlertDialogTitle>
            <AlertDialogDescription className="text-slate-300">
              Removing “{deleteDialog.workflowName}” will also remove its historical runs. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-full border-white/30 text-white">Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="rounded-full bg-destructive px-4 py-2 text-sm font-semibold text-destructive-foreground hover:bg-destructive/90"
              onClick={handleDelete}
              disabled={loading[`delete-${deleteDialog.workflowId}`]}
            >
              {loading[`delete-${deleteDialog.workflowId}`] ? (
                <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Trash2 className="mr-2 h-4 w-4" />
              )}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
