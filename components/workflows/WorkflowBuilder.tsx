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
import { ScrollArea } from "@/components/ui/scroll-area"
import { Alert, AlertDescription } from "@/components/ui/alert"
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
  Edit,
  X,
  Database,
  CheckCircle,
  ExternalLink,
  ArrowRight,
  Wifi,
  WifiOff,
  Workflow,
  AlertCircle,
  Info,
} from "lucide-react"
import { useToast } from "@/hooks/use-toast"

// Enhanced integration data with proper logos and better organization
const AVAILABLE_INTEGRATIONS = [
  {
    id: "notion",
    name: "Notion",
    logo: "https://upload.wikimedia.org/wikipedia/commons/4/45/Notion_app_logo.png",
    fallbackLogo: "/placeholder.svg?height=40&width=40&text=N",
    triggers: [
      { id: "page_updated", name: "Page Updated", description: "Triggers when a page is modified" },
      {
        id: "database_item_added",
        name: "Database Item Added",
        description: "Triggers when a new item is added to a database",
      },
      {
        id: "database_item_updated",
        name: "Database Item Updated",
        description: "Triggers when a database item is modified",
      },
      { id: "new_page_created", name: "New Page Created", description: "Triggers when a new page is created" },
    ],
    actions: ["Create Page", "Update Database", "Add Comment"],
    category: "Productivity",
    description: "Manage pages and databases in your Notion workspace",
    color: "bg-gray-100 text-gray-900",
  },
  {
    id: "gmail",
    name: "Gmail",
    logo: "https://upload.wikimedia.org/wikipedia/commons/7/7e/Gmail_icon_%282020%29.svg",
    fallbackLogo: "/placeholder.svg?height=40&width=40&text=GM",
    triggers: [
      { id: "new_email", name: "New Email", description: "Triggers when a new email is received" },
      {
        id: "email_from_sender",
        name: "Email from Specific Sender",
        description: "Triggers when an email is received from a specific sender",
      },
      {
        id: "email_with_attachment",
        name: "Email with Attachment",
        description: "Triggers when an email with attachments is received",
      },
      { id: "important_email", name: "Important Email", description: "Triggers when an important email is received" },
    ],
    actions: ["Send Email", "Reply to Email", "Forward Email"],
    category: "Email",
    description: "Automate your email workflows and responses",
    color: "bg-red-100 text-red-900",
  },
  {
    id: "slack",
    name: "Slack",
    logo: "https://upload.wikimedia.org/wikipedia/commons/d/d5/Slack_icon_2019.svg",
    fallbackLogo: "/placeholder.svg?height=40&width=40&text=S",
    triggers: [
      {
        id: "new_message_in_channel",
        name: "New Message in Channel",
        description: "Triggers when a new message is posted in a channel",
      },
      {
        id: "direct_message_received",
        name: "Direct Message Received",
        description: "Triggers when a direct message is received",
      },
      { id: "user_mentioned", name: "User Mentioned", description: "Triggers when you are mentioned in a message" },
      { id: "file_uploaded", name: "File Uploaded", description: "Triggers when a file is uploaded to a channel" },
    ],
    actions: ["Send Message", "Create Channel", "Update Status"],
    category: "Communication",
    description: "Integrate with your Slack workspace and channels",
    color: "bg-purple-100 text-purple-900",
  },
  {
    id: "google-sheets",
    name: "Google Sheets",
    logo: "https://upload.wikimedia.org/wikipedia/commons/3/30/Google_Sheets_logo_%282014-2020%29.svg",
    fallbackLogo: "/placeholder.svg?height=40&width=40&text=GS",
    triggers: [
      { id: "new_row_added", name: "New Row Added", description: "Triggers when a new row is added to a spreadsheet" },
      { id: "row_updated", name: "Row Updated", description: "Triggers when a row is updated" },
      { id: "cell_changed", name: "Cell Changed", description: "Triggers when a specific cell is changed" },
      { id: "sheet_created", name: "Sheet Created", description: "Triggers when a new sheet is created" },
    ],
    actions: ["Add Row", "Update Row", "Create Sheet"],
    category: "Productivity",
    description: "Work with spreadsheets and data automation",
    color: "bg-green-100 text-green-900",
  },
  {
    id: "google-calendar",
    name: "Google Calendar",
    logo: "https://upload.wikimedia.org/wikipedia/commons/a/a5/Google_Calendar_icon_%282020%29.svg",
    fallbackLogo: "/placeholder.svg?height=40&width=40&text=GC",
    triggers: [
      { id: "new_event", name: "New Event", description: "Triggers when a new event is created" },
      { id: "event_updated", name: "Event Updated", description: "Triggers when an event is modified" },
      { id: "event_starting_soon", name: "Event Starting Soon", description: "Triggers before an event starts" },
      { id: "event_cancelled", name: "Event Cancelled", description: "Triggers when an event is cancelled" },
    ],
    actions: ["Create Event", "Update Event", "Delete Event"],
    category: "Productivity",
    description: "Manage calendar events and scheduling",
    color: "bg-blue-100 text-blue-900",
  },
  {
    id: "airtable",
    name: "Airtable",
    logo: "https://upload.wikimedia.org/wikipedia/commons/4/4b/Airtable_Logo.svg",
    fallbackLogo: "/placeholder.svg?height=40&width=40&text=A",
    triggers: [
      { id: "new_record", name: "New Record", description: "Triggers when a new record is added" },
      { id: "record_updated", name: "Record Updated", description: "Triggers when a record is updated" },
      { id: "view_updated", name: "View Updated", description: "Triggers when a view is modified" },
      { id: "base_shared", name: "Base Shared", description: "Triggers when a base is shared" },
    ],
    actions: ["Create Record", "Update Record", "Delete Record"],
    category: "Database",
    description: "Organize and automate your Airtable bases",
    color: "bg-orange-100 text-orange-900",
  },
  {
    id: "trello",
    name: "Trello",
    logo: "https://upload.wikimedia.org/wikipedia/en/8/8c/Trello_logo.svg",
    fallbackLogo: "/placeholder.svg?height=40&width=40&text=T",
    triggers: [
      { id: "new_card", name: "New Card", description: "Triggers when a new card is created" },
      { id: "card_moved", name: "Card Moved", description: "Triggers when a card is moved between lists" },
      { id: "card_updated", name: "Card Updated", description: "Triggers when a card is updated" },
      {
        id: "due_date_approaching",
        name: "Due Date Approaching",
        description: "Triggers when a card's due date is approaching",
      },
    ],
    actions: ["Create Card", "Move Card", "Update Card"],
    category: "Project Management",
    description: "Manage boards, cards, and project workflows",
    color: "bg-indigo-100 text-indigo-900",
  },
  {
    id: "github",
    name: "GitHub",
    logo: "https://upload.wikimedia.org/wikipedia/commons/9/91/Octicons-mark-github.svg",
    fallbackLogo: "/placeholder.svg?height=40&width=40&text=GH",
    triggers: [
      { id: "new_issue", name: "New Issue", description: "Triggers when a new issue is created" },
      {
        id: "pull_request_created",
        name: "Pull Request Created",
        description: "Triggers when a new pull request is created",
      },
      {
        id: "push_to_repository",
        name: "Push to Repository",
        description: "Triggers when code is pushed to a repository",
      },
      { id: "release_published", name: "Release Published", description: "Triggers when a new release is published" },
    ],
    actions: ["Create Issue", "Create Pull Request", "Add Comment"],
    category: "Development",
    description: "Automate your development and code workflows",
    color: "bg-gray-100 text-gray-900",
  },
]

