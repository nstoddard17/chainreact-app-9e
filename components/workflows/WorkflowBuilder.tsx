"use client"

import { useEffect, useState, useCallback, useMemo } from "react"
import { useSearchParams, useRouter } from "next/navigation"
import AppLayout from "@/components/layout/AppLayout"
import { useWorkflowStore } from "@/stores/workflowStore"
import { useIntegrationStore } from "@/stores/integrationStore"
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
  ArrowLeft,
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
import { ALL_NODE_COMPONENTS, NodeComponent } from "@/lib/workflows/availableNodes"
import { INTEGRATION_CONFIGS } from "@/lib/integrations/availableIntegrations"

// Group nodes by provider to build integration list
const getIntegrationsFromNodes = () => {
  const integrations: Record<
    string,
    {
      id: string
      name: string
      logo: string
      description: string
      category: string
      color: string
      triggers: NodeComponent[]
      actions: NodeComponent[]
    }
  > = {}

  ALL_NODE_COMPONENTS.forEach((node) => {
    if (node.providerId) {
      if (!integrations[node.providerId]) {
        const config = INTEGRATION_CONFIGS[node.providerId]
        integrations[node.providerId] = {
          id: node.providerId,
          name: config?.name || node.providerId,
          logo: `/integrations/${node.providerId}.svg`,
          description: config?.description || `Integration for ${node.providerId}`,
          category: config?.category || "Uncategorized",
          color: config?.color || "#FFFFFF",
          triggers: [],
          actions: [],
        }
      }

      if (node.isTrigger) {
        integrations[node.providerId].triggers.push(node)
      } else {
        integrations[node.providerId].actions.push(node)
      }
    }
  })

  return Object.values(integrations)
}

const AVAILABLE_INTEGRATIONS = getIntegrationsFromNodes()

