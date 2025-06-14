"use client"
import { useEffect, useState } from "react"
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
  CheckCircle,
  AlertCircle,
  X,
} from "lucide-react"
import { useToast } from "@/hooks/use-toast"

// Mock data for available integrations and their actions
const AVAILABLE_INTEGRATIONS = [
  {
    id: "gmail",
    name: "Gmail",
    icon: "📧",
    triggers: ["New Email", "Email Received from Specific Sender", "Email with Attachment", "Important Email"],
    actions: ["Send Email", "Reply to Email", "Forward Email"],
  },
  {
    id: "slack",
    name: "Slack",
    icon: "💬",
    triggers: ["New Message in Channel", "Direct Message Received", "User Mentioned", "File Uploaded"],
    actions: ["Send Message", "Create Channel", "Update Status"],
  },
  {
    id: "notion",
    name: "Notion",
    icon: "📝",
    triggers: ["New Page Created", "Database Item Added", "Page Updated", "Database Item Updated"],
    actions: ["Create Page", "Update Database", "Add Comment"],
  },
  {
    id: "discord",
    name: "Discord",
    icon: "🎮",
    triggers: ["New Message", "User Joined Server", "User Left Server", "Reaction Added"],
    actions: ["Send Message", "Create Channel", "Assign Role"],
  },
  {
    id: "stripe",
    name: "Stripe",
    icon: "💳",
    triggers: ["Payment Received", "Subscription Created", "Payment Failed", "Customer Created"],
    actions: ["Create Customer", "Send Invoice", "Refund Payment"],
  },
  {
    id: "hubspot",
    name: "HubSpot",
    icon: "🎯",
    triggers: ["New Contact", "Deal Updated", "Contact Updated", "Deal Created"],
    actions: ["Create Contact", "Update Deal", "Send Email"],
  },
  {
    id: "github",
    name: "GitHub",
    icon: "🐙",
    triggers: ["New Issue", "Pull Request Created", "Push to Repository", "Release Published"],
    actions: ["Create Issue", "Create Pull Request", "Add Comment"],
  },
  {
    id: "google-calendar",
    name: "Google Calendar",
    icon: "📅",
    triggers: ["New Event", "Event Updated", "Event Starting Soon", "Event Cancelled"],
    actions: ["Create Event", "Update Event", "Delete Event"],
  },
  {
    id: "google-sheets",
    name: "Google Sheets",
    icon: "📊",
    triggers: ["New Row Added", "Row Updated", "Cell Changed", "Sheet Created"],
    actions: ["Add Row", "Update Row", "Create Sheet"],
  },
  {
    id: "google-drive",
    name: "Google Drive",
    icon: "💾",
    triggers: ["New File", "File Updated", "File Shared", "Folder Created"],
    actions: ["Upload File", "Create Folder", "Share File"],
  },
  {
    id: "google-docs",
    name: "Google Docs",
    icon: "📄",
    triggers: ["New Document", "Document Updated", "Comment Added", "Document Shared"],
    actions: ["Create Document", "Update Document", "Add Comment"],
  },
  {
    id: "airtable",
    name: "Airtable",
    icon: "🗃️",
    triggers: ["New Record", "Record Updated", "View Updated", "Base Shared"],
    actions: ["Create Record", "Update Record", "Delete Record"],
  },
  {
    id: "trello",
    name: "Trello",
    icon: "📋",
    triggers: ["New Card", "Card Moved", "Card Updated", "Due Date Approaching"],
    actions: ["Create Card", "Move Card", "Update Card"],
  },
  {
    id: "dropbox",
    name: "Dropbox",
    icon: "📦",
    triggers: ["New File", "File Updated", "File Shared", "Folder Created"],
    actions: ["Upload File", "Create Folder", "Share File"],
  },
  {
    id: "teams",
    name: "Microsoft Teams",
    icon: "👥",
    triggers: ["New Message", "Meeting Started", "File Shared", "Channel Created"],
    actions: ["Send Message", "Schedule Meeting", "Share File"],
  },
  {
    id: "gitlab",
    name: "GitLab",
    icon: "🦊",
    triggers: ["New Issue", "Merge Request Created", "Pipeline Failed", "Push to Branch"],
    actions: ["Create Issue", "Create Merge Request", "Add Comment"],
  },
  {
    id: "facebook",
    name: "Facebook",
    icon: "👤",
    triggers: ["New Post", "Page Mention", "Comment on Post", "New Page Like"],
    actions: ["Create Post", "Reply to Comment", "Share Post"],
  },
  {
    id: "youtube",
    name: "YouTube",
    icon: "📺",
    triggers: ["New Video Uploaded", "New Comment", "New Subscriber", "Video Liked"],
    actions: ["Upload Video", "Reply to Comment", "Update Video"],
  },
  {
    id: "mailchimp",
    name: "Mailchimp",
    icon: "🐵",
    triggers: ["New Subscriber", "Email Campaign Sent", "Subscriber Updated", "Unsubscribe"],
    actions: ["Add Subscriber", "Send Campaign", "Update Subscriber"],
  },
  {
    id: "linkedin",
    name: "LinkedIn",
    icon: "💼",
    triggers: ["New Connection", "Post Engagement", "Message Received", "Profile View"],
    actions: ["Create Post", "Send Message", "Connect with User"],
  },
]

