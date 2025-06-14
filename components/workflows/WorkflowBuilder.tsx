"use client"
import { useEffect, useState, useCallback, useMemo } from "react"
import type React from "react"

import { useSearchParams, useRouter } from "next/navigation"
import AppLayout from "@/components/layout/AppLayout"
import { useWorkflowStore } from "@/stores/workflowStore"
import { useAIStore } from "@/stores/aiStore"
import { useIntegrationStore } from "@/stores/integrationStore"
import { AIChatAssistant } from "@/components/ai/AIChatAssistant"
import { WorkflowOptimizer } from "@/components/ai/WorkflowOptimizer"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Textarea } from "@/components/ui/textarea"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import {
  Save,
  Play,
  Loader2,
  Sparkles,
  Zap,
  Brain,
  ArrowLeft,
  Undo,
  Redo,
  RefreshCw,
  Plus,
  Edit,
  X,
  Database,
  CheckCircle,
  AlertCircle,
} from "lucide-react"
import { useToast } from "@/hooks/use-toast"

// Enhanced integration data with better organization
const AVAILABLE_INTEGRATIONS = [
  {
    id: "notion",
    name: "Notion",
    logo: "https://upload.wikimedia.org/wikipedia/commons/4/45/Notion_app_logo.png",
    triggers: ["Page Updated", "Database Item Added", "Database Item Updated", "New Page Created"],
    actions: ["Create Page", "Update Database", "Add Comment"],
    category: "Productivity",
    description: "Manage pages and databases in your Notion workspace",
  },
  {
    id: "gmail",
    name: "Gmail",
    logo: "https://upload.wikimedia.org/wikipedia/commons/7/7e/Gmail_icon_%282020%29.svg",
    triggers: ["New Email", "Email Received from Specific Sender", "Email with Attachment", "Important Email"],
    actions: ["Send Email", "Reply to Email", "Forward Email"],
    category: "Email",
    description: "Automate your email workflows and responses",
  },
  {
    id: "slack",
    name: "Slack",
    logo: "https://upload.wikimedia.org/wikipedia/commons/d/d5/Slack_icon_2019.svg",
    triggers: ["New Message in Channel", "Direct Message Received", "User Mentioned", "File Uploaded"],
    actions: ["Send Message", "Create Channel", "Update Status"],
    category: "Communication",
    description: "Integrate with your Slack workspace and channels",
  },
  {
    id: "google-sheets",
    name: "Google Sheets",
    logo: "https://upload.wikimedia.org/wikipedia/commons/3/30/Google_Sheets_logo_%282014-2020%29.svg",
    triggers: ["New Row Added", "Row Updated", "Cell Changed", "Sheet Created"],
    actions: ["Add Row", "Update Row", "Create Sheet"],
    category: "Productivity",
    description: "Work with spreadsheets and data automation",
  },
  {
    id: "google-calendar",
    name: "Google Calendar",
    logo: "https://upload.wikimedia.org/wikipedia/commons/a/a5/Google_Calendar_icon_%282020%29.svg",
    triggers: ["New Event", "Event Updated", "Event Starting Soon", "Event Cancelled"],
    actions: ["Create Event", "Update Event", "Delete Event"],
    category: "Productivity",
    description: "Manage calendar events and scheduling",
  },
  {
    id: "airtable",
    name: "Airtable",
    logo: "https://upload.wikimedia.org/wikipedia/commons/4/4b/Airtable_Logo.svg",
    triggers: ["New Record", "Record Updated", "View Updated", "Base Shared"],
    actions: ["Create Record", "Update Record", "Delete Record"],
    category: "Database",
    description: "Organize and automate your Airtable bases",
  },
  {
    id: "trello",
    name: "Trello",
    logo: "https://upload.wikimedia.org/wikipedia/en/8/8c/Trello_logo.svg",
    triggers: ["New Card", "Card Moved", "Card Updated", "Due Date Approaching"],
    actions: ["Create Card", "Move Card", "Update Card"],
    category: "Project Management",
    description: "Manage boards, cards, and project workflows",
  },
  {
    id: "github",
    name: "GitHub",
    logo: "https://upload.wikimedia.org/wikipedia/commons/9/91/Octicons-mark-github.svg",
    triggers: ["New Issue", "Pull Request Created", "Push to Repository", "Release Published"],
    actions: ["Create Issue", "Create Pull Request", "Add Comment"],
    category: "Development",
    description: "Automate your development and code workflows",
  },
]

