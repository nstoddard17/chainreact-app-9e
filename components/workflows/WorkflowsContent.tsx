"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import AppLayout from "@/components/layout/AppLayout"
import { TemplateGallery } from "@/components/templates/TemplateGallery"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
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

export default function WorkflowsContent() {
  const { profile } = useAuthStore()
  const { currentOrganization } = useOrganizationStore()
  const { integrations, fetchIntegrations } = useIntegrationStore()
  const {
    workflows,
    loading,
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
  
  const [activeTab, setActiveTab] = useState("workflows")
  const [aiPrompt, setAiPrompt] = useState("")
  const [generatingAI, setGeneratingAI] = useState(false)
  const [aiModel, setAiModel] = useState<'gpt-4o' | 'gpt-4o-mini'>('gpt-4o-mini')
  const [updatingWorkflows, setUpdatingWorkflows] = useState<Set<string>>(new Set())
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

  // Use the new timeout loading hook for fast, reliable loading
  useTimeoutLoading({
    loadFunction: async (force) => {
      // Always fetch fresh data for workflows to ensure deleted ones don't appear
      return await loadAllWorkflows(true)
    },
    isLoading: loading,
    timeout: 10000, // 10 second timeout for workflows
    forceRefreshOnMount: true, // Always refresh workflows on mount
    onError: (error) => {
      toast({
        title: "Error loading workflows",
        description: "Please refresh the page to try again",
        variant: "destructive",
      })
    },
    dependencies: [] // No dependencies - only load on mount
  })

  // Load integrations on mount
  useEffect(() => {
    fetchIntegrations()
  }, [fetchIntegrations])

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
    // Refresh workflows to reflect the changes
    loadAllWorkflows(true) // Force refresh after moving to organization
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
    // Refresh workflows to show the updated data
    await loadAllWorkflows(true) // Force refresh after edit
  }

  const handleToggleStatus = async (id: string, currentStatus?: string) => {
    const status = currentStatus || "draft"
    
    // Determine the new status based on current status
    let newStatus: string
    if (status === "active") {
      newStatus = "paused"
    } else if (status === "paused") {
      newStatus = "active"
    } else if (status === "draft") {
      // For draft workflows, check if they're ready to be activated
      const workflow = workflows?.find(w => w.id === id)
      if (workflow) {
        const hasTrigger = workflow.nodes?.some(n => n.data?.isTrigger)
        const hasAction = workflow.nodes?.some(n => !n.data?.isTrigger)
        const hasConnections = workflow.connections?.length > 0
        
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
    
    try {
      // Set loading state for this specific workflow
      setUpdatingWorkflows(prev => new Set(prev).add(id))

      console.log(`🔄 Updating workflow ${id} status from ${status} to ${newStatus}`)

      // If activating, check for Gmail trigger and register webhook
      if (newStatus === 'active') {
        // Get the workflow to check its nodes
        const workflow = workflows.find(w => w.id === id)
        if (workflow?.nodes) {
          const gmailTrigger = workflow.nodes.find((n: any) =>
            n?.data?.type === 'gmail_trigger_new_email' ||
            n?.data?.nodeType === 'gmail_trigger_new_email' ||
            n?.type === 'gmail_trigger_new_email'
          )

          if (gmailTrigger) {
            console.log('🔔 Gmail trigger detected, registering webhook...')

            // Check if user has Gmail integration connected
            const gmailIntegration = integrations.find(
              (int: any) => int.provider_id === 'gmail' && int.status === 'connected'
            )

            if (!gmailIntegration) {
              toast({
                title: "Gmail not connected",
                description: "Please connect your Gmail account before activating a workflow with Gmail trigger.",
                variant: "destructive",
              })
              setUpdatingWorkflows(prev => {
                const newSet = new Set(prev)
                newSet.delete(id)
                return newSet
              })
              return
            }

            // Register the Gmail webhook
            const webhookResponse = await fetch('/api/workflows/webhook-registration', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
              },
              credentials: 'include',
              body: JSON.stringify({
                workflowId: id,
                triggerType: gmailTrigger.data?.type || gmailTrigger.data?.nodeType || gmailTrigger.type,
                providerId: 'gmail',
                config: {
                  labelIds: gmailTrigger.data?.config?.labelIds || ['INBOX']
                }
              })
            })

            if (!webhookResponse.ok) {
              const errorData = await webhookResponse.json()
              console.error('Failed to register Gmail webhook:', errorData)
              toast({
                title: "Webhook registration failed",
                description: errorData.details || errorData.error || "Could not set up Gmail notifications.",
                variant: "destructive",
              })
              setUpdatingWorkflows(prev => {
                const newSet = new Set(prev)
                newSet.delete(id)
                return newSet
              })
              return
            }

            const webhookData = await webhookResponse.json()
            console.log('✅ Gmail webhook registered:', webhookData)
          }
        }
      }

      await updateWorkflowById(id, { status: newStatus })

      toast({
        title: "Success",
        description: `Workflow ${newStatus === "active" ? "activated" : newStatus === "paused" ? "paused" : "updated"}`,
      })
    } catch (error) {
      console.error("Failed to update workflow status:", error)
      toast({
        title: "Error",
        description: "Failed to update workflow status",
        variant: "destructive",
      })
    } finally {
      // Clear loading state for this workflow
      setUpdatingWorkflows(prev => {
        const newSet = new Set(prev)
        newSet.delete(id)
        return newSet
      })
    }
  }

  const handleDeleteWorkflow = async () => {
    if (!deleteConfirmation.workflowId) return

    try {
      await deleteWorkflowById(deleteConfirmation.workflowId)
      toast({
        title: "Success",
        description: "Workflow deleted successfully",
      })
      setDeleteConfirmation({ open: false, workflowId: null, workflowName: "" })
    } catch (error) {
      console.error("Failed to delete workflow:", error)
      toast({
        title: "Error",
        description: "Failed to delete workflow",
        variant: "destructive",
      })
      setDeleteConfirmation({ open: false, workflowId: null, workflowName: "" })
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
            console.log('Model:', data.debug.model)
            console.log('Detected Scenarios:', data.debug.detectedScenarios)
            console.log('System Prompt:\n', data.debug.systemPrompt)
            console.log('User Prompt:\n', data.debug.userPrompt)
            console.log('Raw OpenAI Response (JSON string):\n', data.debug.rawResponse)
            if (data.debug.errors?.length) {
              console.warn('Validation Errors:', data.debug.errors)
            }
            // Also provide a single JSON object for copying
            console.log('Debug Bundle JSON:', JSON.stringify({
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
            window.location.href = `/workflows/builder?id=${data.workflow.id}`
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
      console.error("Failed to generate workflow:", error)
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
      console.error("Failed to create template:", error)
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

  if (loading) {
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
          <Button onClick={() => loadAllWorkflows(true)}>Retry</Button>
        </div>
      </AppLayout>
    )
  }

  return (
    <AppLayout title="Workflows">
      <div className="space-y-8 p-6">
        <div className="flex items-center justify-end">
          <CreateWorkflowDialog />
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-8">
          <TabsList className="grid w-full grid-cols-2 bg-slate-100 p-1 rounded-lg">
            <TabsTrigger
              value="workflows"
              className="transition-all duration-200 hover:bg-card hover:shadow-sm focus:ring-2 focus:ring-primary focus:ring-offset-2"
            >
              My Workflows
            </TabsTrigger>
            <TabsTrigger
              value="templates"
              className="transition-all duration-200 hover:bg-card hover:shadow-sm focus:ring-2 focus:ring-primary focus:ring-offset-2"
            >
              Templates
            </TabsTrigger>
          </TabsList>

          <TabsContent value="workflows" className="space-y-8">
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
                          <SelectTrigger id="ai-model" className="w-48">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="gpt-4o-mini">
                              <div className="flex flex-col items-start">
                                <span>GPT-4o Mini</span>
                                <span className="text-xs text-muted-foreground">Faster & cost-efficient</span>
                              </div>
                            </SelectItem>
                            <SelectItem value="gpt-4o">
                              <div className="flex flex-col items-start">
                                <span>GPT-4o</span>
                                <span className="text-xs text-muted-foreground">More capable & accurate</span>
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
                    <Button
                      variant="outline"
                      onClick={() => setActiveTab("templates")}
                      className="flex items-center gap-2 hover:bg-slate-50 hover:shadow-sm focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition-all duration-200"
                    >
                      <Template className="w-4 h-4" />
                      Browse Templates
                    </Button>
                  </div>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {workflows.map((workflow) => (
                  <Card key={workflow.id} className="overflow-hidden border-border hover:border-primary/40 hover:shadow-lg transition-all duration-200 group flex flex-col h-full">
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
                                : workflow.status === "paused"
                                ? "bg-yellow-100 text-yellow-800 border border-yellow-200"
                                : "bg-slate-100 text-slate-800 border border-slate-200"
                            }`}
                            title={
                              workflow.status === "draft" 
                                ? (() => {
                                    const hasTrigger = workflow.nodes?.some(n => n.data?.isTrigger)
                                    const hasAction = workflow.nodes?.some(n => !n.data?.isTrigger)
                                    const hasConnections = workflow.connections?.length > 0
                                    
                                    // Debug logging for trigger detection
                                    console.log('🔍 Workflow trigger detection:', {
                                      workflowId: workflow.id,
                                      nodes: workflow.nodes?.map(n => ({ 
                                        id: n.id, 
                                        type: n.type,
                                        isTrigger: n.data?.isTrigger,
                                        title: n.data?.title,
                                        providerId: n.data?.providerId
                                      })),
                                      hasTrigger,
                                      hasAction,
                                      hasConnections
                                    })
                                    
                                    if (!hasTrigger) return 'Missing trigger'
                                    if (!hasAction) return 'Missing action'
                                    if (!hasConnections) return 'Missing connections'
                                    return 'Ready to activate'
                                  })()
                                : undefined
                            }
                          >
                            {workflow.status === "active" ? (
                              <>
                                <div className="w-1.5 h-1.5 rounded-full bg-green-500" />
                                Active
                              </>
                            ) : workflow.status === "paused" ? (
                              <>
                                <div className="w-1.5 h-1.5 rounded-full bg-yellow-500" />
                                Paused
                              </>
                            ) : (
                              <>
                                <div className="w-1.5 h-1.5 rounded-full bg-slate-500" />
                                Draft
                              </>
                            )}
                          </div>
                          
                          {/* Only show issue badges if there are actual problems */}
                          {workflow.status === "draft" && (() => {
                            const hasTrigger = workflow.nodes?.some(n => n.data?.isTrigger)
                            const hasAction = workflow.nodes?.some(n => !n.data?.isTrigger && n.type !== 'addAction')
                            const hasConnections = workflow.connections?.length > 0
                            const discordTrigger = workflow.nodes?.find(n => n.data?.type === 'discord_trigger_new_message')
                            const needsDiscordConfig = !!(discordTrigger && (!discordTrigger.data?.config?.guildId || !discordTrigger.data?.config?.channelId))
                            
                            return (
                              <>
                                {!hasTrigger && (
                                  <div className="text-xs text-red-600 bg-red-50 px-2 py-1 rounded border border-red-200">
                                    ⚠️ Missing trigger
                                  </div>
                                )}
                                {hasTrigger && !hasAction && (
                                  <div className="text-xs text-red-600 bg-red-50 px-2 py-1 rounded border border-red-200">
                                    ⚠️ Missing action
                                  </div>
                                )}
                                {workflow.nodes?.length > 1 && !hasConnections && (
                                  <div className="text-xs text-red-600 bg-red-50 px-2 py-1 rounded border border-red-200">
                                    ⚠️ Missing connections
                                  </div>
                                )}
                                {needsDiscordConfig && (
                                  <div className="text-xs text-yellow-700 bg-yellow-50 px-2 py-1 rounded border border-yellow-200" title="Select your Discord server and channel in the trigger">
                                    ⚠️ Select Discord server and channel
                                  </div>
                                )}
                              </>
                            )
                          })()}
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
                            ) : (
                              <PermissionGuard permission="workflows.edit">
                                {workflow.status === "active" ? (
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
                            )}
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
                        href={`/workflows/builder?id=${workflow.id}`}
                        className="block w-full bg-slate-100 hover:bg-slate-200 p-3 text-center text-sm font-semibold border-t border-border transition-all duration-200 text-slate-900 hover:text-slate-900"
                      >
                        Edit Workflow
                      </Link>
                    </div>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="templates">
            <TemplateGallery />
          </TabsContent>
        </Tabs>
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
                      window.location.href = `/workflows/builder?id=${aiDebugWorkflowId}`
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
