"use client"
import { useEffect, useState, useCallback } from "react"
import { useSearchParams, useRouter } from "next/navigation"
import { useWorkflowStore } from "@/stores/workflowStore"
import { useAIStore } from "@/stores/aiStore"
import { useIntegrationStore } from "@/stores/integrationStore"
import { useToast } from "@/hooks/use-toast"

import AppLayout from "@/components/layout/AppLayout"
import { WorkflowOptimizer } from "@/components/ai/WorkflowOptimizer"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Textarea } from "@/components/ui/textarea"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Save, Play, Loader2, Sparkles, Zap, Brain, ArrowLeft, RefreshCw, Plus, Edit, X } from "lucide-react"
import { AIChatAssistant } from "@/components/ai/AIChatAssistant"

// Mock data for available integrations and their actions
const AVAILABLE_INTEGRATIONS = [
  {
    id: "gmail",
    name: "Gmail",
    logo: "https://upload.wikimedia.org/wikipedia/commons/7/7e/Gmail_icon_%282020%29.svg",
    triggers: ["New Email", "Email Received from Specific Sender", "Email with Attachment", "Important Email"],
    actions: ["Send Email", "Reply to Email", "Forward Email"],
  },
  {
    id: "slack",
    name: "Slack",
    logo: "https://upload.wikimedia.org/wikipedia/commons/d/d5/Slack_icon_2019.svg",
    triggers: ["New Message in Channel", "Direct Message Received", "User Mentioned", "File Uploaded"],
    actions: ["Send Message", "Create Channel", "Update Status"],
  },
  {
    id: "notion",
    name: "Notion",
    logo: "https://upload.wikimedia.org/wikipedia/commons/4/45/Notion_app_logo.png",
    triggers: ["New Page Created", "Database Item Added", "Page Updated", "Database Item Updated"],
    actions: ["Create Page", "Update Database", "Add Comment"],
  },
  {
    id: "discord",
    name: "Discord",
    logo: "https://assets-global.website-files.com/6257adef93867e50d84d30e2/636e0a6a49cf127bf92de1e2_icon_clyde_blurple_RGB.png",
    triggers: ["New Message", "User Joined Server", "User Left Server", "Reaction Added"],
    actions: ["Send Message", "Create Channel", "Assign Role"],
  },
  {
    id: "stripe",
    name: "Stripe",
    logo: "https://upload.wikimedia.org/wikipedia/commons/b/ba/Stripe_Logo%2C_revised_2016.svg",
    triggers: ["Payment Received", "Subscription Created", "Payment Failed", "Customer Created"],
    actions: ["Create Customer", "Send Invoice", "Refund Payment"],
  },
  {
    id: "hubspot",
    name: "HubSpot",
    logo: "https://upload.wikimedia.org/wikipedia/commons/3/3f/HubSpot_Logo.svg",
    triggers: ["New Contact", "Deal Updated", "Contact Updated", "Deal Created"],
    actions: ["Create Contact", "Update Deal", "Send Email"],
  },
  {
    id: "github",
    name: "GitHub",
    logo: "https://upload.wikimedia.org/wikipedia/commons/9/91/Octicons-mark-github.svg",
    triggers: ["New Issue", "Pull Request Created", "Push to Repository", "Release Published"],
    actions: ["Create Issue", "Create Pull Request", "Add Comment"],
  },
  {
    id: "google-calendar",
    name: "Google Calendar",
    logo: "https://upload.wikimedia.org/wikipedia/commons/a/a5/Google_Calendar_icon_%282020%29.svg",
    triggers: ["New Event", "Event Updated", "Event Starting Soon", "Event Cancelled"],
    actions: ["Create Event", "Update Event", "Delete Event"],
  },
  {
    id: "google-sheets",
    name: "Google Sheets",
    logo: "https://upload.wikimedia.org/wikipedia/commons/3/30/Google_Sheets_logo_%282014-2020%29.svg",
    triggers: ["New Row Added", "Row Updated", "Cell Changed", "Sheet Created"],
    actions: ["Add Row", "Update Row", "Create Sheet"],
  },
  {
    id: "google-drive",
    name: "Google Drive",
    logo: "https://upload.wikimedia.org/wikipedia/commons/1/12/Google_Drive_icon_%282020%29.svg",
    triggers: ["New File", "File Updated", "File Shared", "Folder Created"],
    actions: ["Upload File", "Create Folder", "Share File"],
  },
  {
    id: "google-docs",
    name: "Google Docs",
    logo: "https://upload.wikimedia.org/wikipedia/commons/0/01/Google_Docs_logo_%282014-2020%29.svg",
    triggers: ["New Document", "Document Updated", "Comment Added", "Document Shared"],
    actions: ["Create Document", "Update Document", "Add Comment"],
  },
  {
    id: "airtable",
    name: "Airtable",
    logo: "https://upload.wikimedia.org/wikipedia/commons/4/4b/Airtable_Logo.svg",
    triggers: ["New Record", "Record Updated", "View Updated", "Base Shared"],
    actions: ["Create Record", "Update Record", "Delete Record"],
  },
  {
    id: "trello",
    name: "Trello",
    logo: "https://upload.wikimedia.org/wikipedia/commons/en/8/8c/Trello_logo.svg",
    triggers: ["New Card", "Card Moved", "Card Updated", "Due Date Approaching"],
    actions: ["Create Card", "Move Card", "Update Card"],
  },
  {
    id: "dropbox",
    name: "Dropbox",
    logo: "https://upload.wikimedia.org/wikipedia/commons/c/cb/Dropbox_logo_2017.svg",
    triggers: ["New File", "File Updated", "File Shared", "Folder Created"],
    actions: ["Upload File", "Create Folder", "Share File"],
  },
  {
    id: "teams",
    name: "Microsoft Teams",
    logo: "https://upload.wikimedia.org/wikipedia/commons/c/c9/Microsoft_Office_Teams_%282018%E2%80%93present%29.svg",
    triggers: ["New Message", "Meeting Started", "File Shared", "Channel Created"],
    actions: ["Send Message", "Schedule Meeting", "Share File"],
  },
  {
    id: "gitlab",
    name: "GitLab",
    logo: "https://about.gitlab.com/images/press/logo/svg/gitlab-logo-500.svg",
    triggers: ["New Issue", "Merge Request Created", "Pipeline Failed", "Push to Branch"],
    actions: ["Create Issue", "Create Merge Request", "Add Comment"],
  },
  {
    id: "facebook",
    name: "Facebook",
    logo: "https://upload.wikimedia.org/wikipedia/commons/5/51/Facebook_f_logo_%282019%29.svg",
    triggers: ["New Post", "Page Mention", "Comment on Post", "New Page Like"],
    actions: ["Create Post", "Reply to Comment", "Share Post"],
  },
  {
    id: "youtube",
    name: "YouTube",
    logo: "https://upload.wikimedia.org/wikipedia/commons/0/09/YouTube_full-color_icon_%282017%29.svg",
    triggers: ["New Video Uploaded", "New Comment", "New Subscriber", "Video Liked"],
    actions: ["Upload Video", "Reply to Comment", "Update Video"],
  },
  {
    id: "mailchimp",
    name: "Mailchimp",
    logo: "https://upload.wikimedia.org/wikipedia/commons/2/27/Mailchimp_Logo.svg",
    triggers: ["New Subscriber", "Email Campaign Sent", "Subscriber Updated", "Unsubscribe"],
    actions: ["Add Subscriber", "Send Campaign", "Update Subscriber"],
  },
  {
    id: "linkedin",
    name: "LinkedIn",
    logo: "https://upload.wikimedia.org/wikipedia/commons/c/ca/LinkedIn_logo_initials.png",
    triggers: ["New Connection", "Post Engagement", "Message Received", "Profile View"],
    actions: ["Create Post", "Send Message", "Connect with User"],
  },
]

