"use client"

import { useCallback, useEffect, useState } from "react"
import Link from "next/link"
import AppLayout from "@/components/layout/AppLayout"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { Play, Pause, Settings, Trash2, Sparkles, LayoutTemplateIcon as Template, Plus, Building2, Pencil, Clock, Calendar, User } from "lucide-react"
import { LightningLoader } from '@/components/ui/lightning-loader'
import { useToast } from "@/hooks/use-toast"
import CreateWorkflowDialog from "./CreateWorkflowDialog"
import AddToOrganizationDialog from "./AddToOrganizationDialog"
import WorkflowDialog from "./WorkflowDialog"
import { useWorkflows } from "@/hooks/use-workflows"
import { Workflow } from "@/stores/workflowStore"
import { useTimeoutLoading } from '@/hooks/use-timeout-loading'
import { RoleGuard, PermissionGuard, OrganizationRoleGuard } from "@/components/ui/role-guard"
import { useAuthStore } from "@/stores/authStore"
import { useOrganizationStore } from "@/stores/organizationStore"
import { hasOrganizationPermission } from "@/lib/utils/organizationRoles"
import { getRelativeTime, formatDateTime } from "@/lib/utils/formatTime"
import { createClient } from "@/utils/supabaseClient"
import { useIntegrationStore } from "@/stores/integrationStore"

import { logger } from '@/lib/utils/logger'