// Enhanced trigger configurations with cleaner structure
const TRIGGER_CONFIGS = {
  page_updated: [
    {
      key: "page_id",
      label: "Notion Page",
      type: "resource_select",
      provider: "notion",
      dataType: "pages",
      placeholder: "Select a specific page (optional)",
      required: false,
      helpText: "Choose a specific page to monitor, or leave empty to monitor all pages",
    },
  ],
  database_item_added: [
    {
      key: "database_id",
      label: "Notion Database",
      type: "resource_select",
      provider: "notion",
      dataType: "databases",
      placeholder: "Select a database",
      required: true,
      helpText: "Choose the database to monitor for new items",
    },
  ],
  database_item_updated: [
    {
      key: "database_id",
      label: "Notion Database",
      type: "resource_select",
      provider: "notion",
      dataType: "databases",
      placeholder: "Select a database",
      required: true,
      helpText: "Choose the database to monitor for item updates",
    },
  ],
  new_message_in_channel: [
    {
      key: "channel_id",
      label: "Slack Channel",
      type: "resource_select",
      provider: "slack",
      dataType: "channels",
      placeholder: "Select a channel",
      required: true,
      helpText: "Choose the channel to monitor for new messages",
    },
  ],
  direct_message_received: [
    {
      key: "from_user",
      label: "From User",
      type: "resource_select",
      provider: "slack",
      dataType: "users",
      placeholder: "Select a user (optional)",
      required: false,
      helpText: "Optionally filter messages from a specific user",
    },
  ],
  new_row_added: [
    {
      key: "spreadsheet_id",
      label: "Google Spreadsheet",
      type: "resource_select",
      provider: "google-sheets",
      dataType: "spreadsheets",
      placeholder: "Select a spreadsheet",
      required: true,
      helpText: "Choose the spreadsheet to monitor for new rows",
    },
    {
      key: "sheet_name",
      label: "Sheet Name",
      type: "text",
      placeholder: "Sheet1 (optional)",
      required: false,
      helpText: "Specify a particular sheet within the spreadsheet",
    },
  ],
  new_event: [
    {
      key: "calendar_id",
      label: "Google Calendar",
      type: "resource_select",
      provider: "google-calendar",
      dataType: "calendars",
      placeholder: "Select a calendar (optional)",
      required: false,
      helpText: "Choose a specific calendar, or leave empty to monitor all calendars",
    },
  ],
  new_record: [
    {
      key: "base_id",
      label: "Airtable Base",
      type: "resource_select",
      provider: "airtable",
      dataType: "bases",
      placeholder: "Select a base",
      required: true,
      helpText: "Choose the Airtable base to monitor",
    },
    {
      key: "table_name",
      label: "Table Name",
      type: "text",
      placeholder: "Enter table name",
      required: true,
      helpText: "Specify the table within the base",
    },
  ],
  new_card: [
    {
      key: "board_id",
      label: "Trello Board",
      type: "resource_select",
      provider: "trello",
      dataType: "boards",
      placeholder: "Select a board",
      required: true,
      helpText: "Choose the Trello board to monitor",
    },
    {
      key: "list_name",
      label: "List Name",
      type: "text",
      placeholder: "List name (optional)",
      required: false,
      helpText: "Optionally specify a particular list within the board",
    },
  ],
  new_issue: [
    {
      key: "repository",
      label: "GitHub Repository",
      type: "resource_select",
      provider: "github",
      dataType: "repositories",
      placeholder: "Select a repository",
      required: true,
      helpText: "Choose the repository to monitor for new issues",
    },
  ],
  new_email: [
    {
      key: "label_id",
      label: "Gmail Label",
      type: "resource_select",
      provider: "gmail",
      dataType: "labels",
      placeholder: "Select a label (optional)",
      required: false,
      helpText: "Optionally filter emails by a specific label",
    },
  ],
  email_from_sender: [
    {
      key: "sender_email",
      label: "Sender Email",
      type: "email",
      placeholder: "sender@example.com",
      required: true,
      helpText: "Enter the email address to monitor",
    },
  ],
}