// Enhanced trigger configurations with resource requirements
const TRIGGER_CONFIGS = {
  "Page Updated": [
    {
      key: "page_id",
      label: "Notion Page",
      type: "resource_select",
      provider: "notion",
      dataType: "pages",
      placeholder: "Select a page to monitor",
      required: false,
      description: "Choose a specific page to monitor for updates, or leave empty to monitor all pages",
    },
  ],
  "Database Item Added": [
    {
      key: "database_id",
      label: "Notion Database",
      type: "resource_select",
      provider: "notion",
      dataType: "databases",
      placeholder: "Select a database",
      required: true,
      description: "Choose the database to monitor for new items",
    },
  ],
  "Database Item Updated": [
    {
      key: "database_id",
      label: "Notion Database",
      type: "resource_select",
      provider: "notion",
      dataType: "databases",
      placeholder: "Select a database",
      required: true,
      description: "Choose the database to monitor for item updates",
    },
  ],
  "New Message in Channel": [
    {
      key: "channel",
      label: "Slack Channel",
      type: "resource_select",
      provider: "slack",
      dataType: "channels",
      placeholder: "Select a channel",
      required: true,
      description: "Choose the channel to monitor for new messages",
    },
  ],
  "Direct Message Received": [
    {
      key: "from_user",
      label: "From User (optional)",
      type: "resource_select",
      provider: "slack",
      dataType: "users",
      placeholder: "Select a user",
      required: false,
      description: "Optionally filter messages from a specific user",
    },
  ],
  "New Row Added": [
    {
      key: "spreadsheet_id",
      label: "Google Spreadsheet",
      type: "resource_select",
      provider: "google-sheets",
      dataType: "spreadsheets",
      placeholder: "Select a spreadsheet",
      required: true,
      description: "Choose the spreadsheet to monitor for new rows",
    },
    {
      key: "sheet_name",
      label: "Sheet Name (optional)",
      type: "text",
      placeholder: "Sheet1",
      required: false,
      description: "Specify a particular sheet within the spreadsheet",
    },
  ],
  "New Event": [
    {
      key: "calendar_id",
      label: "Google Calendar",
      type: "resource_select",
      provider: "google-calendar",
      dataType: "calendars",
      placeholder: "Select a calendar",
      required: false,
      description: "Choose a specific calendar, or leave empty to monitor all calendars",
    },
  ],
  "New Record": [
    {
      key: "base_id",
      label: "Airtable Base",
      type: "resource_select",
      provider: "airtable",
      dataType: "bases",
      placeholder: "Select a base",
      required: true,
      description: "Choose the Airtable base to monitor",
    },
    {
      key: "table_name",
      label: "Table Name",
      type: "text",
      placeholder: "Table Name",
      required: true,
      description: "Specify the table within the base",
    },
  ],
  "New Card": [
    {
      key: "board_id",
      label: "Trello Board",
      type: "resource_select",
      provider: "trello",
      dataType: "boards",
      placeholder: "Select a board",
      required: true,
      description: "Choose the Trello board to monitor",
    },
    {
      key: "list_name",
      label: "List Name (optional)",
      type: "text",
      placeholder: "To Do",
      required: false,
      description: "Optionally specify a particular list within the board",
    },
  ],
  "New Issue": [
    {
      key: "repository",
      label: "GitHub Repository",
      type: "resource_select",
      provider: "github",
      dataType: "repositories",
      placeholder: "Select a repository",
      required: true,
      description: "Choose the repository to monitor for new issues",
    },
  ],
}

interface WorkflowStep {
  id: string
  type: "trigger" | "action" | "condition"
  appId: string
  appName: string
  actionName: string
  config: Record<string, any>
  isConfigured: boolean
}