export default function WorkflowsContent() {
  const { profile } = useAuthStore()
  const { currentOrganization } = useOrganizationStore()
  const { integrations, fetchIntegrations } = useIntegrationStore()
  const {
    workflows,
    error,
    loadAllWorkflows,
    updateWorkflowById,
    deleteWorkflowById,
  } = useWorkflows()
  const [userProfiles, setUserProfiles] = useState<Record<string, any>>({})

  // Get user's organization role
  const getUserOrgRole = () => {
    if (!currentOrganization || !profile) return 'viewer'
    const userMember = currentOrganization.members?.find(
      (member: any) => member.user_id === profile.id
    )
    return userMember?.role || 'viewer'
  }

  const userOrgRole = getUserOrgRole()

  const [aiPrompt, setAiPrompt] = useState("")
  const [generatingAI, setGeneratingAI] = useState(false)
  const [aiModel, setAiModel] = useState<'gpt-4o' | 'gpt-4o-mini'>('gpt-4o-mini')
  const [updatingWorkflows, setUpdatingWorkflows] = useState<Set<string>>(new Set())
  const [deletingWorkflows, setDeletingWorkflows] = useState<Set<string>>(new Set())

  // Clear loading states when workflows update (safety mechanism)
  useEffect(() => {
    if (!workflows) return

    // Clear updating state - when workflows array updates, assume update completed
    setUpdatingWorkflows(prev => {
      if (prev.size === 0) return prev
      // Clear all updating states since workflows array changed
      return new Set()
    })

    // Clear deleting state for workflows that no longer exist
    setDeletingWorkflows(prev => {
      const workflowIds = new Set(workflows.map(w => w.id))
      const newSet = new Set(prev)
      let changed = false

      prev.forEach(id => {
        if (!workflowIds.has(id)) {
          newSet.delete(id)
          changed = true
        }
      })

      return changed ? newSet : prev
    })
  }, [workflows])
  const [aiDebugMode, setAiDebugMode] = useState(false)
  const [aiStrictMode, setAiStrictMode] = useState(true)
  const [aiDebugData, setAiDebugData] = useState<any | null>(null)
  const [aiDebugOpen, setAiDebugOpen] = useState(false)
  const [aiDebugWorkflowId, setAiDebugWorkflowId] = useState<string | null>(null)
  const [editDialogOpen, setEditDialogOpen] = useState(false)
  const [workflowToEdit, setWorkflowToEdit] = useState<Workflow | null>(null)
  const [templateDialog, setTemplateDialog] = useState<{ open: boolean; workflowId: string | null }>({
    open: false,
    workflowId: null,
  })
  const [addToOrgDialog, setAddToOrgDialog] = useState<{ open: boolean; workflowId: string | null; workflowName: string }>({
    open: false,
    workflowId: null,
    workflowName: "",
  })
  const [templateForm, setTemplateForm] = useState({
    name: "",
    description: "",
    category: "",
    tags: "",
    is_public: false,
  })
  const [errorModal, setErrorModal] = useState<{ open: boolean; title: string; message: string }>({
    open: false,
    title: "",
    message: "",
  })
  const [deleteConfirmation, setDeleteConfirmation] = useState<{ open: boolean; workflowId: string | null; workflowName: string }>({
    open: false,
    workflowId: null,
    workflowName: "",
  })
  const { toast } = useToast()
  const hasWorkflows = Array.isArray(workflows) && workflows.length > 0
  const [forceShowContent, setForceShowContent] = useState(false)
  const [refreshing, setRefreshing] = useState(false)

  // Use the new timeout loading hook for fast, reliable loading
  // NON-BLOCKING - page renders immediately
  const { refresh: refreshWorkflows } = useTimeoutLoading({
    loadFunction: async (force) => {
      if (force) {
        setForceShowContent(false)
      }
      setRefreshing(true)
      try {
        return await loadAllWorkflows(force ?? true)
      } finally {
        setRefreshing(false)
      }
    },
    isLoading: refreshing,
    timeout: 5000, // 5 second timeout
    forceRefreshOnMount: true, // Always refresh workflows on mount
    onError: (error) => {
      // Don't show toast for timeouts - just log
      logger.warn('Workflow loading error (non-blocking):', error)
    },
    onSuccess: () => {
      setForceShowContent(false)
    },
    dependencies: [] // Only load on mount
  })

  // Add a fallback timeout to force show content if loading gets stuck
  // This ensures the page never stays in infinite loading state
  useEffect(() => {
    if (!refreshing) {
      setForceShowContent(false)
      return
    }

    const fallbackTimeout = setTimeout(() => {
      if (refreshing && !hasWorkflows) {
        logger.warn('⚠️ Workflows page stuck in loading state - forcing content display')
        setForceShowContent(true)
      }
    }, 8000) // 8 second fallback (longer than useTimeoutLoading)

    return () => clearTimeout(fallbackTimeout)
  }, [refreshing, hasWorkflows])

  // Load integrations on mount
  const safeFetchIntegrations = useCallback(async (force = false) => {
    const state = useIntegrationStore.getState()
    if (state.loadingStates?.['integrations']) {
      logger.debug('⏳ Integration fetch already in progress, skipping duplicate request')
      return null
    }
    return fetchIntegrations(force)
  }, [fetchIntegrations])

  useEffect(() => {
    logger.debug('🔧 Fetching integrations on mount...')
    safeFetchIntegrations()
      .then(() => {
        logger.debug('✅ Integrations fetched')
      })
      .catch((err) => {
        logger.error('❌ Failed to fetch integrations:', err)
      })
  }, [safeFetchIntegrations])

  // Load user profiles for workflow creators
  useEffect(() => {
    const loadUserProfiles = async () => {
      if (!workflows || workflows.length === 0) return

      const userIds = [...new Set(workflows.map(w => w.user_id).filter(Boolean))]
      const supabase = createClient()
      if (!supabase) return

      const { data: profiles } = await supabase
        .from('user_profiles')
        .select('id, full_name, username')
        .in('id', userIds)

      if (profiles) {
        const profileMap = profiles.reduce((acc, profile) => {
          acc[profile.id] = profile
          return acc
        }, {} as Record<string, any>)
        setUserProfiles(profileMap)
      }
    }

    loadUserProfiles()
  }, [workflows])

  const handleMoveToOrganization = (workflowId: string, workflowName: string) => {
    setAddToOrgDialog({
      open: true,
      workflowId,
      workflowName,
    })
  }

  const handleMoveComplete = () => {
    // No need to refresh - the store will update automatically
    // when the move operation completes
  }

  const handleEditWorkflow = (workflow: Workflow) => {
    setWorkflowToEdit(workflow)
    setEditDialogOpen(true)
  }

  const handleEditSuccess = async () => {
    toast({
      title: "Success",
      description: "Workflow updated successfully",
    })
    // No need to refresh - the WorkflowDialog already updates the store
  }

  const handleToggleStatus = async (id: string, currentStatus?: string) => {
    const status = currentStatus || "draft"
    const workflowList = workflows || []
    const workflowToUpdate = workflowList.find((w: any) => w.id === id) || null

    let newStatus: string
    if (status === "active") {
      newStatus = "inactive"
    } else if (status === "inactive") {
      newStatus = "active"
    } else if (status === "draft") {
      if (workflowToUpdate) {
        const hasTrigger = workflowToUpdate.nodes?.some(n => n.data?.isTrigger)
        const hasAction = workflowToUpdate.nodes?.some(n => !n.data?.isTrigger)
        const hasConnections = workflowToUpdate.connections?.length > 0

        if (!hasTrigger) {
          toast({
            title: "Cannot Activate",
            description: "Workflow needs a trigger to be activated",
            variant: "destructive",
          })
          return
        }

        if (!hasAction) {
          toast({
            title: "Cannot Activate",
            description: "Workflow needs at least one action to be activated",
            variant: "destructive",
          })
          return
        }

        if (!hasConnections) {
          toast({
            title: "Cannot Activate",
            description: "Workflow needs connections between nodes to be activated",
            variant: "destructive",
          })
          return
        }

        newStatus = "active"
      } else {
        newStatus = "active"
      }
    } else {
      newStatus = "active"
    }

    if (!workflowToUpdate) {
      logger.error(`Workflow with id ${id} not found`)
      toast({
        title: "Error",
        description: "Workflow not found",
        variant: "destructive",
      })
      return
    }

    // Set loading state
    setUpdatingWorkflows(prev => new Set(prev).add(id))

    let webhookRegistrationPromise: Promise<void> | null = null

    try {
      const workflowSnapshot = workflowList.find((w: any) => w.id === id) || workflowToUpdate

      if (newStatus === 'active') {
        const triggerNode = workflowSnapshot.nodes.find((n: any) => n?.data?.isTrigger)
        if (triggerNode) {
          const providerId: string | undefined = triggerNode.data?.providerId
          const integrationProviders = ['gmail', 'airtable', 'discord', 'slack', 'stripe', 'shopify', 'hubspot']

          if (providerId && integrationProviders.includes(providerId)) {
            const integration = integrations.find(
              (int: any) => int.provider === providerId && int.status === 'connected'
            )

            if (!integration) {
              toast({
                title: `${providerId.charAt(0).toUpperCase() + providerId.slice(1)} not connected`,
                description: `Please connect your ${providerId.charAt(0).toUpperCase() + providerId.slice(1)} account before activating this workflow.`,
                variant: "destructive",
              })
              // Clear loading state before returning
              setUpdatingWorkflows(prev => {
                const newSet = new Set(prev)
                newSet.delete(id)
                return newSet
              })
              return
            }
          }

          const gmailTrigger = workflowSnapshot.nodes.find((n: any) =>
            n?.data?.type === 'gmail_trigger_new_email' ||
            n?.type === 'gmail_trigger_new_email'
          )

          if (gmailTrigger) {
            const gmailIntegration = integrations.find(
              (int: any) => int.provider === 'gmail' && int.status === 'connected'
            )

            if (gmailIntegration) {
              webhookRegistrationPromise = fetch('/api/workflows/webhook-registration', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({
                  workflowId: id,
                  triggerType: gmailTrigger.data?.type || gmailTrigger.type,
                  providerId: 'gmail',
                  config: { labelIds: gmailTrigger.data?.config?.labelIds || ['INBOX'] }
                })
              }).then(response => {
                if (!response.ok) {
                  response.json().then(errorData => {
                    logger.error('⚠️ Gmail webhook registration failed (non-blocking):', errorData)
                  })
                } else {
                  response.json().then(webhookData => {
                    logger.debug('✅ Gmail webhook registered successfully:', webhookData)
                  })
                }
              }).catch(webhookError => {
                logger.error('⚠️ Gmail webhook registration error (non-blocking):', webhookError)
              })
            }
          }
        }
      }

      logger.debug(`📝 About to call updateWorkflowById for ${id} with status: ${newStatus}`)
      const updatedWorkflow = await updateWorkflowById(id, { status: newStatus })
      logger.debug(`✅ Workflow update completed:`, updatedWorkflow)

      if ((updatedWorkflow as any)?.triggerActivationError) {
        const error = (updatedWorkflow as any).triggerActivationError
        logger.error('❌ Trigger activation failed:', error)

        // Format error details for display
        let errorDescription = error.message || "Could not activate triggers"
        if (error.details) {
          if (Array.isArray(error.details)) {
            errorDescription = error.details.join('; ')
          } else if (typeof error.details === 'string') {
            errorDescription = error.details
          }
        }

        toast({
          title: "Workflow activation failed",
          description: errorDescription,
          variant: "destructive",
          duration: 10000, // Show for longer so user can read the error
        })
        throw new Error(error.message || "Trigger activation failed")
      }

      logger.debug(`✅ Workflow status updated. Webhooks will be ${newStatus === 'active' ? 'registered' : 'unregistered'} automatically.`)

      // Check if this workflow has Notion triggers that need manual setup
      const hasNotionTrigger = workflowSnapshot.nodes.some((n: any) =>
        n?.data?.providerId === 'notion' && n?.data?.isTrigger
      )

      if (newStatus === 'active' && hasNotionTrigger) {
        toast({
          title: "Notion webhook setup required",
          description: "To complete activation, configure the webhook in your Notion integration settings.",
          action: {
            label: "Open Notion Integrations",
            onClick: () => window.open('https://www.notion.so/my-integrations', '_blank')
          },
          duration: 15000, // Show for 15 seconds
        })
      }

      toast({
        title: "Success",
        description: `Workflow ${newStatus === "active" ? "activated" : newStatus === "inactive" ? "deactivated" : "updated"}`
      })

      if (webhookRegistrationPromise) {
        logger.debug('🚀 Starting Gmail webhook registration in background...')
        webhookRegistrationPromise
      }
    } catch (error) {
      logger.error("Failed to update workflow status:", error)

      toast({
        title: "Error",
        description: "Failed to update workflow status",
        variant: "destructive",
      })
    } finally {
      // Always clear loading state when done (success or error)
      setUpdatingWorkflows(prev => {
        const newSet = new Set(prev)
        newSet.delete(id)
        return newSet
      })
    }
  }

  const handleDeleteWorkflow = async () => {
    if (!deleteConfirmation.workflowId) return

    const workflowId = deleteConfirmation.workflowId

    // Add to deleting set
    setDeletingWorkflows(prev => new Set(prev).add(workflowId))

    // Close dialog immediately to show loading state on card
    setDeleteConfirmation({ open: false, workflowId: null, workflowName: "" })

    try {
      await deleteWorkflowById(workflowId)
      toast({
        title: "Success",
        description: "Workflow deleted successfully",
      })
    } catch (error) {
      logger.error("Failed to delete workflow:", error)
      toast({
        title: "Error",
        description: "Failed to delete workflow",
        variant: "destructive",
      })
      // Remove from deleting set on error so user can try again
      setDeletingWorkflows(prev => {
        const newSet = new Set(prev)
        newSet.delete(workflowId)
        return newSet
      })
    }
  }

  const openDeleteConfirmation = (id: string, name: string) => {
    setDeleteConfirmation({ open: true, workflowId: id, workflowName: name })
  }

  const handleGenerateWithAI = async () => {
    if (!aiPrompt.trim()) return

    setGeneratingAI(true)
    try {
      const response = await fetch("/api/ai/generate-workflow", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: 'include', // Include session cookies for authentication
        body: JSON.stringify({
          prompt: aiPrompt,
          model: aiModel,
          debug: aiDebugMode,
          strict: aiStrictMode,
        }),
      })

      const data = await response.json()

      if (data.success) {
        if (aiDebugMode && data.debug) {
          setAiDebugData(data.debug)
          setAiDebugOpen(true)
          setAiDebugWorkflowId(data.workflow?.id || null)

          // Console-friendly debug dump for quick copy/paste
          try {
            // Group logs for readability
            console.groupCollapsed('AI Debug: Workflow Generation')
            logger.debug('Model:', data.debug.model)
            logger.debug('Detected Scenarios:', data.debug.detectedScenarios)
            logger.debug('System Prompt:\n', data.debug.systemPrompt)
            logger.debug('User Prompt:\n', data.debug.userPrompt)
            logger.debug('Raw OpenAI Response (JSON string):\n', data.debug.rawResponse)
            if (data.debug.errors?.length) {
              logger.warn('Validation Errors:', data.debug.errors)
            }
            // Also provide a single JSON object for copying
            logger.debug('Debug Bundle JSON:', JSON.stringify({
              workflowId: data.workflow?.id,
              model: data.debug.model,
              detectedScenarios: data.debug.detectedScenarios,
              systemPrompt: data.debug.systemPrompt,
              userPrompt: data.debug.userPrompt,
              rawResponse: data.debug.rawResponse,
              errors: data.debug.errors,
              generatedWorkflow: data.generated,
            }, null, 2))
            console.groupEnd()
          } catch (e) {
            // Best-effort logging, avoid UI impact
          }
        }
        if (aiDebugMode) {
          toast({
            title: "Success",
            description: `Workflow "${data.workflow.name}" created. Debug mode is active.`,
          })
        } else {
          toast({
            title: "Success",
            description: `Workflow "${data.workflow.name}" created successfully! Opening in builder...`,
          })
          // If this is a Discord-triggered workflow, add a reminder toast
          try {
            const hasDiscordTrigger = Array.isArray(data?.workflow?.nodes) && data.workflow.nodes.some((n: any) => n?.data?.type === 'discord_trigger_new_message')
            if (hasDiscordTrigger) {
              toast({
                title: "Next step",
                description: "In the builder, select your Discord server and channel for the trigger.",
              })
            }
          } catch {}
          // Clear the prompt
          setAiPrompt("")
          // Navigate to the workflow builder with the new workflow
          setTimeout(() => {
            window.location.href = `/workflow/${data.workflow.id}/builder`
          }, 500)
        }
      } else {
        if (aiDebugMode && data.debug) {
          setAiDebugData(data.debug)
          setAiDebugOpen(true)
          setAiDebugWorkflowId(null)
        }
        // Check if it's a coming soon integration error
        if (data.comingSoonIntegrations && data.comingSoonIntegrations.length > 0) {
          setErrorModal({
            open: true,
            title: "Integration Not Available",
            message: data.error || `The following integrations are coming soon and not yet available: ${data.comingSoonIntegrations.join(', ')}. Please try your request without these integrations.`,
          })
        } else {
          // For other errors, show in modal as well
          setErrorModal({
            open: true,
            title: "Workflow Generation Failed",
            message: data.error || "Failed to generate workflow. Please try again.",
          })
        }
      }
    } catch (error: any) {
      logger.error("Failed to generate workflow:", error)
      // Show error in modal instead of just toast
      setErrorModal({
        open: true,
        title: "Error",
        message: error.message || "An unexpected error occurred while generating the workflow.",
      })
    } finally {
      setGeneratingAI(false)
    }
  }

  const handleCreateTemplate = async () => {
    if (!templateDialog.workflowId) return

    try {
      setTemplateDialog({ open: false, workflowId: null })
      setTemplateForm({
        name: "",
        description: "",
        category: "",
        tags: "",
        is_public: false,
      })

      toast({
        title: "Not implemented",
        description: "Template creation is not implemented in the cached version yet",
      })
    } catch (error) {
      logger.error("Failed to create template:", error)
      toast({
        title: "Error",
        description: "Failed to create template",
        variant: "destructive",
      })
    }
  }

  const DebugSection = () => {
    if (!aiDebugData) return null
    const { model, detectedScenarios, systemPrompt, userPrompt, rawResponse, errors } = aiDebugData
    return (
      <div className="space-y-4">
        <div>
          <div className="text-sm text-muted-foreground">Model</div>
          <div className="font-mono text-sm">{model}</div>
        </div>
        <div>
          <div className="text-sm text-muted-foreground">Detected Scenarios</div>
          <div className="font-mono text-sm">{Array.isArray(detectedScenarios) ? detectedScenarios.join(', ') : ''}</div>
        </div>
        <div>
          <div className="text-sm text-muted-foreground">System Prompt</div>
          <pre className="bg-slate-50 border rounded p-2 max-h-[30vh] overflow-auto text-xs whitespace-pre-wrap">{systemPrompt}</pre>
        </div>
        <div>
          <div className="text-sm text-muted-foreground">User Prompt</div>
          <pre className="bg-slate-50 border rounded p-2 max-h-[30vh] overflow-auto text-xs whitespace-pre-wrap">{userPrompt}</pre>
        </div>
        <div>
          <div className="text-sm text-muted-foreground">Raw OpenAI Response</div>
          <pre className="bg-slate-50 border rounded p-2 max-h-[30vh] overflow-auto text-xs whitespace-pre-wrap">{rawResponse}</pre>
        </div>
        {Array.isArray(errors) && errors.length > 0 && (
          <div>
            <div className="text-sm text-red-600">Validation Errors</div>
            <ul className="list-disc pl-5 text-xs text-red-600 space-y-1">
              {errors.map((e: string, i: number) => (
                <li key={i}>{e}</li>
              ))}
            </ul>
          </div>
        )}
      </div>
    )
  }

  if (refreshing && !hasWorkflows && !forceShowContent) {
    return (
      <AppLayout title="Workflows">
        <div className="flex items-center justify-center h-64">
          <LightningLoader size="xl" color="primary" />
        </div>
      </AppLayout>
    )
  }

  if (error) {
    return (
      <AppLayout title="Workflows">
        <div className="flex flex-col items-center justify-center h-64">
          <div className="text-red-500 mb-4">Error loading workflows: {error}</div>
          <Button onClick={() => { setForceShowContent(false); refreshWorkflows(); }}>Retry</Button>
        </div>
      </AppLayout>
    )
  }

  return (
    <AppLayout title="Workflows">
      <div className="space-y-8 p-6">
        {refreshing && hasWorkflows && (
          <div className="flex items-center justify-between rounded border border-border bg-card/60 px-3 py-2 text-sm text-muted-foreground">
            <span>Refreshing workflows…</span>
            <LightningLoader size="sm" />
          </div>
        )}

        <div className="space-y-8">
            <PermissionGuard permission="workflows.create">
              <div className="flex items-center justify-end">
                <CreateWorkflowDialog />
              </div>
            </PermissionGuard>
            <PermissionGuard permission="workflows.create">
              <Card className="bg-gradient-to-br from-muted/30 via-muted/20 to-muted/10 border-border shadow-sm">
                <CardHeader className="pb-4">
                  <CardTitle className="flex items-center gap-3 text-xl">
                    <div className="p-2 bg-primary/10 rounded-lg">
                      <Sparkles className="h-5 w-5 text-primary" />
                    </div>
                    Generate Workflow with AI
                  </CardTitle>
                  <p className="text-slate-600 text-sm">
                    Describe what you want your workflow to do, and AI will create it for you.
                  </p>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex gap-4">
                    <div className="flex-1 space-y-3">
                      <Textarea
                        placeholder="Describe your workflow... e.g., 'Send Slack notifications when new emails arrive from important clients'"
                        value={aiPrompt}
                        onChange={(e) => setAiPrompt(e.target.value)}
                        rows={3}
                        className="resize-none border-border focus:border-primary focus:ring-primary transition-all duration-200"
                      />
                      <div className="flex items-center gap-3">
                        <Label htmlFor="ai-model" className="text-sm text-muted-foreground">AI Model:</Label>
                        <Select
                          value={aiModel}
                          onValueChange={(value: 'gpt-4o' | 'gpt-4o-mini') => setAiModel(value)}
                        >
                          <SelectTrigger id="ai-model" className="w-48 text-sm">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="gpt-4o-mini" className="text-sm">
                              <div className="flex flex-col items-start">
                                <span className="text-sm">GPT-4o Mini</span>
                                <span className="text-xs text-muted-foreground hidden lg:block">Faster & cost-efficient</span>
                              </div>
                            </SelectItem>
                            <SelectItem value="gpt-4o" className="text-sm">
                              <div className="flex flex-col items-start">
                                <span className="text-sm">GPT-4o</span>
                                <span className="text-xs text-muted-foreground hidden lg:block">More capable & accurate</span>
                              </div>
                            </SelectItem>
                          </SelectContent>
                        </Select>
                        <RoleGuard requiredRole="admin">
                          <div className="flex items-center gap-4 ml-4">
                            <div className="flex items-center gap-2">
                              <Switch id="ai-debug" checked={aiDebugMode} onCheckedChange={setAiDebugMode} />
                              <Label htmlFor="ai-debug" className="text-sm text-muted-foreground">AI Debug Mode</Label>
                            </div>
                            <div className="flex items-center gap-2">
                              <Switch id="ai-strict" checked={aiStrictMode} onCheckedChange={setAiStrictMode} />
                              <Label htmlFor="ai-strict" className="text-sm text-muted-foreground">Strict Mode</Label>
                            </div>
                          </div>
                        </RoleGuard>
                      </div>
                      {/* Removed example prompt buttons for a cleaner UI */}
                    </div>
                    <Button
                      onClick={handleGenerateWithAI}
                      disabled={!aiPrompt.trim() || generatingAI}
                      className="bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700 hover:shadow-lg hover:scale-105 focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition-all duration-200 px-6"
                    >
                      {generatingAI ? (
                        <>
                          <LightningLoader size="sm" className="mr-2" />
                          Generating...
                        </>
                      ) : (
                        <>
                          <Sparkles className="w-4 h-4 mr-2" />
                          Generate
                        </>
                      )}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </PermissionGuard>

            {!workflows || workflows.length === 0 ? (
              <div className="text-center py-16">
                <div className="max-w-md mx-auto space-y-6">
                  <div className="p-4 bg-slate-100 rounded-full w-16 h-16 mx-auto flex items-center justify-center">
                    <Plus className="w-8 h-8 text-slate-400" />
                  </div>
                  <div>
                    <h3 className="text-lg font-medium text-slate-900 mb-2">No workflows yet</h3>
                    <p className="text-slate-500 text-sm">
                      Create your first workflow to automate your tasks and processes.
                    </p>
                  </div>
                  <div className="flex flex-col sm:flex-row gap-3 justify-center">
                    <PermissionGuard permission="workflows.create">
                      <CreateWorkflowDialog />
                    </PermissionGuard>
                    <Link href="/workflows/templates">
                      <Button
                        variant="outline"
                        className="flex items-center gap-2 hover:bg-slate-50 hover:shadow-sm focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition-all duration-200"
                      >
                        <Template className="w-4 h-4" />
                        Browse Templates
                      </Button>
                    </Link>
                  </div>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {workflows.map((workflow) => (
                  <Card key={workflow.id} className="overflow-hidden border-border hover:border-primary/40 hover:shadow-lg transition-all duration-200 group flex flex-col h-full relative">
                    {/* Loading overlay for deleting workflow */}
                    {deletingWorkflows.has(workflow.id) && (
                      <div className="absolute inset-0 bg-background/80 backdrop-blur-sm z-50 flex items-center justify-center">
                        <div className="flex flex-col items-center gap-2">
                          <LightningLoader size="sm" />
                          <p className="text-sm text-muted-foreground">Deleting workflow...</p>
                        </div>
                      </div>
                    )}
                    <CardHeader className="pb-3 flex-shrink-0">
                      <div className="space-y-2">
                        {/* Workflow Name and Edit Button */}
                        <div className="flex items-center justify-between">
                          <CardTitle className="font-semibold text-lg text-slate-900 group-hover:text-primary transition-colors">
                            {workflow.name}
                          </CardTitle>
                          <PermissionGuard permission="workflows.edit">
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-8 w-8 p-0 opacity-0 group-hover:opacity-100 transition-opacity"
                              onClick={(e) => {
                                e.preventDefault()
                                handleEditWorkflow(workflow)
                              }}
                              title="Edit workflow details"
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                          </PermissionGuard>
                        </div>

                        {/* Workflow Description */}
                        <div>
                          {workflow.description ? (
                            <p className="text-sm text-slate-600">{workflow.description}</p>
                          ) : (
                            <p className="text-sm text-slate-400 italic">No description</p>
                          )}
                        </div>

                        {/* Validation warnings for all workflows */}
                        {(() => {
                          const validationIssues: string[] = []
                          const disconnectedIntegrations: Set<string> = new Set()
                          const hasTrigger = workflow.nodes?.some(n => n.data?.isTrigger)
                          const hasAction = workflow.nodes?.some(n => !n.data?.isTrigger && n.type !== 'addAction')
                          const hasConnections = workflow.connections?.length > 0

                          // Check for basic workflow structure
                          if (!hasTrigger) validationIssues.push('Missing trigger')
                          if (!hasAction) validationIssues.push('Missing action')
                          if (workflow.nodes?.length > 1 && !hasConnections) validationIssues.push('Missing connections')

                          // Check for disconnected integrations
                          workflow.nodes?.forEach(node => {
                            if (!node.data) return

                            const providerId = node.data.providerId
                            // Skip system/internal node types
                            if (!providerId || ['logic', 'core', 'manual', 'schedule', 'webhook', 'ai'].includes(providerId)) return

                            // Special case: Excel uses OneDrive's OAuth connection
                            const actualProvider = providerId === 'microsoft-excel' ? 'onedrive' : providerId

                            // Check if integration is connected
                            const isConnected = integrations.some(
                              integration => integration.provider === actualProvider && integration.status === 'connected'
                            )

                            if (!isConnected) {
                              disconnectedIntegrations.add(providerId)
                            }
                          })

                          // Add disconnected integration warnings
                          if (disconnectedIntegrations.size > 0) {
                            const integrationNames = Array.from(disconnectedIntegrations)
                              .map(id => id.split('-').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' '))
                              .join(', ')
                            validationIssues.push(`Integration disconnected: ${integrationNames}`)
                          }

                          // Check for missing required fields in nodes
                          workflow.nodes?.forEach(node => {
                            if (!node.data) return

                            // Check for validation state
                            if (node.data.validationState?.missingRequired?.length > 0) {
                              validationIssues.push(`${node.data.title || 'Node'}: incomplete configuration`)
                            }

                            // Special checks for specific node types
                            const nodeType = node.data.type || node.type
                            if (nodeType === 'discord_trigger_new_message') {
                              if (!node.data.config?.guildId || !node.data.config?.channelId) {
                                validationIssues.push('Discord trigger needs server and channel')
                              }
                            }
                            if (nodeType === 'gmail_send_email') {
                              if (!node.data.config?.to || !node.data.config?.subject) {
                                validationIssues.push('Gmail action missing recipient or subject')
                              }
                            }
                            if (nodeType === 'airtable_create_record') {
                              if (!node.data.config?.baseId || !node.data.config?.tableName) {
                                validationIssues.push('Airtable action missing base or table')
                              }
                            }
                          })

                          if (validationIssues.length === 0) return null

                          // If more than 3 issues, show generic message
                          if (validationIssues.length > 3) {
                            return (
                              <div className="mt-2 text-xs text-amber-700 bg-amber-50 px-2 py-1.5 rounded border border-amber-200">
                                ⚠️ {validationIssues.length} configuration issues need attention
                              </div>
                            )
                          }

                          // Show specific issues if 3 or fewer
                          return (
                            <div className="mt-2 space-y-1">
                              {validationIssues.map((issue, idx) => (
                                <div key={idx} className="text-xs text-amber-700 bg-amber-50 px-2 py-1 rounded border border-amber-200">
                                  ⚠️ {issue}
                                </div>
                              ))}
                            </div>
                          )
                        })()}
                      </div>
                    </CardHeader>
                    
                    {/* Bottom section with status, date, actions, and edit button */}
                    <div className="mt-auto">
                      <div className="px-6 pb-3">
                        <div className="flex flex-wrap gap-2 text-xs mb-3">
                          <div
                            className={`px-2 py-1 rounded-full flex items-center gap-1.5 font-medium ${
                              workflow.status === "active"
                                ? "bg-green-100 text-green-800 border border-green-200"
                                : workflow.status === "inactive"
                                ? "bg-yellow-100 text-yellow-800 border border-yellow-200"
                                : "bg-slate-100 text-slate-800 border border-slate-200"
                            }`}
                          >
                            {workflow.status === "active" ? (
                              <>
                                <div className="w-1.5 h-1.5 rounded-full bg-green-500" />
                                Active
                              </>
                            ) : workflow.status === "inactive" ? (
                              <>
                                <div className="w-1.5 h-1.5 rounded-full bg-yellow-500" />
                                Inactive
                              </>
                            ) : (
                              <>
                                <div className="w-1.5 h-1.5 rounded-full bg-slate-500" />
                                Draft
                              </>
                            )}
                          </div>
                        </div>
                        {/* Metadata section with dates and creator */}
                        <div className="border-t border-slate-100 pt-2 mt-2 space-y-1">
                          {workflow.created_at && (
                            <div className="flex items-center gap-4 text-xs text-slate-500">
                              <div className="flex items-center gap-1" title={formatDateTime(workflow.created_at)}>
                                <Calendar className="h-3 w-3" />
                                <span>Created {getRelativeTime(workflow.created_at)}</span>
                              </div>
                            </div>
                          )}
                          {workflow.updated_at && (
                            <div className="flex items-center gap-4 text-xs text-slate-500">
                              <div className="flex items-center gap-1" title={formatDateTime(workflow.updated_at)}>
                                <Clock className="h-3 w-3" />
                                <span>Modified {getRelativeTime(workflow.updated_at)}</span>
                              </div>
                            </div>
                          )}
                          {workflow.user_id && (
                            <div className="flex items-center gap-4 text-xs text-slate-500">
                              <div className="flex items-center gap-1">
                                <User className="h-3 w-3" />
                                <span>
                                  Created by {userProfiles[workflow.user_id]?.full_name || 
                                             userProfiles[workflow.user_id]?.username || 
                                             (workflow.user_id === profile?.id ? 'You' : 'Unknown')}
                                </span>
                              </div>
                            </div>
                          )}
                        </div>
                        
                        <div className="flex justify-between items-center mt-2">
                          <div></div>
                          <div className="flex items-center gap-1">
                            <PermissionGuard permission="workflows.edit">
                              {updatingWorkflows.has(workflow.id) ? (
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  disabled
                                  className="h-7 w-7 p-0"
                                >
                                  <LightningLoader size="sm" />
                                  <span className="sr-only">Updating...</span>
                                </Button>
                              ) : workflow.status === "active" ? (
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={(e) => {
                                    e.preventDefault()
                                    handleToggleStatus(workflow.id, workflow.status)
                                  }}
                                  className="h-7 w-7 p-0 hover:bg-yellow-50 hover:text-yellow-600 transition-colors"
                                  title="Pause workflow"
                                >
                                  <Pause className="h-3 w-3" />
                                  <span className="sr-only">Pause</span>
                                </Button>
                              ) : (
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={(e) => {
                                    e.preventDefault()
                                    handleToggleStatus(workflow.id, workflow.status)
                                  }}
                                  className="h-7 w-7 p-0 hover:bg-green-50 hover:text-green-600 transition-colors"
                                  title={workflow.status === "draft" ? "Activate workflow" : "Resume workflow"}
                                >
                                  <Play className="h-3 w-3" />
                                  <span className="sr-only">Activate</span>
                                </Button>
                              )}
                            </PermissionGuard>
                            <PermissionGuard permission="workflows.delete">
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={(e) => {
                                  e.preventDefault()
                                  openDeleteConfirmation(workflow.id, workflow.name)
                                }}
                                className="h-7 w-7 p-0 text-red-500 hover:text-red-700 hover:bg-red-50 transition-colors"
                              >
                                <Trash2 className="h-3 w-3" />
                                <span className="sr-only">Delete</span>
                              </Button>
                            </PermissionGuard>
                            
                            {/* Add to Organization button - only show for personal workflows */}
                            {!workflow.organization_id && (
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={(e) => {
                                  e.preventDefault()
                                  handleMoveToOrganization(workflow.id, workflow.name)
                                }}
                                className="h-7 w-7 p-0 text-blue-500 hover:text-blue-700 hover:bg-blue-50 transition-colors"
                                title="Add to Organization"
                              >
                                <Building2 className="h-3 w-3" />
                                <span className="sr-only">Add to Organization</span>
                              </Button>
                            )}
                          </div>
                        </div>
                      </div>
                      
                      {/* Edit Workflow button - always at bottom */}
                      <Link
                        href={`/workflow/${workflow.id}/builder`}
                        className="block w-full bg-slate-100 hover:bg-slate-200 p-3 text-center text-sm font-semibold border-t border-border transition-all duration-200 text-slate-900 hover:text-slate-900"
                      >
                        Edit Workflow
                      </Link>
                    </div>
                  </Card>
                ))}
              </div>
            )}
        </div>
      </div>

      {/* Admin-only AI Debug Modal */}
      <OrganizationRoleGuard requiredRole="admin">
        <Dialog open={aiDebugOpen} onOpenChange={setAiDebugOpen}>
          <DialogContent className="w-[calc(100vw-2rem)] sm:w-auto max-w-3xl max-h-[calc(100vh-4rem)] overflow-auto">
            <DialogHeader>
              <DialogTitle>AI Debug Output</DialogTitle>
              <DialogDescription>Inspect the exact prompts and raw model response used to generate this workflow.</DialogDescription>
            </DialogHeader>
            <DebugSection />
            <DialogFooter>
              <div className="flex items-center gap-2 w-full justify-between">
                <div className="text-xs text-muted-foreground">
                  {aiDebugWorkflowId ? `Workflow ID: ${aiDebugWorkflowId}` : ''}
                </div>
                <div className="flex items-center gap-2">
                  {Array.isArray(aiDebugData?.errors) && aiDebugData.errors.length > 0 && (
                    <Button
                      variant="outline"
                      onClick={async () => {
                        try {
                          const bundle = {
                            errors: aiDebugData?.errors || [],
                            systemPrompt: aiDebugData?.systemPrompt || '',
                            userPrompt: aiDebugData?.userPrompt || '',
                            rawResponse: aiDebugData?.rawResponse || '',
                          }
                          await navigator.clipboard.writeText(JSON.stringify(bundle, null, 2))
                          toast({ title: 'Copied', description: 'Validation errors copied to clipboard.' })
                        } catch (e) {
                          toast({ title: 'Copy failed', description: 'Could not copy to clipboard', variant: 'destructive' })
                        }
                      }}
                    >
                      Copy Errors
                    </Button>
                  )}
                  {aiDebugWorkflowId && (
                    <Button onClick={() => {
                      setAiDebugOpen(false)
                      window.location.href = `/workflow/${aiDebugWorkflowId}/builder`
                    }}>
                      Open in Builder
                    </Button>
                  )}
                  <Button variant="outline" onClick={() => setAiDebugOpen(false)}>Close</Button>
                </div>
              </div>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </OrganizationRoleGuard>

      <Dialog
        open={templateDialog.open}
        onOpenChange={(isOpen) => {
          if (!isOpen) {
            setTemplateDialog({ open: false, workflowId: null })
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create Template</DialogTitle>
            <DialogDescription>
              Share your workflow as a template for other users. Templates can be public or private to your organization.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="name">Template Name</Label>
              <Input
                id="name"
                placeholder="Enter template name"
                value={templateForm.name}
                onChange={(e) => setTemplateForm({ ...templateForm, name: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                placeholder="Describe what this template does"
                value={templateForm.description}
                onChange={(e) => setTemplateForm({ ...templateForm, description: e.target.value })}
                rows={3}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="category">Category</Label>
              <Select
                value={templateForm.category}
                onValueChange={(value) => setTemplateForm({ ...templateForm, category: value })}
              >
                <SelectTrigger id="category">
                  <SelectValue placeholder="Select category" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="productivity">Productivity</SelectItem>
                  <SelectItem value="communication">Communication</SelectItem>
                  <SelectItem value="data">Data Management</SelectItem>
                  <SelectItem value="marketing">Marketing</SelectItem>
                  <SelectItem value="sales">Sales</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="tags">Tags (comma separated)</Label>
              <Input
                id="tags"
                placeholder="e.g. email, automation, slack"
                value={templateForm.tags}
                onChange={(e) => setTemplateForm({ ...templateForm, tags: e.target.value })}
              />
            </div>
            <div className="flex items-center space-x-2">
              <Switch
                id="is_public"
                checked={templateForm.is_public}
                onCheckedChange={(checked) => setTemplateForm({ ...templateForm, is_public: checked })}
              />
              <Label htmlFor="is_public">Make this template public</Label>
            </div>
          </div>
          <div className="flex justify-end space-x-2">
            <Button
              variant="outline"
              onClick={() => setTemplateDialog({ open: false, workflowId: null })}
            >
              Cancel
            </Button>
            <Button onClick={handleCreateTemplate} disabled={!templateForm.name}>
              Create Template
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <AddToOrganizationDialog
        open={addToOrgDialog.open}
        onOpenChange={(open) => {
          if (!open) {
            setAddToOrgDialog({ open: false, workflowId: null, workflowName: "" })
          }
        }}
        workflowId={addToOrgDialog.workflowId || ""}
        workflowName={addToOrgDialog.workflowName}
        onMoveComplete={handleMoveComplete}
      />

      {/* Edit Workflow Dialog */}
      <WorkflowDialog 
        open={editDialogOpen}
        onOpenChange={setEditDialogOpen}
        workflow={workflowToEdit}
        onSuccess={handleEditSuccess}
      />

      {/* Error Modal */}
      <AlertDialog open={errorModal.open} onOpenChange={(open) => !open && setErrorModal({ open: false, title: "", message: "" })}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{errorModal.title}</AlertDialogTitle>
            <AlertDialogDescription className="space-y-2">
              <span>{errorModal.message}</span>
              {errorModal.title === "Integration Not Available" && (
                <div className="mt-3 p-3 bg-amber-50 border border-amber-200 rounded-md">
                  <p className="text-sm text-amber-800">
                    💡 <strong>Tip:</strong> Try rephrasing your request without mentioning the unavailable integrations, 
                    or use similar available integrations instead.
                  </p>
                </div>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction onClick={() => setErrorModal({ open: false, title: "", message: "" })}>
              OK
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete Workflow Confirmation Modal */}
      <AlertDialog open={deleteConfirmation.open} onOpenChange={(open) => {
        if (!open) {
          setDeleteConfirmation({ open: false, workflowId: null, workflowName: "" })
        }
      }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Workflow</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete the workflow "{deleteConfirmation.workflowName}"? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteWorkflow}
              className="bg-red-600 hover:bg-red-700 text-white"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

    </AppLayout>
  )
}