interface WorkflowStep {
  id: string
  type: "trigger" | "action" | "condition"
  appId: string
  appName: string
  actionName: string
  actionId: string
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
    isResourceLoading,
    getIntegrationStatus,
    getCachedResourceCount,
    refreshResourcesForProvider,
    fetchDynamicData,
  } = useIntegrationStore()

  const [workflowSteps, setWorkflowSteps] = useState<WorkflowStep[]>([])
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false)

  // Modal states - streamlined for new flow
  const [showTriggerModal, setShowTriggerModal] = useState(false)
  const [showIntegrationList, setShowIntegrationList] = useState(true)
  const [showTriggerList, setShowTriggerList] = useState(false)
  const [showConfigModal, setShowConfigModal] = useState(false)
  const [showConnectModal, setShowConnectModal] = useState(false)
  const [showAIGenerator, setShowAIGenerator] = useState(false)
  const [showOptimizer, setShowOptimizer] = useState(false)
  const [showExitDialog, setShowExitDialog] = useState(false)
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)
  const [stepToDelete, setStepToDelete] = useState<number>(-1)

  // Selection states
  const [selectedIntegration, setSelectedIntegration] = useState<any>(null)
  const [selectedTrigger, setSelectedTrigger] = useState<any>(null)
  const [currentConfig, setCurrentConfig] = useState<Record<string, any>>({})
  const [aiPrompt, setAiPrompt] = useState("")
  const [generatingAI, setGeneratingAI] = useState(false)
  const [isConnecting, setIsConnecting] = useState(false)

  // Resource loading states
  const [resourceLoadingStates, setResourceLoadingStates] = useState<Record<string, boolean>>({})
  const [resourceErrors, setResourceErrors] = useState<Record<string, string>>({})

  const { toast } = useToast()

  // Enhanced resource management
  const [resourceRefreshStates, setResourceRefreshStates] = useState<Record<string, boolean>>({})

  // Memoized connected providers
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

  // Initialize data on mount
  useEffect(() => {
    const initializeData = async () => {
      try {
        await fetchIntegrations()
        // Start background preloading for connected integrations
        const connectedIntegrations = integrations.filter((i) => i.status === "connected")
        if (connectedIntegrations.length > 0) {
          await initializeGlobalPreload()
        }
      } catch (error) {
        console.error("Failed to initialize data:", error)
        toast({
          title: "Initialization Error",
          description: "Failed to load integration data. Please refresh the page.",
          variant: "destructive",
        })
      }
    }
    initializeData()
  }, [fetchIntegrations, initializeGlobalPreload])

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

  // Streamlined trigger addition flow
  const handleAddTrigger = () => {
    setShowTriggerModal(true)
    setShowIntegrationList(true)
    setShowTriggerList(false)
    setSelectedIntegration(null)
    setSelectedTrigger(null)
  }

  const handleIntegrationSelected = (integration: any) => {
    setSelectedIntegration(integration)
    setShowIntegrationList(false)
    setShowTriggerList(true)
  }

  const handleTriggerSelected = async (trigger: any) => {
    setSelectedTrigger(trigger)

    const integrationStatus = getEnhancedIntegrationStatus(selectedIntegration.id)

    if (!integrationStatus.isConnected) {
      setShowTriggerModal(false)
      setShowConnectModal(true)
      return
    }

    // Check if trigger needs configuration
    const triggerConfig = TRIGGER_CONFIGS[trigger.id as keyof typeof TRIGGER_CONFIGS]

    if (triggerConfig && triggerConfig.length > 0) {
      setCurrentConfig({})
      setShowTriggerModal(false)
      setShowConfigModal(true)

      // Pre-load resources for this trigger
      await preloadTriggerResources(trigger.id, selectedIntegration.id)
    } else {
      // Add trigger directly without configuration
      addTriggerStep(trigger, {})
    }
  }

  const preloadTriggerResources = async (triggerId: string, integrationId: string) => {
    const triggerConfig = TRIGGER_CONFIGS[triggerId as keyof typeof TRIGGER_CONFIGS]
    if (!triggerConfig) return

    for (const field of triggerConfig) {
      if (field.type === "resource_select") {
        const key = `${field.provider}_${field.dataType}`
        setResourceLoadingStates((prev) => ({ ...prev, [key]: true }))
        setResourceErrors((prev) => ({ ...prev, [key]: "" }))

        try {
          await fetchDynamicData(field.provider, field.dataType)
        } catch (error: any) {
          console.error(`Failed to load ${field.dataType} for ${field.provider}:`, error)
          setResourceErrors((prev) => ({
            ...prev,
            [key]: `Failed to load ${field.dataType}. Please check your connection.`,
          }))
        } finally {
          setResourceLoadingStates((prev) => ({ ...prev, [key]: false }))
        }
      }
    }
  }

  const addTriggerStep = (trigger: any, config: Record<string, any>) => {
    const newStep: WorkflowStep = {
      id: `step-${Date.now()}`,
      type: "trigger",
      appId: selectedIntegration.id,
      appName: selectedIntegration.name,
      actionName: trigger.name,
      actionId: trigger.id,
      config: config,
      isConfigured: true,
    }

    setWorkflowSteps([newStep])
    resetModalStates()

    toast({
      title: "Trigger Added",
      description: `${trigger.name} trigger has been added to your workflow.`,
    })
  }

  const resetModalStates = () => {
    setShowTriggerModal(false)
    setShowConfigModal(false)
    setShowConnectModal(false)
    setShowIntegrationList(true)
    setShowTriggerList(false)
    setSelectedIntegration(null)
    setSelectedTrigger(null)
    setCurrentConfig({})
    setResourceErrors({})
    setResourceLoadingStates({})
  }

  const handleConnectIntegration = async () => {
    if (!selectedIntegration) return

    setIsConnecting(true)
    try {
      await connectIntegration(selectedIntegration.id)

      toast({
        title: "Connecting...",
        description: `Opening ${selectedIntegration.name} authorization in a new tab`,
      })

      // After connection, continue with trigger setup
      setTimeout(() => {
        setShowConnectModal(false)

        // Check if trigger needs configuration
        const triggerConfig = TRIGGER_CONFIGS[selectedTrigger.id as keyof typeof TRIGGER_CONFIGS]

        if (triggerConfig && triggerConfig.length > 0) {
          setCurrentConfig({})
          setShowConfigModal(true)
          preloadTriggerResources(selectedTrigger.id, selectedIntegration.id)
        } else {
          addTriggerStep(selectedTrigger, {})
        }
      }, 1000)
    } catch (error: any) {
      toast({
        title: "Connection Failed",
        description: error.message,
        variant: "destructive",
      })
    } finally {
      setIsConnecting(false)
    }
  }

  const handleConfigComplete = () => {
    if (selectedTrigger) {
      // Validate required fields
      const triggerConfig = TRIGGER_CONFIGS[selectedTrigger.id as keyof typeof TRIGGER_CONFIGS] || []
      const missingFields = triggerConfig.filter((field) => field.required && !currentConfig[field.key])

      if (missingFields.length > 0) {
        toast({
          title: "Missing Required Fields",
          description: `Please fill in: ${missingFields.map((f) => f.label).join(", ")}`,
          variant: "destructive",
        })
        return
      }

      addTriggerStep(selectedTrigger, currentConfig)
    }
  }

  const handleBackToIntegrations = () => {
    setShowIntegrationList(true)
    setShowTriggerList(false)
    setSelectedIntegration(null)
  }

  const handleEditStep = (index: number) => {
    const step = workflowSteps[index]
    const integration = AVAILABLE_INTEGRATIONS.find((app) => app.id === step.appId)
    const trigger = integration?.triggers.find((t) => t.id === step.actionId)

    if (integration && trigger) {
      setSelectedIntegration(integration)
      setSelectedTrigger(trigger)
      setCurrentConfig(step.config)
      setShowConfigModal(true)
      preloadTriggerResources(trigger.id, integration.id)
    }
  }

  const handleUpdateStep = () => {
    if (workflowSteps.length > 0) {
      const updatedSteps = [...workflowSteps]
      updatedSteps[0] = {
        ...updatedSteps[0],
        config: currentConfig,
      }
      setWorkflowSteps(updatedSteps)
      setShowConfigModal(false)
      resetModalStates()

      toast({
        title: "Trigger Updated",
        description: "Your trigger configuration has been updated.",
      })
    }
  }

  const handleDeleteStep = (index: number) => {
    setStepToDelete(index)
    setShowDeleteDialog(true)
  }

  const confirmDeleteStep = () => {
    if (stepToDelete >= 0) {
      const newSteps = workflowSteps.filter((_, i) => i !== stepToDelete)
      setWorkflowSteps(newSteps)
      toast({
        title: "Trigger Deleted",
        description: "The trigger has been removed from your workflow.",
      })
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

  // Enhanced config field rendering with better error handling
  const getConfigFields = () => {
    if (!selectedTrigger) return []
    return TRIGGER_CONFIGS[selectedTrigger.id as keyof typeof TRIGGER_CONFIGS] || []
  }

  const renderConfigField = (field: any) => {
    if (field.type === "resource_select") {
      const resources = getDynamicData(field.provider, field.dataType)
      const key = `${field.provider}_${field.dataType}`
      const isLoading = resourceLoadingStates[key] || isResourceLoading(field.provider, field.dataType)
      const error = resourceErrors[key]
      const isRefreshing = resourceRefreshStates[field.provider]

      return (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <Label htmlFor={field.key} className="text-sm font-medium text-slate-700">
              {field.label} {field.required && <span className="text-red-500">*</span>}
            </Label>
            <div className="flex items-center gap-2">
              {resources.length > 0 && !isLoading && !error && (
                <Badge variant="secondary" className="text-xs">
                  {resources.length} available
                </Badge>
              )}
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={async () => {
                  setResourceRefreshStates((prev) => ({ ...prev, [field.provider]: true }))
                  setResourceErrors((prev) => ({ ...prev, [key]: "" }))
                  try {
                    await refreshResourcesForProvider(field.provider)
                    toast({
                      title: "Resources Refreshed",
                      description: `${field.provider} resources have been updated.`,
                    })
                  } catch (error: any) {
                    setResourceErrors((prev) => ({
                      ...prev,
                      [key]: `Failed to refresh ${field.dataType}`,
                    }))
                  } finally {
                    setResourceRefreshStates((prev) => ({ ...prev, [field.provider]: false }))
                  }
                }}
                disabled={isRefreshing || isLoading}
                className="h-6 w-6 p-0"
              >
                <RefreshCw className={`w-3 h-3 ${isRefreshing ? "animate-spin" : ""}`} />
              </Button>
            </div>
          </div>

          {error && (
            <Alert variant="destructive" className="py-2">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription className="text-sm">{error}</AlertDescription>
            </Alert>
          )}

          <Select
            value={currentConfig[field.key] || ""}
            onValueChange={(value) => setCurrentConfig({ ...currentConfig, [field.key]: value })}
            disabled={isLoading || isRefreshing || !!error}
          >
            <SelectTrigger className={isLoading || isRefreshing || error ? "opacity-50 cursor-not-allowed" : ""}>
              <SelectValue
                placeholder={
                  isLoading || isRefreshing
                    ? "Loading resources..."
                    : error
                      ? "Error loading resources"
                      : resources.length === 0
                        ? "No resources found"
                        : field.placeholder
                }
              />
            </SelectTrigger>
            <SelectContent side="bottom" align="start" className="max-h-[200px] overflow-y-auto" sideOffset={4}>
              {isLoading || isRefreshing ? (
                <div className="p-3 text-sm text-muted-foreground flex items-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Loading {field.dataType}...
                </div>
              ) : error ? (
                <div className="p-3 text-sm text-red-600 flex items-center gap-2">
                  <AlertCircle className="w-4 h-4" />
                  Failed to load resources
                </div>
              ) : resources.length === 0 ? (
                <div className="p-3 text-sm text-muted-foreground">
                  <div className="flex items-center gap-2 mb-1">
                    <Info className="w-4 h-4" />
                    No {field.dataType} found
                  </div>
                  <div className="text-xs">Try refreshing or check your {field.provider} connection.</div>
                </div>
              ) : (
                resources.map((resource, index) => (
                  <SelectItem key={resource.id || index} value={resource.value}>
                    <div className="flex items-center gap-2">
                      <Database className="w-3 h-3 text-muted-foreground" />
                      <span className="truncate">{resource.name}</span>
                    </div>
                  </SelectItem>
                ))
              )}
            </SelectContent>
          </Select>

          {field.helpText && !error && (
            <p className="text-xs text-muted-foreground flex items-start gap-1">
              <Info className="w-3 h-3 mt-0.5 flex-shrink-0" />
              {field.helpText}
            </p>
          )}
        </div>
      )
    } else if (field.type === "textarea") {
      return (
        <div className="space-y-2">
          <Label htmlFor={field.key} className="text-sm font-medium text-slate-700">
            {field.label} {field.required && <span className="text-red-500">*</span>}
          </Label>
          <Textarea
            id={field.key}
            value={currentConfig[field.key] || ""}
            onChange={(e) => setCurrentConfig({ ...currentConfig, [field.key]: e.target.value })}
            placeholder={field.placeholder}
            rows={3}
            className="resize-none"
          />
          {field.helpText && (
            <p className="text-xs text-muted-foreground flex items-start gap-1">
              <Info className="w-3 h-3 mt-0.5 flex-shrink-0" />
              {field.helpText}
            </p>
          )}
        </div>
      )
    } else {
      return (
        <div className="space-y-2">
          <Label htmlFor={field.key} className="text-sm font-medium text-slate-700">
            {field.label} {field.required && <span className="text-red-500">*</span>}
          </Label>
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
          {field.helpText && (
            <p className="text-xs text-muted-foreground flex items-start gap-1">
              <Info className="w-3 h-3 mt-0.5 flex-shrink-0" />
              {field.helpText}
            </p>
          )}
        </div>
      )
    }
  }

  const hasConfigurableOptions = (step: WorkflowStep) => {
    const triggerConfig = TRIGGER_CONFIGS[step.actionId as keyof typeof TRIGGER_CONFIGS]
    return triggerConfig && triggerConfig.length > 0
  }

  const handleImageError = (e: React.SyntheticEvent<HTMLImageElement, Event>) => {
    const target = e.currentTarget
    const integration = AVAILABLE_INTEGRATIONS.find((int) => int.logo === target.src)
    if (integration && target.src !== integration.fallbackLogo) {
      target.onerror = null
      target.src = integration.fallbackLogo
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
        {/* Enhanced Toolbar */}
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
            {/* Integration Status */}
            <div className="flex items-center gap-2 px-3 py-1 bg-slate-50 rounded-lg text-sm text-slate-600">
              <div className="flex items-center gap-1">
                <CheckCircle className="w-3 h-3 text-green-500" />
                <span>{connectedIntegrationsCount} connected</span>
              </div>
            </div>

            {/* Preloading Status */}
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

        {/* Clean Workflow Builder */}
        <div className="flex-1 p-8 bg-slate-50 overflow-auto">
          <div className="max-w-2xl mx-auto">
            {/* Workflow Steps or Add Trigger */}
            {workflowSteps.length === 0 ? (
              // Clean Add Trigger Section
              <div className="flex flex-col items-center justify-center space-y-6 py-12">
                <div className="w-20 h-20 bg-white rounded-2xl shadow-sm border border-slate-200 flex items-center justify-center">
                  <Workflow className="w-10 h-10 text-slate-400" />
                </div>
                <div className="text-center space-y-2">
                  <h3 className="text-lg font-semibold text-slate-900">Start Building Your Workflow</h3>
                  <p className="text-sm text-slate-500 max-w-md">
                    Begin by adding a trigger that will start your workflow when specific events occur in your connected
                    apps.
                  </p>
                </div>
                <Button
                  onClick={handleAddTrigger}
                  size="lg"
                  className="bg-blue-600 hover:bg-blue-700 text-white px-8 py-3 rounded-lg shadow-sm hover:shadow-md transition-all duration-200"
                >
                  Add Trigger
                </Button>
              </div>
            ) : (
              // Existing Workflow Steps
              <div className="space-y-6">
                {workflowSteps.map((step, index) => (
                  <div key={step.id}>
                    <Card className="bg-white shadow-sm hover:shadow-md transition-shadow duration-200 border-l-4 border-l-blue-500">
                      <CardContent className="p-6">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center space-x-4">
                            <div className="w-12 h-12 bg-slate-100 rounded-lg flex items-center justify-center">
                              <img
                                src={
                                  AVAILABLE_INTEGRATIONS.find((app) => app.id === step.appId)?.logo ||
                                  AVAILABLE_INTEGRATIONS.find((app) => app.id === step.appId)?.fallbackLogo ||
                                  "/placeholder.svg" ||
                                  "/placeholder.svg"
                                }
                                alt={step.appName}
                                className="w-8 h-8"
                                onError={handleImageError}
                              />
                            </div>
                            <div>
                              <div className="font-semibold text-slate-900">{step.actionName}</div>
                              <div className="text-sm text-slate-500">{step.appName}</div>
                              <Badge variant="default" className="mt-1 text-xs">
                                Trigger
                              </Badge>
                              {hasConfigurableOptions(step) && Object.keys(step.config).length > 0 && (
                                <div className="text-xs text-blue-600 mt-2 space-y-1">
                                  {Object.entries(step.config)
                                    .filter(([_, value]) => value)
                                    .map(([key, value]) => (
                                      <div key={key} className="flex items-center gap-1">
                                        <Database className="w-3 h-3" />
                                        <span>
                                          {key.replace(/_/g, " ")}: {value}
                                        </span>
                                      </div>
                                    ))}
                                </div>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center space-x-2">
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
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Streamlined Trigger Selection Modal */}
        <Dialog open={showTriggerModal} onOpenChange={setShowTriggerModal}>
          <DialogContent className="max-w-2xl max-h-[80vh] overflow-hidden">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                {showTriggerList && (
                  <Button variant="ghost" size="sm" onClick={handleBackToIntegrations} className="p-1 h-auto">
                    <ArrowLeft className="w-4 h-4" />
                  </Button>
                )}
                {showIntegrationList ? "Choose Integration" : `${selectedIntegration?.name} Triggers`}
              </DialogTitle>
              <DialogDescription>
                {showIntegrationList
                  ? "Select an integration to see available triggers"
                  : `Choose a trigger for ${selectedIntegration?.name}`}
              </DialogDescription>
            </DialogHeader>

            <ScrollArea className="max-h-[60vh]">
              {showIntegrationList && (
                <div className="space-y-2">
                  {AVAILABLE_INTEGRATIONS.map((integration) => {
                    const integrationStatus = getEnhancedIntegrationStatus(integration.id)
                    const isConnected = integrationStatus.isConnected
                    const resourceCount = integrationStatus.resourceCount

                    return (
                      <Card
                        key={integration.id}
                        className={`cursor-pointer transition-all duration-200 hover:shadow-md ${
                          isConnected ? "border-green-200 bg-green-50/30" : "border-slate-200 hover:border-blue-200"
                        }`}
                        onClick={() => handleIntegrationSelected(integration)}
                      >
                        <CardContent className="p-4">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center space-x-3">
                              <div className="w-12 h-12 bg-white rounded-lg flex items-center justify-center shadow-sm border border-slate-200">
                                <img
                                  src={integration.logo || integration.fallbackLogo}
                                  alt={integration.name}
                                  className="w-8 h-8"
                                  onError={handleImageError}
                                />
                              </div>
                              <div>
                                <div className="font-medium text-slate-900">{integration.name}</div>
                                <div className="text-sm text-slate-500">{integration.description}</div>
                                <div className="flex items-center gap-2 mt-1">
                                  <Badge variant="outline" className="text-xs">
                                    {integration.category}
                                  </Badge>
                                  <Badge variant="secondary" className="text-xs">
                                    {integration.triggers.length} triggers
                                  </Badge>
                                </div>
                              </div>
                            </div>
                            <div className="flex flex-col items-end gap-2">
                              <div className="flex items-center gap-1">
                                {isConnected ? (
                                  <>
                                    <Wifi className="w-4 h-4 text-green-500" />
                                    <span className="text-xs text-green-600">Connected</span>
                                  </>
                                ) : (
                                  <>
                                    <WifiOff className="w-4 h-4 text-orange-500" />
                                    <span className="text-xs text-orange-600">Not connected</span>
                                  </>
                                )}
                              </div>
                              {isConnected && resourceCount > 0 && (
                                <Badge variant="secondary" className="text-xs">
                                  {resourceCount} resources
                                </Badge>
                              )}
                              <ArrowRight className="w-4 h-4 text-slate-400" />
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    )
                  })}
                </div>
              )}

              {showTriggerList && selectedIntegration && (
                <div className="space-y-2">
                  {selectedIntegration.triggers.map((trigger: any) => (
                    <Card
                      key={trigger.id}
                      className="cursor-pointer transition-all duration-200 hover:shadow-md hover:border-blue-200"
                      onClick={() => handleTriggerSelected(trigger)}
                    >
                      <CardContent className="p-4">
                        <div className="flex items-center justify-between">
                          <div>
                            <div className="font-medium text-slate-900">{trigger.name}</div>
                            <div className="text-sm text-slate-500 mt-1">{trigger.description}</div>
                          </div>
                          <ArrowRight className="w-4 h-4 text-slate-400" />
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </ScrollArea>
          </DialogContent>
        </Dialog>

        {/* Connection Modal */}
        <Dialog open={showConnectModal} onOpenChange={setShowConnectModal}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Connect {selectedIntegration?.name}</DialogTitle>
              <DialogDescription>
                You need to connect {selectedIntegration?.name} to use this trigger in your workflow.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="flex items-center space-x-3 p-4 bg-slate-50 rounded-lg">
                <div className="w-12 h-12 bg-white rounded-lg flex items-center justify-center shadow-sm border border-slate-200">
                  <img
                    src={selectedIntegration?.logo || selectedIntegration?.fallbackLogo}
                    alt={selectedIntegration?.name}
                    className="w-8 h-8"
                    onError={handleImageError}
                  />
                </div>
                <div>
                  <div className="font-medium">{selectedIntegration?.name}</div>
                  <div className="text-sm text-slate-500">{selectedIntegration?.description}</div>
                </div>
              </div>
              <div className="flex items-center gap-2 p-3 bg-blue-50 rounded-lg text-sm text-blue-700">
                <ExternalLink className="w-4 h-4" />
                <span>This will open a new tab for authorization</span>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setShowConnectModal(false)} className="flex-1">
                  Cancel
                </Button>
                <Button onClick={handleConnectIntegration} disabled={isConnecting} className="flex-1">
                  {isConnecting ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Connecting...
                    </>
                  ) : (
                    <>
                      <ExternalLink className="w-4 h-4 mr-2" />
                      Connect {selectedIntegration?.name}
                    </>
                  )}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        {/* Enhanced Configuration Modal - Fixed double text issue */}
        <Dialog open={showConfigModal} onOpenChange={setShowConfigModal}>
          <DialogContent className="max-w-2xl max-h-[80vh] overflow-hidden">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <div className="w-8 h-8 bg-slate-100 rounded-lg flex items-center justify-center">
                  <img
                    src={selectedIntegration?.logo || selectedIntegration?.fallbackLogo}
                    alt={selectedIntegration?.name}
                    className="w-5 h-5"
                    onError={handleImageError}
                  />
                </div>
                Configure {selectedTrigger?.name}
              </DialogTitle>
              <DialogDescription>
                Set up the parameters for this trigger to customize when it activates.
              </DialogDescription>
            </DialogHeader>
            <ScrollArea className="max-h-[60vh]">
              <div className="space-y-6 p-1">
                {getConfigFields().map((field) => (
                  <div key={field.key}>{renderConfigField(field)}</div>
                ))}
                {getConfigFields().length === 0 && (
                  <div className="text-center py-8 text-slate-500">
                    <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-4">
                      <CheckCircle className="w-8 h-8 text-green-500" />
                    </div>
                    <div className="text-lg font-medium mb-2">No configuration needed</div>
                    <div className="text-sm">This trigger works automatically without additional setup</div>
                  </div>
                )}
              </div>
            </ScrollArea>
            <div className="flex gap-2 pt-4 border-t">
              <Button variant="outline" onClick={() => setShowConfigModal(false)} className="flex-1">
                Cancel
              </Button>
              <Button
                onClick={workflowSteps.length > 0 ? handleUpdateStep : handleConfigComplete}
                className="flex-1"
                disabled={(() => {
                  const fields = getConfigFields()
                  return fields.some((field) => field.required && !currentConfig[field.key])
                })()}
              >
                {workflowSteps.length > 0 ? "Update Trigger" : "Add Trigger"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        {/* Delete Confirmation Dialog */}
        <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Delete Trigger</DialogTitle>
              <DialogDescription>
                Are you sure you want to delete this trigger? This action cannot be undone.
              </DialogDescription>
            </DialogHeader>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setShowDeleteDialog(false)} className="flex-1">
                Cancel
              </Button>
              <Button variant="destructive" onClick={confirmDeleteStep} className="flex-1">
                Delete Trigger
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