const CONDITION_TYPES = [
  { id: "time", name: "Time-based", description: "Wait for a specific time or duration" },
  { id: "field", name: "Field-based", description: "Check if data meets certain criteria" },
  { id: "ai", name: "AI-based", description: "Use AI to make intelligent decisions" },
]

// Define which triggers need configuration
const TRIGGER_CONFIGS = {
  "Email Received from Specific Sender": [
    { key: "sender_email", label: "Sender Email", type: "email", placeholder: "sender@example.com", required: true },
  ],
  "New Message in Channel": [
    {
      key: "channel",
      label: "Channel",
      type: "dynamic_select",
      provider: "slack",
      dataType: "channels",
      placeholder: "Select a channel",
      required: true,
    },
  ],
  "Direct Message Received": [
    {
      key: "from_user",
      label: "From User (optional)",
      type: "dynamic_select",
      provider: "slack",
      dataType: "users",
      placeholder: "Select a user",
      required: false,
    },
  ],
  "User Mentioned": [
    {
      key: "channel",
      label: "Channel (optional)",
      type: "dynamic_select",
      provider: "slack",
      dataType: "channels",
      placeholder: "Select a channel",
      required: false,
    },
  ],
  "New Message": [
    {
      key: "channel_id",
      label: "Channel (optional)",
      type: "dynamic_select",
      provider: "discord",
      dataType: "channels",
      placeholder: "Select a channel",
      required: false,
    },
  ],
  "Database Item Added": [
    {
      key: "database_id",
      label: "Database",
      type: "dynamic_select",
      provider: "notion",
      dataType: "databases",
      placeholder: "Select a database",
      required: true,
    },
  ],
  "Database Item Updated": [
    {
      key: "database_id",
      label: "Database",
      type: "dynamic_select",
      provider: "notion",
      dataType: "databases",
      placeholder: "Select a database",
      required: true,
    },
  ],
  "New Row Added": [
    {
      key: "spreadsheet_id",
      label: "Spreadsheet",
      type: "dynamic_select",
      provider: "google-sheets",
      dataType: "spreadsheets",
      placeholder: "Select a spreadsheet",
      required: true,
    },
    { key: "sheet_name", label: "Sheet Name", type: "text", placeholder: "Sheet1", required: false },
  ],
  "Row Updated": [
    {
      key: "spreadsheet_id",
      label: "Spreadsheet",
      type: "dynamic_select",
      provider: "google-sheets",
      dataType: "spreadsheets",
      placeholder: "Select a spreadsheet",
      required: true,
    },
    { key: "sheet_name", label: "Sheet Name", type: "text", placeholder: "Sheet1", required: false },
  ],
  "New Record": [
    {
      key: "base_id",
      label: "Base",
      type: "dynamic_select",
      provider: "airtable",
      dataType: "bases",
      placeholder: "Select a base",
      required: true,
    },
    { key: "table_name", label: "Table Name", type: "text", placeholder: "Table Name", required: true },
  ],
  "Record Updated": [
    {
      key: "base_id",
      label: "Base",
      type: "dynamic_select",
      provider: "airtable",
      dataType: "bases",
      placeholder: "Select a base",
      required: true,
    },
    { key: "table_name", label: "Table Name", type: "text", placeholder: "Table Name", required: true },
  ],
  "New Card": [
    {
      key: "board_id",
      label: "Board",
      type: "dynamic_select",
      provider: "trello",
      dataType: "boards",
      placeholder: "Select a board",
      required: true,
    },
    { key: "list_name", label: "List Name (optional)", type: "text", placeholder: "To Do", required: false },
  ],
  "Card Moved": [
    {
      key: "board_id",
      label: "Board",
      type: "dynamic_select",
      provider: "trello",
      dataType: "boards",
      placeholder: "Select a board",
      required: true,
    },
  ],
  "Push to Repository": [
    {
      key: "repository",
      label: "Repository",
      type: "dynamic_select",
      provider: "github",
      dataType: "repositories",
      placeholder: "Select a repository",
      required: true,
    },
    { key: "branch", label: "Branch (optional)", type: "text", placeholder: "main", required: false },
  ],
  "New Issue": [
    {
      key: "repository",
      label: "Repository",
      type: "dynamic_select",
      provider: "github",
      dataType: "repositories",
      placeholder: "Select a repository",
      required: true,
    },
  ],
  "Pull Request Created": [
    {
      key: "repository",
      label: "Repository",
      type: "dynamic_select",
      provider: "github",
      dataType: "repositories",
      placeholder: "Select a repository",
      required: true,
    },
  ],
  "Event Updated": [
    {
      key: "calendar_id",
      label: "Calendar",
      type: "dynamic_select",
      provider: "google-calendar",
      dataType: "calendars",
      placeholder: "Select a calendar",
      required: false,
    },
  ],
  "Event Starting Soon": [
    { key: "minutes_before", label: "Minutes Before", type: "number", placeholder: "15", required: true },
    {
      key: "calendar_id",
      label: "Calendar",
      type: "dynamic_select",
      provider: "google-calendar",
      dataType: "calendars",
      placeholder: "Select a calendar",
      required: false,
    },
  ],
  "Deal Updated": [
    {
      key: "pipeline_id",
      label: "Pipeline",
      type: "dynamic_select",
      provider: "hubspot",
      dataType: "pipelines",
      placeholder: "Select a pipeline",
      required: false,
    },
    { key: "stage", label: "Deal Stage (optional)", type: "text", placeholder: "qualified", required: false },
  ],
  "Deal Created": [
    {
      key: "pipeline_id",
      label: "Pipeline",
      type: "dynamic_select",
      provider: "hubspot",
      dataType: "pipelines",
      placeholder: "Select a pipeline",
      required: false,
    },
    { key: "amount_min", label: "Minimum Amount", type: "number", placeholder: "1000", required: false },
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
  const { integrations, fetchIntegrations, connectIntegration } = useIntegrationStore()

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

  const [dynamicData, setDynamicData] = useState<Record<string, any[]>>({})

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
    const integration = integrations.find((i) => i.provider === app.id)

    if (!integration || integration.status !== "connected") {
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
          config: {}, // Empty config for simple triggers
          isConfigured: true,
        }

        const newSteps = [...workflowSteps]
        newSteps.splice(currentStepIndex, 0, newStep)
        setWorkflowSteps(newSteps)

        // Close modals and reset state
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
      // Convert workflow steps to the format expected by the backend
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

  const getConfigFields = () => {
    const [options, setOptions] = useState<any[]>([])
    const [isLoading, setIsLoading] = useState(false)

    const fetchDynamicData = useCallback(
      async (field: any) => {
        const cacheKey = `${field.provider}-${field.dataType}`

        if (dynamicData[cacheKey]) {
          setOptions(dynamicData[cacheKey])
          return
        }

        setIsLoading(true)
        try {
          const response = await fetch("/api/integrations/fetch-user-data", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ provider: field.provider, dataType: field.dataType }),
          })

          const result = await response.json()

          if (result.success) {
            setOptions(result.data)
            setDynamicData((prev) => ({ ...prev, [cacheKey]: result.data }))
          } else {
            console.error("Failed to fetch dynamic data:", result.error)
          }
        } catch (error) {
          console.error("Error fetching dynamic data:", error)
        } finally {
          setIsLoading(false)
        }
      },
      [dynamicData],
    )

    if (currentStepIndex === 0) {
      // For triggers
      return TRIGGER_CONFIGS[selectedAction as keyof typeof TRIGGER_CONFIGS] || []
    } else {
      // For actions - return existing action config fields
      if (selectedAction === "Send Email") {
        return [
          { key: "to", label: "To", type: "email", placeholder: "recipient@example.com", required: true },
          { key: "subject", label: "Subject", type: "text", placeholder: "Email subject", required: true },
          { key: "body", label: "Body", type: "textarea", placeholder: "Email content...", required: true },
        ]
      } else if (selectedAction === "Send Message") {
        if (selectedApp?.id === "slack") {
          return [
            {
              key: "channel",
              label: "Channel",
              type: "dynamic_select",
              provider: "slack",
              dataType: "channels",
              placeholder: "Select a channel",
              required: true,
            },
            { key: "message", label: "Message", type: "textarea", placeholder: "Your message...", required: true },
          ]
        } else if (selectedApp?.id === "discord") {
          return [
            {
              key: "channel_id",
              label: "Channel",
              type: "dynamic_select",
              provider: "discord",
              dataType: "channels",
              placeholder: "Select a channel",
              required: true,
            },
            { key: "message", label: "Message", type: "textarea", placeholder: "Your message...", required: true },
          ]
        } else if (selectedApp?.id === "teams") {
          return [
            {
              key: "team_id",
              label: "Team",
              type: "dynamic_select",
              provider: "teams",
              dataType: "teams",
              placeholder: "Select a team",
              required: true,
            },
            { key: "message", label: "Message", type: "textarea", placeholder: "Your message...", required: true },
          ]
        }
        return [
          { key: "channel", label: "Channel", type: "text", placeholder: "#general", required: true },
          { key: "message", label: "Message", type: "textarea", placeholder: "Your message...", required: true },
        ]
      } else if (selectedAction === "Create Page") {
        return [
          { key: "title", label: "Page Title", type: "text", placeholder: "Page title", required: true },
          { key: "content", label: "Content", type: "textarea", placeholder: "Page content...", required: false },
        ]
      } else if (selectedAction === "Create Contact") {
        return [
          { key: "email", label: "Email", type: "email", placeholder: "contact@example.com", required: true },
          { key: "first_name", label: "First Name", type: "text", placeholder: "John", required: false },
          { key: "last_name", label: "Last Name", type: "text", placeholder: "Doe", required: false },
          { key: "company", label: "Company", type: "text", placeholder: "Company Name", required: false },
        ]
      } else if (selectedAction === "Update Deal") {
        return [
          {
            key: "pipeline_id",
            label: "Pipeline",
            type: "dynamic_select",
            provider: "hubspot",
            dataType: "pipelines",
            placeholder: "Select a pipeline",
            required: false,
          },
          { key: "deal_name", label: "Deal Name", type: "text", placeholder: "Deal Name", required: true },
          { key: "amount", label: "Amount", type: "number", placeholder: "1000", required: false },
          { key: "stage", label: "Stage", type: "text", placeholder: "qualified", required: false },
        ]
      } else if (selectedAction === "Create Event") {
        return [
          {
            key: "calendar_id",
            label: "Calendar",
            type: "dynamic_select",
            provider: "google-calendar",
            dataType: "calendars",
            placeholder: "Select a calendar",
            required: false,
          },
          { key: "title", label: "Event Title", type: "text", placeholder: "Meeting Title", required: true },
          { key: "start_time", label: "Start Time", type: "datetime-local", placeholder: "", required: true },
          { key: "end_time", label: "End Time", type: "datetime-local", placeholder: "", required: true },
          {
            key: "description",
            label: "Description",
            type: "textarea",
            placeholder: "Event description...",
            required: false,
          },
        ]
      } else if (selectedAction === "Add Row") {
        return [
          {
            key: "spreadsheet_id",
            label: "Spreadsheet",
            type: "dynamic_select",
            provider: "google-sheets",
            dataType: "spreadsheets",
            placeholder: "Select a spreadsheet",
            required: true,
          },
          { key: "sheet_name", label: "Sheet Name", type: "text", placeholder: "Sheet1", required: false },
          {
            key: "values",
            label: "Values (comma-separated)",
            type: "text",
            placeholder: "Value1, Value2, Value3",
            required: true,
          },
        ]
      } else if (selectedAction === "Create Record") {
        return [
          {
            key: "base_id",
            label: "Base",
            type: "dynamic_select",
            provider: "airtable",
            dataType: "bases",
            placeholder: "Select a base",
            required: true,
          },
          { key: "table_name", label: "Table Name", type: "text", placeholder: "Table Name", required: true },
          {
            key: "fields",
            label: "Fields (JSON)",
            type: "textarea",
            placeholder: '{"Name": "John", "Email": "john@example.com"}',
            required: true,
          },
        ]
      } else if (selectedAction === "Create Card") {
        return [
          {
            key: "board_id",
            label: "Board",
            type: "dynamic_select",
            provider: "trello",
            dataType: "boards",
            placeholder: "Select a board",
            required: true,
          },
          { key: "list_name", label: "List Name", type: "text", placeholder: "To Do", required: true },
          { key: "card_name", label: "Card Name", type: "text", placeholder: "Task Name", required: true },
          {
            key: "description",
            label: "Description",
            type: "textarea",
            placeholder: "Task description...",
            required: false,
          },
        ]
      } else if (selectedAction === "Create Issue") {
        return [
          {
            key: "repository",
            label: "Repository",
            type: "dynamic_select",
            provider: "github",
            dataType: "repositories",
            placeholder: "Select a repository",
            required: true,
          },
          { key: "title", label: "Issue Title", type: "text", placeholder: "Bug report", required: true },
          { key: "body", label: "Issue Body", type: "textarea", placeholder: "Describe the issue...", required: false },
          {
            key: "labels",
            label: "Labels (comma-separated)",
            type: "text",
            placeholder: "bug, urgent",
            required: false,
          },
        ]
      } else if (selectedAction === "Upload File") {
        if (selectedApp?.id === "google-drive") {
          return [
            {
              key: "folder_id",
              label: "Folder",
              type: "dynamic_select",
              provider: "google-drive",
              dataType: "folders",
              placeholder: "Select a folder",
              required: false,
            },
            { key: "file_name", label: "File Name", type: "text", placeholder: "document.pdf", required: true },
            {
              key: "file_content",
              label: "File Content/URL",
              type: "text",
              placeholder: "File content or URL",
              required: true,
            },
          ]
        }
        return [
          { key: "file_name", label: "File Name", type: "text", placeholder: "document.pdf", required: true },
          {
            key: "file_content",
            label: "File Content/URL",
            type: "text",
            placeholder: "File content or URL",
            required: true,
          },
        ]
      } else if (selectedAction === "Send Campaign") {
        return [
          {
            key: "list_id",
            label: "Mailing List",
            type: "dynamic_select",
            provider: "mailchimp",
            dataType: "lists",
            placeholder: "Select a mailing list",
            required: true,
          },
          { key: "subject", label: "Subject", type: "text", placeholder: "Newsletter Subject", required: true },
          { key: "content", label: "Content", type: "textarea", placeholder: "Email content...", required: true },
        ]
      } else if (selectedAction === "Time-based") {
        return [
          {
            key: "delayType",
            label: "Delay Type",
            type: "select",
            options: ["minutes", "hours", "days", "specific"],
            required: true,
          },
          {
            key: "delayValue",
            label: "Delay Value",
            type: "number",
            placeholder: "Enter delay amount",
            required: true,
          },
        ]
      } else if (selectedAction === "Field-based") {
        return [
          {
            key: "field",
            label: "Field to Check",
            type: "text",
            placeholder: "e.g., email, status, amount",
            required: true,
          },
          {
            key: "operator",
            label: "Operator",
            type: "select",
            options: ["equals", "contains", "greater", "less"],
            required: true,
          },
          { key: "value", label: "Value", type: "text", placeholder: "Value to compare against", required: true },
        ]
      } else if (selectedAction === "AI-based") {
        return [
          {
            key: "prompt",
            label: "AI Prompt",
            type: "textarea",
            placeholder: "Describe what the AI should check for...",
            required: true,
          },
          {
            key: "confidence",
            label: "Confidence Threshold",
            type: "select",
            options: ["low", "medium", "high"],
            required: false,
          },
        ]
      }
      return []
    }
  }

  const renderConfigField = (field: any) => {
    const cacheKey = `${field.provider}-${field.dataType}`
    const [options, setOptions] = useState<any[]>([])
    const [isLoading, setIsLoading] = useState(false)

    useEffect(() => {
      if (field.provider && field.dataType) {
        const fetchData = async () => {
          if (dynamicData[cacheKey]) {
            setOptions(dynamicData[cacheKey])
            return
          }

          setIsLoading(true)
          try {
            const response = await fetch("/api/integrations/fetch-user-data", {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
              },
              body: JSON.stringify({ provider: field.provider, dataType: field.dataType }),
            })

            const result = await response.json()

            if (result.success) {
              setOptions(result.data)
              setDynamicData((prev) => ({ ...prev, [cacheKey]: result.data }))
            } else {
              console.error("Failed to fetch dynamic data:", result.error)
            }
          } catch (error) {
            console.error("Error fetching dynamic data:", error)
          } finally {
            setIsLoading(false)
          }
        }

        fetchData()
      }
    }, [field.provider, field.dataType, cacheKey, dynamicData])

    if (field.type === "dynamic_select") {
      return (
        <Select
          value={currentConfig[field.key] || ""}
          onValueChange={(value) => setCurrentConfig({ ...currentConfig, [field.key]: value })}
          disabled={isLoading}
        >
          <SelectTrigger>
            <SelectValue placeholder={isLoading ? "Loading..." : field.placeholder} />
          </SelectTrigger>
          <SelectContent>
            {options.map((option: any) => (
              <SelectItem key={option.id || option.value} value={option.id || option.value}>
                {option.name || option.label || option.title}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )
    } else if (field.type === "select") {
      return (
        <Select
          value={currentConfig[field.key] || ""}
          onValueChange={(value) => setCurrentConfig({ ...currentConfig, [field.key]: value })}
        >
          <SelectTrigger>
            <SelectValue placeholder={`Select ${field.label.toLowerCase()}`} />
          </SelectTrigger>
          <SelectContent>
            {field.options?.map((option: string) => (
              <SelectItem key={option} value={option}>
                {option.charAt(0).toUpperCase() + option.slice(1)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
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
    } else {
      // Check if action has configurable options
      const configurableActions = [
        "Send Email",
        "Send Message",
        "Create Page",
        "Time-based",
        "Field-based",
        "AI-based",
        "Create Contact",
        "Update Deal",
        "Create Issue",
        "Create Pull Request",
        "Add Comment",
        "Create Event",
        "Update Event",
        "Delete Event",
        "Add Row",
        "Update Row",
        "Create Sheet",
        "Upload File",
        "Create Folder",
        "Share File",
        "Create Document",
        "Update Document",
        "Create Record",
        "Update Record",
        "Delete Record",
        "Create Card",
        "Move Card",
        "Update Card",
        "Schedule Meeting",
        "Create Merge Request",
        "Create Post",
        "Reply to Comment",
        "Share Post",
        "Upload Video",
        "Update Video",
        "Add Subscriber",
        "Send Campaign",
        "Update Subscriber",
        "Connect with User",
        "Reply to Email",
        "Forward Email",
        "Create Channel",
        "Update Status",
        "Update Database",
        "Create Customer",
        "Send Invoice",
        "Refund Payment",
        "Assign Role",
      ]
      return configurableActions.includes(step.actionName)
    }
  }

  return (
    <AppLayout>
      <div className="container mx-auto p-6">
        <div className="mb-6 flex items-center justify-between">
          <Button variant="ghost" onClick={handleBack}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Workflows
          </Button>
          <div className="flex items-center space-x-2">
            <Button variant="outline" onClick={() => setShowAIGenerator(true)}>
              <Brain className="mr-2 h-4 w-4" />
              Generate with AI
            </Button>
            <Button variant="outline" onClick={() => setShowOptimizer(true)}>
              <Sparkles className="mr-2 h-4 w-4" />
              Optimize
            </Button>
            <Button onClick={handleTest} disabled={testing}>
              {testing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Play className="mr-2 h-4 w-4" />}
              Test Workflow
            </Button>
            <Button onClick={handleSave} disabled={saving || !hasUnsavedChanges}>
              {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
              Save Workflow
            </Button>
          </div>
        </div>

        <div className="mb-6">
          <h1 className="text-3xl font-bold">Workflow Builder</h1>
          <p className="text-muted-foreground">Build powerful automations by connecting your favorite apps</p>
        </div>

        {/* Integration Status Alert */}
        {connectedIntegrationsCount < integrations.length && (
          <Card className="mb-6 border-orange-200 bg-orange-50">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <div className="h-2 w-2 rounded-full bg-orange-500" />
                  <p className="text-sm font-medium">
                    {connectedIntegrationsCount} of {integrations.length} integrations connected
                  </p>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleRefreshIntegrations}
                  disabled={refreshingIntegrations}
                >
                  {refreshingIntegrations ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <RefreshCw className="mr-2 h-4 w-4" />
                  )}
                  Refresh
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Optimization Suggestions */}
        {workflowOptimizations.length > 0 && (
          <Card className="mb-6 border-blue-200 bg-blue-50">
            <CardContent className="p-4">
              <div className="flex items-start justify-between">
                <div className="space-y-2">
                  <div className="flex items-center space-x-2">
                    <Zap className="h-4 w-4 text-blue-600" />
                    <p className="text-sm font-medium text-blue-900">Optimization Suggestions Available</p>
                  </div>
                  <ul className="space-y-1">
                    {workflowOptimizations.slice(0, 2).map((opt, index) => (
                      <li key={index} className="text-sm text-blue-800">
                        • {opt.description}
                      </li>
                    ))}
                  </ul>
                </div>
                <Button size="sm" variant="outline" onClick={() => setShowOptimizer(true)}>
                  View All
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Workflow Steps */}
        <div className="space-y-4">
          {workflowSteps.length === 0 ? (
            <Card className="border-dashed">
              <CardContent className="flex flex-col items-center justify-center py-12">
                <div className="text-center">
                  <h3 className="text-lg font-semibold mb-2">Start Building Your Workflow</h3>
                  <p className="text-muted-foreground mb-4">Add your first step to get started</p>
                  <Button onClick={() => handleAddStep(0)}>
                    <Plus className="mr-2 h-4 w-4" />
                    Add First Step
                  </Button>
                </div>
              </CardContent>
            </Card>
          ) : (
            <>
              {workflowSteps.map((step, index) => (
                <div key={step.id} className="relative">
                  <Card>
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-4">
                          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-primary-foreground text-sm font-medium">
                            {index + 1}
                          </div>
                          <div>
                            <h3 className="font-semibold">{step.actionName}</h3>
                            <p className="text-sm text-muted-foreground">{step.appName}</p>
                            {hasConfigurableOptions(step) && (
                              <Badge
                                variant={Object.keys(step.config).length > 0 ? "default" : "secondary"}
                                className="mt-1"
                              >
                                {Object.keys(step.config).length > 0 ? "Configured" : "Needs Configuration"}
                              </Badge>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center space-x-2">
                          <Button size="sm" variant="outline" onClick={() => handleEditStep(index)}>
                            <Edit className="h-4 w-4" />
                          </Button>
                          <Button size="sm" variant="outline" onClick={() => handleDeleteStep(index)}>
                            <X className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                  {index < workflowSteps.length - 1 && (
                    <div className="flex justify-center py-2">
                      <div className="h-6 w-px bg-border" />
                    </div>
                  )}
                </div>
              ))}
              <div className="flex justify-center">
                <Button variant="outline" onClick={() => handleAddStep(workflowSteps.length)}>
                  <Plus className="mr-2 h-4 w-4" />
                  Add Step
                </Button>
              </div>
            </>
          )}
        </div>
      </div>

      {/* All the existing modals remain the same */}
      {/* App Selector Modal */}
      <Dialog open={showAppSelector} onOpenChange={setShowAppSelector}>
        <DialogContent className="sm:max-w-[600px]">
          <DialogHeader>
            <DialogTitle>Choose an App</DialogTitle>
            <DialogDescription>Select the app you want to use for this workflow step.</DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-4 py-4">
            {AVAILABLE_INTEGRATIONS.map((app) => {
              const integration = integrations.find((i) => i.provider === app.id)
              const isConnected = integration?.status === "connected"

              return (
                <Button
                  key={app.id}
                  variant="outline"
                  className="h-auto p-4 justify-start"
                  onClick={() => handleAppSelected(app)}
                >
                  <div className="flex items-center space-x-3">
                    <img src={app.logo || "/placeholder.svg"} alt={app.name} className="h-8 w-8" />
                    <div className="text-left">
                      <div className="font-medium">{app.name}</div>
                      <div className="text-xs text-muted-foreground">{isConnected ? "Connected" : "Not connected"}</div>
                    </div>
                  </div>
                </Button>
              )
            })}
          </div>
        </DialogContent>
      </Dialog>

      {/* Action Selector Modal */}
      <Dialog open={showActionSelector} onOpenChange={setShowActionSelector}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Choose an Action</DialogTitle>
            <DialogDescription>What do you want to do with {selectedApp?.name}?</DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-4">
            {currentStepIndex === 0
              ? // Show triggers for first step
                selectedApp?.triggers.map((trigger) => (
                  <Button
                    key={trigger}
                    variant="outline"
                    className="w-full justify-start"
                    onClick={() => handleActionSelected(trigger)}
                  >
                    {trigger}
                  </Button>
                ))
              : // Show actions for subsequent steps
                selectedApp?.actions.map((action) => (
                  <Button
                    key={action}
                    variant="outline"
                    className="w-full justify-start"
                    onClick={() => handleActionSelected(action)}
                  >
                    {action}
                  </Button>
                ))}
          </div>
        </DialogContent>
      </Dialog>

      {/* Configuration Modal */}
      <Dialog open={showConfigModal} onOpenChange={setShowConfigModal}>
        <DialogContent className="sm:max-w-[600px]">
          <DialogHeader>
            <DialogTitle>Configure {selectedAction}</DialogTitle>
            <DialogDescription>
              Set up the configuration for {selectedAction} with {selectedApp?.name}.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            {getConfigFields().map((field) => (
              <div key={field.key} className="space-y-2">
                <Label htmlFor={field.key}>
                  {field.label}
                  {field.required && <span className="text-red-500 ml-1">*</span>}
                </Label>
                {renderConfigField(field)}
              </div>
            ))}
          </div>
          <div className="flex justify-end space-x-2">
            <Button variant="outline" onClick={() => setShowConfigModal(false)}>
              Cancel
            </Button>
            <Button onClick={handleConfigComplete}>
              {currentStepIndex >= 0 && workflowSteps[currentStepIndex] ? "Update Step" : "Add Step"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* AI Generator Modal */}
      <Dialog open={showAIGenerator} onOpenChange={setShowAIGenerator}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Generate Workflow with AI</DialogTitle>
            <DialogDescription>
              Describe what you want your workflow to do, and AI will create it for you.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <Textarea
              placeholder="Example: When I receive an email from a client, create a task in Trello and send a Slack notification to my team..."
              value={aiPrompt}
              onChange={(e) => setAiPrompt(e.target.value)}
              rows={4}
            />
          </div>
          <div className="flex justify-end space-x-2">
            <Button variant="outline" onClick={() => setShowAIGenerator(false)}>
              Cancel
            </Button>
            <Button onClick={handleGenerateWithAI} disabled={generatingAI || !aiPrompt.trim()}>
              {generatingAI ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Brain className="mr-2 h-4 w-4" />}
              Generate Workflow
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Workflow Optimizer Modal */}
      <Dialog open={showOptimizer} onOpenChange={setShowOptimizer}>
        <DialogContent className="sm:max-w-[800px]">
          <DialogHeader>
            <DialogTitle>Workflow Optimizer</DialogTitle>
            <DialogDescription>
              AI-powered suggestions to improve your workflow performance and reliability.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <WorkflowOptimizer workflowId={currentWorkflow?.id || ""} />
          </div>
        </DialogContent>
      </Dialog>

      {/* Exit Confirmation Dialog */}
      <Dialog open={showExitDialog} onOpenChange={setShowExitDialog}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle>Unsaved Changes</DialogTitle>
            <DialogDescription>You have unsaved changes to your workflow. What would you like to do?</DialogDescription>
          </DialogHeader>
          <div className="flex justify-end space-x-2 pt-4">
            <Button variant="outline" onClick={handleDiscardAndExit}>
              Discard Changes
            </Button>
            <Button onClick={handleSaveAndExit}>Save & Exit</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Connect App Modal */}
      <Dialog open={showConnectModal} onOpenChange={setShowConnectModal}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle>Connect {selectedApp?.name}</DialogTitle>
            <DialogDescription>
              You need to connect your {selectedApp?.name} account to use this integration in your workflow.
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end space-x-2 pt-4">
            <Button variant="outline" onClick={() => setShowConnectModal(false)}>
              Cancel
            </Button>
            <Button onClick={() => handleConnectApp(selectedApp?.id)}>Connect {selectedApp?.name}</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle>Delete Step</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete this workflow step? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end space-x-2 pt-4">
            <Button variant="outline" onClick={() => setShowDeleteDialog(false)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={confirmDeleteStep}>
              Delete Step
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <AIChatAssistant />
    </AppLayout>
  )
}