export default function WorkflowBuilder() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const workflowId = searchParams.get("id")

  const { currentWorkflow, setCurrentWorkflow, saveWorkflow, fetchWorkflows, workflows, generateWorkflowWithAI } =
    useWorkflowStore()

  const { optimizations, anomalies, fetchOptimizations, fetchAnomalies } = useAIStore()
  const {
    integrations,
    fetchIntegrations,
    connectIntegration,
    globalPreloadingData,
    preloadProgress,
    initializeGlobalPreload,
    getDynamicData,
    getResourcesForTrigger,
    isResourceLoading,
    getIntegrationStatus,
    getCachedResourceCount,
    refreshResourcesForProvider,
  } = useIntegrationStore()

  const [workflowSteps, setWorkflowSteps] = useState<WorkflowStep[]>([])
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false)
  const [refreshingIntegrations, setRefreshingIntegrations] = useState(false)

  // Modal states
  const [showAppSelector, setShowAppSelector] = useState(false)
  const [showActionSelector, setShowActionSelector] = useState(false)
  const [showConfigModal, setShowConfigModal] = useState(false)
  const [showAIGenerator, setShowAIGenerator] = useState(false)
  const [showOptimizer, setShowOptimizer] = useState(false)
  const [showExitDialog, setShowExitDialog] = useState(false)
  const [showConnectModal, setShowConnectModal] = useState(false)
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)
  const [stepToDelete, setStepToDelete] = useState<number>(-1)

  // Current selection states
  const [currentStepIndex, setCurrentStepIndex] = useState<number>(-1)
  const [selectedApp, setSelectedApp] = useState<any>(null)
  const [selectedAction, setSelectedAction] = useState<string>("")
  const [currentConfig, setCurrentConfig] = useState<Record<string, any>>({})
  const [aiPrompt, setAiPrompt] = useState("")
  const [generatingAI, setGeneratingAI] = useState(false)

  const { toast } = useToast()

  // Enhanced resource management
  const [resourceRefreshStates, setResourceRefreshStates] = useState<Record<string, boolean>>({})

  // Memoized connected providers to prevent unnecessary re-renders
  const connectedProviders = useMemo(() => {
    return integrations.filter((i) => i.status === "connected").map((i) => i.provider)
  }, [integrations])

  // Enhanced integration status for each app
  const getEnhancedIntegrationStatus = useCallback(
    (appId: string) => {
      const status = getIntegrationStatus(appId)
      const resourceCount = getCachedResourceCount(appId)
      const isLoading =
        globalPreloadingData || isResourceLoading(appId, "pages") || isResourceLoading(appId, "databases")

      return {
        status,
        resourceCount,
        isLoading,
        isConnected: status === "connected",
      }
    },
    [getIntegrationStatus, getCachedResourceCount, globalPreloadingData, isResourceLoading],
  )

  // Fetch integrations on mount
  useEffect(() => {
    fetchIntegrations()
  }, [fetchIntegrations])

  // Load workflow if ID is provided
  useEffect(() => {
    if (workflowId && workflows.length > 0) {
      const workflow = workflows.find((w) => w.id === workflowId)
      if (workflow) {
        setCurrentWorkflow(workflow)
        fetchOptimizations(workflow.id)
        fetchAnomalies(workflow.id)
      }
    }
  }, [workflowId, workflows, setCurrentWorkflow, fetchOptimizations, fetchAnomalies])

  // Fetch workflows on mount
  useEffect(() => {
    fetchWorkflows()
  }, [fetchWorkflows])

  // Track changes
  useEffect(() => {
    setHasUnsavedChanges(workflowSteps.length > 0)
  }, [workflowSteps])

  const handleAddStep = (index: number) => {
    setCurrentStepIndex(index)
    setShowAppSelector(true)
  }

  const handleAppSelected = (app: any) => {
    const integrationStatus = getEnhancedIntegrationStatus(app.id)

    if (!integrationStatus.isConnected) {
      setSelectedApp(app)
      setShowAppSelector(false)
      setShowConnectModal(true)
      return
    }

    setSelectedApp(app)
    setShowAppSelector(false)
    setShowActionSelector(true)
  }

  const handleConnectApp = async (appId: string) => {
    try {
      await connectIntegration(appId)
      setShowConnectModal(false)
      setShowActionSelector(true)
      toast({
        title: "Success",
        description: `${selectedApp?.name} connected successfully`,
      })
    } catch (error: any) {
      toast({
        title: "Connection Failed",
        description: error.message,
        variant: "destructive",
      })
    }
  }

  const handleActionSelected = (actionName: string, actionType: "action" | "condition" = "action") => {
    setSelectedAction(actionName)

    // For triggers (first step), check if configuration is needed
    if (currentStepIndex === 0) {
      const triggerConfig = TRIGGER_CONFIGS[actionName as keyof typeof TRIGGER_CONFIGS]

      if (triggerConfig && triggerConfig.length > 0) {
        // This trigger needs configuration
        setCurrentConfig({})
        setShowActionSelector(false)
        setShowConfigModal(true)
      } else {
        // This trigger doesn't need configuration, add it directly
        const newStep: WorkflowStep = {
          id: `step-${Date.now()}`,
          type: "trigger",
          appId: selectedApp.id,
          appName: selectedApp.name,
          actionName: actionName,
          config: {},
          isConfigured: true,
        }

        const newSteps = [...workflowSteps]
        newSteps.splice(currentStepIndex, 0, newStep)
        setWorkflowSteps(newSteps)

        setShowActionSelector(false)
        setSelectedApp(null)
        setSelectedAction("")
        setCurrentConfig({})
      }
      return
    }

    // For actions and conditions, continue with configuration modal
    setCurrentConfig({})
    setShowActionSelector(false)
    setShowConfigModal(true)
  }

  const handleConfigComplete = () => {
    const newStep: WorkflowStep = {
      id: `step-${Date.now()}`,
      type: currentStepIndex === 0 ? "trigger" : "action",
      appId: selectedApp.id,
      appName: selectedApp.name,
      actionName: selectedAction,
      config: currentConfig,
      isConfigured: true,
    }

    const newSteps = [...workflowSteps]
    newSteps.splice(currentStepIndex, 0, newStep)
    setWorkflowSteps(newSteps)

    setShowConfigModal(false)
    setSelectedApp(null)
    setSelectedAction("")
    setCurrentConfig({})
  }

  const handleEditStep = (index: number) => {
    const step = workflowSteps[index]
    setCurrentStepIndex(index)
    setSelectedApp(AVAILABLE_INTEGRATIONS.find((app) => app.id === step.appId))
    setSelectedAction(step.actionName)
    setCurrentConfig(step.config)
    setShowConfigModal(true)
  }

  const handleUpdateStep = () => {
    const updatedSteps = [...workflowSteps]
    updatedSteps[currentStepIndex] = {
      ...updatedSteps[currentStepIndex],
      config: currentConfig,
    }
    setWorkflowSteps(updatedSteps)
    setShowConfigModal(false)
  }

  const handleDeleteStep = (index: number) => {
    setStepToDelete(index)
    setShowDeleteDialog(true)
  }

  const confirmDeleteStep = () => {
    if (stepToDelete >= 0) {
      const newSteps = workflowSteps.filter((_, i) => i !== stepToDelete)
      setWorkflowSteps(newSteps)
    }
    setShowDeleteDialog(false)
    setStepToDelete(-1)
  }

  const handleSave = async () => {
    if (!currentWorkflow) return

    setSaving(true)
    try {
      const updatedWorkflow = {
        ...currentWorkflow,
        nodes: workflowSteps.map((step, index) => ({
          id: step.id,
          type: "custom",
          position: { x: 0, y: index * 150 },
          data: {
            type: step.type,
            title: step.actionName,
            description: `${step.appName} - ${step.actionName}`,
            config: step.config,
          },
        })),
        connections: [],
      }
      setCurrentWorkflow(updatedWorkflow)
      await saveWorkflow()
      setHasUnsavedChanges(false)
      toast({
        title: "Success",
        description: "Workflow saved successfully",
      })
    } catch (error) {
      console.error("Failed to save workflow:", error)
      toast({
        title: "Error",
        description: "Failed to save workflow",
        variant: "destructive",
      })
    } finally {
      setSaving(false)
    }
  }

  const handleTest = async () => {
    if (!currentWorkflow) return

    setTesting(true)
    try {
      const response = await fetch("/api/workflows/execute", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          workflowId: currentWorkflow.id,
          testMode: true,
        }),
      })

      const result = await response.json()

      if (result.success) {
        toast({
          title: "Success",
          description: "Workflow test completed successfully!",
        })
      } else {
        toast({
          title: "Error",
          description: `Workflow test failed: ${result.error}`,
          variant: "destructive",
        })
      }
    } catch (error) {
      console.error("Failed to test workflow:", error)
      toast({
        title: "Error",
        description: "Failed to test workflow",
        variant: "destructive",
      })
    } finally {
      setTesting(false)
    }
  }

  const handleBack = () => {
    if (hasUnsavedChanges) {
      setShowExitDialog(true)
    } else {
      router.push("/workflows")
    }
  }

  const handleSaveAndExit = async () => {
    await handleSave()
    setShowExitDialog(false)
    router.push("/workflows")
  }

  const handleDiscardAndExit = () => {
    setShowExitDialog(false)
    router.push("/workflows")
  }

  const handleRefreshIntegrations = async () => {
    setRefreshingIntegrations(true)
    try {
      await fetchIntegrations(true)
      await initializeGlobalPreload()
      toast({
        title: "Success",
        description: "Integration permissions refreshed",
      })
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to refresh integrations",
        variant: "destructive",
      })
    } finally {
      setRefreshingIntegrations(false)
    }
  }

  const handleRefreshProviderResources = async (provider: string) => {
    setResourceRefreshStates((prev) => ({ ...prev, [provider]: true }))
    try {
      await refreshResourcesForProvider(provider)
      toast({
        title: "Success",
        description: `${provider} resources refreshed`,
      })
    } catch (error) {
      toast({
        title: "Error",
        description: `Failed to refresh ${provider} resources`,
        variant: "destructive",
      })
    } finally {
      setResourceRefreshStates((prev) => ({ ...prev, [provider]: false }))
    }
  }

  const handleGenerateWithAI = async () => {
    if (!aiPrompt.trim()) return

    setGeneratingAI(true)
    try {
      const workflow = await generateWorkflowWithAI(aiPrompt)
      setAiPrompt("")
      setShowAIGenerator(false)
      toast({
        title: "Success",
        description: "AI workflow generated successfully!",
      })
      window.location.href = `/workflows/builder?id=${workflow.id}`
    } catch (error) {
      console.error("Failed to generate workflow:", error)
      toast({
        title: "Error",
        description: "Failed to generate workflow with AI",
        variant: "destructive",
      })
    } finally {
      setGeneratingAI(false)
    }
  }

  const connectedIntegrationsCount = integrations.filter((i) => i.status === "connected").length
  const workflowOptimizations = currentWorkflow ? optimizations[currentWorkflow.id] || [] : []
  const workflowAnomalies = currentWorkflow ? anomalies[currentWorkflow.id] || [] : []

  // Enhanced config field rendering with resource selection
  const getConfigFields = () => {
    if (currentStepIndex === 0) {
      return TRIGGER_CONFIGS[selectedAction as keyof typeof TRIGGER_CONFIGS] || []
    } else {
      // Return existing action config fields
      return []
    }
  }

  const renderConfigField = (field: any) => {
    if (field.type === "resource_select") {
      const resources = getDynamicData(field.provider, field.dataType)
      const isLoading = isResourceLoading(field.provider, field.dataType) || globalPreloadingData
      const isRefreshing = resourceRefreshStates[field.provider]

      return (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label htmlFor={field.key} className="text-sm font-medium">
              {field.label} {field.required && "*"}
            </Label>
            <div className="flex items-center gap-2">
              {resources.length > 0 && (
                <Badge variant="secondary" className="text-xs">
                  {resources.length} available
                </Badge>
              )}
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => handleRefreshProviderResources(field.provider)}
                disabled={isRefreshing}
                className="h-6 w-6 p-0"
              >
                <RefreshCw className={`w-3 h-3 ${isRefreshing ? "animate-spin" : ""}`} />
              </Button>
            </div>
          </div>

          <Select
            value={currentConfig[field.key] || ""}
            onValueChange={(value) => setCurrentConfig({ ...currentConfig, [field.key]: value })}
            disabled={isLoading || isRefreshing}
          >
            <SelectTrigger className={isLoading || isRefreshing ? "opacity-50 cursor-not-allowed" : ""}>
              <SelectValue
                placeholder={
                  isLoading || isRefreshing
                    ? "Loading resources..."
                    : resources.length === 0
                      ? "No resources found"
                      : field.placeholder
                }
              />
            </SelectTrigger>
            <SelectContent side="bottom" align="start" className="max-h-[200px] overflow-y-auto" sideOffset={4}>
              {isLoading || isRefreshing ? (
                <div className="p-2 text-sm text-muted-foreground flex items-center gap-2">
                  <Loader2 className="w-3 h-3 animate-spin" />
                  Loading {field.dataType}...
                </div>
              ) : resources.length === 0 ? (
                <div className="p-2 text-sm text-muted-foreground">
                  No {field.dataType} found. Try refreshing or check your {field.provider} connection.
                </div>
              ) : (
                resources.map((resource, index) => (
                  <SelectItem key={resource.id || index} value={resource.value}>
                    <div className="flex items-center gap-2">
                      <Database className="w-3 h-3 text-muted-foreground" />
                      {resource.name}
                    </div>
                  </SelectItem>
                ))
              )}
            </SelectContent>
          </Select>

          {field.description && <p className="text-xs text-muted-foreground">{field.description}</p>}
        </div>
      )
    } else if (field.type === "textarea") {
      return (
        <Textarea
          id={field.key}
          value={currentConfig[field.key] || ""}
          onChange={(e) => setCurrentConfig({ ...currentConfig, [field.key]: e.target.value })}
          placeholder={field.placeholder}
          rows={3}
        />
      )
    } else {
      return (
        <Input
          id={field.key}
          type={field.type}
          value={currentConfig[field.key] || ""}
          onChange={(e) => {
            const value = field.type === "number" ? Number(e.target.value) : e.target.value
            setCurrentConfig({ ...currentConfig, [field.key]: value })
          }}
          placeholder={field.placeholder}
        />
      )
    }
  }

  const hasConfigurableOptions = (step: WorkflowStep) => {
    if (step.type === "trigger") {
      const triggerConfig = TRIGGER_CONFIGS[step.actionName as keyof typeof TRIGGER_CONFIGS]
      return triggerConfig && triggerConfig.length > 0
    }
    return false
  }

  const handleImageError = (e: React.SyntheticEvent<HTMLImageElement, Event>) => {
    const target = e.currentTarget
    if (target.src !== "/placeholder.svg?height=32&width=32") {
      target.onerror = null
      target.src = "/placeholder.svg?height=32&width=32"
    }
  }

  if (!currentWorkflow) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center h-64">
          <div className="text-center">
            <div className="text-lg font-medium text-slate-900 mb-2">No workflow selected</div>
            <div className="text-sm text-slate-500 mb-4">
              Create a new workflow or select an existing one to start building
            </div>
            <Button
              onClick={() => setShowAIGenerator(true)}
              className="flex items-center gap-2 hover:shadow-lg hover:scale-105 focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition-all duration-200"
            >
              <Sparkles className="w-4 h-4" />
              Generate with AI
            </Button>
          </div>
        </div>

        <Dialog open={showAIGenerator} onOpenChange={setShowAIGenerator}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Generate Workflow with AI</DialogTitle>
              <DialogDescription>
                Describe what you want your workflow to do, and AI will create it for you.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <Textarea
                placeholder="e.g., Send Slack notifications when new Notion pages are created in my project database"
                value={aiPrompt}
                onChange={(e) => setAiPrompt(e.target.value)}
                rows={4}
              />
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setShowAIGenerator(false)} className="flex-1">
                  Cancel
                </Button>
                <Button onClick={handleGenerateWithAI} disabled={!aiPrompt.trim() || generatingAI} className="flex-1">
                  {generatingAI ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
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
            </div>
          </DialogContent>
        </Dialog>

        <AIChatAssistant />
      </AppLayout>
    )
  }

  return (
    <AppLayout>
      <div className="h-full flex flex-col">
        {/* Enhanced Toolbar with Integration Status */}
        <div className="flex items-center justify-between p-4 bg-white border-b border-slate-200 shadow-sm">
          <div className="flex items-center gap-4">
            <Button
              variant="outline"
              size="sm"
              onClick={handleBack}
              className="hover:bg-slate-50 hover:shadow-sm focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition-all duration-200"
            >
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back
            </Button>
            <div>
              <h1 className="text-xl font-semibold text-slate-900 flex items-center gap-2">
                {currentWorkflow.name}
                {hasUnsavedChanges && <span className="w-2 h-2 bg-orange-400 rounded-full" title="Unsaved changes" />}
              </h1>
              <p className="text-sm text-slate-500">{currentWorkflow.description}</p>
            </div>
          </div>
          <div className="flex items-center space-x-2">
            {/* Enhanced Integration Status */}
            <div className="flex items-center gap-2 px-3 py-1 bg-slate-50 rounded-lg text-sm text-slate-600">
              <div className="flex items-center gap-1">
                <CheckCircle className="w-3 h-3 text-green-500" />
                <span>{connectedIntegrationsCount} connected</span>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleRefreshIntegrations}
                disabled={refreshingIntegrations}
                className="h-6 w-6 p-0 hover:bg-slate-200"
              >
                <RefreshCw className={`w-3 h-3 ${refreshingIntegrations ? "animate-spin" : ""}`} />
              </Button>
            </div>

            {/* Enhanced Preloading Status */}
            {globalPreloadingData && (
              <div className="flex items-center gap-2 px-3 py-1 bg-blue-50 rounded-lg text-sm text-blue-600">
                <Loader2 className="w-3 h-3 animate-spin" />
                <span>Loading resources...</span>
                {Object.keys(preloadProgress).length > 0 && (
                  <Badge variant="secondary" className="text-xs">
                    {Object.values(preloadProgress).filter(Boolean).length}/{Object.keys(preloadProgress).length}
                  </Badge>
                )}
              </div>
            )}

            <Button variant="outline" size="sm" disabled>
              <Undo className="w-4 h-4" />
            </Button>
            <Button variant="outline" size="sm" disabled>
              <Redo className="w-4 h-4" />
            </Button>

            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowAIGenerator(true)}
              className="flex items-center gap-2 hover:bg-blue-50 hover:text-blue-600 hover:border-blue-200"
            >
              <Sparkles className="w-4 h-4" />
              AI Generate
            </Button>

            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowOptimizer(true)}
              className="flex items-center gap-2 hover:bg-purple-50 hover:text-purple-600 hover:border-purple-200"
            >
              <Zap className="w-4 h-4" />
              Optimize
            </Button>

            <Button
              variant="outline"
              size="sm"
              onClick={handleTest}
              disabled={testing}
              className="hover:bg-green-50 hover:text-green-600 hover:border-green-200"
            >
              {testing ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Testing...
                </>
              ) : (
                <>
                  <Play className="w-4 h-4 mr-2" />
                  Test
                </>
              )}
            </Button>
            <Button size="sm" onClick={handleSave} disabled={saving} className="bg-blue-600 hover:bg-blue-700">
              {saving ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  <Save className="w-4 h-4 mr-2" />
                  Save
                </>
              )}
            </Button>
          </div>
        </div>

        {/* AI Insights Bar */}
        {(workflowOptimizations.length > 0 || workflowAnomalies.length > 0) && (
          <div className="p-4 bg-gradient-to-r from-blue-50 to-purple-50 border-b border-slate-200">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-4">
                <div className="flex items-center space-x-2">
                  <Brain className="w-5 h-5 text-blue-600" />
                  <span className="text-sm font-medium text-slate-900">AI Insights</span>
                </div>
                {workflowOptimizations.length > 0 && (
                  <Badge variant="secondary">{workflowOptimizations.length} optimizations</Badge>
                )}
                {workflowAnomalies.length > 0 && <Badge variant="destructive">{workflowAnomalies.length} issues</Badge>}
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowOptimizer(true)}
                className="hover:bg-white hover:shadow-sm"
              >
                View Details
              </Button>
            </div>
          </div>
        )}

        {/* Enhanced Workflow Builder */}
        <div className="flex-1 p-6 bg-slate-50 overflow-auto">
          <div className="max-w-2xl mx-auto space-y-4">
            {/* Start Trigger */}
            <div className="flex items-center justify-center">
              <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center">
                <div className="w-6 h-6 bg-green-500 rounded-full" />
              </div>
            </div>

            {/* Workflow Steps */}
            {workflowSteps.map((step, index) => (
              <div key={step.id} className="space-y-4">
                {/* Step Card */}
                <Card className="bg-white shadow-sm hover:shadow-md transition-shadow duration-200">
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-3">
                        <div className="w-10 h-10 bg-slate-100 rounded-lg flex items-center justify-center">
                          <img
                            src={
                              AVAILABLE_INTEGRATIONS.find((app) => app.id === step.appId)?.logo || "/placeholder.svg"
                            }
                            alt={step.appName}
                            className="w-6 h-6"
                            onError={handleImageError}
                          />
                        </div>
                        <div>
                          <div className="font-medium text-slate-900">{step.actionName}</div>
                          <div className="text-sm text-slate-500">{step.appName}</div>
                          {hasConfigurableOptions(step) && Object.keys(step.config).length > 0 && (
                            <div className="text-xs text-blue-600 mt-1">
                              {Object.entries(step.config)
                                .filter(([_, value]) => value)
                                .map(([key, value]) => `${key}: ${value}`)
                                .join(", ")}
                            </div>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center space-x-2">
                        <Badge variant={step.type === "trigger" ? "default" : "secondary"}>{step.type}</Badge>
                        {hasConfigurableOptions(step) && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleEditStep(index)}
                            className="hover:bg-slate-100"
                          >
                            <Edit className="w-4 h-4" />
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDeleteStep(index)}
                          className="hover:bg-red-50 hover:text-red-600"
                        >
                          <X className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* Add Step Button */}
                <div className="flex items-center justify-center">
                  <div className="flex flex-col items-center">
                    <div className="w-px h-6 bg-slate-300" />
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleAddStep(index + 1)}
                      className="w-8 h-8 rounded-full p-0 hover:bg-blue-50 hover:border-blue-200"
                    >
                      <Plus className="w-4 h-4" />
                    </Button>
                    <div className="w-px h-6 bg-slate-300" />
                  </div>
                </div>
              </div>
            ))}

            {/* Initial Add Step Button */}
            {workflowSteps.length === 0 && (
              <div className="flex items-center justify-center">
                <Button
                  variant="outline"
                  onClick={() => handleAddStep(0)}
                  className="flex items-center gap-2 hover:bg-blue-50 hover:border-blue-200 hover:text-blue-600"
                >
                  <Plus className="w-4 h-4" />
                  Add Trigger
                </Button>
              </div>
            )}

            {/* End */}
            <div className="flex items-center justify-center">
              <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center">
                <div className="w-6 h-6 bg-red-500 rounded-full" />
              </div>
            </div>
          </div>
        </div>

        {/* Enhanced App Selector Modal */}
        <Dialog open={showAppSelector} onOpenChange={setShowAppSelector}>
          <DialogContent className="max-w-4xl max-h-[80vh] overflow-hidden">
            <DialogHeader>
              <DialogTitle>Choose an Integration</DialogTitle>
              <DialogDescription>
                Select an app to {currentStepIndex === 0 ? "trigger" : "perform an action in"} your workflow
              </DialogDescription>
            </DialogHeader>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 max-h-[60vh] overflow-y-auto">
              {AVAILABLE_INTEGRATIONS.map((app) => {
                const integrationStatus = getEnhancedIntegrationStatus(app.id)
                const isConnected = integrationStatus.isConnected
                const resourceCount = integrationStatus.resourceCount
                const isLoading = integrationStatus.isLoading

                return (
                  <Card
                    key={app.id}
                    className={`cursor-pointer transition-all duration-200 hover:shadow-md ${
                      isConnected ? "border-green-200 bg-green-50/30" : "border-slate-200 hover:border-blue-200"
                    }`}
                    onClick={() => handleAppSelected(app)}
                  >
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between mb-3">
                        <div className="flex items-center space-x-3">
                          <div className="w-10 h-10 bg-slate-100 rounded-lg flex items-center justify-center">
                            <img
                              src={app.logo || "/placeholder.svg"}
                              alt={app.name}
                              className="w-6 h-6"
                              onError={handleImageError}
                            />
                          </div>
                          <div>
                            <div className="font-medium text-slate-900">{app.name}</div>
                            <Badge variant="outline" className="text-xs">
                              {app.category}
                            </Badge>
                          </div>
                        </div>
                        <div className="flex flex-col items-end gap-1">
                          {isConnected ? (
                            <div className="flex items-center gap-1">
                              <CheckCircle className="w-4 h-4 text-green-500" />
                              <span className="text-xs text-green-600">Connected</span>
                            </div>
                          ) : (
                            <div className="flex items-center gap-1">
                              <AlertCircle className="w-4 h-4 text-orange-500" />
                              <span className="text-xs text-orange-600">Not connected</span>
                            </div>
                          )}
                          {isConnected && resourceCount > 0 && (
                            <Badge variant="secondary" className="text-xs">
                              {resourceCount} resources
                            </Badge>
                          )}
                          {isLoading && (
                            <div className="flex items-center gap-1">
                              <Loader2 className="w-3 h-3 animate-spin text-blue-500" />
                              <span className="text-xs text-blue-600">Loading...</span>
                            </div>
                          )}
                        </div>
                      </div>
                      <p className="text-sm text-slate-600 mb-3">{app.description}</p>
                      <div className="space-y-2">
                        <div className="text-xs font-medium text-slate-700">
                          {currentStepIndex === 0 ? "Available Triggers:" : "Available Actions:"}
                        </div>
                        <div className="flex flex-wrap gap-1">
                          {(currentStepIndex === 0 ? app.triggers : app.actions).slice(0, 3).map((item) => (
                            <Badge key={item} variant="outline" className="text-xs">
                              {item}
                            </Badge>
                          ))}
                          {(currentStepIndex === 0 ? app.triggers : app.actions).length > 3 && (
                            <Badge variant="outline" className="text-xs">
                              +{(currentStepIndex === 0 ? app.triggers : app.actions).length - 3} more
                            </Badge>
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                )
              })}
            </div>
          </DialogContent>
        </Dialog>

        {/* Enhanced Action Selector Modal */}
        <Dialog open={showActionSelector} onOpenChange={setShowActionSelector}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>
                Choose {currentStepIndex === 0 ? "Trigger" : "Action"} - {selectedApp?.name}
              </DialogTitle>
              <DialogDescription>
                Select what should {currentStepIndex === 0 ? "trigger" : "happen in"} this step
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-2 max-h-[60vh] overflow-y-auto">
              {(currentStepIndex === 0 ? selectedApp?.triggers : selectedApp?.actions)?.map((action) => (
                <Button
                  key={action}
                  variant="outline"
                  className="justify-start h-auto p-4 text-left hover:bg-blue-50 hover:border-blue-200"
                  onClick={() => handleActionSelected(action)}
                >
                  <div>
                    <div className="font-medium">{action}</div>
                    <div className="text-sm text-slate-500 mt-1">
                      {currentStepIndex === 0
                        ? `Triggers when ${action.toLowerCase()}`
                        : `Performs ${action.toLowerCase()}`}
                    </div>
                  </div>
                </Button>
              ))}
            </div>
          </DialogContent>
        </Dialog>

        {/* Enhanced Configuration Modal */}
        <Dialog open={showConfigModal} onOpenChange={setShowConfigModal}>
          <DialogContent className="max-w-2xl max-h-[80vh] overflow-hidden">
            <DialogHeader>
              <DialogTitle>
                Configure {selectedAction} - {selectedApp?.name}
              </DialogTitle>
              <DialogDescription>
                Set up the parameters for this {currentStepIndex === 0 ? "trigger" : "action"}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 max-h-[60vh] overflow-y-auto">
              {getConfigFields().map((field) => (
                <div key={field.key} className="space-y-2">
                  <Label htmlFor={field.key} className="text-sm font-medium">
                    {field.label} {field.required && <span className="text-red-500">*</span>}
                  </Label>
                  {renderConfigField(field)}
                  {field.description && <p className="text-xs text-slate-500">{field.description}</p>}
                </div>
              ))}
              {getConfigFields().length === 0 && (
                <div className="text-center py-8 text-slate-500">
                  <div className="text-lg font-medium mb-2">No configuration needed</div>
                  <div className="text-sm">
                    This {currentStepIndex === 0 ? "trigger" : "action"} works automatically
                  </div>
                </div>
              )}
            </div>
            <div className="flex gap-2 pt-4 border-t">
              <Button variant="outline" onClick={() => setShowConfigModal(false)} className="flex-1">
                Cancel
              </Button>
              <Button
                onClick={
                  currentStepIndex >= 0 && currentStepIndex < workflowSteps.length
                    ? handleUpdateStep
                    : handleConfigComplete
                }
                className="flex-1"
              >
                {currentStepIndex >= 0 && currentStepIndex < workflowSteps.length ? "Update Step" : "Add Step"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        {/* Connect Integration Modal */}
        <Dialog open={showConnectModal} onOpenChange={setShowConnectModal}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Connect {selectedApp?.name}</DialogTitle>
              <DialogDescription>You need to connect {selectedApp?.name} to use it in your workflow</DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="flex items-center space-x-3 p-4 bg-slate-50 rounded-lg">
                <div className="w-10 h-10 bg-white rounded-lg flex items-center justify-center shadow-sm">
                  <img
                    src={selectedApp?.logo || "/placeholder.svg"}
                    alt={selectedApp?.name}
                    className="w-6 h-6"
                    onError={handleImageError}
                  />
                </div>
                <div>
                  <div className="font-medium">{selectedApp?.name}</div>
                  <div className="text-sm text-slate-500">{selectedApp?.description}</div>
                </div>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setShowConnectModal(false)} className="flex-1">
                  Cancel
                </Button>
                <Button onClick={() => handleConnectApp(selectedApp?.id)} className="flex-1">
                  Connect {selectedApp?.name}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        {/* Delete Confirmation Dialog */}
        <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Delete Step</DialogTitle>
              <DialogDescription>
                Are you sure you want to delete this step? This action cannot be undone.
              </DialogDescription>
            </DialogHeader>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setShowDeleteDialog(false)} className="flex-1">
                Cancel
              </Button>
              <Button variant="destructive" onClick={confirmDeleteStep} className="flex-1">
                Delete Step
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        {/* Exit Confirmation Dialog */}
        <Dialog open={showExitDialog} onOpenChange={setShowExitDialog}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Unsaved Changes</DialogTitle>
              <DialogDescription>You have unsaved changes. What would you like to do?</DialogDescription>
            </DialogHeader>
            <div className="flex gap-2">
              <Button variant="outline" onClick={handleDiscardAndExit} className="flex-1">
                Discard Changes
              </Button>
              <Button onClick={handleSaveAndExit} className="flex-1">
                Save & Exit
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        {/* AI Generator Modal */}
        <Dialog open={showAIGenerator} onOpenChange={setShowAIGenerator}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Generate Workflow with AI</DialogTitle>
              <DialogDescription>
                Describe what you want your workflow to do, and AI will create it for you.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <Textarea
                placeholder="e.g., Send Slack notifications when new Notion pages are created in my project database"
                value={aiPrompt}
                onChange={(e) => setAiPrompt(e.target.value)}
                rows={4}
              />
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setShowAIGenerator(false)} className="flex-1">
                  Cancel
                </Button>
                <Button onClick={handleGenerateWithAI} disabled={!aiPrompt.trim() || generatingAI} className="flex-1">
                  {generatingAI ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
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
            </div>
          </DialogContent>
        </Dialog>

        {/* Workflow Optimizer Modal */}
        <WorkflowOptimizer
          isOpen={showOptimizer}
          onClose={() => setShowOptimizer(false)}
          workflowId={currentWorkflow?.id}
        />

        {/* AI Chat Assistant */}
        <AIChatAssistant />
      </div>
    </AppLayout>
  )
}
