"use client"
import { useEffect, useState, useCallback } from "react"
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
} from "lucide-react"
import { useToast } from "@/hooks/use-toast"

// Mock data for available integrations and their actions
const AVAILABLE_INTEGRATIONS = [
  {
    id: "gmail",
    name: "Gmail",
    logo: "https://upload.wikimedia.org/wikipedia/commons/7/7e/Gmail_icon_%282020%29.svg",
    triggers: [
      "New Email",
      "Email Received from Specific Sender",
      "Email Received from Specific Sender",
      "Email with Attachment",
      "Important Email",
    ],
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
    logo: "https://upload.wikimedia.org/wikipedia/en/8/8c/Trello_logo.svg",
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
  "Email with Attachment": [
    {
      key: "attachment_type",
      label: "Attachment Type (optional)",
      type: "select",
      options: ["any", "pdf", "image", "document"],
      required: false,
    },
    { key: "min_size_mb", label: "Minimum Size (MB)", type: "number", placeholder: "1", required: false },
  ],
  "Important Email": [
    { key: "importance_level", label: "Importance Level", type: "select", options: ["high", "normal"], required: true },
    { key: "keywords", label: "Keywords (optional)", type: "text", placeholder: "urgent, important", required: false },
  ],
  "File Uploaded": [
    { key: "channel", label: "Channel (optional)", type: "text", placeholder: "#general", required: false },
    {
      key: "file_type",
      label: "File Type (optional)",
      type: "select",
      options: ["any", "image", "document", "video"],
      required: false,
    },
  ],
  "Page Updated": [
    {
      key: "page_id",
      label: "Page",
      type: "dynamic_select",
      provider: "notion",
      dataType: "pages",
      placeholder: "Select a page",
      required: false,
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
  "Cell Changed": [
    { key: "spreadsheet_id", label: "Spreadsheet ID", type: "text", placeholder: "Spreadsheet ID", required: true },
    { key: "range", label: "Cell Range (optional)", type: "text", placeholder: "A1:Z100", required: false },
  ],
  "File Shared": [
    { key: "folder_path", label: "Folder Path (optional)", type: "text", placeholder: "/folder/path", required: false },
    { key: "share_type", label: "Share Type", type: "select", options: ["anyone", "specific"], required: false },
  ],
  "Comment Added": [
    { key: "document_id", label: "Document ID (optional)", type: "text", placeholder: "Document ID", required: false },
  ],
  "Document Shared": [
    { key: "document_id", label: "Document ID (optional)", type: "text", placeholder: "Document ID", required: false },
  ],
  "Due Date Approaching": [
    { key: "board_id", label: "Board ID", type: "text", placeholder: "Board ID", required: true },
    { key: "days_before", label: "Days Before", type: "number", placeholder: "1", required: true },
  ],
  "Card Updated": [
    { key: "board_id", label: "Board ID", type: "text", placeholder: "Board ID", required: true },
    { key: "list_name", label: "List Name (optional)", type: "text", placeholder: "In Progress", required: false },
  ],
  "Pipeline Failed": [
    { key: "repository", label: "Repository", type: "text", placeholder: "owner/repo", required: true },
    { key: "branch", label: "Branch (optional)", type: "text", placeholder: "main", required: false },
  ],
  "Merge Request Created": [
    { key: "repository", label: "Repository", type: "text", placeholder: "owner/repo", required: true },
    { key: "target_branch", label: "Target Branch (optional)", type: "text", placeholder: "main", required: false },
  ],
  "Release Published": [
    { key: "repository", label: "Repository", type: "text", placeholder: "owner/repo", required: true },
    { key: "prerelease", label: "Include Prereleases", type: "select", options: ["yes", "no"], required: false },
  ],
  "User Joined Server": [
    { key: "server_id", label: "Server ID (optional)", type: "text", placeholder: "Server ID", required: false },
  ],
  "User Left Server": [
    { key: "server_id", label: "Server ID (optional)", type: "text", placeholder: "Server ID", required: false },
  ],
  "Reaction Added": [
    { key: "channel_id", label: "Channel ID (optional)", type: "text", placeholder: "Channel ID", required: false },
    { key: "emoji", label: "Specific Emoji (optional)", type: "text", placeholder: "👍", required: false },
  ],
  "Subscription Created": [
    { key: "plan_id", label: "Plan ID (optional)", type: "text", placeholder: "price_xxx", required: false },
    { key: "amount_min", label: "Minimum Amount (cents)", type: "number", placeholder: "1000", required: false },
  ],
  "Payment Failed": [
    { key: "amount_min", label: "Minimum Amount (cents)", type: "number", placeholder: "1000", required: false },
    {
      key: "failure_code",
      label: "Failure Code (optional)",
      type: "text",
      placeholder: "card_declined",
      required: false,
    },
  ],
  "Customer Created": [
    {
      key: "email_domain",
      label: "Email Domain (optional)",
      type: "text",
      placeholder: "company.com",
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
  "Contact Updated": [
    { key: "property", label: "Property Changed (optional)", type: "text", placeholder: "email", required: false },
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

  // Dynamic data states - moved to top level
  const [dynamicData, setDynamicData] = useState<Record<string, any[]>>({})
  const [fieldLoadingStates, setFieldLoadingStates] = useState<Record<string, boolean>>({})
  const [preloadingData, setPreloadingData] = useState(false)

  // Get all possible dynamic data types that could be needed
  const getAllDynamicDataTypes = useCallback(() => {
    const dataTypes: Array<{ provider: string; dataType: string }> = []

    // Add all dynamic selects from trigger configs
    Object.values(TRIGGER_CONFIGS).forEach((config) => {
      config.forEach((field) => {
        if (field.type === "dynamic_select" && field.provider && field.dataType) {
          dataTypes.push({ provider: field.provider, dataType: field.dataType })
        }
      })
    })

    // Add common action dynamic selects
    const actionDataTypes = [
      { provider: "slack", dataType: "channels" },
      { provider: "slack", dataType: "users" },
      { provider: "discord", dataType: "channels" },
      { provider: "notion", dataType: "databases" },
      { provider: "notion", dataType: "pages" },
      { provider: "google-sheets", dataType: "spreadsheets" },
      { provider: "google-calendar", dataType: "calendars" },
      { provider: "google-drive", dataType: "folders" },
      { provider: "airtable", dataType: "bases" },
      { provider: "trello", dataType: "boards" },
      { provider: "github", dataType: "repositories" },
      { provider: "hubspot", dataType: "pipelines" },
      { provider: "teams", dataType: "teams" },
      { provider: "mailchimp", dataType: "lists" },
    ]

    dataTypes.push(...actionDataTypes)

    // Remove duplicates
    return dataTypes.filter(
      (item, index, self) =>
        index === self.findIndex((t) => t.provider === item.provider && t.dataType === item.dataType),
    )
  }, [])

  // Fetch dynamic data function
  const fetchDynamicData = useCallback(
    async (provider: string, dataType: string) => {
      const cacheKey = `${provider}-${dataType}`

      // Check if we already have this data or are currently loading it
      if (dynamicData[cacheKey] || fieldLoadingStates[cacheKey]) {
        return
      }

      setFieldLoadingStates((prev) => ({ ...prev, [cacheKey]: true }))

      try {
        const response = await fetch("/api/integrations/fetch-user-data", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ provider, dataType }),
        })

        const result = await response.json()

        if (result.success) {
          const options = result.data || []
          setDynamicData((prev) => ({ ...prev, [cacheKey]: options }))
        } else {
          console.error("Failed to fetch dynamic data:", result.error)
          setDynamicData((prev) => ({ ...prev, [cacheKey]: [] }))
        }
      } catch (error) {
        console.error("Error fetching dynamic data:", error)
        setDynamicData((prev) => ({ ...prev, [cacheKey]: [] }))
      } finally {
        setFieldLoadingStates((prev) => ({ ...prev, [cacheKey]: false }))
      }
    },
    [dynamicData, fieldLoadingStates],
  )

  // Pre-load all integration data when component mounts
  const preloadAllIntegrationData = useCallback(async () => {
    if (preloadingData) return

    setPreloadingData(true)
    const allDataTypes = getAllDynamicDataTypes()

    // Only fetch data for connected integrations
    const connectedProviders = integrations.filter((i) => i.status === "connected").map((i) => i.provider)

    const relevantDataTypes = allDataTypes.filter((dt) => connectedProviders.includes(dt.provider))

    // Fetch all data types in parallel, but limit concurrency
    const batchSize = 3
    for (let i = 0; i < relevantDataTypes.length; i += batchSize) {
      const batch = relevantDataTypes.slice(i, i + batchSize)
      await Promise.all(batch.map(({ provider, dataType }) => fetchDynamicData(provider, dataType)))
    }

    setPreloadingData(false)
  }, [integrations, getAllDynamicDataTypes, fetchDynamicData, preloadingData])

  // Pre-fetch dynamic data when config modal opens (fallback)
  useEffect(() => {
    if (showConfigModal && selectedAction && selectedApp) {
      const fields = getConfigFields()

      fields.forEach((field) => {
        if (field.type === "dynamic_select" && field.provider && field.dataType) {
          fetchDynamicData(field.provider, field.dataType)
        }
      })
    }
  }, [showConfigModal, selectedAction, selectedApp, fetchDynamicData])

  // Fetch integrations on mount
  useEffect(() => {
    fetchIntegrations()
  }, [fetchIntegrations])

  // Pre-load integration data when integrations are loaded
  useEffect(() => {
    if (integrations.length > 0 && !preloadingData) {
      preloadAllIntegrationData()
    }
  }, [integrations, preloadAllIntegrationData, preloadingData])

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
      // Re-preload data after refresh
      await preloadAllIntegrationData()
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

  // Update the getConfigFields function to include dynamic selects for actions
  const getConfigFields = () => {
    if (currentStepIndex === 0) {
      // For triggers
      return TRIGGER_CONFIGS[selectedAction as keyof typeof TRIGGER_CONFIGS] || []
    } else {
      // For actions - return existing action config fields with dynamic selects
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

  // Simplified renderConfigField function - no hooks inside
  const renderConfigField = (field: any) => {
    if (field.type === "dynamic_select") {
      const cacheKey = `${field.provider}-${field.dataType}`
      const options = dynamicData[cacheKey] || []
      const isLoading = fieldLoadingStates[cacheKey] || false

      return (
        <Select
          value={currentConfig[field.key] || ""}
          onValueChange={(value) => setCurrentConfig({ ...currentConfig, [field.key]: value })}
          disabled={isLoading}
        >
          <SelectTrigger>
            <SelectValue placeholder={isLoading ? "Loading..." : field.placeholder} />
          </SelectTrigger>
          <SelectContent side="bottom" align="start" className="max-h-[200px] overflow-y-auto" sideOffset={4}>
            {options.length === 0 && !isLoading ? (
              <div className="p-2 text-sm text-muted-foreground">No items found</div>
            ) : (
              options.map((option: any) => (
                <SelectItem key={option.id || option.value} value={option.id || option.value}>
                  {option.name || option.label || option.title}
                </SelectItem>
              ))
            )}
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
          <SelectContent side="bottom" align="start" className="max-h-[200px] overflow-y-auto" sideOffset={4}>
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
        "Send Email", // HubSpot
        "Create Issue",
        "Create Pull Request",
        "Add Comment", // GitHub
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
        "Add Comment", // Google Docs
        "Create Record",
        "Update Record",
        "Delete Record",
        "Create Card",
        "Move Card",
        "Update Card",
        "Schedule Meeting",
        "Share File", // Teams
        "Create Merge Request",
        "Add Comment", // GitLab
        "Create Post",
        "Reply to Comment",
        "Share Post",
        "Upload Video",
        "Reply to Comment", // YouTube
        "Update Video",
        "Add Subscriber",
        "Send Campaign",
        "Update Subscriber",
        "Create Post", // LinkedIn
        "Send Message", // LinkedIn
        "Connect with User",
        "Reply to Email",
        "Forward Email",
        "Create Channel", // Slack
        "Update Status",
        "Update Database",
        "Add Comment", // Notion
        "Create Customer",
        "Send Invoice",
        "Refund Payment",
        "Assign Role", // Discord
      ]
      return configurableActions.includes(step.actionName)
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
                placeholder="e.g., Send Slack notifications when new emails arrive from important clients"
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
        {/* Keep existing toolbar exactly as is */}
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
            <div className="flex items-center gap-2 px-3 py-1 bg-slate-50 rounded-lg text-sm text-slate-600">
              <span>{connectedIntegrationsCount} integrations</span>
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

            {preloadingData && (
              <div className="flex items-center gap-2 px-3 py-1 bg-blue-50 rounded-lg text-sm text-blue-600">
                <Loader2 className="w-3 h-3 animate-spin" />
                <span>Loading data...</span>
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
                  <Badge variant="secondary" className="bg-blue-100 text-blue-800">
                    {workflowOptimizations.length} optimization{workflowOptimizations.length !== 1 ? "s" : ""}
                  </Badge>
                )}
                {workflowAnomalies.length > 0 && (
                  <Badge variant="destructive">
                    {workflowAnomalies.length} anomal{workflowAnomalies.length !== 1 ? "ies" : "y"}
                  </Badge>
                )}
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowOptimizer(true)}
                className="text-blue-600 border-blue-200 hover:bg-blue-50"
              >
                View Details
              </Button>
            </div>
          </div>
        )}

        {/* Main Canvas - Vertical Chain Builder */}
        <div className="flex-1 bg-slate-50 overflow-y-auto">
          <div className="max-w-2xl mx-auto py-8 px-4">
            {workflowSteps.length === 0 ? (
              // Empty state - single large + button
              <div className="flex flex-col items-center justify-center min-h-[400px]">
                <div className="text-center mb-8">
                  <h3 className="text-lg font-medium text-slate-900 mb-2">Start Building Your Workflow</h3>
                  <p className="text-slate-600">Click the button below to add your first step</p>
                </div>
                <Button
                  onClick={() => handleAddStep(0)}
                  size="lg"
                  className="w-16 h-16 rounded-full bg-blue-600 hover:bg-blue-700 shadow-lg hover:shadow-xl transition-all duration-200"
                >
                  <Plus className="w-8 h-8" />
                </Button>
              </div>
            ) : (
              // Workflow chain
              <div className="space-y-4">
                {workflowSteps.map((step, index) => (
                  <div key={step.id} className="relative">
                    {/* Enhanced connecting line - more prominent */}
                    {index > 0 && (
                      <div className="flex justify-center">
                        <div className="w-px h-6 bg-gradient-to-b from-blue-400 to-blue-600"></div>
                      </div>
                    )}

                    {/* Step card with enhanced styling */}
                    <Card className="relative bg-white border-2 border-slate-200 hover:shadow-lg hover:border-blue-300 transition-all duration-200">
                      <CardContent className="p-6">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center space-x-4">
                            <div className="w-12 h-12 bg-white rounded-lg flex items-center justify-center shadow-md border border-slate-200">
                              <img
                                src={
                                  AVAILABLE_INTEGRATIONS.find((app) => app.id === step.appId)?.logo ||
                                  "/placeholder.svg?height=32&width=32" ||
                                  "/placeholder.svg" ||
                                  "/placeholder.svg"
                                }
                                alt={step.appName}
                                className="w-8 h-8 object-contain"
                                onError={(e) => {
                                  e.currentTarget.src = "/placeholder.svg?height=32&width=32"
                                }}
                              />
                            </div>
                            <div>
                              <h4 className="font-medium text-slate-900">{step.appName}</h4>
                              <p className="text-sm text-slate-600">{step.actionName}</p>
                              <div className="flex items-center gap-2 mt-1">
                                {step.type === "trigger" && (
                                  <Badge variant="secondary" className="text-xs bg-green-100 text-green-800">
                                    Trigger
                                  </Badge>
                                )}
                                {index > 0 && (
                                  <Badge variant="outline" className="text-xs">
                                    Step {index + 1}
                                  </Badge>
                                )}
                              </div>
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

                {/* Single add step button at the end */}
                {workflowSteps.length > 0 && (
                  <div className="flex flex-col items-center mt-4">
                    <div className="w-px h-6 bg-gradient-to-b from-blue-400 to-blue-600 mb-2"></div>
                    <Button
                      onClick={() => handleAddStep(workflowSteps.length)}
                      variant="outline"
                      className="w-12 h-12 rounded-full border-2 border-dashed border-slate-300 hover:border-blue-400 hover:bg-blue-50 shadow-sm hover:shadow-md transition-all duration-200"
                    >
                      <Plus className="w-5 h-5" />
                    </Button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* App Selector Modal */}
      <Dialog open={showAppSelector} onOpenChange={setShowAppSelector}>
        <DialogContent className="max-w-md max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Choose an App</DialogTitle>
            <DialogDescription>Select the app you want to use for this step</DialogDescription>
          </DialogHeader>
          <div className="space-y-2 mt-4">
            {AVAILABLE_INTEGRATIONS.map((app) => {
              const integration = integrations.find((i) => i.provider === app.id)
              const isConnected = integration?.status === "connected"

              return (
                <Button
                  key={app.id}
                  variant="outline"
                  className="w-full justify-start h-auto p-4 hover:bg-blue-50 hover:border-blue-300 transition-colors"
                  onClick={() => handleAppSelected(app)}
                >
                  <div className="flex items-center space-x-3">
                    <div className="w-8 h-8 flex items-center justify-center">
                      <img
                        src={app.logo || "/placeholder.svg"}
                        alt={app.name}
                        className="w-6 h-6 object-contain"
                        onError={(e) => {
                          e.currentTarget.src = "/placeholder.svg?height=24&width=24"
                        }}
                      />
                    </div>
                    <div className="text-left">
                      <div className="font-medium text-slate-900">{app.name}</div>
                    </div>
                  </div>
                </Button>
              )
            })}
          </div>
        </DialogContent>
      </Dialog>

      {/* Connect App Modal */}
      <Dialog open={showConnectModal} onOpenChange={setShowConnectModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Connect {selectedApp?.name}</DialogTitle>
            <DialogDescription>
              You need to connect your {selectedApp?.name} account to use this app in your workflow.
            </DialogDescription>
          </DialogHeader>
          <div className="flex gap-3 pt-4">
            <Button variant="outline" onClick={() => setShowConnectModal(false)} className="flex-1">
              Cancel
            </Button>
            <Button onClick={() => handleConnectApp(selectedApp?.id)} className="flex-1">
              Connect {selectedApp?.name}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Action Selector Modal */}
      <Dialog open={showActionSelector} onOpenChange={setShowActionSelector}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Choose {currentStepIndex === 0 ? "a Trigger" : "an Action"}</DialogTitle>
            <DialogDescription>Select what you want to do with {selectedApp?.name}</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 mt-4">
            {currentStepIndex === 0 ? (
              // Show triggers for first step - smaller buttons in vertical list
              <div className="space-y-2">
                {selectedApp?.triggers.map((trigger: string) => (
                  <Button
                    key={trigger}
                    variant="outline"
                    className="w-full justify-start h-auto p-4 hover:bg-blue-50 hover:border-blue-300 transition-colors"
                    onClick={() => handleActionSelected(trigger)}
                  >
                    <div className="text-left">
                      <div className="font-medium text-slate-900">{trigger}</div>
                      <div className="text-sm text-slate-500 mt-1">
                        Triggers when {trigger.toLowerCase()} in {selectedApp?.name}
                      </div>
                    </div>
                  </Button>
                ))}
              </div>
            ) : (
              // Show actions and conditions for subsequent steps
              <>
                <div className="mb-4">
                  <h4 className="font-medium text-slate-900 mb-2">Actions</h4>
                  <div className="space-y-2">
                    {selectedApp?.actions.map((action: string) => (
                      <Card
                        key={action}
                        className="cursor-pointer hover:shadow-md transition-shadow duration-200 border hover:border-blue-200"
                        onClick={() => handleActionSelected(action, "action")}
                      >
                        <CardContent className="p-3">
                          <h5 className="font-medium text-slate-900">{action}</h5>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                </div>

                <div>
                  <h4 className="font-medium text-slate-900 mb-2">Conditions</h4>
                  <div className="space-y-2">
                    {CONDITION_TYPES.map((condition) => (
                      <Card
                        key={condition.id}
                        className="cursor-pointer hover:shadow-md transition-shadow duration-200 border hover:border-purple-200"
                        onClick={() => handleActionSelected(condition.name, "condition")}
                      >
                        <CardContent className="p-3">
                          <h5 className="font-medium text-slate-900">{condition.name}</h5>
                          <p className="text-sm text-slate-600">{condition.description}</p>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                </div>
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Configuration Modal */}
      <Dialog open={showConfigModal} onOpenChange={setShowConfigModal}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Configure {selectedAction}</DialogTitle>
            <DialogDescription>
              {currentStepIndex === 0
                ? "Configure the trigger settings"
                : "Fill in the required information for this action"}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 mt-4">
            {getConfigFields().map((field) => (
              <div key={field.key} className="space-y-2">
                <Label htmlFor={field.key} className="text-sm font-medium">
                  {field.label} {field.required && "*"}
                </Label>
                {renderConfigField(field)}
              </div>
            ))}
          </div>

          <div className="flex gap-3 pt-6">
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
              disabled={(() => {
                const fields = getConfigFields()
                return fields.some((field) => field.required && !currentConfig[field.key])
              })()}
            >
              {currentStepIndex >= 0 && currentStepIndex < workflowSteps.length ? "Update Step" : "Add Step"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Exit Confirmation Dialog */}
      <Dialog open={showExitDialog} onOpenChange={setShowExitDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Unsaved Changes</DialogTitle>
            <DialogDescription>
              You have unsaved changes. Do you want to save as a draft or discard before exiting?
            </DialogDescription>
          </DialogHeader>
          <div className="flex gap-3 pt-4">
            <Button variant="outline" onClick={() => setShowExitDialog(false)} className="flex-1">
              Cancel
            </Button>
            <Button
              variant="outline"
              onClick={handleDiscardAndExit}
              className="flex-1 hover:bg-red-50 hover:text-red-600 hover:border-red-200"
            >
              Discard
            </Button>
            <Button onClick={handleSaveAndExit} className="flex-1">
              Save and Exit
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* AI Generation Dialog */}
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
              placeholder="e.g., Send Slack notifications when new emails arrive from important clients"
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

      {/* AI Dialogs */}
      <WorkflowOptimizer open={showOptimizer} onOpenChange={setShowOptimizer} workflow={currentWorkflow} />

      <AIChatAssistant />

      {/* Delete Confirmation Dialog */}
      <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Step</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete this step? This action cannot be undone.
              {stepToDelete >= 0 && workflowSteps[stepToDelete] && (
                <div className="mt-2 p-3 bg-slate-50 rounded-lg">
                  <div className="flex items-center space-x-2">
                    <img
                      src={
                        AVAILABLE_INTEGRATIONS.find((app) => app.id === workflowSteps[stepToDelete].appId)?.logo ||
                        "/placeholder.svg" ||
                        "/placeholder.svg"
                      }
                      alt={workflowSteps[stepToDelete].appName}
                      className="w-6 h-6 object-contain"
                      onError={(e) => {
                        e.currentTarget.src = "/placeholder.svg?height=24&width=24"
                      }}
                    />
                    <div>
                      <div className="font-medium text-slate-900">{workflowSteps[stepToDelete].appName}</div>
                      <div className="text-sm text-slate-600">{workflowSteps[stepToDelete].actionName}</div>
                    </div>
                  </div>
                </div>
              )}
            </DialogDescription>
          </DialogHeader>
          <div className="flex gap-3 pt-4">
            <Button variant="outline" onClick={() => setShowDeleteDialog(false)} className="flex-1">
              Cancel
            </Button>
            <Button variant="destructive" onClick={confirmDeleteStep} className="flex-1">
              Delete Step
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </AppLayout>
  )
}