const CONDITION_TYPES = [
  { id: "time", name: "Time-based", description: "Wait for a specific time or duration" },
  { id: "field", name: "Field-based", description: "Check if data meets certain criteria" },
  { id: "ai", name: "AI-based", description: "Use AI to make intelligent decisions" },
]

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

  // Current selection states
  const [currentStepIndex, setCurrentStepIndex] = useState<number>(-1)
  const [selectedApp, setSelectedApp] = useState<any>(null)
  const [selectedAction, setSelectedAction] = useState<string>("")
  const [currentConfig, setCurrentConfig] = useState<Record<string, any>>({})
  const [aiPrompt, setAiPrompt] = useState("")
  const [generatingAI, setGeneratingAI] = useState(false)

  const { toast } = useToast()

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

    // For triggers (first step), automatically add without configuration modal
    if (currentStepIndex === 0) {
      const newStep: WorkflowStep = {
        id: `step-${Date.now()}`,
        type: "trigger",
        appId: selectedApp.id,
        appName: selectedApp.name,
        actionName: actionName,
        config: {}, // Triggers typically don't need configuration
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
    const newSteps = workflowSteps.filter((_, i) => i !== index)
    setWorkflowSteps(newSteps)
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
                {/* Remove this entire section when there are steps: */}
                {/* Add step button at the top */}
                {/* <div className="flex justify-center">
                  <Button
                    onClick={() => handleAddStep(0)}
                    variant="outline"
                    className="w-12 h-12 rounded-full border-2 border-dashed border-slate-300 hover:border-blue-400 hover:bg-blue-50"
                  >
                    <Plus className="w-5 h-5" />
                  </Button>
                </div> */}

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
                            <div className="w-12 h-12 bg-gradient-to-br from-blue-400 to-blue-600 rounded-lg flex items-center justify-center text-white text-xl shadow-md">
                              {AVAILABLE_INTEGRATIONS.find((app) => app.id === step.appId)?.icon || "⚡"}
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
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleEditStep(index)}
                              className="hover:bg-slate-100"
                            >
                              <Edit className="w-4 h-4" />
                            </Button>
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
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Choose an App</DialogTitle>
            <DialogDescription>Select the app you want to use for this step</DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mt-4">
            {AVAILABLE_INTEGRATIONS.map((app) => {
              const integration = integrations.find((i) => i.provider === app.id)
              const isConnected = integration?.status === "connected"

              return (
                <Card
                  key={app.id}
                  className="cursor-pointer hover:shadow-md transition-shadow duration-200 border-2 hover:border-blue-200"
                  onClick={() => handleAppSelected(app)}
                >
                  <CardContent className="p-4 text-center">
                    <div className="text-3xl mb-2">{app.icon}</div>
                    <h3 className="font-medium text-slate-900 mb-1">{app.name}</h3>
                    {isConnected ? (
                      <div className="flex items-center justify-center text-green-600 text-sm">
                        <CheckCircle className="w-4 h-4 mr-1" />
                        Connected
                      </div>
                    ) : (
                      <div className="flex items-center justify-center text-slate-500 text-sm">
                        <AlertCircle className="w-4 h-4 mr-1" />
                        Not Connected
                      </div>
                    )}
                  </CardContent>
                </Card>
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
            <DialogDescription>Fill in the required information for this action</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 mt-4">
            {/* Mock configuration fields based on action type */}
            {selectedAction === "Send Email" && (
              <>
                <div>
                  <Label htmlFor="to">To *</Label>
                  <Input
                    id="to"
                    placeholder="recipient@example.com"
                    value={currentConfig.to || ""}
                    onChange={(e) => setCurrentConfig({ ...currentConfig, to: e.target.value })}
                  />
                </div>
                <div>
                  <Label htmlFor="subject">Subject *</Label>
                  <Input
                    id="subject"
                    placeholder="Email subject"
                    value={currentConfig.subject || ""}
                    onChange={(e) => setCurrentConfig({ ...currentConfig, subject: e.target.value })}
                  />
                </div>
                <div>
                  <Label htmlFor="body">Body *</Label>
                  <Textarea
                    id="body"
                    placeholder="Email content..."
                    rows={4}
                    value={currentConfig.body || ""}
                    onChange={(e) => setCurrentConfig({ ...currentConfig, body: e.target.value })}
                  />
                </div>
              </>
            )}

            {selectedAction === "Send Message" && (
              <>
                <div>
                  <Label htmlFor="channel">Channel *</Label>
                  <Input
                    id="channel"
                    placeholder="#general"
                    value={currentConfig.channel || ""}
                    onChange={(e) => setCurrentConfig({ ...currentConfig, channel: e.target.value })}
                  />
                </div>
                <div>
                  <Label htmlFor="message">Message *</Label>
                  <Textarea
                    id="message"
                    placeholder="Your message..."
                    rows={3}
                    value={currentConfig.message || ""}
                    onChange={(e) => setCurrentConfig({ ...currentConfig, message: e.target.value })}
                  />
                </div>
              </>
            )}

            {selectedAction === "Create Page" && (
              <>
                <div>
                  <Label htmlFor="title">Page Title *</Label>
                  <Input
                    id="title"
                    placeholder="Page title"
                    value={currentConfig.title || ""}
                    onChange={(e) => setCurrentConfig({ ...currentConfig, title: e.target.value })}
                  />
                </div>
                <div>
                  <Label htmlFor="content">Content</Label>
                  <Textarea
                    id="content"
                    placeholder="Page content..."
                    rows={4}
                    value={currentConfig.content || ""}
                    onChange={(e) => setCurrentConfig({ ...currentConfig, content: e.target.value })}
                  />
                </div>
              </>
            )}

            {/* Time-based condition */}
            {selectedAction === "Time-based" && (
              <>
                <div>
                  <Label htmlFor="delay">Delay Type</Label>
                  <Select
                    value={currentConfig.delayType || ""}
                    onValueChange={(value) => setCurrentConfig({ ...currentConfig, delayType: value })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select delay type" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="minutes">Minutes</SelectItem>
                      <SelectItem value="hours">Hours</SelectItem>
                      <SelectItem value="days">Days</SelectItem>
                      <SelectItem value="specific">Specific Time</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="delayValue">Delay Value *</Label>
                  <Input
                    id="delayValue"
                    type="number"
                    placeholder="Enter delay amount"
                    value={currentConfig.delayValue || ""}
                    onChange={(e) => setCurrentConfig({ ...currentConfig, delayValue: e.target.value })}
                  />
                </div>
              </>
            )}

            {/* Field-based condition */}
            {selectedAction === "Field-based" && (
              <>
                <div>
                  <Label htmlFor="field">Field to Check *</Label>
                  <Input
                    id="field"
                    placeholder="e.g., email, status, amount"
                    value={currentConfig.field || ""}
                    onChange={(e) => setCurrentConfig({ ...currentConfig, field: e.target.value })}
                  />
                </div>
                <div>
                  <Label htmlFor="operator">Operator</Label>
                  <Select
                    value={currentConfig.operator || ""}
                    onValueChange={(value) => setCurrentConfig({ ...currentConfig, operator: value })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select operator" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="equals">Equals</SelectItem>
                      <SelectItem value="contains">Contains</SelectItem>
                      <SelectItem value="greater">Greater than</SelectItem>
                      <SelectItem value="less">Less than</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="value">Value *</Label>
                  <Input
                    id="value"
                    placeholder="Value to compare against"
                    value={currentConfig.value || ""}
                    onChange={(e) => setCurrentConfig({ ...currentConfig, value: e.target.value })}
                  />
                </div>
              </>
            )}

            {/* AI-based condition */}
            {selectedAction === "AI-based" && (
              <>
                <div>
                  <Label htmlFor="prompt">AI Prompt *</Label>
                  <Textarea
                    id="prompt"
                    placeholder="Describe what the AI should check for..."
                    rows={3}
                    value={currentConfig.prompt || ""}
                    onChange={(e) => setCurrentConfig({ ...currentConfig, prompt: e.target.value })}
                  />
                </div>
                <div>
                  <Label htmlFor="confidence">Confidence Threshold</Label>
                  <Select
                    value={currentConfig.confidence || ""}
                    onValueChange={(value) => setCurrentConfig({ ...currentConfig, confidence: value })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select confidence level" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="low">Low (60%)</SelectItem>
                      <SelectItem value="medium">Medium (80%)</SelectItem>
                      <SelectItem value="high">High (95%)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </>
            )}
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
              disabled={
                (selectedAction === "Send Email" &&
                  (!currentConfig.to || !currentConfig.subject || !currentConfig.body)) ||
                (selectedAction === "Send Message" && (!currentConfig.channel || !currentConfig.message)) ||
                (selectedAction === "Create Page" && !currentConfig.title) ||
                (selectedAction === "Time-based" && !currentConfig.delayValue) ||
                (selectedAction === "Field-based" && (!currentConfig.field || !currentConfig.value)) ||
                (selectedAction === "AI-based" && !currentConfig.prompt)
              }
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
    </AppLayout>
  )
}