// TODO: Refactor TRIGGER_CONFIGS to be more dynamic
const TRIGGER_CONFIGS: Record<string, any> = {}
const ACTION_CONFIGS: Record<string, any> = {}

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
  const {
    integrations,
    fetchIntegrations,
    connectIntegration,
    getIntegrationStatus,
    clearError,
    error: integrationError,
  } = useIntegrationStore()

  const [workflowSteps, setWorkflowSteps] = useState<WorkflowStep[]>([])
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false)

  // Modal states
  const [showTriggerModal, setShowTriggerModal] = useState(false)
  const [showActionModal, setShowActionModal] = useState(false)
  const [selectedIntegration, setSelectedIntegration] = useState<any>(null)
  const [selectedTrigger, setSelectedTrigger] = useState<any>(null)
  const [selectedAction, setSelectedAction] = useState<any>(null)
  const [configStep, setConfigStep] = useState<any>(null)
  const [dynamicData, setDynamicData] = useState<Record<string, any[]>>({})
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<number | null>(null)
  const [showExitConfirm, setShowExitConfirm] = useState(false)
  const [showDiscardConfirm, setShowDiscardConfirm] = useState(false)
  const [showGenerateAIModal, setShowGenerateAIModal] = useState(false)
  const [aiPrompt, setAiPrompt] = useState("")
  const [isGenerating, setIsGenerating] = useState(false)

  const { toast } = useToast()

  useEffect(() => {
    // Initialization logic...
    if (workflowId && workflows.length > 0) {
      const wf = workflows.find((w) => w.id === workflowId)
      if (wf) {
        setCurrentWorkflow(wf)
        // Assuming wf.steps is the structure
        // setWorkflowSteps(wf.steps)
      }
    }
    fetchIntegrations()
  }, [workflowId, workflows, fetchWorkflows, setCurrentWorkflow, fetchIntegrations])

  const handleAddTrigger = () => {
    resetModalStates()
    setShowTriggerModal(true)
  }

  const handleIntegrationSelected = (integration: any) => {
    setSelectedIntegration(integration)
  }

  const handleTriggerSelected = async (trigger: any) => {
    setSelectedTrigger(trigger)
    const configFields = TRIGGER_CONFIGS[trigger.type] || []

    if (configFields.length > 0) {
      setConfigStep({ ...trigger, config: {} })
    } else {
      addTriggerStep(trigger, {})
      resetModalStates()
    }
  }

  const addTriggerStep = (trigger: any, config: Record<string, any>) => {
    const newStep: WorkflowStep = {
      id: `trigger_${Date.now()}`,
      type: "trigger",
      appId: selectedIntegration.id,
      appName: selectedIntegration.name,
      actionId: trigger.type,
      actionName: trigger.title,
      config,
      isConfigured: (TRIGGER_CONFIGS[trigger.type] || []).length === 0,
    }
    setWorkflowSteps([newStep])
    setHasUnsavedChanges(true)
  }

  const addActionStep = (action: any, config: Record<string, any>) => {
    const newStep: WorkflowStep = {
      id: `action_${Date.now()}`,
      type: "action",
      appId: selectedIntegration.id,
      appName: selectedIntegration.name,
      actionId: action.type,
      actionName: action.title,
      config,
      isConfigured: (ACTION_CONFIGS[action.type] || []).length === 0,
    }
    setWorkflowSteps([...workflowSteps, newStep])
    setHasUnsavedChanges(true)
  }

  const handleActionSelected = async (action: any) => {
    setSelectedAction(action)
    const configFields = ACTION_CONFIGS[action.type] || []

    if (configFields.length > 0) {
      setConfigStep({ ...action, config: {} })
    } else {
      addActionStep(action, {})
      resetModalStates()
    }
  }

  const resetModalStates = () => {
    setShowTriggerModal(false)
    setShowActionModal(false)
    setSelectedIntegration(null)
    setSelectedTrigger(null)
    setSelectedAction(null)
    setConfigStep(null)
    setDynamicData({})
  }

  // ... other functions ...

  const workflowName = currentWorkflow?.name || "Untitled Workflow"

  return (
    <AppLayout title={workflowName}>
      <div className="flex-1 flex flex-col p-6 space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold">{workflowName}</h1>
          {/* ... other header elements */}
        </div>
        
        {/* Workflow Steps */}
        <div className="flex-1">
          {workflowSteps.length === 0 ? (
            <div className="flex items-center justify-center h-full border-2 border-dashed rounded-lg">
              <Button onClick={handleAddTrigger}>Add a trigger</Button>
            </div>
          ) : (
            <div>
              {/* Render workflow steps here */}
            </div>
          )}
        </div>
      </div>
      
      <Dialog open={showTriggerModal} onOpenChange={setShowTriggerModal}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {selectedIntegration ? `Choose a trigger for ${selectedIntegration.name}` : "Choose an integration"}
            </DialogTitle>
            <DialogDescription>
              {selectedIntegration
                ? "Select a trigger to start your workflow."
                : "Select an integration to see its available triggers."}
            </DialogDescription>
          </DialogHeader>

          {selectedIntegration && (
            <Button variant="ghost" onClick={() => setSelectedIntegration(null)} className="mb-4">
              <ArrowLeft className="mr-2 h-4 w-4" /> Back to integrations
            </Button>
          )}

          <ScrollArea className="h-[70vh] -mx-4">
            <div className="flex flex-col gap-2 px-4">
              {!selectedIntegration
                ? AVAILABLE_INTEGRATIONS.filter(int => int.triggers.length > 0).map((integration) => (
                    <Card
                      key={integration.id}
                      className="cursor-pointer hover:shadow-lg transition-shadow"
                      onClick={() => handleIntegrationSelected(integration)}
                    >
                      <CardContent className="flex items-center gap-4 p-4">
                        <img src={integration.logo} alt={`${integration.name} logo`} className="w-8 h-8 object-contain" />
                        <div>
                          <h3 className="font-semibold">{integration.name}</h3>
                          <p className="text-sm text-muted-foreground">{integration.triggers.length} {integration.triggers.length > 1 ? 'triggers' : 'trigger'}</p>
                        </div>
                      </CardContent>
                    </Card>
                  ))
                : selectedIntegration.triggers.map((trigger: any) => (
                    <Card
                      key={trigger.type}
                      className="cursor-pointer hover:shadow-lg transition-shadow"
                      onClick={() => handleTriggerSelected(trigger)}
                    >
                      <CardContent className="p-4">
                        <h3 className="font-semibold">{trigger.title}</h3>
                        <p className="text-sm text-muted-foreground">{trigger.description || 'No description available'}</p>
                      </CardContent>
                    </Card>
                  ))}
            </div>
          </ScrollArea>
        </DialogContent>
      </Dialog>
      
      <Dialog open={showActionModal} onOpenChange={setShowActionModal}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {selectedIntegration ? `Choose an action for ${selectedIntegration.name}` : "Choose an integration"}
            </DialogTitle>
            <DialogDescription>
              {selectedIntegration
                ? "Select an action to add to your workflow."
                : "Select an integration to see its available actions."}
            </DialogDescription>
          </DialogHeader>

          {selectedIntegration && (
            <Button variant="ghost" onClick={() => setSelectedIntegration(null)} className="mb-4">
              <ArrowLeft className="mr-2 h-4 w-4" /> Back to integrations
            </Button>
          )}

          <ScrollArea className="h-[70vh] -mx-4">
            <div className="flex flex-col gap-2 px-4">
              {!selectedIntegration
                ? AVAILABLE_INTEGRATIONS.filter(int => int.actions.length > 0).map((integration) => (
                    <Card
                      key={integration.id}
                      className="cursor-pointer hover:shadow-lg transition-shadow"
                      onClick={() => handleIntegrationSelected(integration)}
                    >
                      <CardContent className="flex items-center gap-4 p-4">
                        <img src={integration.logo} alt={`${integration.name} logo`} className="w-8 h-8 object-contain" />
                        <div>
                          <h3 className="font-semibold">{integration.name}</h3>
                          <p className="text-sm text-muted-foreground">{integration.actions.length} {integration.actions.length > 1 ? 'actions' : 'action'}</p>
                        </div>
                      </CardContent>
                    </Card>
                  ))
                : selectedIntegration.actions.map((action: any) => (
                  <Card
                    key={action.type}
                    className="cursor-pointer hover:shadow-lg transition-shadow"
                    onClick={() => handleActionSelected(action)}
                  >
                    <CardContent className="p-4">
                      <h3 className="font-semibold">{action.title}</h3>
                      <p className="text-sm text-muted-foreground">{action.description || 'No description available'}</p>
                    </CardContent>
                  </Card>
                ))}
            </div>
          </ScrollArea>
        </DialogContent>
      </Dialog>
    </AppLayout>
  )
}
