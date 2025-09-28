"use client"

import React, { useEffect, useCallback, useState, useMemo, useRef, startTransition } from "react"
import { useSearchParams, useRouter } from "next/navigation"
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  addEdge,
  type Connection,
  type Edge,
  type Node,
  type NodeTypes,
  type EdgeTypes,
  Panel,
  BackgroundVariant,
  useReactFlow,
  ReactFlowProvider,
  type NodeProps,
  type EdgeProps,
  getBezierPath,
} from "@xyflow/react"
import "@xyflow/react/dist/style.css"

import { useWorkflowStore, type Workflow, type WorkflowNode, type WorkflowConnection } from "@/stores/workflowStore"
import { useCollaborationStore } from "@/stores/collaborationStore"
import { useIntegrationStore } from "@/stores/integrationStore"
import { useWorkflowTestStore } from "@/stores/workflowTestStore"
import { useWorkflowErrorStore } from "@/stores/workflowErrorStore"
import { useWorkflowStepExecutionStore } from "@/stores/workflowStepExecutionStore"
import { StepExecutionPanel } from "./StepExecutionPanel"
import { EnhancedExecutionPanel } from "./EnhancedExecutionPanel"
import { supabase, createClient } from "@/utils/supabaseClient"
import { ConfigurationModal } from "./configuration"
import { AIAgentConfigModal } from "./AIAgentConfigModal"
import ActionSelectionDialogContent from './ActionSelectionDialogContent'
import CustomNode from "./CustomNode"
import { AddActionNode } from "./AddActionNode"
import { CollaboratorCursors } from "./CollaboratorCursors"
import ErrorNotificationPopup from "./ErrorNotificationPopup"
import { ReAuthNotification } from "@/components/integrations/ReAuthNotification"
import WorkflowExecutions from "./WorkflowExecutions"
import { ExecutionHistoryModal } from "./ExecutionHistoryModal"
import { SandboxPreviewPanel } from "./SandboxPreviewPanel"

import { Button } from "@/components/ui/button"
import { RoleGuard, OrganizationRoleGuard } from "@/components/ui/role-guard"
import { Badge, type BadgeProps } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Save, Loader2, Play, ArrowLeft, Plus, Search, ChevronRight, RefreshCw, Bell, Zap, Ear, GitBranch, Bot, History, Radio, Pause, TestTube, Rocket, Shield, FlaskConical, Settings, HelpCircle } from "lucide-react"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter, DialogClose } from "@/components/ui/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from "@/components/ui/dropdown-menu"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Checkbox } from "@/components/ui/checkbox"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { ALL_NODE_COMPONENTS, NodeComponent } from "@/lib/workflows/nodes"
import { INTEGRATION_CONFIGS } from "@/lib/integrations/availableIntegrations"
import { useIntegrationSelection } from "@/hooks/workflows/useIntegrationSelection"
import { useToast } from "@/hooks/use-toast"
import { saveNodeConfig, clearNodeConfig, loadNodeConfig } from "@/lib/workflows/configPersistence"
import { Card } from "@/components/ui/card"
import { WorkflowLoadingScreen } from "@/components/ui/loading-screen"

type IntegrationInfo = {
  id: string
  name: string
  description: string
  category: string
  color: string
  triggers: NodeComponent[]
  actions: NodeComponent[]
}

const getIntegrationsFromNodes = (): IntegrationInfo[] => {
  const integrationMap: Record<string, IntegrationInfo> = {}
  
  // Add Core integration for built-in triggers
  integrationMap['core'] = {
    id: 'core',
    name: 'Core',
    description: 'Built-in workflow triggers and utilities',
    category: 'Core',
    color: '#6B7280',
    triggers: [],
    actions: [],
  }
  
  // Add Logic integration for control flow
  integrationMap['logic'] = {
    id: 'logic',
    name: 'Logic',
    description: 'Control flow and data manipulation',
    category: 'Core',
    color: '#6B7280',
    triggers: [],
    actions: [],
  }
  
  // Add AI Agent as a separate integration
  integrationMap['ai'] = {
    id: 'ai',
    name: 'AI Agent',
    description: 'Intelligent automation with AI-powered decision making and task execution',
    category: 'ai',
    color: '#8B5CF6',
    triggers: [],
    actions: [],
  }
  
  // Add other integrations from configs
  for (const integrationId in INTEGRATION_CONFIGS) {
    const config = INTEGRATION_CONFIGS[integrationId]
    if (config) {
      integrationMap[integrationId] = {
        id: config.id,
        name: config.name,
        description: config.description,
        category: config.category,
        color: config.color,
        triggers: [],
        actions: [],
      }
    }
  }
  
  ALL_NODE_COMPONENTS.forEach((node) => {
    // Handle core triggers (webhook, schedule, manual) that don't have providerId
    if (!node.providerId && (node.type === 'webhook' || node.type === 'schedule' || node.type === 'manual')) {
      integrationMap['core'].triggers.push(node)
    }
    // Handle nodes with providerId
    else if (node.providerId && integrationMap[node.providerId]) {
      if (node.isTrigger) {
        integrationMap[node.providerId].triggers.push(node)
      } else {
        integrationMap[node.providerId].actions.push(node)
      }
    }
  })
  const integrations = Object.values(integrationMap)
  
  // Sort integrations to put core first, then logic, then AI Agent, then alphabetically
  return integrations.sort((a, b) => {
    if (a.id === 'core') return -1
    if (b.id === 'core') return 1
    if (a.id === 'logic') return -1
    if (b.id === 'logic') return 1
    if (a.id === 'ai') return -1
    if (b.id === 'ai') return 1
    return a.name.localeCompare(b.name)
  })
}

const nodeTypes: NodeTypes = {
  custom: CustomNode as React.ComponentType<NodeProps>,
  addAction: AddActionNode as React.ComponentType<NodeProps>,
}

// Add concurrent state updates for better UX
const useConcurrentStateUpdates = () => {
  const updateWithTransition = useCallback((updateFn: () => void) => {
    startTransition(() => {
      updateFn()
    })
  }, [])
  
  return { updateWithTransition }
}

const useWorkflowBuilderState = () => {
  const router = useRouter()
  const searchParams = useSearchParams()
  const workflowId = searchParams.get("id")

  const {
    workflows,
    currentWorkflow,
    setCurrentWorkflow,
    updateWorkflow,
    removeNode,
    loading: workflowLoading,
    recalculateWorkflowValidation,
  } = useWorkflowStore()
  const { joinCollaboration, leaveCollaboration, collaborators } = useCollaborationStore()
  const {
    getConnectedProviders,
    integrations,
    fetchIntegrations,
    loading: integrationsLoading
  } = useIntegrationStore()
  const { addError, setCurrentWorkflow: setErrorStoreWorkflow, getLatestErrorForNode } = useWorkflowErrorStore()
  
  // Helper to get current user ID for integrations
  const getCurrentUserId = useCallback(async (): Promise<string | null> => {
    const { data: { user } } = await supabase.auth.getUser()
    return user?.id || null
  }, [])
  
  // Use cached data with fallbacks
  const workflowsData = workflows || []
  const integrationsData = integrations || []
  
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([])
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([])
  const { fitView, getNodes, getEdges } = useReactFlow<Node, Edge>()

  // Memoize node types to prevent unnecessary re-renders
  const nodeTypes = useMemo(() => ({
    custom: CustomNode,
    addAction: AddActionNode,
  }), [])
  
  // Memoize edge types to enable custom edges with plus buttons
  const edgeTypes = useMemo(() => ({
    custom: CustomEdgeWithButton,
  }), [])

  const [isSaving, setIsSaving] = useState(false)
  const [isExecuting, setIsExecuting] = useState(false)
  const [activeExecutionNodeId, setActiveExecutionNodeId] = useState<string | null>(null)
  const [executionResults, setExecutionResults] = useState<Record<string, { status: 'pending' | 'running' | 'completed' | 'error', timestamp: number, error?: string }>>({})
  const [workflowName, setWorkflowName] = useState("")
  const [workflowDescription, setWorkflowDescription] = useState("")
  const [showTriggerDialog, setShowTriggerDialog] = useState(false)
  const [showActionDialog, setShowActionDialog] = useState(false)
  const [selectedIntegration, setSelectedIntegration] = useState<IntegrationInfo | null>(null)
  // Cache integration status when modal opens to prevent flickering
  const [cachedIntegrationStatus, setCachedIntegrationStatus] = useState<Record<string, boolean>>({})
  const pendingSaveTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const isSavingRef = useRef<boolean>(false)
  const [selectedTrigger, setSelectedTrigger] = useState<NodeComponent | null>(null)
  const [selectedAction, setSelectedAction] = useState<NodeComponent | null>(null)
  const [searchQuery, setSearchQuery] = useState("")
  const [filterCategory, setFilterCategory] = useState("all")
  const [showConnectedOnly, setShowConnectedOnly] = useState(false) // Default to showing all integrations to avoid filtering issues
  const [showComingSoon, setShowComingSoon] = useState(false) // Hide coming soon integrations by default
  const [sourceAddNode, setSourceAddNode] = useState<{ id: string; parentId: string; insertBefore?: string } | null>(null)
  const [isActionAIMode, setIsActionAIMode] = useState(false) // AI mode for action selection
  const [configuringNode, setConfiguringNode] = useState<{ id: string; integration: any; nodeComponent: NodeComponent; config: Record<string, any>; dynamicOptions?: Record<string, any[]> } | null>(null)
  const [pendingNode, setPendingNode] = useState<{ type: 'trigger' | 'action'; integration: IntegrationInfo; nodeComponent: NodeComponent; sourceNodeInfo?: { id: string; parentId: string } } | null>(null)
  const [deletingNode, setDeletingNode] = useState<{ id: string; name: string } | null>(null)
  const [aiAgentActionCallback, setAiAgentActionCallback] = useState<((nodeType: string, providerId: string, config?: any) => void) | null>(null)
  const [listeningMode, setListeningMode] = useState(false)
  const [hasShownLoading, setHasShownLoading] = useState(false)
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false)
  const [showUnsavedChangesModal, setShowUnsavedChangesModal] = useState(false)
  const [isProcessingDeletion, setIsProcessingDeletion] = useState(false)
  const [pendingNavigation, setPendingNavigation] = useState<string | null>(null)
  const [isRebuildingAfterSave, setIsRebuildingAfterSave] = useState(false)
  const [reactFlowInitialized, setReactFlowInitialized] = useState(false)
  const [showDiscordConnectionModal, setShowDiscordConnectionModal] = useState(false)
  const [showExecutionHistory, setShowExecutionHistory] = useState(false)
  const [showSandboxPreview, setShowSandboxPreview] = useState(false)
  const [showEnhancedExecutionPanel, setShowEnhancedExecutionPanel] = useState(false)
  const [enhancedExecutionMode, setEnhancedExecutionMode] = useState<'sandbox' | 'live'>('sandbox')
  const [sandboxInterceptedActions, setSandboxInterceptedActions] = useState<any[]>([])
  const isProcessingChainsRef = useRef(false)
  const [isStepByStep, setIsStepByStep] = useState(false)
  const [stepContinueCallback, setStepContinueCallback] = useState<(() => void) | null>(null)
  const [skipCallback, setSkipCallback] = useState<(() => void) | null>(null)
  const [connectingIntegrationId, setConnectingIntegrationId] = useState<string | null>(null)
  const [, forceUpdate] = useState({})

  const { toast } = useToast()
  const { updateWithTransition } = useConcurrentStateUpdates()
  
  const resetIntegrationFilters = useCallback(() => {
    setShowConnectedOnly(false)
    setShowComingSoon(false)
  }, [])

  // Clear any stuck save/execute states and timers within builder state scope
  const clearStuckRequests = useCallback(() => {
    try {
      setIsSaving(false)
      setIsExecuting(false)
      isSavingRef.current = false
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current)
        saveTimeoutRef.current = null
      }
    } catch {}
  }, [setIsSaving, setIsExecuting])

  // Define availableIntegrations early so it can be used in callbacks below
  const availableIntegrations = useMemo(() => {
    const integrations = getIntegrationsFromNodes()
    return integrations
  }, []) // Note: This is still static, but at least consistent with INTEGRATION_CONFIGS

  // Define isIntegrationConnected early so it can be used in callbacks below
  const isIntegrationConnected = useCallback((integrationId: string): boolean => {
    // System integrations that are always "connected" since they don't require external authentication
    const systemIntegrations = ['core', 'logic', 'ai', 'webhook', 'scheduler', 'manual'];
    if (systemIntegrations.includes(integrationId)) return true;

    // If integrations are actively loading, assume connected to avoid flicker
    if (integrationsLoading) {
      return true
    }

    // Use the integrations from the hook state instead of always getting fresh from store
    // This prevents the modal from showing disconnected when the store gets temporarily cleared
    const integrationsToCheck = integrations && integrations.length > 0
      ? integrations
      : useIntegrationStore.getState().integrations;

    // If we have no integrations data at all, assume connected rather than filtering everything out
    // This prevents the trigger modal from showing only "core" when integrations are still loading
    if (!integrationsToCheck || integrationsToCheck.length === 0) {
      console.log('⚠️ [isIntegrationConnected] No integrations data available, assuming connected for:', integrationId);
      return true; // Default to showing integrations rather than hiding them
    }

    // Debug logging to see what's in the store

    // Create a mapping of integration config IDs to possible database provider values
    // This handles cases where the integration ID doesn't match the database provider value
    const providerMappings: Record<string, string[]> = {
      'gmail': ['gmail', 'google'],
      'google-calendar': ['google-calendar', 'google_calendar', 'google'],
      'google-drive': ['google-drive', 'google_drive', 'google'],
      'google-sheets': ['google-sheets', 'google_sheets', 'google'],
      'google-docs': ['google-docs', 'google_docs', 'google'],
      'discord': ['discord'],
      'slack': ['slack'],
      'notion': ['notion'],
      'airtable': ['airtable'],
      'hubspot': ['hubspot'],
      'stripe': ['stripe'],
      'shopify': ['shopify'],
      'trello': ['trello'],
      'microsoft-onenote': ['microsoft-onenote', 'microsoft_onenote', 'onenote', 'ms-onenote', 'ms_onenote'],
      'microsoft-outlook': ['microsoft-outlook', 'microsoft_outlook', 'outlook', 'ms-outlook', 'ms_outlook'],
      'microsoft-teams': ['microsoft-teams', 'microsoft_teams', 'teams', 'ms-teams', 'ms_teams'],
      'onedrive': ['onedrive', 'microsoft-onedrive', 'microsoft_onedrive'],
      'facebook': ['facebook'],
      'instagram': ['instagram'],
      'twitter': ['twitter'],
      'linkedin': ['linkedin'],
    };

    // For Google services, check if ANY Google service is connected
    // Google services share authentication, so if one is connected, all are connected
    if (integrationId.startsWith('google-') || integrationId === 'gmail') {
      const googleServices = ['google', 'google-drive', 'google-sheets', 'google-docs', 'google-calendar', 'gmail',
                              'google_drive', 'google_sheets', 'google_docs', 'google_calendar'];
      const connectedGoogleService = integrationsToCheck?.find(i =>
        googleServices.includes(i.provider) &&
        i.status === 'connected'
      );

      if (connectedGoogleService) {
        console.log('✅ [isIntegrationConnected] Found connected Google service:', connectedGoogleService.provider);
        return true;
      }

      // Also check via getConnectedProviders which handles the grouping
      const connectedProviders = getConnectedProviders();
      const hasAnyGoogleConnected = googleServices.some(service => connectedProviders.includes(service));
      if (hasAnyGoogleConnected) {
        console.log('✅ [isIntegrationConnected] Found Google service via getConnectedProviders');
        return true;
      }

      console.log('❌ [isIntegrationConnected] No connected Google services found for:', integrationId);
      console.log('   Available integrations:', integrationsToCheck?.map(i => ({ provider: i.provider, status: i.status })));
      return false;
    }

    // For Microsoft services, each service requires its own separate authentication
    // Unlike Google services, Microsoft services don't share authentication
    if (integrationId.startsWith('microsoft-') || integrationId === 'onedrive') {
      // Check for the specific Microsoft service only
      const possibleProviders = providerMappings[integrationId] || [integrationId];
      const connectedMicrosoftService = integrationsToCheck?.find(i =>
        possibleProviders.includes(i.provider) &&
        i.status === 'connected'
      );

      if (connectedMicrosoftService) {
        return true;
      }

      return false;
    }

    // Check if this specific integration exists in the store
    // Use the mapping to check all possible provider values
    const possibleProviders = providerMappings[integrationId] || [integrationId];

    // Also check with simple provider name matching (discord -> discord, etc)
    const integration = integrationsToCheck?.find(i => {
      // Check if status is connected
      if (i.status !== 'connected') return false;

      // Check exact match
      if (i.provider === integrationId) return true;

      // Check if provider is in the possible providers list
      if (possibleProviders.includes(i.provider)) return true;

      // Check if the integration ID matches the provider with different casing or hyphens
      const normalizedProvider = i.provider.toLowerCase().replace(/-/g, '_');
      const normalizedId = integrationId.toLowerCase().replace(/-/g, '_');
      if (normalizedProvider === normalizedId) return true;

      return false;
    });

    if (integration) return true;

    // Use the getConnectedProviders as fallback
    const connectedProviders = getConnectedProviders();

    // Check if any of the possible providers are in the connected list
    const isConnected = possibleProviders.some(provider => connectedProviders.includes(provider));

    // Debug logging for non-system integrations
    if (integrationId === 'gmail' || integrationId === 'discord') {
      console.log(`🔍 [isIntegrationConnected] Checking ${integrationId}:`, {
        integrationsToCheck: integrationsToCheck?.length || 0,
        isConnected,
        possibleProviders,
        connectedProviders: connectedProviders?.length || 0
      });
    }

    return isConnected;
  }, [getConnectedProviders, integrations, integrationsLoading])

  const openTriggerDialog = useCallback(() => {
    resetIntegrationFilters()
    setSelectedIntegration(null)
    setSelectedTrigger(null)
    setSearchQuery("")

    // Cache integration status when opening the modal to prevent flickering
    const statusCache: Record<string, boolean> = {}
    availableIntegrations.forEach(integration => {
      statusCache[integration.id] = isIntegrationConnected(integration.id)
    })
    console.log('🔄 [openTriggerDialog] Caching integration status:', {
      totalIntegrations: availableIntegrations.length,
      connectedCount: Object.values(statusCache).filter(v => v).length,
      statusCache
    })
    setCachedIntegrationStatus(statusCache)

    setShowTriggerDialog(true)
  }, [resetIntegrationFilters, availableIntegrations, isIntegrationConnected])

  const openActionDialog = useCallback(() => {
    resetIntegrationFilters()
    setSelectedIntegration(null)
    setSelectedAction(null)
    setSearchQuery("")

    // Cache integration status when opening the modal to prevent flickering
    const statusCache: Record<string, boolean> = {}
    availableIntegrations.forEach(integration => {
      statusCache[integration.id] = isIntegrationConnected(integration.id)
    })
    console.log('🔄 [openActionDialog] Caching integration status:', {
      totalIntegrations: availableIntegrations.length,
      connectedCount: Object.values(statusCache).filter(v => v).length,
      currentIntegrations: integrations?.length || 0,
      statusCache
    })
    setCachedIntegrationStatus(statusCache)

    // Force-refresh integrations so connection statuses are up-to-date in the modal
    try { fetchIntegrations(true) } catch {}
    setShowActionDialog(true)
  }, [resetIntegrationFilters, fetchIntegrations, availableIntegrations, isIntegrationConnected, integrations])

  // Step execution store hooks
  const {
    isStepMode,
    isPaused,
    currentNodeId,
    nodeStatuses,
    startStepExecution,
    stopStepExecution,
    setNodeStatus,
    setNodeResult,
    setCurrentNode,
    addToExecutionPath,
    pauseExecution,
    resetExecution: resetStepExecution
  } = useWorkflowStepExecutionStore()

  // Fetch integrations on component mount to ensure we have the data
  useEffect(() => {
    // Only fetch if we don't have integrations loaded yet
    if (!integrations || integrations.length === 0) {
      console.log('📦 [WorkflowBuilder] Fetching integrations on mount');
      fetchIntegrations(false).catch((error) => {
        console.error('❌ [WorkflowBuilder] Failed to fetch integrations on mount:', error);
      });
    } else {
      console.log('✅ [WorkflowBuilder] Integrations already loaded:', {
        count: integrations.length,
        integrations: integrations.map(i => ({
          provider: i.provider,
          status: i.status,
          id: i.id
        }))
      });
    }
  }, []); // Only run on mount

  const nodeNeedsConfiguration = (nodeComponent: NodeComponent): boolean => {
    // Manual trigger doesn't need configuration
    if (nodeComponent.type === 'manual') {
      return false;
    }

    // All other trigger nodes should have configuration
    if (nodeComponent.isTrigger) {
      return true;
    }

    // For non-trigger nodes, check if they have a configuration schema
    const hasConfigSchema = !!(nodeComponent.configSchema && nodeComponent.configSchema.length > 0);

    // Node needs configuration if it has a config schema
    return hasConfigSchema;
  }

  // Helper function to get the current workflow's trigger
  const getWorkflowTrigger = () => {
    const triggerNode = getNodes().find(node => node.data?.isTrigger)
    return triggerNode
  }

  // Helper function to check if action should be available based on trigger
  const isActionCompatibleWithTrigger = (action: NodeComponent): boolean => {
    const trigger = getWorkflowTrigger()
    
    // If no trigger yet, allow all actions
    if (!trigger) return true
    
    // Show all actions regardless of trigger
    return true
  }

  // Helper function to check if AI Agent can be used after a specific node
  const canUseAIAgentAfterNode = (parentNode: Node): boolean => {
    // Find the node component definition
    const nodeComponent = ALL_NODE_COMPONENTS.find((c) => c.type === parentNode.data.type)
    
    // AI Agent can only be used after nodes that produce outputs
    return nodeComponent?.producesOutput === true
  }

  // Helper function to filter actions based on compatibility
  const getCompatibleActions = (actions: NodeComponent[]): NodeComponent[] => {
    const trigger = getNodes().find(node => node.data?.isTrigger)
    
    return actions.filter(action => {
      // AI Agent can only be used after nodes that produce outputs
      if (action.type === 'ai_agent' && sourceAddNode) {
        const parentNode = getNodes().find(n => n.id === sourceAddNode.parentId)
        if (parentNode && !canUseAIAgentAfterNode(parentNode)) {
          return false
        }
      }
      
      return true
    })
  }

  // Note: isIntegrationConnected has been moved earlier in the file to avoid initialization errors



  const handleChangeTrigger = useCallback(() => {
    // Store existing action nodes (non-trigger nodes) to preserve them
    const currentNodes = getNodes();
    const actionNodes = currentNodes.filter(node =>
      node.type === 'custom' && !node.data.isTrigger && node.data?.type !== 'addAction'
    );

    console.log('🔄 Changing trigger, preserving', actionNodes.length, 'action nodes');

    // Store the action nodes temporarily in state so we can restore them after trigger selection
    // We'll use a ref or state to store these
    sessionStorage.setItem('preservedActionNodes', JSON.stringify(actionNodes));

    // Also preserve connections from the current trigger to action nodes so we can re-connect
    try {
      const currentEdges = getEdges();
      const triggerNode = currentNodes.find(n => n.data?.isTrigger);
      if (triggerNode) {
        const triggerEdges = currentEdges.filter(e => e.source === triggerNode.id);
        const targetIds = triggerEdges.map(e => e.target);
        sessionStorage.setItem('preservedTriggerTargets', JSON.stringify(targetIds));
        console.log('📌 Preserving connections to', targetIds.length, 'nodes:', targetIds);
      }
    } catch (error) {
      console.error('Failed to preserve trigger connections:', error);
    }
    
    // Clear all configuration preferences when changing trigger
    const clearAllPreferences = async () => {
      try {
        
        // Clear all preferences for this user
        const response = await fetch(`/api/user/config-preferences`, {
          method: "DELETE"
        })
        
        if (response.ok) {
        } else {
        }
      } catch (error) {
      }
    }
    
    clearAllPreferences();
    
    openTriggerDialog();
  }, [getNodes, openTriggerDialog])

  const handleConfigureNode = useCallback(async (nodeId: string) => {
    const nodeToConfigure = getNodes().find((n) => n.id === nodeId)
    if (!nodeToConfigure) return

    // Special case: Manual triggers open the trigger selection dialog
    if (nodeToConfigure.data.type === 'manual') {
      openTriggerDialog()
      return
    }

    const nodeComponent = ALL_NODE_COMPONENTS.find((c) => c.type === nodeToConfigure.data.type)
    if (!nodeComponent) return

    console.log('🔧 [WorkflowBuilder] handleConfigureNode called for:', {
      nodeId,
      nodeType: nodeToConfigure.data.type,
      existingConfig: nodeToConfigure.data.config,
      savedDynamicOptions: nodeToConfigure.data.savedDynamicOptions,
      nodeData: nodeToConfigure.data
    });

    const providerId = nodeToConfigure.data.providerId as keyof typeof INTEGRATION_CONFIGS
    const integration = INTEGRATION_CONFIGS[providerId]

    // Handle core triggers (schedule, webhook) that don't have an integration config
    if (!integration && providerId === 'core' && nodeComponent) {
      // Create a minimal integration config for core triggers
      const coreIntegration: IntegrationConfig = {
        id: 'core',
        name: 'Core',
        description: 'System-level triggers and actions',
        category: 'system',
        color: '#6B7280',
        supportedActions: [],
        supportedTriggers: ['manual', 'schedule', 'webhook']
      }

      // Try to load configuration from our persistence system first
      let config = { ...(nodeToConfigure.data.config || {}) }
      let dynamicOptions = nodeToConfigure.data.savedDynamicOptions || {}

      if (dynamicOptions && Object.keys(dynamicOptions).length > 0) {
        config.__dynamicOptions = dynamicOptions
      }

      if (nodeToConfigure.data.validationState) {
        config.__validationState = nodeToConfigure.data.validationState
      }

      if (typeof window !== "undefined") {
        try {
          // Extract workflow ID from URL
          const pathParts = window.location.pathname.split('/')
          const builderIndex = pathParts.indexOf('builder')
          const workflowId = builderIndex !== -1 && pathParts.length > builderIndex + 1 ? pathParts[builderIndex + 1] : null

          if (workflowId) {
            // IMPORTANT: await the async loadNodeConfig function
            const savedNodeData = await loadNodeConfig(workflowId, nodeId, nodeToConfigure.data.type as string)
            if (savedNodeData) {
              // Use saved config and dynamicOptions if available
              config = savedNodeData.config || config
              dynamicOptions = savedNodeData.dynamicOptions || dynamicOptions
              console.log('📋 [WorkflowBuilder] Loaded saved config from persistence:', {
                nodeId,
                config,
                dynamicOptions
              });
            }
          }
        } catch (error) {
          console.error('❌ [WorkflowBuilder] Failed to load from persistence:', error);
          // Fall back to workflow store config
        }
      }

      setConfiguringNode({ id: nodeId, integration: coreIntegration, nodeComponent, config, dynamicOptions })
    } else if (integration && nodeComponent) {

      // Try to load configuration from our persistence system first
      let config = { ...(nodeToConfigure.data.config || {}) }
      let dynamicOptions = nodeToConfigure.data.savedDynamicOptions || {}

      if (dynamicOptions && Object.keys(dynamicOptions).length > 0) {
        config.__dynamicOptions = dynamicOptions
      }

      if (nodeToConfigure.data.validationState) {
        config.__validationState = nodeToConfigure.data.validationState
      }

      if (typeof window !== "undefined") {
        try {
          // Extract workflow ID from URL
          const pathParts = window.location.pathname.split('/')
          const builderIndex = pathParts.indexOf('builder')
          const workflowId = builderIndex !== -1 && pathParts.length > builderIndex + 1 ? pathParts[builderIndex + 1] : null

          if (workflowId) {

            // IMPORTANT: await the async loadNodeConfig function
            const savedNodeData = await loadNodeConfig(workflowId, nodeId, nodeToConfigure.data.type as string)
            if (savedNodeData) {
              // Use saved config and dynamicOptions if available
              config = savedNodeData.config || config
              dynamicOptions = savedNodeData.dynamicOptions || dynamicOptions
              console.log('📋 [WorkflowBuilder] Loaded saved config from persistence:', {
                nodeId,
                config,
                dynamicOptions
              });
            }
          }
        } catch (error) {
          console.error('❌ [WorkflowBuilder] Failed to load from persistence:', error);
          // Fall back to workflow store config
        }
      }

      console.log('📋 [WorkflowBuilder] Setting configuringNode with config:', {
        nodeId,
        nodeType: nodeComponent.type,
        configFromNode: nodeToConfigure.data.config,
        configFromPersistence: config,
        finalConfig: config,
        dynamicOptions
      });
      setConfiguringNode({ id: nodeId, integration, nodeComponent, config, dynamicOptions })
    }
  }, [getNodes, openTriggerDialog])

  // Helper function to create Add Action nodes with consistent properties
  const createAddActionNode = (id: string, parentId: string, position: { x: number; y: number }, additionalData?: any): Node => {
    return {
      id,
      type: 'addAction',
      position,
      draggable: false, // Add Action nodes cannot be dragged independently
      selectable: false, // Prevent selection to avoid confusion
      focusable: false, // Don't allow focus for cleaner UX
      data: {
        parentId,
        onClick: () => handleAddActionClick(id, parentId),
        ...additionalData
      }
    }
  }

  const handleAddActionClick = useCallback((nodeId: string, parentId: string, isFromChainPlaceholder: boolean = false) => {
    // Check if there's already a trigger in the workflow
    const hasTrigger = getNodes().some(node =>
      node.id === 'trigger' ||
      node.data?.isTrigger === true ||
      (typeof node.data?.type === 'string' && node.data.type.includes('trigger'))
    )

    if (!hasTrigger && nodeId.includes('add-action-trigger')) {
      // This is the initial add button and there's no trigger - open trigger dialog
      openTriggerDialog()
    } else {
      // Normal action adding - just open the dialog
      // The useEffect will fetch integrations when the dialog opens
      setSourceAddNode({ id: nodeId, parentId })

      // If this is from a chain placeholder, default to AI mode
      if (isFromChainPlaceholder) {
        setIsActionAIMode(true)
      }

      openActionDialog()
    }
  }, [getNodes, integrations, integrationsLoading, fetchIntegrations, openTriggerDialog, openActionDialog])
  // Listen for custom event from chain placeholder add action buttons
  React.useEffect(() => {
    const handleChainPlaceholderAddAction = (event: CustomEvent) => {
      const { nodeId, parentId, isFromChainPlaceholder } = event.detail;
      console.log('Chain placeholder add action event received:', event.detail);
      handleAddActionClick(nodeId, parentId, isFromChainPlaceholder);
    };

    window.addEventListener('chain-placeholder-add-action', handleChainPlaceholderAddAction as EventListener);

    return () => {
      window.removeEventListener('chain-placeholder-add-action', handleChainPlaceholderAddAction as EventListener);
    };
  }, [handleAddActionClick]);

  // Handle insert action between nodes
  const handleInsertAction = useCallback((sourceNodeId: string, targetNodeId: string) => {
    setSourceAddNode({ 
      id: `insert-${sourceNodeId}-${targetNodeId}`, 
      parentId: sourceNodeId,
      insertBefore: targetNodeId 
    })
    openActionDialog()
  }, [openActionDialog])

  const handleActionDialogClose = useCallback((open: boolean) => {
    if (!open) {
      // Always clear sourceAddNode when dialog closes to prevent reopening
      setSourceAddNode(null)
      setSelectedIntegration(null)
      setSelectedAction(null)
      setSearchQuery("")
    }
    setShowActionDialog(open)
  }, [])

  // Handle trigger selection
  const handleTriggerSelect = useCallback((integration: IntegrationInfo, trigger: NodeComponent) => {
    
    // Create a new trigger node
    const newNodeId = 'trigger'
    const newNode: Node = {
      id: newNodeId,
      type: 'custom',
      position: { x: 400, y: 100 },
      data: {
        ...trigger,
        isTrigger: true,
        providerId: integration.id,
        config: {},
        onConfigure: handleConfigureNode,
        onDelete: (id: string) => handleDeleteNodeWithConfirmationRef.current?.(id),
        onRename: (id: string, title: string) => handleRenameNodeRef.current?.(id, title),
        onChangeTrigger: handleChangeTrigger
      }
    }
    
    // Check if there are existing action nodes to preserve
    const currentNodes = getNodes();
    const existingActionNodes = currentNodes.filter(n =>
      n.type === 'custom' &&
      !n.data?.isTrigger &&
      n.data?.type !== 'addAction'
    );
    const existingTrigger = currentNodes.find(n => n.data?.isTrigger);

    // Get existing edges to preserve connections
    const currentEdges = getEdges();
    const triggerOutgoingEdges = existingTrigger
      ? currentEdges.filter(e => e.source === existingTrigger.id)
      : [];

    // Update nodes
    setNodes((nds) => {
      // Remove old trigger and add action nodes
      const filteredNodes = nds.filter(n =>
        n.id !== 'trigger' &&
        !n.data?.isTrigger &&
        n.type !== 'addAction'
      );

      // If we have existing action nodes, just add the new trigger
      if (existingActionNodes.length > 0) {
        return [newNode, ...filteredNodes];
      } else {
        // No existing actions, create an add action node
        const addActionId = `add-action-${newNodeId}-${Date.now()}`;
        const addActionNode = createAddActionNode(
          addActionId,
          newNodeId,
          { x: 400, y: 260 }
        );
        return [newNode, addActionNode];
      }
    });

    // Update edges to preserve connections
    setEdges((eds) => {
      // Remove old trigger-related edges
      const nonTriggerEdges = eds.filter(e =>
        !e.source.includes('trigger') &&
        !e.id.includes('trigger')
      );

      // If we had connections from the old trigger to actions, recreate them
      if (triggerOutgoingEdges.length > 0 && existingActionNodes.length > 0) {
        const newTriggerEdges = triggerOutgoingEdges.map(edge => ({
          ...edge,
          id: `edge-${newNodeId}-${edge.target}`,
          source: newNodeId
        }));
        return [...nonTriggerEdges, ...newTriggerEdges];
      } else if (existingActionNodes.length === 0) {
        // No existing actions, create edge to add action node
        const addActionId = `add-action-${newNodeId}-${Date.now()}`;
        const newEdge: Edge = {
          id: `edge-${newNodeId}-${addActionId}`,
          source: newNodeId,
          target: addActionId,
          animated: false,
          style: { stroke: "#d1d5db", strokeWidth: 1, strokeDasharray: "5,5" },
          type: "straight"
        }
        return [...nonTriggerEdges, newEdge];
      } else {
        // We have action nodes but no existing connections, try to restore from session storage
        let restoredEdges: Edge[] = []
        try {
          const raw = sessionStorage.getItem('preservedTriggerTargets')
          const targets: string[] = raw ? JSON.parse(raw) : []
          if (Array.isArray(targets) && targets.length > 0) {
            restoredEdges = targets.map(t => ({
              id: `edge-${newNodeId}-${t}`,
              source: newNodeId,
              target: t,
              animated: false,
              style: { stroke: "#d1d5db", strokeWidth: 1 },
              type: "straight"
            }))
          }
        } catch {
          // ignore parse errors
        } finally {
          sessionStorage.removeItem('preservedTriggerTargets')
        }
        return [...nonTriggerEdges, ...restoredEdges];
      }
    })
    
    // Clean up preserved action nodes snapshot (no longer needed)
    sessionStorage.removeItem('preservedActionNodes')

    // Close the dialog
    setShowTriggerDialog(false)
    setSelectedIntegration(null)
    setSelectedTrigger(null)
    setSearchQuery("")
    
    // Mark as having unsaved changes
    setHasUnsavedChanges(true)
    
    // Open configuration if needed
    // Manual trigger should NOT open configuration
    // Schedule trigger should always open configuration
    console.log('🔧 [Trigger Config Check]', {
      triggerType: trigger.type,
      needsConfig: nodeNeedsConfiguration && nodeNeedsConfiguration(trigger),
      willOpenConfig: trigger.type === 'schedule' || (trigger.type !== 'manual' && nodeNeedsConfiguration && nodeNeedsConfiguration(trigger))
    })

    // Skip configuration for manual trigger - it doesn't need any
    if (trigger.type === 'manual') {
      toast({
        title: "Manual Trigger Added",
        description: "Your workflow will run when you click the 'Test Workflow' button."
      })
      // Ensure the view fits to show the new trigger node
      setTimeout(() => {
        fitView({ padding: 0.2, duration: 200 })
      }, 100)
    } else if (trigger.type === 'schedule' || (nodeNeedsConfiguration && nodeNeedsConfiguration(trigger))) {
      console.log('⏰ Opening configuration modal for node:', newNodeId)
      setTimeout(() => {
        console.log('⏰ Calling handleConfigureNode for:', newNodeId)
        handleConfigureNode(newNodeId)
      }, 100)
    }
  }, [setNodes, setEdges, handleConfigureNode, handleChangeTrigger, handleAddActionClick, fitView])

  // Forward declare these functions to avoid initialization issues
  // They will be properly defined later but we need references for handleActionSelect
  const handleDeleteNodeWithConfirmationRef = useRef<(nodeId: string) => void>()
  const handleRenameNodeRef = useRef<(nodeId: string, newTitle: string) => void>()
  const handleAddChainRef = useRef<(aiAgentNodeId: string) => void>()

  // Helper function to handle node insertion logic
  const handleNodeInsertion = useCallback((newNode: Node, sourceAddNode: any, parentNode: any, verticalSpacing: number) => {
    // Don't create add action node for chain placeholders - they have internal buttons
    const shouldCreateAddAction = newNode.data?.type !== 'chain_placeholder'

    if (shouldCreateAddAction) {
      // Create Add Action node after the new action
      const addActionId = `add-action-${newNode.id}-${Date.now()}`
      const addActionNode = createAddActionNode(
        addActionId,
        newNode.id,
        {
          x: newNode.position.x,
          y: newNode.position.y + verticalSpacing
        }
      )

      // Handle insertion between nodes if needed
      if (sourceAddNode.insertBefore) {
        // Insert between two nodes
        setNodes((nds) => [...nds.filter(n => n.type !== 'addAction'), newNode, addActionNode])

        setEdges((eds) => {
          const updatedEdges = eds.filter(e =>
            !(e.source === sourceAddNode.parentId && e.target === sourceAddNode.insertBefore)
          )

          // Add edges for the new node
          updatedEdges.push({
            id: `${sourceAddNode.parentId}-${newNode.id}`,
            source: sourceAddNode.parentId,
            target: newNode.id,
            type: 'custom',
            animated: false,
            style: { stroke: '#94a3b8', strokeWidth: 2 }
          })

          updatedEdges.push({
            id: `${newNode.id}-${sourceAddNode.insertBefore}`,
            source: newNode.id,
            target: sourceAddNode.insertBefore,
            type: 'custom',
            animated: false,
            style: { stroke: '#94a3b8', strokeWidth: 2 }
          })

          updatedEdges.push({
            id: `${newNode.id}-${addActionId}`,
            source: newNode.id,
            target: addActionId,
            type: 'straight',
            animated: true,
            style: { stroke: '#b1b1b7', strokeWidth: 2, strokeDasharray: '5,5' }
          })

          return updatedEdges
        })
      } else {
        // Replace the add action node with the new action and new add action
        setNodes((nds) => {
          const filtered = nds.filter(n => n.id !== sourceAddNode.id)
          return [...filtered, newNode, addActionNode]
        })

        // Update edges to point to the new node
        setEdges((eds) => {
          const updatedEdges = eds.map(edge => {
            if (edge.target === sourceAddNode.id) {
              // Update the edge to point to the new node
              // Check if this is from an AI Agent (check both node type and if replacing a placeholder)
              const nodes = getNodes()
              const sourceNode = nodes.find(n => n.id === edge.source)
              const targetNode = nodes.find(n => n.id === sourceAddNode.id)
              const isFromAIAgent = sourceNode?.data?.type === 'ai_agent'
              const isReplacingPlaceholder = targetNode?.data?.type === 'chain_placeholder'

              // If it's from AI agent or we're replacing a chain placeholder, ensure solid line
              if (isFromAIAgent || isReplacingPlaceholder) {
                return {
                  ...edge,
                  target: newNode.id,
                  style: { stroke: '#94a3b8', strokeWidth: 2 },  // Force solid line style
                  type: 'custom',
                  animated: false
                }
              } else {
                return { ...edge, target: newNode.id }
              }
            }
            return edge
          })

          // Add edge to the new Add Action node
          updatedEdges.push({
            id: `${newNode.id}-${addActionId}`,
            source: newNode.id,
            target: addActionId,
            type: 'straight',
            animated: true,
            style: { stroke: '#b1b1b7', strokeWidth: 2, strokeDasharray: '5,5' }
          })

          return updatedEdges
        })
      }
    } else {
      // Just add the node without an add action button (for chain placeholders)
      if (sourceAddNode.insertBefore) {
        setNodes((nds) => [...nds.filter(n => n.type !== 'addAction'), newNode])
        setEdges((eds) => {
          const updatedEdges = eds.filter(e =>
            !(e.source === sourceAddNode.parentId && e.target === sourceAddNode.insertBefore)
          )

          updatedEdges.push({
            id: `${sourceAddNode.parentId}-${newNode.id}`,
            source: sourceAddNode.parentId,
            target: newNode.id,
            type: 'custom',
            animated: false,
            style: { stroke: '#94a3b8', strokeWidth: 2 }
          })

          updatedEdges.push({
            id: `${newNode.id}-${sourceAddNode.insertBefore}`,
            source: newNode.id,
            target: sourceAddNode.insertBefore,
            type: 'custom',
            animated: false,
            style: { stroke: '#94a3b8', strokeWidth: 2 }
          })

          return updatedEdges
        })
      } else {
        setNodes((nds) => {
          const filtered = nds.filter(n => n.id !== sourceAddNode.id)
          return [...filtered, newNode]
        })

        setEdges((eds) => eds.map(edge => {
          if (edge.target === sourceAddNode.id) {
            // Update the edge to point to the new node
            // Check if this is from an AI Agent (check both node type and if replacing a placeholder)
            const nodes = getNodes()
            const sourceNode = nodes.find(n => n.id === edge.source)
            const targetNode = nodes.find(n => n.id === sourceAddNode.id)
            const isFromAIAgent = sourceNode?.data?.type === 'ai_agent'
            const isReplacingPlaceholder = targetNode?.data?.type === 'chain_placeholder'

            // If it's from AI agent or we're replacing a chain placeholder, ensure solid line
            if (isFromAIAgent || isReplacingPlaceholder) {
              return {
                ...edge,
                target: newNode.id,
                style: { stroke: '#94a3b8', strokeWidth: 2 },  // Force solid line style
                type: 'custom',
                animated: false
              }
            } else {
              return { ...edge, target: newNode.id }
            }
          }
          return edge
        }))
      }
    }
  }, [setNodes, setEdges])

  // Handle action selection
  const handleActionSelect = useCallback((integration: IntegrationInfo, action: NodeComponent) => {

    if (!sourceAddNode) {
      toast({
        title: "Cannot Add Action",
        description: "Please use the 'Add Action' button on a node to add new actions.",
        variant: "destructive"
      })
      setShowActionDialog(false)
      return
    }

    // Generate unique node ID
    const timestamp = Date.now()
    const randomId = Math.random().toString(36).substr(2, 9)
    const newNodeId = `node-${timestamp}-${randomId}`

    // Check if this action requires configuration
    const requiresConfig = nodeNeedsConfiguration && nodeNeedsConfiguration(action)

    // If AI mode is enabled, skip configuration and add the action with AI-configured fields
    if (isActionAIMode && requiresConfig) {
      // Create config with all fields set to AI mode
      const aiConfig: Record<string, any> = {}

      // Get field schema for this action
      if (action.configSchema) {
        action.configSchema.forEach((field: any) => {
          // Set each field to use AI placeholder
          aiConfig[field.name] = `{{AI_FIELD:${field.name}}}`
        })
      }

      // Add the node immediately with AI configuration
      const allNodes = getNodes()
      const parentNode = allNodes.find(n => n.id === sourceAddNode.parentId)

      // Check if the parent is a chain placeholder - if so, we should replace it at its position
      const isReplacingPlaceholder = parentNode?.data?.type === 'chain_placeholder'
      const basePosition = parentNode ? parentNode.position : { x: 400, y: 300 }

      // Check if parent is an AI agent chain node to determine spacing
      const isChainNode = parentNode?.data?.isAIAgentChild || parentNode?.data?.parentAIAgentId
      const verticalSpacing = isChainNode ? 120 : 160

      // Create new action node with AI configuration
      const newNode: Node = {
        id: newNodeId,
        type: 'custom',
        position: {
          x: basePosition.x,
          // If replacing a placeholder, use its exact position; otherwise add spacing
          y: isReplacingPlaceholder ? basePosition.y : basePosition.y + verticalSpacing
        },
        data: {
          ...action,
          providerId: integration.id,
          config: aiConfig,
          isAIConfigured: true, // Flag to indicate this was configured by AI mode
          onConfigure: handleConfigureNode,
          onDelete: (id: string) => handleDeleteNodeWithConfirmationRef.current?.(id),
          onRename: (id: string, title: string) => handleRenameNodeRef.current?.(id, title),
          // Preserve chain metadata if adding to a chain
          ...(parentNode?.data?.isAIAgentChild ? {
            isAIAgentChild: true,
            parentAIAgentId: parentNode.data.parentAIAgentId,
            parentChainIndex: parentNode.data.parentChainIndex
          } : {})
        }
      }

      // Handle insertion logic
      handleNodeInsertion(newNode, sourceAddNode, parentNode, verticalSpacing)

      // Close dialog and reset state
      setShowActionDialog(false)
      setSourceAddNode(null)
      setSelectedIntegration(null)
      setSelectedAction(null)
      setSearchQuery("")
      setIsActionAIMode(false) // Reset AI mode after use

      toast({
        title: "Action Added",
        description: `${action.title} has been added with AI configuration.`,
      })

      return
    }

    if (requiresConfig && !isActionAIMode) {
      // Store the pending node info but don't add it yet
      setPendingNode({
        type: 'action',
        integration,
        nodeComponent: action,
        sourceNodeInfo: sourceAddNode,
        nodeId: newNodeId
      } as any)
      
      // Close dialog
      setShowActionDialog(false)
      setSourceAddNode(null)
      setSelectedIntegration(null)
      setSelectedAction(null)
      setSearchQuery("")
      
      // Open configuration modal
      setConfiguringNode({
        id: newNodeId,
        integration,
        nodeComponent: action,
        config: {}
      })
    } else {
      // Add the node immediately if no configuration is needed
      const allNodes = getNodes()
      const parentNode = allNodes.find(n => n.id === sourceAddNode.parentId)

      // Check if the parent is a chain placeholder - if so, we should replace it at its position
      const isReplacingPlaceholder = parentNode?.data?.type === 'chain_placeholder'
      const basePosition = parentNode ? parentNode.position : { x: 400, y: 300 }

      // Create new action node with proper handlers
      const newNode: Node = {
        id: newNodeId,
        type: 'custom',
        position: {
          x: basePosition.x,
          // If replacing a placeholder, use its exact position; otherwise add spacing
          y: isReplacingPlaceholder ? basePosition.y : basePosition.y + 160
        },
        data: {
          ...action,
          providerId: integration.id,
          config: {},
          onConfigure: handleConfigureNode,
          onDelete: (id: string) => handleDeleteNodeWithConfirmationRef.current?.(id),
          onRename: (id: string, title: string) => handleRenameNodeRef.current?.(id, title)
        }
      }
      
      // Create Add Action node after the new action
      const addActionId = `add-action-${newNodeId}-${Date.now()}`
      const addActionNode = createAddActionNode(
        addActionId,
        newNodeId,
        {
          x: basePosition.x,
          // If we replaced a placeholder, the Add Action should be 160px below the placeholder's original position
          // Otherwise, it should be 320px below the parent (160px below the new action)
          y: isReplacingPlaceholder ? basePosition.y + 160 : basePosition.y + 320
        }
      )
      
      // Handle insertion between nodes if needed
      if (sourceAddNode.insertBefore) {
        // Insert between two nodes
        setNodes((nds) => [...nds.filter(n => n.type !== 'addAction'), newNode, addActionNode])
        
        setEdges((eds) => {
          const updatedEdges = eds.filter(e => 
            !(e.source === sourceAddNode.parentId && e.target === sourceAddNode.insertBefore)
          )
          
          // Add edges for the new node
          updatedEdges.push({
            id: `${sourceAddNode.parentId}-${newNodeId}`,
            source: sourceAddNode.parentId,
            target: newNodeId,
            type: 'custom'
          })
          
          updatedEdges.push({
            id: `${newNodeId}-${sourceAddNode.insertBefore || ''}`,
            source: newNodeId,
            target: sourceAddNode.insertBefore || '',
            type: 'custom'
          })
          
          // Add edge to Add Action node
          updatedEdges.push({
            id: `${newNodeId}-${addActionId}`,
            source: newNodeId,
            target: addActionId,
            animated: false,
            style: { stroke: "#d1d5db", strokeWidth: 1, strokeDasharray: "5,5" },
            type: "straight"
          })
          
          return updatedEdges
        })
      } else {
        // Add at the end (replacing the Add Action button that was clicked)
        setNodes((nds) => [...nds.filter(n => n.id !== sourceAddNode.id), newNode, addActionNode])
        
        setEdges((eds) => [
          ...eds.filter(e => e.target !== sourceAddNode.id),
          {
            id: `${sourceAddNode.parentId}-${newNodeId}`,
            source: sourceAddNode.parentId,
            target: newNodeId,
            type: 'custom'
          },
          {
            id: `${newNodeId}-${addActionId}`,
            source: newNodeId,
            target: addActionId,
            animated: false,
            style: { stroke: "#d1d5db", strokeWidth: 1, strokeDasharray: "5,5" },
            type: "straight"
          }
        ])
      }
      
      // Close dialog and clear state
      setShowActionDialog(false)
      setSourceAddNode(null)
      setSelectedIntegration(null)
      setSelectedAction(null)
      setSearchQuery("")
      
      // Mark as having unsaved changes
      setHasUnsavedChanges(true)
    }
  }, [sourceAddNode, getNodes, setNodes, setEdges, handleConfigureNode, handleAddActionClick, setPendingNode, setConfiguringNode, isActionAIMode, handleNodeInsertion, createAddActionNode, setIsActionAIMode, toast])

  // Handle renaming nodes
  const handleRenameNode = useCallback((nodeId: string, newTitle: string) => {
    setNodes((nds) => 
      nds.map((node) => {
        if (node.id === nodeId) {
          return {
            ...node,
            data: {
              ...node.data,
              title: newTitle,
              label: newTitle
            }
          }
        }
        return node
      })
    )
    setHasUnsavedChanges(true)
  }, [setNodes])
  
  // Update the ref after the function is defined
  useEffect(() => {
    handleRenameNodeRef.current = handleRenameNode
  }, [handleRenameNode])

  // Configuration modal handlers
  const handleConfigurationClose = useCallback(() => {
    // If there's a pending node, don't add it (user cancelled)
    setPendingNode(null)
    setConfiguringNode(null)
  }, [])

  const handleConfigurationSave = useCallback(async (config: Record<string, any>) => {
    if (!configuringNode) return

    // Extract dynamic options and validation metadata from the config (if included)
    const { __dynamicOptions, __validationState, ...actualConfig } = config;

    console.log('💾 [WorkflowBuilder] handleConfigurationSave called with:', {
      nodeId: configuringNode.id,
      nodeType: configuringNodeInfo?.type,
      providerId: configuringNodeInfo?.providerId,
      config: actualConfig,
      dynamicOptions: __dynamicOptions,
      validationState: __validationState,
      configuringNode
    });

    // NOTION WORKSPACE DEBUG: Log configuration for Notion nodes
    if (configuringNodeInfo?.providerId === 'notion' && config.workspace) {
    }

    // GMAIL ATTACHMENT DEBUG: Log configuration for Gmail nodes
    if (configuringNodeInfo?.providerId === 'gmail' && configuringNodeInfo?.type === 'gmail_action_send_email') {
    }

    try {
      // Check if this is a pending node that needs to be added
      if (pendingNode && (pendingNode as any).nodeId === configuringNode.id) {
        // This is a new node that was pending - add it now
        const sourceAddNode = (pendingNode as any).sourceNodeInfo
        const allNodes = getNodes()
        const parentNode = allNodes.find(n => n.id === sourceAddNode.parentId)
        const basePosition = parentNode ? parentNode.position : { x: 400, y: 300 }
        
        // Create the new action node with configuration
        const newNode: Node = {
          id: configuringNode.id,
          type: 'custom',
          position: { 
            x: basePosition.x, 
            y: basePosition.y + 160 
          },
          data: {
            ...pendingNode.nodeComponent,
            providerId: pendingNode.integration.id,
            config: actualConfig,
            savedDynamicOptions: __dynamicOptions,
            validationState: __validationState,
            onConfigure: handleConfigureNode,
            onDelete: (id: string) => handleDeleteNodeWithConfirmationRef.current?.(id),
            onRename: (id: string, title: string) => handleRenameNodeRef.current?.(id, title)
          }
        }
        
        // Create Add Action node after the new action
        const addActionId = `add-action-${configuringNode.id}-${Date.now()}`
        const addActionNode = createAddActionNode(
          addActionId,
          configuringNode.id,
          { 
            x: basePosition.x, 
            y: basePosition.y + 320 // 160px below the new action
          }
        )
        
        // Add nodes and edges
        if (sourceAddNode.insertBefore) {
          // Insert between two nodes
          setNodes((nds) => [...nds.filter(n => n.type !== 'addAction'), newNode, addActionNode])
          
          setEdges((eds) => {
            const updatedEdges = eds.filter(e => 
              !(e.source === sourceAddNode.parentId && e.target === sourceAddNode.insertBefore)
            )
            
            updatedEdges.push({
              id: `${sourceAddNode.parentId}-${configuringNode.id}`,
              source: sourceAddNode.parentId,
              target: configuringNode.id,
              type: 'custom'
            })
            
            updatedEdges.push({
              id: `${configuringNode.id}-${sourceAddNode.insertBefore || ''}`,
              source: configuringNode.id,
              target: sourceAddNode.insertBefore || '',
              type: 'custom'
            })
            
            updatedEdges.push({
              id: `${configuringNode.id}-${addActionId}`,
              source: configuringNode.id,
              target: addActionId,
              animated: false,
              style: { stroke: "#d1d5db", strokeWidth: 1, strokeDasharray: "5,5" },
              type: "straight"
            })
            
            return updatedEdges
          })
        } else {
          // Add at the end
          setNodes((nds) => [...nds.filter(n => n.id !== sourceAddNode.id), newNode, addActionNode])
          
          setEdges((eds) => [
            ...eds.filter(e => e.target !== sourceAddNode.id),
            {
              id: `${sourceAddNode.parentId}-${configuringNode.id}`,
              source: sourceAddNode.parentId,
              target: configuringNode.id,
              type: 'custom'
            },
            {
              id: `${configuringNode.id}-${addActionId}`,
              source: configuringNode.id,
              target: addActionId,
              animated: false,
              style: { stroke: "#d1d5db", strokeWidth: 1, strokeDasharray: "5,5" },
              type: "straight"
            }
          ])
        }
        
        // Clear pending node
        setPendingNode(null)
      } else {
        // This is an existing node - just update its configuration
        
        setNodes((nds) =>
          nds.map((node) => {
            if (node.id === configuringNode.id) {
              return {
                ...node,
                data: {
                  ...node.data,
                  config: actualConfig,
                  savedDynamicOptions: __dynamicOptions ?? node.data?.savedDynamicOptions,
                  validationState: __validationState ?? node.data?.validationState,
                }
              }
            }
            return node
          })
        )
      }
      
      // Mark as having unsaved changes
      setHasUnsavedChanges(true)
      
      // Close the configuration modal
      setConfiguringNode(null)
      
      // Return the node ID for any post-save processing
      return configuringNode.id
    } catch (error) {
      throw error
    }
  }, [configuringNode, pendingNode, getNodes, setNodes, setEdges, handleConfigureNode, handleAddActionClick])

  const handleSaveConfiguration = useCallback(async (node: any, config: Record<string, any>) => {
    if (!node) return
    
    try {
      // Update the node with the new configuration
      setNodes((nds) =>
        nds.map((n) => {
          if (n.id === node.id) {
            return {
              ...n,
              data: {
                ...n.data,
                config: config
              }
            }
          }
          return n
        })
      )
      
      // Mark as having unsaved changes
      setHasUnsavedChanges(true)
      
      // Return the node ID for any post-save processing
      return node.id
    } catch (error) {
      throw error
    }
  }, [setNodes])

  // Configuration modal computed values
  const configuringNodeInfo = useMemo(() => {
    if (!configuringNode) return null
    return configuringNode.nodeComponent || null
  }, [configuringNode])

  const configuringIntegrationName = useMemo(() => {
    if (!configuringNode?.integration) return ''
    return configuringNode.integration.name || configuringNode.integration.id || ''
  }, [configuringNode])

  const configuringInitialData = useMemo(() => {
    if (!configuringNode) return {}
    console.log('📊 [WorkflowBuilder] configuringInitialData computed:', {
      nodeId: configuringNode.id,
      config: configuringNode.config,
      hasConfig: !!configuringNode.config,
      configKeys: configuringNode.config ? Object.keys(configuringNode.config) : [],
      hasDynamicOptions: !!configuringNode.dynamicOptions
    });
    // Return both config and dynamicOptions for the modal
    return {
      ...(configuringNode.config || {}),
      __dynamicOptions: configuringNode.dynamicOptions // Pass dynamic options with a special key
    }
  }, [configuringNode])

  // Memoize the recalculateLayout function to prevent unnecessary calls
  const recalculateLayout = useCallback(() => {
    const nodeList = getNodes()
      .filter((n: Node) => n.type === "custom" || n.type === "addAction")
      .sort((a: Node, b: Node) => a.position.y - b.position.y)
    if (nodeList.length === 0) return

    const triggerNode = nodeList.find((n: Node) => n.data?.isTrigger)
    const basePosition = triggerNode ? { x: triggerNode.position.x, y: triggerNode.position.y } : { x: 400, y: 100 }
    const verticalGap = 200
    let currentY = basePosition.y
    
    // Use requestAnimationFrame for smoother performance
    requestAnimationFrame(() => {
      const newNodes = getNodes()
        .map((n: Node) => {
          if (n.type === "custom" || n.type === "addAction") {
            const newY = currentY
            currentY += verticalGap
            return { ...n, position: { x: basePosition.x, y: newY } }
          }
          return n
        })
        .sort((a: Node, b: Node) => a.position.y - b.position.y)
        
      let runningNodes = newNodes
        .filter((n: Node) => n.type === "custom" || n.type === "addAction")
        .sort((a: Node, b: Node) => a.position.y - b.position.y)
        
      const newEdges: Edge[] = []
      for (let i = 0; i < runningNodes.length - 1; i++) {
        const source = runningNodes[i]
        const target = runningNodes[i + 1]
        newEdges.push({
          id: `${source.id}-${target.id}`,
          source: source.id,
          target: target.id,
          animated: false,
          style: { 
            stroke: "#d1d5db", 
            strokeWidth: 1, 
            strokeDasharray: target.type === "addAction" ? "5,5" : undefined 
          },
          type: "straight",
        })
      }
      
      setNodes(newNodes)
      setEdges(newEdges)
      
      // Delay fitView to ensure layout is complete
      setTimeout(() => fitView({ padding: 0.5 }), 100)
    })
  }, [getNodes, setNodes, setEdges, fitView])

  const handleDeleteNode = useCallback((nodeId: string) => {
    // Set flag to prevent workflow reload during deletion
    setIsProcessingDeletion(true)
    
    const allNodes = getNodes()
    const allEdges = getEdges()
    const nodeToRemove = allNodes.find((n) => n.id === nodeId)
    if (!nodeToRemove) return
    
    // Check if this is an AI Agent node
    const isAIAgent = nodeToRemove.data?.type === 'ai_agent'
    
    // If it's an AI Agent, collect all child nodes to delete
    let nodesToDelete = [nodeId]
    if (isAIAgent) {
      
      // First, let's log all Add Action nodes to see what we have
      const allAddActionNodes = allNodes.filter(n => n.type === 'addAction')
      
      // Find all nodes that are children of this AI Agent
      const childNodes = allNodes.filter(n => {
        // Don't delete the AI Agent itself (already in list)
        if (n.id === nodeId) return false
        
        // Check if it's a direct child of the AI Agent (has parentAIAgentId)
        if (n.data?.parentAIAgentId === nodeId) {
          return true
        }
        
        // Check if it's marked as an AI Agent child
        if (n.data?.isAIAgentChild && n.data?.parentAIAgentId === nodeId) {
          return true
        }
        
        // Only delete Add Action nodes that are specifically part of AI Agent chains
        // Don't delete regular workflow plus buttons that might be after the AI agent
        if (n.type === 'addAction') {
          // Delete chain Add Action nodes (marked with isChainAddAction or parentAIAgentId)
          if (n.data?.parentAIAgentId === nodeId) {
            return true
          }
          // Also check if the parentId points to a node that's a child of this AI Agent
          const parentNode = allNodes.find(pn => pn.id === n.data?.parentId)
          if (parentNode?.data?.isAIAgentChild && parentNode?.data?.parentAIAgentId === nodeId) {
            return true
          }
        }
        
        // Check if it's part of an AI Agent chain (has the AI Agent ID in its ID)
        // This catches chain placeholders and other nodes created with the AI Agent ID pattern
        if (n.id.includes(`${nodeId}-chain`) || n.id.includes(`${nodeId}-rt-chain`)) {
          return true
        }
        
        return false
      })
      
      // Add all child nodes to the delete list
      childNodes.forEach(child => {
        nodesToDelete.push(child.id)
      })
      
    }
    
    // Check if we're deleting from an AI Agent chain
    const isAIAgentChainNode = nodeToRemove.data?.isAIAgentChild && nodeToRemove.data?.parentAIAgentId
    
    // Find nodes to reposition after deletion (only for AI Agent chains)
    let nodesToReposition: string[] = []
    let repositionAmount = 0
    
    if (isAIAgentChainNode && !isAIAgent) {
      // Get the chain index of the deleted node
      const deletedNodeChainIndex = nodeToRemove.data?.parentChainIndex
      const deletedNodeParentId = nodeToRemove.data?.parentAIAgentId
      
      // Count remaining nodes in this chain after deletion
      const remainingChainNodes = allNodes.filter(n => {
        return n.data?.parentAIAgentId === deletedNodeParentId && 
               n.data?.parentChainIndex === deletedNodeChainIndex &&
               !nodesToDelete.includes(n.id) &&
               n.type !== 'addAction'
      })
      
      // Only reposition if there are remaining nodes in the chain
      // If the chain is empty, no repositioning is needed since nodes stay in place
      if (remainingChainNodes.length > 0) {
        
        // Find all nodes below the deleted node in the SAME chain only
        const deletedNodePos = nodeToRemove.position
        const nodesBelow = allNodes.filter(n => {
          // Must be in the same chain (same parent AI Agent and chain index)
          const sameChain = n.data?.parentAIAgentId === deletedNodeParentId && 
                           n.data?.parentChainIndex === deletedNodeChainIndex
          
          // Must be below the deleted node
          const isBelow = n.position.y > deletedNodePos.y
          
          // Must not be a node that's being deleted
          const notBeingDeleted = !nodesToDelete.includes(n.id)
          
          // Must not be an Add Action node (they get repositioned automatically)
          const notAddAction = n.type !== 'addAction'
          
          return sameChain && isBelow && notBeingDeleted && notAddAction
        })
        
        // Calculate how much to move nodes up (120px for AI chains)
        repositionAmount = -120
        nodesToReposition = nodesBelow.map(n => n.id)
        
      } else {
      }
    }
    
    // Clear configuration preferences for all deleted nodes
    const clearNodePreferences = async () => {
      try {
        // Clear configurations for all nodes being deleted
        for (const deletingNodeId of nodesToDelete) {
          const nodeToClear = allNodes.find(n => n.id === deletingNodeId)
          if (!nodeToClear) continue
          
          const nodeType = nodeToClear.data.type
          const providerId = nodeToClear.data.providerId
          
          // Clear our enhanced config persistence data
          if (currentWorkflow?.id && deletingNodeId && nodeType) {
            try {
              
              await clearNodeConfig(currentWorkflow.id, deletingNodeId, nodeType as string)
              
            } catch (configError) {
            }
          }
          
          // Clean up any uploaded files associated with this node
          if (currentWorkflow?.id && deletingNodeId) {
            // Check if this node type might have file uploads
            const fileUploadNodeTypes = [
              'google-drive:create_file',
              'google-drive:upload_file',
              'google_drive_upload_file',
              'google_drive_action_upload_file',
              // Add other node types that handle files here as needed
            ];
            
            if (nodeType && fileUploadNodeTypes.includes(nodeType)) {
              try {
                
                // Get the user session for auth
                const { data: { session } } = await supabase.auth.getSession();
                if (session) {
                  // Call the DELETE endpoint to clean up files
                  const response = await fetch(
                    `/api/workflows/files/upload?nodeId=${deletingNodeId}&workflowId=${currentWorkflow.id}`,
                    {
                      method: 'DELETE',
                      headers: {
                        'Authorization': `Bearer ${session.access_token}`,
                      },
                    }
                  );
                  
                  if (response.ok) {
                  } else {
                  }
                }
              } catch (fileError) {
              }
            }
          }
          
          if (nodeType && providerId) {
            // Since we can't easily identify which preferences belong to which node,
            // we'll clear ALL preferences for this node type and provider
            // This is a temporary solution until we implement proper node isolation
            const response = await fetch(`/api/user/config-preferences?nodeType=${encodeURIComponent(nodeType as string)}&providerId=${encodeURIComponent(providerId as string)}`, {
              method: "DELETE"
            })
            
            if (response.ok) {
            } else {
            }
          }
        }
      } catch (error) {
      }
    }
    
    // Clear preferences immediately
    clearNodePreferences()
    
    // If we're deleting the trigger or this is the last custom node, reset the workflow
    const customNodes = allNodes.filter((n: Node) => n.type === "custom")
    if (nodeToRemove.data.isTrigger || customNodes.length <= 1) {
      // Clear all configuration preferences when resetting the workflow
      const clearAllPreferences = async () => {
        try {
          
          // Clear all preferences for this user
          const response = await fetch(`/api/user/config-preferences`, {
            method: "DELETE"
          })
          
          if (response.ok) {
          } else {
          }
        } catch (error) {
        }
      }
      
      clearAllPreferences()
      setNodes([])
      setEdges([])
      return
    }
    
    // Find the node before the deleted node (by following edges)
    const incomingEdge = allEdges.find(e => e.target === nodeId)
    const previousNodeId = incomingEdge?.source
    
    // Find nodes that come after the deleted node
    const outgoingEdges = allEdges.filter(e => e.source === nodeId)
    
    // Remove all nodes in the delete list and their related edges
    const nodesAfterRemoval = allNodes.filter((n: Node) => !nodesToDelete.includes(n.id))
    let edgesAfterRemoval = allEdges.filter((e: Edge) => 
      !nodesToDelete.includes(e.source) && !nodesToDelete.includes(e.target)
    )
    
    // Remove any add action nodes that were connected to deleted nodes
    let cleanedNodes = nodesAfterRemoval.filter((n: Node) => {
      // Check if this is an add action node connected to any deleted node
      if (n.type === "addAction") {
        const parentId = n.data.parentId
        if (parentId && nodesToDelete.includes(parentId as string)) {
          return false
        }
      }
      return true
    })
    
    // Additional cleanup: Remove orphaned Add Action buttons from AI Agent chains
    // when the last action in a chain is deleted
    if (isAIAgentChainNode && !isAIAgent) {
      
      // Find the parent AI Agent node
      const parentAIAgentId = nodeToRemove.data?.parentAIAgentId
      const chainIndex = nodeToRemove.data?.parentChainIndex
      
      if (parentAIAgentId !== undefined) {
        // Check if there are any remaining nodes in this specific chain
        const remainingChainNodes = cleanedNodes.filter(n => 
          n.data?.isAIAgentChild && 
          n.data?.parentAIAgentId === parentAIAgentId &&
          n.data?.parentChainIndex === chainIndex &&
          n.type !== 'addAction' // Don't count Add Action buttons
        )
        
        
        // If no nodes remain in this chain, remove its Add Action button and mark chain as emptied
        if (remainingChainNodes.length === 0) {
          
          // Find and remove the Add Action button for this chain
          const removedAddActionIds: string[] = []
          cleanedNodes = cleanedNodes.filter(n => {
            if (n.type === 'addAction' && 
                n.data?.parentAIAgentId === parentAIAgentId &&
                n.data?.parentChainIndex === chainIndex) {
              removedAddActionIds.push(n.id)
              return false
            }
            return true
          })
          
          // Also remove edges connected to the removed Add Action buttons
          if (removedAddActionIds.length > 0) {
            edgesAfterRemoval = edgesAfterRemoval.filter(e => 
              !removedAddActionIds.includes(e.source) && !removedAddActionIds.includes(e.target)
            )
          }
          
          // Mark this chain as intentionally emptied in the AI Agent node's data
          cleanedNodes = cleanedNodes.map(n => {
            if (n.id === parentAIAgentId && n.data?.type === 'ai_agent') {
              // Initialize emptiedChains array if it doesn't exist
              const emptiedChains = n.data.emptiedChains || []
              if (!emptiedChains.includes(chainIndex)) {
                emptiedChains.push(chainIndex)
              }
              
              
              return {
                ...n,
                data: {
                  ...n.data,
                  emptiedChains: emptiedChains
                }
              }
            }
            return n
          })
        }
      }
    }
    
    // If deleting a middle node, reconnect the chain and move nodes up
    let updatedEdges = [...edgesAfterRemoval]
    let nodesToShift: Node[] = []
    let shiftAmount = 0
    
    if (previousNodeId && outgoingEdges.length > 0) {
      // This is a middle node deletion - need to reconnect the chain
      
      // Connect the previous node to all nodes that were after the deleted node
      outgoingEdges.forEach(outgoingEdge => {
        const nextNodeId = outgoingEdge.target
        
        // Create new edge to reconnect the chain
        // Use a simpler unique ID to avoid duplicate keys with long node IDs
        const edgeId = `edge-reconnect-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
        const newEdge: Edge = {
          id: edgeId,
          source: previousNodeId,
          target: nextNodeId,
          type: 'custom',
          animated: false,
          style: { stroke: "#94a3b8", strokeWidth: 2 },
          data: {
            onAddNode: () => {
              handleInsertAction(previousNodeId, nextNodeId)
            }
          }
        }
        updatedEdges.push(newEdge)
        
        // For AI Agent chains, we need to find all nodes that should move up
        const nextNode = allNodes.find(n => n.id === nextNodeId)
        if (nextNode?.data?.isAIAgentChild) {
          // Find all nodes in this chain that are below the deleted node
          const chainNodes = cleanedNodes.filter(n => 
            n.data?.isAIAgentChild && 
            n.data?.parentAIAgentId === nextNode.data.parentAIAgentId &&
            n.data?.parentChainIndex === nextNode.data.parentChainIndex &&
            n.position.y >= nextNode.position.y
          )
          nodesToShift.push(...chainNodes)
        } else {
          // For main workflow, find all nodes below the deleted node
          const nodesBelow = cleanedNodes.filter(n => 
            !n.data?.isAIAgentChild &&
            n.position.y >= nextNode?.position.y &&
            n.type === 'custom'
          )
          nodesToShift.push(...nodesBelow)
        }
      })
      
      // Calculate how much space was freed by deleting the node
      const deletedNode = allNodes.find(n => n.id === nodeId)
      if (deletedNode && nodesToShift.length > 0) {
        // For AI Agent chains, we already handle repositioning above (120px)
        // For main workflow nodes, use standard spacing of 160px
        if (!isAIAgentChainNode) {
          shiftAmount = 160
        } else {
          // AI Agent chains are already handled by the repositioning logic above
          shiftAmount = 0
          nodesToShift = [] // Clear the shift list since we're handling it differently
        }
      }
    }
    
    // Update node positions if we need to shift them up
    let finalNodes = cleanedNodes
    
    // First apply the AI Agent chain repositioning (from lines 690-720)
    if (repositionAmount !== 0 && nodesToReposition.length > 0) {
      finalNodes = finalNodes.map(node => {
        if (nodesToReposition.includes(node.id)) {
          return {
            ...node,
            position: {
              ...node.position,
              y: node.position.y + repositionAmount // repositionAmount is negative, so this moves up
            }
          }
        }
        return node
      })
    }
    
    // Then apply the middle node deletion repositioning
    if (shiftAmount > 0 && nodesToShift.length > 0) {
      finalNodes = finalNodes.map(node => {
        if (nodesToShift.some(n => n.id === node.id)) {
          return {
            ...node,
            position: {
              ...node.position,
              y: node.position.y - shiftAmount
            }
          }
        }
        return node
      })
    }
    
    // Update the nodes and edges state
    setNodes(finalNodes)
    setEdges(updatedEdges)
    
    
    // Remove all deleted nodes from the workflow store
    nodesToDelete.forEach(deletedNodeId => {
      removeNode(deletedNodeId)
    })
    // Capture the final state for use in setTimeout callbacks
    const capturedFinalNodes = finalNodes
    const capturedUpdatedEdges = updatedEdges
    // Now rebuild the add action button logic
    setTimeout(() => {
      // Use the captured nodes that we already computed instead of getNodes()
      // This ensures we're working with the correct post-deletion state
      const currentNodes = capturedFinalNodes
      const currentEdges = capturedUpdatedEdges
      
      // Only filter out nodes that are being deleted
      const remainingCustomNodes = currentNodes.filter((n: Node) => 
        n.type === "custom" && 
        !nodesToDelete.includes(n.id)
      )
      
      if (remainingCustomNodes.length === 0) {
        return
      }
      
      // Keep track of which AI Agent chains need their Add Action buttons updated
      const chainsNeedingUpdate = new Set<string>()
      
      // If we're deleting an AI Agent child node, mark that chain for update
      nodesToDelete.forEach(nodeId => {
        const node = allNodes.find(n => n.id === nodeId)
        if (node?.data?.isAIAgentChild && node?.data?.parentAIAgentId) {
          const chainKey = `${node.data.parentAIAgentId}-chain${node.data.parentChainIndex}`
          chainsNeedingUpdate.add(chainKey)
        }
      })
      
      // Keep AI Agent chain Add Action nodes that don't need updating
      const addActionNodesToKeep = currentNodes.filter((n: Node) => {
        if (n.type !== 'addAction') return false
        if (nodesToDelete.includes(n.id)) return false
        
        // If it's an AI Agent chain Add Action
        if (n.data?.isChainAddAction && n.data?.parentAIAgentId) {
          const chainKey = `${n.data.parentAIAgentId}-chain${n.data.parentChainIndex}`
          // Keep it if this chain doesn't need updating
          return !chainsNeedingUpdate.has(chainKey)
        }
        
        // Remove main workflow Add Actions (we'll rebuild them)
        return false
      })
      
      // Remove all Add Action nodes that need to be rebuilt and apply repositioning
      const nodesWithoutRebuildingAddActions = currentNodes
        .filter((n: Node) => {
          if (nodesToDelete.includes(n.id)) return false
          if (n.type !== 'addAction') return true
          // Keep the Add Action nodes we identified above
          return addActionNodesToKeep.includes(n)
        })
        .map((n: Node) => {
          // Apply repositioning for AI Agent chain nodes
          if (nodesToReposition.includes(n.id)) {
            return {
              ...n,
              position: {
                ...n.position,
                y: n.position.y + repositionAmount
              }
            }
          }
          return n
        })
      
      // Keep edges for Add Action nodes we're keeping
      const edgesWithoutRebuildingAddActions = currentEdges.filter((e: Edge) => {
        const targetNode = currentNodes.find((n: Node) => n.id === e.target)
        const sourceNode = currentNodes.find((n: Node) => n.id === e.source)
        
        // Remove edges to/from deleted nodes
        if (nodesToDelete.includes(e.source) || nodesToDelete.includes(e.target)) {
          return false
        }
        
        // Keep edges for Add Action nodes we're keeping
        if (addActionNodesToKeep.some(n => n.id === e.source || n.id === e.target)) {
          return true
        }
        
        // Remove edges for Add Actions we're rebuilding
        if (targetNode?.type === 'addAction' || sourceNode?.type === 'addAction') {
          return false
        }
        
        return true
      })
      
      // For each AI Agent chain that needs updating, find its last node and add an Add Action button
      chainsNeedingUpdate.forEach(chainKey => {
        const [aiAgentId, chainPart] = chainKey.split('-chain')
        const chainIndex = parseInt(chainPart)
        
        // Find all nodes in this chain - including those connected but missing metadata
        // Start with nodes that have the chain metadata
        const nodesWithChainMetadata = remainingCustomNodes.filter(n => 
          n.data?.isAIAgentChild && 
          n.data?.parentAIAgentId === aiAgentId && 
          n.data?.parentChainIndex === chainIndex
        )
        
        // Find all nodes connected to this chain (even if they don't have metadata)
        const chainNodes = new Set(nodesWithChainMetadata)
        let nodesToCheck = [...nodesWithChainMetadata]
        const checkedNodes = new Set<string>()
        
        while (nodesToCheck.length > 0) {
          const currentNode = nodesToCheck.shift()!
          if (checkedNodes.has(currentNode.id)) continue
          checkedNodes.add(currentNode.id)
          
          // Find nodes connected to this one
          edgesWithoutRebuildingAddActions.forEach(edge => {
            if (edge.source === currentNode.id) {
              const targetNode = remainingCustomNodes.find(n => n.id === edge.target)
              if (targetNode && !chainNodes.has(targetNode)) {
                chainNodes.add(targetNode)
                nodesToCheck.push(targetNode)
              }
            }
            if (edge.target === currentNode.id) {
              const sourceNode = remainingCustomNodes.find(n => n.id === edge.source)
              if (sourceNode && !chainNodes.has(sourceNode) && sourceNode.data?.isAIAgentChild) {
                chainNodes.add(sourceNode)
                nodesToCheck.push(sourceNode)
              }
            }
          })
        }
        
        const chainNodesArray = Array.from(chainNodes)
        
        if (chainNodesArray.length > 0) {
          // Find the last node in this chain by Y position (furthest down)
          // This is more reliable than checking edges for complex chains
          let lastChainNode = chainNodesArray[0]; // Default to first node
          let maxY = chainNodesArray[0].position.y;
          
          // Find the node with the highest Y position (furthest down in the chain)
          for (const node of chainNodesArray) {
            if (node.position.y > maxY) {
              maxY = node.position.y;
              lastChainNode = node;
            }
          }
          
          // Create new Add Action button for this chain
          const addActionId = `add-action-${aiAgentId}-chain${chainIndex}-${Date.now()}`
          const addActionNode = createAddActionNode(
            addActionId,
            lastChainNode.id,
            {
              x: lastChainNode.position.x,
              y: lastChainNode.position.y + 160
            },
            {
              parentAIAgentId: aiAgentId,
              parentChainIndex: chainIndex,
              isChainAddAction: true
            }
          )

          nodesWithoutRebuildingAddActions.push(addActionNode)

          // Add edge to the Add Action button
          // Use a simpler edge ID to avoid duplicate keys with long node IDs
          const edgeId = `edge-chain${chainIndex}-addaction-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
          edgesWithoutRebuildingAddActions.push({
            id: edgeId,
            source: lastChainNode.id,
            target: addActionId,
            animated: false,
            style: { stroke: "#b1b1b7", strokeWidth: 2, strokeDasharray: "5,5" },
            type: "straight"
          })
        }
      })
      
      // Handle main workflow Add Action button (but not for AI Agent nodes)
      // Check if there are any AI Agent nodes remaining
      const hasAIAgentNodes = remainingCustomNodes.some(n => n.data?.type === 'ai_agent')
      
      if (!hasAIAgentNodes) {
        // No AI Agent nodes, so we need a main workflow Add Action
        const mainWorkflowNodes = remainingCustomNodes
          .filter(n => 
            !n.data?.isAIAgentChild && 
            n.data?.type !== 'ai_agent' && 
            !n.data?.isTrigger &&
            !n.id.startsWith('trigger')
          )
          .sort((a, b) => a.position.y - b.position.y)
        
        // Find the last node in the main workflow chain
        const lastMainNode = mainWorkflowNodes.find(node => {
          return !edgesWithoutRebuildingAddActions.some(edge => 
            edge.source === node.id && 
            mainWorkflowNodes.some(n => n.id === edge.target)
          )
        }) || mainWorkflowNodes[mainWorkflowNodes.length - 1]
        
        if (lastMainNode) {
          // Add new add action node after the actual last custom node
          const addActionId = `add-action-${Date.now()}`
          const addActionNode = createAddActionNode(
            addActionId,
            lastMainNode.id,
            { x: lastMainNode.position.x, y: lastMainNode.position.y + 160 }
          )
          
          nodesWithoutRebuildingAddActions.push(addActionNode)
          
          // Add edge from last node to add action button
          // Use a simpler edge ID to avoid duplicate keys with long node IDs
          const mainEdgeId = `edge-main-addaction-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
          edgesWithoutRebuildingAddActions.push({
            id: mainEdgeId,
            source: lastMainNode.id,
            target: addActionId,
            animated: false,
            style: { stroke: "#d1d5db", strokeWidth: 1, strokeDasharray: "5,5" },
            type: "straight"
          })
        } else {
          // No action nodes, but we have a trigger - add Add Action after trigger
          const triggerNode = remainingCustomNodes.find(n => 
            n.data?.isTrigger || n.id.startsWith('trigger')
          )
          
          if (triggerNode) {
            const addActionId = `add-action-${triggerNode.id}-${Date.now()}`
            const addActionNode = createAddActionNode(
              addActionId,
              triggerNode.id,
              { x: triggerNode.position.x, y: triggerNode.position.y + 160 }
            )
            
            nodesWithoutRebuildingAddActions.push(addActionNode)
            
            // Add edge from trigger to add action button
            // Use a simpler edge ID to avoid duplicate keys with long node IDs
            const triggerEdgeId = `edge-trigger-addaction-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
            edgesWithoutRebuildingAddActions.push({
              id: triggerEdgeId,
              source: triggerNode.id,
              target: addActionId,
              animated: false,
              style: { stroke: "#d1d5db", strokeWidth: 1, strokeDasharray: "5,5" },
              type: "straight"
            })
          }
        }
      }
      
      // Apply the emptiedChains update to the AI Agent node if it was updated earlier
      const finalNodes = nodesWithoutRebuildingAddActions.map(n => {
        // Find if this node was updated with emptiedChains in cleanedNodes
        const updatedNode = cleanedNodes.find(cn => cn.id === n.id && cn.data?.emptiedChains)
        if (updatedNode && n.data?.type === 'ai_agent') {
          return {
            ...n,
            data: {
              ...n.data,
              emptiedChains: updatedNode.data.emptiedChains
            }
          }
        }
        return n
      })
      
      setNodes(finalNodes)
      setEdges(edgesWithoutRebuildingAddActions)
      
      // Fit view to show the updated workflow
      setTimeout(() => fitView({ padding: 0.5 }), 100)
    }, 50)
    // Save the workflow after node deletion
    // IMPORTANT: We need to save with the captured nodes which have all the updates
    // Pass the correct nodes and edges directly
    setTimeout(async () => {
      try {
        if (currentWorkflow?.id) {
          // Use captured nodes which contains all the updates from deletion
          // Filter to only include custom nodes (not addAction nodes)
          const reactFlowNodes = capturedFinalNodes.filter((n: Node) => 
            n.type === 'custom'
          )
          // Use captured edges which has the reconnected chains
          const reactFlowEdges = capturedUpdatedEdges.filter((e: Edge) => 
            // Only save edges between custom nodes
            reactFlowNodes.some((n: Node) => n.id === e.source) && 
            reactFlowNodes.some((n: Node) => n.id === e.target)
          )

          // Map to database format (same as handleSave)
          const mappedNodes: WorkflowNode[] = reactFlowNodes.map((n: Node) => {
            // Log AI Agent nodes to check emptiedChains
            if (n.data?.type === 'ai_agent') {
            }
            const position = {
              x: typeof n.position.x === 'number' ? Math.round(n.position.x * 100) / 100 : parseFloat(parseFloat(n.position.x as unknown as string).toFixed(2)),
              y: typeof n.position.y === 'number' ? Math.round(n.position.y * 100) / 100 : parseFloat(parseFloat(n.position.y as unknown as string).toFixed(2))
            };
            
            return {
              id: n.id, 
              type: 'custom', 
              position: position,
              data: { 
                label: n.data.label as string, 
                type: n.data.type as string, 
                config: n.data.config || {},
                providerId: n.data.providerId as string | undefined,
                isTrigger: n.data.isTrigger as boolean | undefined,
                title: n.data.title as string | undefined,
                description: n.data.description as string | undefined,
                // Preserve AI Agent chain metadata
                isAIAgentChild: n.data.isAIAgentChild as boolean | undefined,
                parentAIAgentId: n.data.parentAIAgentId as string | undefined,
                parentChainIndex: n.data.parentChainIndex as number | undefined,
                // Preserve emptiedChains tracking for AI Agent nodes
                emptiedChains: n.data.emptiedChains as number[] | undefined
              },
            };
          })

          // Auto-connect unconnected triggers after deletion
          const autoConnectAfterDeletion = () => {
            const triggers = reactFlowNodes.filter((n: Node) => n.data?.isTrigger);
            const actions = reactFlowNodes.filter((n: Node) => !n.data?.isTrigger && n.data?.type !== 'addAction' && n.type === 'custom');
            let updatedEdges = [...reactFlowEdges];
            let newEdgesAdded = false;

            console.log('🔍 Deletion auto-connect check:', {
              triggers: triggers.length,
              actions: actions.length,
              currentEdges: reactFlowEdges.length
            });

            triggers.forEach((trigger: Node) => {
              const isConnected = updatedEdges.some((e: Edge) => e.source === trigger.id);

              if (!isConnected && actions.length > 0) {
                let closestAction: Node | null = null;
                let minDistance = Infinity;

                actions.forEach((action: Node) => {
                  // Skip UI placeholder nodes
                  if (action.data?.type === 'addAction' || action.data?.type === 'insertAction') {
                    return;
                  }

                  const dx = action.position.x - trigger.position.x;
                  const dy = action.position.y - trigger.position.y;
                  const distance = Math.sqrt(dx * dx + dy * dy);
                  const isRightward = dx > 0;
                  const adjustedDistance = isRightward ? distance : distance * 1.5;

                  if (adjustedDistance < minDistance) {
                    minDistance = adjustedDistance;
                    closestAction = action;
                  }
                });

                if (closestAction) {
                  // Check if this exact edge already exists (same source and target)
                  const edgeExists = updatedEdges.some((e: Edge) =>
                    e.source === trigger.id && e.target === closestAction.id
                  );

                  if (!edgeExists) {
                    const newEdge: Edge = {
                      id: `auto-${trigger.id}-${closestAction.id}-${Date.now()}-${Math.random().toString(36).substring(7)}`,
                      source: trigger.id,
                      target: closestAction.id,
                      type: 'default',
                    };
                    updatedEdges.push(newEdge);
                    newEdgesAdded = true;
                    console.log(`🔗 Auto-connected trigger ${trigger.id} to action ${closestAction.id} after deletion`);
                  }
                }
              }
            });

            if (newEdgesAdded) {
              console.log('✅ New edges added after deletion, updating React Flow');
              setEdges(updatedEdges);
            }

            return updatedEdges;
          };

          const finalEdgesAfterDeletion = autoConnectAfterDeletion();

          const mappedConnections: WorkflowConnection[] = finalEdgesAfterDeletion.map((e: Edge) => ({
            id: e.id,
            source: e.source,
            target: e.target,
            sourceHandle: e.sourceHandle ?? undefined,
            targetHandle: e.targetHandle ?? undefined,
          }))

          await updateWorkflow(currentWorkflow.id, { 
            nodes: mappedNodes, 
            connections: mappedConnections 
          })
        }
      } catch (error) {
      } finally {
        // Clear the deletion flag after save completes
        setTimeout(() => {
          setIsProcessingDeletion(false)
        }, 100)
      }
    }, 200) // Increased delay to ensure state updates with emptiedChains are complete
  }, [getNodes, getEdges, setNodes, setEdges, fitView, handleAddActionClick, removeNode, currentWorkflow, updateWorkflow])

  const handleDeleteNodeWithConfirmation = useCallback((nodeId: string) => {
    const nodeToDelete = getNodes().find((n) => n.id === nodeId)
    if (!nodeToDelete) return
    
    if (nodeToDelete.data.isTrigger) {
      // For trigger nodes, we don't delete but change trigger instead
      handleChangeTrigger()
      return
    }
    
    // For non-trigger nodes, show confirmation dialog
    setDeletingNode({ id: nodeId, name: (nodeToDelete.data.name as string) || 'this node' })
  }, [getNodes, handleChangeTrigger])
  
  // Update the ref after the function is defined
  useEffect(() => {
    handleDeleteNodeWithConfirmationRef.current = handleDeleteNodeWithConfirmation
  }, [handleDeleteNodeWithConfirmation])

  const confirmDeleteNode = useCallback(() => {
    if (!deletingNode) return
    handleDeleteNode(deletingNode.id)
    setDeletingNode(null)
  }, [deletingNode, handleDeleteNode])

  // Handle adding a node between two existing nodes
  const handleAddNodeBetween = useCallback((sourceId: string, targetId: string, position: { x: number, y: number }) => {
    
    // Check if this is an AI Agent chain (nodes have isAIAgentChild flag)
    const allNodes = getNodes()
    const sourceNode = allNodes.find(n => n.id === sourceId)
    const targetNode = allNodes.find(n => n.id === targetId)
    
    // Store context for AI Agent chains
    if (sourceNode?.data?.isAIAgentChild || targetNode?.data?.isAIAgentChild) {
    }
    
    // Set up for insertion - parentId is the source, insertBefore is the target
    setSourceAddNode({ 
      id: `insert-${sourceId}-${targetId}`, 
      parentId: sourceId,
      insertBefore: targetId,
      isAIAgentChain: sourceNode?.data?.isAIAgentChild || targetNode?.data?.isAIAgentChild,
      parentAIAgentId: sourceNode?.data?.parentAIAgentId || targetNode?.data?.parentAIAgentId
    })
    openActionDialog()
  }, [getNodes, openActionDialog])
  
  // Handle adding a new chain to an AI Agent node
  const handleAddChain = useCallback((aiAgentNodeId: string) => {
    const allNodes = getNodes()
    const aiAgentNode = allNodes.find(n => n.id === aiAgentNodeId)
    if (!aiAgentNode) return
    
    // Find all nodes that are children of this AI agent (excluding Add Action buttons)
    const childNodes = allNodes.filter(n => 
      (n.data?.parentAIAgentId === aiAgentNodeId || 
       n.id.startsWith(`${aiAgentNodeId}-chain`) ||
       n.id.includes(`${aiAgentNodeId}-node`)) &&
      n.type !== 'addAction'
    )
    
    // Find the highest chain index to determine the next chain number
    // We need to check ALL child nodes, not just placeholders, since chains may have real nodes
    let highestChainIndex = -1
    childNodes.forEach(node => {
      const chainIndex = node.data?.parentChainIndex
      if (typeof chainIndex === 'number' && chainIndex > highestChainIndex) {
        highestChainIndex = chainIndex
      }
    })
    
    // The new chain should be one more than the highest existing chain index
    const newChainNumber = highestChainIndex + 2 // +2 because highestChainIndex is 0-based, and we want the display number
    const newChainIndex = highestChainIndex + 1 // The actual 0-based index for this new chain
    
    
    // Calculate position with proper spacing
    const horizontalSpacing = 550  // Increased gap between chains to prevent overlap
    const baseY = aiAgentNode.position.y + 200  // Vertical offset from AI agent
    let newX: number
    
    if (childNodes.length === 0) {
      // First chain - directly below AI agent  
      newX = aiAgentNode.position.x
    } else {
      // Find the rightmost position of any child node
      let rightmostX = -Infinity
      
      childNodes.forEach(node => {
        if (node.position.x > rightmostX) {
          rightmostX = node.position.x
        }
      })
      
      // Place new chain to the right with spacing
      newX = rightmostX + horizontalSpacing
    }
    
    // Create a chain placeholder node with proper metadata and Add Action button
    const timestamp = Date.now()
    const randomId = Math.random().toString(36).substr(2, 9)
    const newNodeId = `${aiAgentNodeId}-chain${newChainIndex}-placeholder-${timestamp}-${randomId}`
    
    const newNode = {
      id: newNodeId,
      type: 'custom',
      position: { 
        x: newX, 
        y: baseY
      },
      data: {
        title: `Chain ${newChainIndex + 1}`, // Display as 1-based (Chain 1, Chain 2, etc.)
        description: 'Click + Add Action to add your first action',
        type: 'chain_placeholder',
        providerId: 'core',
        isTrigger: false,
        // Mark this as an AI Agent child with proper chain metadata
        isAIAgentChild: true,
        parentAIAgentId: aiAgentNodeId,
        parentChainIndex: newChainIndex, // Use the calculated chain index
        config: {},
        onConfigure: handleConfigureNode,
        onDelete: handleDeleteNodeWithConfirmation,
        onRename: handleRenameNode,
        // The placeholder should show an Add Action button inside it
        isPlaceholder: true,
        hasAddButton: true,
        onAddAction: () => {
          // When the Add Action button inside the placeholder is clicked
          // We pass the placeholder's ID as both the add action ID and parent ID
          handleAddActionClick(newNodeId, newNodeId, true)
        }
      }
    }
    
    // Add the new placeholder node
    setTimeout(() => {
      // Add only the placeholder node (no separate Add Action node)
      setNodes(nds => [...nds, newNode])
      
      // Create edge from AI Agent to the placeholder with unique ID
      const aiToPlaceholderEdge = {
        id: `e-${aiAgentNodeId}-${newNodeId}-${Date.now()}-${Math.random().toString(36).slice(2,8)}`,
        source: aiAgentNodeId,
        target: newNodeId,
        type: 'custom',
        animated: false,
        style: { stroke: '#94a3b8', strokeWidth: 2 },
        data: { 
          onAddNode: () => {
            handleInsertAction(aiAgentNodeId, newNodeId)
          }
        }
      }
      
      setEdges(eds => [...eds, aiToPlaceholderEdge])
      
      // Auto-zoom to show all nodes
      setTimeout(() => {
        fitView({ 
          padding: 0.2, 
          includeHiddenNodes: false,
          duration: 400,
          maxZoom: 2,
          minZoom: 0.05
        })
      }, 50)
    }, 100)  // Small delay to ensure shift happens first
    
    toast({
      title: "New Chain Added",
      description: `Chain ${newChainIndex + 1} has been added. Click to add actions to your chain.`
    })
  }, [getNodes, setNodes, setEdges, handleAddActionClick, handleDeleteNodeWithConfirmation, handleRenameNode, handleConfigureNode, handleInsertAction, fitView, toast])

  // Assign the ref so it can be used in other parts of the code
  React.useEffect(() => {
    handleAddChainRef.current = handleAddChain
  }, [handleAddChain])

  const onConnect = useCallback((params: Edge | Connection) => {
    setEdges((eds: Edge[]) => {
      const src = (params as any).source
      const tgt = (params as any).target
      if (!src || !tgt) return eds
      // Prevent duplicate edges between same nodes
      const exists = eds.some(e => e.source === src && e.target === tgt)
      if (exists) return eds
      // Ensure unique id for the new edge
      const safeParams = {
        id: `e-${src}-${tgt}-${Date.now()}-${Math.random().toString(36).slice(2,8)}`,
        ...params
      } as Edge
      return addEdge(safeParams, eds)
    })
  }, [setEdges])

  // Enhanced onNodesChange to make Add Action nodes follow their parent nodes
  const optimizedOnNodesChange = useCallback((changes: any) => {
    // First apply the base changes
    onNodesChange(changes)
    
    // Check if any position changes occurred
    const positionChanges = changes.filter((change: any) => change.type === 'position')
    
    if (positionChanges.length > 0) {
      setNodes((nds) => {
        const updatedNodes = [...nds]
        const currentEdges = getEdges()
        
        // For each position change, update connected Add Action nodes
        positionChanges.forEach((change: any) => {
          if (!change.position) return
          
          const parentNodeIndex = updatedNodes.findIndex(n => n.id === change.id)
          if (parentNodeIndex === -1) return
          
          // Update the parent node's position if it's being dragged
          if (change.dragging !== false) {
            updatedNodes[parentNodeIndex] = {
              ...updatedNodes[parentNodeIndex],
              position: change.position
            }
          }
          
          // Find Add Action nodes connected to this node via edges
          const connectedAddActions = currentEdges
            .filter(edge => edge.source === change.id)
            .map(edge => updatedNodes.find(n => n.id === edge.target))
            .filter(node => node && node.type === 'addAction')
          
          // Also check by parentId and ID patterns as fallback
          const addActionPatterns = [
            `add-action-${change.id}`, // Standard pattern
            `add-action-${change.id}-`, // Pattern with additional suffixes
          ]
          
          updatedNodes.forEach((node, index) => {
            if (node.type === 'addAction') {
              // Check if this Add Action is connected to the moved node
              const isConnected = connectedAddActions.some(n => n?.id === node.id)
              
              // Also check other patterns as fallback
              const belongsToParent = 
                isConnected || // Primary: Check edge connection
                node.data?.parentId === change.id || // Check parentId in data
                addActionPatterns.some(pattern => node.id.startsWith(pattern)) // Check ID patterns
              
              if (belongsToParent) {
                // For AI Agent chains, check if this is part of a chain
                const isAIAgentChain = node.data?.parentAIAgentId || node.id.includes('-chain')
                
                // Update Add Action node position to follow parent
                updatedNodes[index] = {
                  ...updatedNodes[index],
                  position: {
                    x: change.position.x,
                    y: change.position.y + 160 // Maintain 160px spacing below parent
                  }
                }
              }
            }
          })
        })
        
        return updatedNodes
      })
    }
  }, [onNodesChange, setNodes, getEdges])

  // Load workflow when component mounts with the workflow ID from URL - placeholder for actual implementation
  // useEffect(() => {
  //   // Load workflow logic here
  // }, [workflowId])

  // Auto-fit view when nodes are loaded
  useEffect(() => {
    if (nodes.length > 0) {
      // Small delay to ensure ReactFlow has rendered the nodes
      const timer = setTimeout(() => {
        fitView({ padding: 0.2, duration: 200 })
      }, 100)
      
      return () => clearTimeout(timer)
    }
  }, [nodes.length, fitView])
  
  // Fetch integrations when component mounts - only if not already loaded - WITH DEBOUNCE
  useEffect(() => {
    const componentId = Math.random().toString(36).substr(2, 9);
    
    // Always fetch integrations on mount to ensure we have the latest data
    // This is critical for showing connection status correctly
    const loadIntegrations = async () => {
      // Avoid forcing to prevent wiping existing connection cache mid-UI
      await fetchIntegrations(false);
    }
    
    loadIntegrations();
    
    // Cleanup function
    return () => {
    }
  }, []) // Empty dependency array - only run on mount

  // Listen for chain placeholder Add Action button clicks (fallback for when callback is missing)
  useEffect(() => {
    const handleChainPlaceholderAddAction = (event: CustomEvent) => {
      const { nodeId, parentId } = event.detail
      console.log('Chain placeholder Add Action clicked (fallback):', { nodeId, parentId })
      handleAddActionClick(nodeId, parentId)
    }

    window.addEventListener('chain-placeholder-add-action', handleChainPlaceholderAddAction as EventListener)

    return () => {
      window.removeEventListener('chain-placeholder-add-action', handleChainPlaceholderAddAction as EventListener)
    }
  }, [handleAddActionClick])

  // Fetch integrations when action or trigger dialog opens
  useEffect(() => {
    if (showActionDialog || showTriggerDialog) {

      // Only fetch if we don't have integrations loaded yet
      if (!integrations || integrations.length === 0) {
        fetchIntegrations(false).catch(() => {})
      }

      // EXTREMELY AGGRESSIVE banner removal
      const cleanupInterval = setInterval(() => {
        // Remove ANY element with red background
        const allElements = document.querySelectorAll('*');
        allElements.forEach(el => {
          const style = window.getComputedStyle(el);
          const bgColor = style.backgroundColor;
          const text = el.textContent || '';

          // Check for red background or the specific text
          if (bgColor && (bgColor.includes('239, 68, 68') || bgColor.includes('rgb(239') || bgColor.includes('#ef4444')) ||
              text.includes('THIS IS THE ACTION DIALOG FROM') ||
              text.includes('IF YOU SEE THIS')) {
            console.log('🔥 REMOVING ELEMENT:', el);
            el.remove();
          }
        });

        // Also remove any element with inline styles containing red
        const inlineRed = document.querySelectorAll('[style*="red"], [style*="239, 68, 68"], [style*="#ef4444"]');
        inlineRed.forEach(el => {
          if (el.textContent && (el.textContent.includes('THIS IS THE ACTION') || el.textContent.includes('IF YOU SEE THIS'))) {
            el.remove();
          }
        });
      }, 50); // Run every 50ms

      // Keep running for 5 seconds
      setTimeout(() => clearInterval(cleanupInterval), 5000);

      return () => clearInterval(cleanupInterval);
    }
  }, [showActionDialog, showTriggerDialog, fetchIntegrations, integrations])

  // Periodic cleanup of stuck save states
  useEffect(() => {
    const interval = setInterval(() => {
      // If we've been "saving" for more than 30 seconds, it's probably stuck
      if (isSavingRef.current && !isSaving) {
        console.warn('⚠️ Cleaning up stuck save state (ref without state)');
        isSavingRef.current = false;
      }
    }, 10000); // Check every 10 seconds

    return () => clearInterval(interval);
  }, [isSaving])
  // Main save function with auto-retry and recovery
  const handleSave = async (retryCount: any = 0, maxRetries = 3) => {
    // Ensure retryCount is a number (protect against event objects being passed)
    if (typeof retryCount !== 'number') {
      retryCount = 0;
    }

    if (!currentWorkflow) {
      return
    }

    // Check both the state and ref to prevent duplicate saves
    if (isSaving || isSavingRef.current) {
      console.log('⚠️ Already saving, skipping duplicate save');
      return
    }

    // CRITICAL: Prevent saving if React Flow isn't ready yet
    if (!reactFlowInitialized) {
      console.warn('⚠️ [SAFETY] React Flow not initialized yet, deferring save...');
      toast({
        title: "Please Wait",
        description: "Workflow is still loading. Please try saving again in a moment.",
        variant: "default"
      });

      // Retry after a delay
      setTimeout(() => {
        handleSave(retryCount, maxRetries);
      }, 1500);
      return;
    }

    const currentNodes = getNodes();
    if (!currentNodes || currentNodes.length === 0) {
      console.warn('⚠️ [SAFETY] React Flow nodes not loaded yet, deferring save...');

      // If we previously had nodes, this is likely a loading issue - retry after delay
      if (currentWorkflow.nodes && currentWorkflow.nodes.length > 0) {
        console.log('🔄 Workflow had nodes before, waiting for React Flow to initialize...');
        setTimeout(() => {
          handleSave(retryCount, maxRetries);
        }, 1000);
        return;
      }
    }

    // Prepare to save

    // Auto-recovery mechanism with longer timeout for large workflows
    const autoRecoveryTimer = setTimeout(() => {
      console.warn('⚠️ Save taking longer than expected, attempting auto-recovery...');

      // If still saving after 35 seconds, auto-retry (increased to match Supabase timeout)
      if (isSavingRef.current && retryCount < maxRetries) {
        console.log(`🔄 Auto-retrying save (attempt ${retryCount + 2}/${maxRetries + 1})`);
        setIsSaving(false);
        isSavingRef.current = false;
        saveTimeoutRef.current = null;


        // Auto-retry after a longer delay to let the system recover
        setTimeout(() => {
          handleSave(retryCount + 1, maxRetries);
        }, 2000); // Increased to 2 seconds
      } else if (retryCount >= maxRetries) {
        // Only show error after all retries exhausted
        console.error('❌ Save failed after maximum retries');
        setIsSaving(false);
        isSavingRef.current = false;
        saveTimeoutRef.current = null;


        toast({
          title: "Save Failed",
          description: "Unable to save after multiple attempts. Your changes are preserved locally. Try refreshing the page.",
          variant: "destructive"
        });
      }
    }, 35000); // 35 second check for auto-recovery (slightly longer than Supabase timeout)

    // Store the timeout reference so it can be cleared later
    saveTimeoutRef.current = autoRecoveryTimer;

    try {
      setIsSaving(true);
      isSavingRef.current = true;
      console.log('💾 Starting workflow save...')
      
      // Get current nodes and edges from React Flow
      const allNodes = getNodes();

      // SAFETY CHECK: If React Flow returns empty but we had nodes before, abort save
      if ((!allNodes || allNodes.length === 0) && currentWorkflow.nodes && currentWorkflow.nodes.length > 0) {
        console.error('❌ [SAFETY] Preventing node erasure - React Flow returned empty nodes but workflow had nodes');
        setIsSaving(false);
        isSavingRef.current = false;

        // Clear timeout if it exists
        if (saveTimeoutRef.current) {
          clearTimeout(saveTimeoutRef.current);
          saveTimeoutRef.current = null;
        }

        toast({
          title: "Save Prevented",
          description: "Workflow nodes are still loading. Please try saving again in a moment.",
          variant: "destructive"
        });

        // Retry after a delay
        setTimeout(() => {
          handleSave(retryCount, maxRetries);
        }, 2000);
        return;
      }

      const reactFlowNodes = allNodes.filter((n: Node) => n.type === 'custom')

      // Additional safety: Don't save if we're about to erase nodes
      if (reactFlowNodes.length === 0 && currentWorkflow.nodes && currentWorkflow.nodes.length > 0) {
        console.error('❌ [SAFETY] All nodes filtered out - preventing save that would erase workflow');
        setIsSaving(false);
        isSavingRef.current = false;

        if (saveTimeoutRef.current) {
          clearTimeout(saveTimeoutRef.current);
          saveTimeoutRef.current = null;
        }

        toast({
          title: "Save Error",
          description: "Unable to save - workflow nodes are missing. Please refresh the page and try again.",
          variant: "destructive"
        });
        return;
      }

      const reactFlowEdges = getEdges().filter((e: Edge) =>
        reactFlowNodes.some((n: Node) => n.id === e.source) &&
        reactFlowNodes.some((n: Node) => n.id === e.target)
      )

      // Map nodes to database format - optimize payload size
      const mappedNodes: WorkflowNode[] = reactFlowNodes.map((n: Node) => {
        const position = {
          x: typeof n.position.x === 'number' ? Math.round(n.position.x * 100) / 100 : parseFloat(parseFloat(n.position.x as unknown as string).toFixed(2)),
          y: typeof n.position.y === 'number' ? Math.round(n.position.y * 100) / 100 : parseFloat(parseFloat(n.position.y as unknown as string).toFixed(2))
        }

        // Only include non-null/non-undefined values to reduce payload size
        const data: any = {
          label: n.data.label,
          type: n.data.type,
          config: n.data.config || {}
        };

        // Only add optional fields if they have values
        if (n.data.savedDynamicOptions && Object.keys(n.data.savedDynamicOptions).length > 0) {
          data.savedDynamicOptions = n.data.savedDynamicOptions;
        }
        if (n.data.providerId) data.providerId = n.data.providerId;
        if (n.data.isTrigger) data.isTrigger = n.data.isTrigger;
        if (n.data.title) data.title = n.data.title;
        if (n.data.description) data.description = n.data.description;
        if (n.data.isAIAgentChild) data.isAIAgentChild = n.data.isAIAgentChild;
        if (n.data.parentAIAgentId) data.parentAIAgentId = n.data.parentAIAgentId;
        if (n.data.parentChainIndex !== undefined) data.parentChainIndex = n.data.parentChainIndex;
        if (n.data.emptiedChains && n.data.emptiedChains.length > 0) data.emptiedChains = n.data.emptiedChains;

        return {
          id: n.id,
          type: 'custom',
          position: position,
          data
        }
      })

      // Auto-connect unconnected triggers to closest action
      const autoConnectTriggers = () => {
        const triggers = reactFlowNodes.filter((n: Node) => n.data?.isTrigger);
        const actions = reactFlowNodes.filter((n: Node) => !n.data?.isTrigger && n.data?.type !== 'addAction' && n.type === 'custom');
        let updatedEdges = [...reactFlowEdges];
        let newEdgesAdded = false;

        console.log('🔍 Auto-connect check:', {
          triggers: triggers.length,
          actions: actions.length,
          currentEdges: reactFlowEdges.length
        });

        triggers.forEach((trigger: Node) => {
          // Check if trigger is already connected to something
          const isConnected = updatedEdges.some((e: Edge) => e.source === trigger.id);

          console.log(`🔍 Trigger ${trigger.id} connected: ${isConnected}`);

          if (!isConnected && actions.length > 0) {
            // Find the closest action node based on distance
            let closestAction: Node | null = null;
            let minDistance = Infinity;

            actions.forEach((action: Node) => {
              // Skip UI placeholder nodes
              if (action.data?.type === 'addAction' || action.data?.type === 'insertAction') {
                return;
              }

              // Calculate distance between trigger and action
              const dx = action.position.x - trigger.position.x;
              const dy = action.position.y - trigger.position.y;
              const distance = Math.sqrt(dx * dx + dy * dy);

              // Prefer actions that are to the right and below the trigger
              const isRightward = dx > 0;
              const adjustedDistance = isRightward ? distance : distance * 1.5; // Penalize leftward connections

              if (adjustedDistance < minDistance) {
                minDistance = adjustedDistance;
                closestAction = action;
              }
            });

            if (closestAction) {
              // Check if this exact edge already exists (same source and target)
              const edgeExists = updatedEdges.some((e: Edge) =>
                e.source === trigger.id && e.target === closestAction.id
              );

              if (!edgeExists) {
                // Create a new edge connecting the trigger to the closest action
                const newEdge: Edge = {
                  id: `auto-${trigger.id}-${closestAction.id}-${Date.now()}-${Math.random().toString(36).substring(7)}`,
                  source: trigger.id,
                  target: closestAction.id,
                  type: 'default',
                };
                updatedEdges.push(newEdge);
                newEdgesAdded = true;
                console.log(`🔗 Auto-connected trigger ${trigger.id} (${trigger.data?.label}) to action ${closestAction.id} (${closestAction.data?.label})`);
              } else {
                console.log(`⏭️ Edge already exists between trigger ${trigger.id} and action ${closestAction.id}`);
              }
            }
          }
        });

        if (newEdgesAdded) {
          console.log('✅ New edges added, updating React Flow');
          // Update the edges in React Flow immediately
          setEdges(updatedEdges);
        }

        return updatedEdges;
      };

      // Apply auto-connection and use the returned edges
      const finalEdges = autoConnectTriggers();

      // Map connections to database format
      const mappedConnections: WorkflowConnection[] = finalEdges.map((e: Edge) => ({
        id: e.id,
        source: e.source,
        target: e.target,
        sourceHandle: e.sourceHandle ?? undefined,
        targetHandle: e.targetHandle ?? undefined
      }))

      // Determine the name to save
      const nameToSave = workflowName && workflowName.trim() !== '' 
        ? workflowName 
        : currentWorkflow.name || 'Untitled Workflow'
      
      
      // Save to database
      let savedWorkflow;
      try {
        savedWorkflow = await updateWorkflow(currentWorkflow.id, {
          name: nameToSave,
          nodes: mappedNodes,
          connections: mappedConnections
        })

        // Debug logging to find [object object] issue
        console.log('📝 [handleSave] savedWorkflow result:', {
          type: typeof savedWorkflow,
          isObject: savedWorkflow && typeof savedWorkflow === 'object',
          hasName: savedWorkflow?.name,
          savedWorkflow: savedWorkflow
        })
      } catch (updateError) {
        console.error('❌ Failed to update workflow:', updateError)
        throw updateError // Re-throw to be handled by outer catch
      }

      // Update the current workflow with the saved data
      if (savedWorkflow) {
        setCurrentWorkflow(savedWorkflow)
        // Also update the name if it was saved
        if (savedWorkflow.name) {
          setWorkflowName(savedWorkflow.name)
        }
      }

      // Clear unsaved changes flag FIRST
      setHasUnsavedChanges(false);

      // Update last save time to prevent immediate re-checking
      lastSaveTimeRef.current = Date.now();

      // Show success toast AFTER clearing loading state
      if (retryCount === 0) {
        // Ensure toast receives proper object format
        const toastData = {
          title: "Workflow Saved",
          description: "Your workflow has been successfully saved."
        }
        console.log('📢 [handleSave] Showing success toast:', toastData)
        toast(toastData)
      } else {
        // Ensure toast receives proper object format
        const toastData = {
          title: "Save Recovered",
          description: `Workflow saved successfully after ${retryCount + 1} attempt${retryCount > 0 ? 's' : ''}.`,
          variant: "default" as const
        }
        console.log('📢 [handleSave] Showing recovery toast:', toastData)
        toast(toastData)
      }

      // Ensure UI updates are processed
      console.log('✅ Save completed successfully, clearing loading state')
      return // Exit successfully

    } catch (error: any) {
      // Auto-retry logic for recoverable errors
      const isRecoverable =
        error.message?.includes("network") ||
        error.message?.includes("timeout") ||
        error.message?.includes("timed out") ||
        error.message?.includes("abort");

      if (isRecoverable && retryCount < maxRetries) {
        console.warn(`⚠️ Save failed (${error.message}), auto-retrying in 1 second...`);

        // Auto-retry after a delay
        setTimeout(() => {
          console.log(`🔄 Retrying save (attempt ${retryCount + 2}/${maxRetries + 1})`);
          handleSave(retryCount + 1, maxRetries);
        }, 1000);

        return; // Exit early to allow retry
      }

      // Only show error if not retryable or max retries reached
      let errorMessage = "Could not save your changes. Please try again."
      if (error.message?.includes("network")) {
        errorMessage = "Network error. Please check your connection."
      } else if (error.message?.includes("unauthorized")) {
        errorMessage = "Session expired. Please refresh the page and try again."
      } else if (retryCount >= maxRetries) {
        errorMessage = `Save failed after ${maxRetries + 1} attempts. Your changes are preserved locally.`
      }

      console.error('Save error details:', error)

      // Ensure errorMessage is a string
      const safeErrorMessage = typeof errorMessage === 'string'
        ? errorMessage
        : "Could not save your changes. Please try again."

      const errorToastData = {
        title: "Error Saving Workflow",
        description: safeErrorMessage,
        variant: "destructive" as const
      }
      console.log('📢 [handleSave] Showing error toast:', errorToastData)
      toast(errorToastData)

      // Auto-cleanup any stuck requests on error
      setTimeout(() => {
        try {
          setIsExecuting(false)
          isSavingRef.current = false
          if (saveTimeoutRef.current) {
            clearTimeout(saveTimeoutRef.current)
            saveTimeoutRef.current = null
          }
        } catch {}
      }, 100);
    }
    finally {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
        saveTimeoutRef.current = null;
      }
      setIsSaving(false);
      isSavingRef.current = false;
    }
  }
  
  // Debounced save function to prevent multiple rapid save calls
  const debouncedSave = useCallback(() => {
    // Clear any pending save timeout
    if (pendingSaveTimeoutRef.current) {
      clearTimeout(pendingSaveTimeoutRef.current)
    }
    
    // Set a new timeout for the save operation
    pendingSaveTimeoutRef.current = setTimeout(async () => {
      await handleSave()
      pendingSaveTimeoutRef.current = null
    }, 500) // 500ms debounce delay
  }, [])
  // Handle toggling workflow live status
  const [isUpdatingStatus, setIsUpdatingStatus] = useState(false)
  
  const handleToggleLive = async () => {
    if (!currentWorkflow?.id) {
      toast({
        title: "Error",
        description: "No workflow to activate",
        variant: "destructive",
      })
      return
    }

    if (hasUnsavedChanges) {
      toast({
        title: "Save Required",
        description: "Please save your changes before activating the workflow",
        variant: "destructive",
      })
      return
    }

    try {
      // Activation guard: Discord new message requires server + channel; slash command requires server only
      const rfNodes = getNodes()
      const discordTrigger = rfNodes.find((n: any) => n?.data?.type === 'discord_trigger_new_message' || n?.data?.type === 'discord_trigger_slash_command')
      if (discordTrigger) {
        let guildId = discordTrigger.data?.config?.guildId
        let channelId = discordTrigger.data?.config?.channelId
        // Try persisted configuration if not in node
        if (!guildId || !channelId) {
          try {
            const savedNodeData = await loadNodeConfig(currentWorkflow.id, discordTrigger.id, discordTrigger.data?.type || '')
            guildId = guildId || savedNodeData?.config?.guildId
            channelId = channelId || savedNodeData?.config?.channelId
          } catch {}
        }
        const isSlash = discordTrigger.data?.type === 'discord_trigger_slash_command'
        const needsChannel = !isSlash
        if (!guildId || (needsChannel && !channelId)) {
          toast({
            title: "Discord trigger needs setup",
            description: needsChannel
              ? "Select a Discord server and channel in the trigger before activating."
              : "Select a Discord server in the trigger before activating.",
            variant: "destructive",
          })
          return
        }
      }

      // Check if workflow has Gmail trigger that needs webhook registration
      const gmailTrigger = rfNodes.find((n: any) =>
        n?.data?.type === 'gmail_trigger_new_email' ||
        n?.data?.nodeType === 'gmail_trigger_new_email' ||
        n?.type === 'gmail_trigger_new_email'
      )

      setIsUpdatingStatus(true)
      // Suppress unsaved-change detection during status toggle
      isSavingRef.current = true

      const newStatus = currentWorkflow.status === 'active' ? 'paused' : 'active'

      // Register Gmail webhook if activating a workflow with Gmail trigger
      if (gmailTrigger && newStatus === 'active') {
        console.log('🔔 Gmail trigger detected, registering webhook...')

        try {
          // Check if user has Gmail integration connected
          const gmailIntegration = integrations?.find(
            (int: any) => int.provider_id === 'gmail' && int.status === 'connected'
          )

          if (!gmailIntegration) {
            setIsUpdatingStatus(false)
            toast({
              title: "Gmail not connected",
              description: "Please connect your Gmail account before activating a workflow with Gmail trigger.",
              variant: "destructive",
            })
            return
          }

          // Get the session for auth
          const { data: { session: gmailSession } } = await supabase.auth.getSession()

          // Register the Gmail webhook
          const webhookResponse = await fetch('/api/workflows/webhook-registration', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              ...(gmailSession?.access_token && {
                'Authorization': `Bearer ${gmailSession.access_token}`
              })
            },
            body: JSON.stringify({
              workflowId: currentWorkflow.id,
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
            setIsUpdatingStatus(false)
            toast({
              title: "Webhook registration failed",
              description: errorData.details || errorData.error || "Could not set up Gmail notifications. Please try again.",
              variant: "destructive",
            })
            return
          }

          const webhookData = await webhookResponse.json()
          console.log('✅ Gmail webhook registered:', webhookData)

          toast({
            title: "Gmail webhook registered",
            description: "Your workflow will now receive Gmail notifications.",
          })
        } catch (error) {
          console.error('Error registering Gmail webhook:', error)
          setIsUpdatingStatus(false)
          toast({
            title: "Webhook registration failed",
            description: "Could not set up Gmail notifications. Please check your configuration.",
            variant: "destructive",
          })
          return
        }
      }
      
      console.log('🔄 Attempting to update workflow status:', {
        workflowId: currentWorkflow.id,
        currentStatus: currentWorkflow.status,
        newStatus: newStatus,
        nodes: nodes.length,
        edges: edges.length
      })
      
      // Use the API endpoint to handle RLS-protected updates
      // This will use the service role key on the server side
      const updatePayload = {
        status: newStatus,
        // Include current nodes and connections
        nodes: nodes.map(n => ({
          id: n.id,
          type: n.type,
          position: n.position,
          data: n.data
        })),
        connections: edges.map(e => ({
          id: e.id,
          source: e.source,
          target: e.target,
          type: e.type || 'straight'
        }))
      }
      
      console.log('📤 Sending update payload:', updatePayload)
      
      // Get the session for auth
      const { data: { session } } = await supabase.auth.getSession()
      
      const response = await fetch(`/api/workflows/${currentWorkflow.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          ...(session?.access_token && {
            'Authorization': `Bearer ${session.access_token}`
          })
        },
        body: JSON.stringify(updatePayload),
      })

      console.log('📨 Response status:', response.status, response.statusText)
      
      if (!response.ok) {
        let errorData
        const responseText = await response.text()
        console.log('📨 Raw error response:', responseText)
        
        try {
          errorData = JSON.parse(responseText)
        } catch (e) {
          console.error('Failed to parse error response as JSON:', e)
          errorData = { error: responseText || `Server error: ${response.status}` }
        }
        
        console.error('❌ API update error:', errorData)
        throw new Error(errorData.error || errorData.message || 'Failed to update workflow status')
      }
      
      const data = await response.json()
      console.log('✅ Workflow updated successfully:', data)

      // Update the local state without marking unsaved changes
      setCurrentWorkflow({
        ...currentWorkflow,
        status: newStatus
      })
      setHasUnsavedChanges(false)

      toast({
        title: "Success",
        description: `Workflow ${newStatus === 'active' ? 'is now live' : 'has been paused'}`,
        variant: newStatus === 'active' ? 'default' : 'secondary',
      })
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to update workflow status",
        variant: "destructive",
      })
    } finally {
      setIsUpdatingStatus(false)
      isSavingRef.current = false
    }
  }
  // Handle Test mode (sandbox) - now uses enhanced execution panel with real trigger listening
  const handleTestSandbox = async () => {
    // Set mode and show enhanced execution panel
    setEnhancedExecutionMode('sandbox')
    setShowEnhancedExecutionPanel(true)
  }

  // Handle Execute mode (live) - now uses enhanced execution panel with real external calls
  const handleExecuteLive = async () => {
    // Set mode and show enhanced execution panel
    setEnhancedExecutionMode('live')
    setShowEnhancedExecutionPanel(true)
  }

  // Legacy handleExecute - keep for backward compatibility but will be phased out
  const handleExecute = async () => {
    if (isExecuting && !listeningMode) {
      return
    }
    
    try {
      if (!currentWorkflow) {
        throw new Error("No workflow selected")
      }
      
      // Get all workflow nodes and edges FIRST to check trigger type
      const workflowNodes = getNodes().filter((n: Node) => n.type === 'custom')
      
      // Find trigger nodes
      const triggerNodes = workflowNodes.filter(node => node.data?.isTrigger)
      
      if (triggerNodes.length === 0) {
        throw new Error("No trigger nodes found in workflow")
      }
      
      // Check if we have a manual trigger
      const hasManualTrigger = triggerNodes.some(node => 
        node.data?.providerId === 'manual' || 
        node.data?.type === 'manual'
      )

      // If we're already in listening mode
      if (listeningMode) {
        // If it's a manual trigger, execute the workflow instead of turning off listening
        if (hasManualTrigger) {
          // Determine if this is TEST MODE or EXECUTE MODE
          // In listening mode, Execute button runs in TEST MODE (simulation)
          const isTestMode = true // When in listening/test mode, always simulate
          
          
          // Execute the workflow directly
          try {
            const response = await fetch('/api/workflows/execute', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                workflowId: currentWorkflow.id,
                testMode: isTestMode,
                inputData: {
                  trigger: {
                    type: 'manual',
                    timestamp: new Date().toISOString(),
                    source: isTestMode ? 'test_mode' : 'live_mode'
                  }
                },
                workflowData: {
                  nodes: getNodes(),
                  edges: getEdges()
                }
              })
            })
            
            if (response.ok) {
              const result = await response.json()
              
              // Different toasts for test vs execute mode
              if (isTestMode) {
                toast({
                  title: "Test Run Complete",
                  description: "Workflow simulated successfully. Check results for preview of actions.",
                })
              } else {
                toast({
                  title: "Workflow Executed",
                  description: `Live execution completed. ID: ${result.executionId}`,
                })
              }
              
              // Don't turn off listening mode - keep it active
              return
            } else {
              const errorData = await response.json().catch(() => ({ error: 'Unknown error' }))
              throw new Error(errorData.error || 'Failed to execute workflow')
            }
          } catch (error: any) {
            toast({
              title: isTestMode ? "Test Failed" : "Execution Failed",
              description: error.message || "Failed to run workflow. Please check the console for details.",
              variant: "destructive"
            })
            return
          }
        } else {
          // For non-manual triggers, turn off listening mode
          setListeningMode(false)
          setIsExecuting(false)
          setActiveExecutionNodeId(null)
          setExecutionResults({})
          toast({
            title: "Listening Mode Disabled",
            description: "No longer listening for triggers.",
          })
          return
        }
      }

      setIsExecuting(true)
      
      // Setup real-time monitoring for execution events
      const supabaseClient = createClient()
      
      // Subscribe to execution events for this workflow to track node status
      const channel = supabaseClient
        .channel(`execution_events_${currentWorkflow.id}`)
        .on(
          "postgres_changes",
          {
            event: "INSERT",
            schema: "public",
            table: "live_execution_events",
            filter: `workflow_id=eq.${currentWorkflow.id}`,
          },
          (payload) => {
            const event = payload.new as any
            
            // Update node execution status
            if (event.node_id) {
              const status = event.event_type === 'node_started' ? 'running' : 
                           event.event_type === 'node_completed' ? 'completed' :
                           event.event_type === 'node_error' ? 'error' : 'pending'
              
              setExecutionResults(prev => ({
                ...prev,
                [event.node_id]: {
                  status,
                  timestamp: Date.now(),
                  error: event.error_message || undefined
                }
              }))
              
              // Handle error state - add to error store
              if (event.event_type === 'node_error' && event.error_message) {
                const nodeName = getNodes().find(n => n.id === event.node_id)?.data?.title || getNodes().find(n => n.id === event.node_id)?.data?.label || `Node ${event.node_id}`
                addError({
                  workflowId: currentWorkflow.id,
                  nodeId: event.node_id,
                  nodeName: String(nodeName),
                  errorMessage: event.error_message,
                  timestamp: new Date().toISOString(),
                  executionSessionId: event.execution_session_id
                })
              }
              
              // Debug execution results update
              
              // Set active node if it's running
              if (event.event_type === 'node_started') {
                setActiveExecutionNodeId(event.node_id)
              } else if (event.event_type === 'node_completed' || event.event_type === 'node_error') {
                setActiveExecutionNodeId(null)
                
                // Stop listening after successful completion (not on error)
                if (event.event_type === 'node_completed' && !getNodes().some(n => 
                  n.id !== event.node_id && 
                  executionResults[n.id]?.status === 'running' || 
                  executionResults[n.id]?.status === 'pending'
                )) {
                  // All nodes completed successfully - stop listening mode
                  setTimeout(() => {
                    setIsExecuting(false)
                    setListeningMode(false)
                  }, 2000) // Wait 2 seconds to show success state
                }
              }
            }
          }
        )
        .subscribe()
      
      // Register webhooks for trigger nodes (skip manual triggers)
      let registeredWebhooks = 0
      for (const triggerNode of triggerNodes) {
        const nodeData = triggerNode.data
        const providerId = nodeData?.providerId
        
        // Skip webhook registration for manual triggers
        if (providerId === 'manual' || nodeData?.type === 'manual') {
          continue
        }
        
        if (providerId) {
          try {
            
            // Register webhook with the provider
            const webhookResponse = await fetch('/api/workflows/webhook-registration', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                workflowId: currentWorkflow.id,
                nodeId: triggerNode.id,
                providerId: providerId,
                triggerType: nodeData.type,
                config: nodeData.config || {}
              })
            })
            
            
            if (webhookResponse.ok) {
              const webhookResult = await webhookResponse.json()
              registeredWebhooks++
              
              // Check for our special debug message
              if (webhookResult.message?.includes('🚨')) {
              }
            } else {
              const errorText = await webhookResponse.text()
            }
          } catch (error) {
          }
        }
      }
      
      // Enable listening mode
              setListeningMode(true)
      
      toast({
        title: "Listening Mode Enabled",
        description: `Now listening for triggers. ${registeredWebhooks} webhook(s) registered. Trigger the events to see the workflow execute.`,
      })
      
    } catch (error: any) {
      
      let errorMessage = error.message || "Failed to setup listening mode"
      
      toast({ 
        title: "Setup Failed", 
        description: errorMessage, 
        variant: "destructive" 
      })
      
      setListeningMode(false)
      setIsExecuting(false)
    }
  }

  const getWorkflowStatus = (): { variant: BadgeProps["variant"]; text: string } => {
    if (currentWorkflow?.status === 'published') return { variant: "default", text: "Published" }
    return { variant: "secondary", text: "Draft" }
  }
  const renderLogo = (integrationId: string, integrationName: string) => {
    // Handle special integrations with icons
    if (integrationId === 'core') {
      return (
        <div className="w-10 h-10 flex items-center justify-center bg-gray-100 rounded-lg">
          <Zap className="w-6 h-6 text-gray-600" />
        </div>
      )
    }
    if (integrationId === 'logic') {
      return (
        <div className="w-10 h-10 flex items-center justify-center bg-gray-100 rounded-lg">
          <GitBranch className="w-6 h-6 text-gray-600" />
        </div>
      )
    }
    if (integrationId === 'ai') {
      return (
        <div className="w-10 h-10 flex items-center justify-center bg-purple-100 rounded-lg">
          <Bot className="w-6 h-6 text-purple-600" />
        </div>
      )
    }
    
    // Extract provider name from integrationId (e.g., "slack_action_send_message" -> "slack")
    const providerId = integrationId.split('_')[0]
    const config = INTEGRATION_CONFIGS[providerId as keyof typeof INTEGRATION_CONFIGS]
    return <img 
      src={config?.logo || `/integrations/${providerId}.svg`} 
      alt={`${integrationName} logo`} 
      className="w-10 h-10 object-contain" 
      style={{ filter: "drop-shadow(0px 1px 2px rgba(0, 0, 0, 0.05))" }}
    />
  }

  // Get categories and comingSoonIntegrations from the shared hook to maintain single source of truth
  const { comingSoonIntegrations: hookComingSoonIntegrations, categories: hookCategories } = useIntegrationSelection();

  // Use the hook's coming soon integrations list and categories
  const comingSoonIntegrations = hookComingSoonIntegrations;
  const categories = hookCategories;

  const filteredIntegrations = useMemo(() => {
    // Apply filters consistently, even during loading
    const result = availableIntegrations
      .filter(int => {
        // Always filter out coming soon integrations unless explicitly shown
        if (!showComingSoon && comingSoonIntegrations.has(int.id)) {
          return false;
        }
        // During loading, don't filter by connection status to avoid flicker
        if (!integrationsLoading && showConnectedOnly) {
          const isConnected = isIntegrationConnected(int.id);
          return isConnected;
        }
        return true;
      })
      .filter(int => {
        if (filterCategory === 'all') return true;
        return int.category === filterCategory;
      })
      .filter(int => {
        const searchLower = searchQuery.toLowerCase();
        if (searchLower === "") return true;

        // Search in integration name, description, and category
        const integrationMatches = int.name.toLowerCase().includes(searchLower) ||
                                 int.description.toLowerCase().includes(searchLower) ||
                                 int.category.toLowerCase().includes(searchLower);

        // Search in trigger names, descriptions, and types
        const triggerMatches = int.triggers.some(t =>
          (t.title && t.title.toLowerCase().includes(searchLower)) ||
          (t.description && t.description.toLowerCase().includes(searchLower)) ||
          (t.type && t.type.toLowerCase().includes(searchLower))
        );

        return integrationMatches || triggerMatches;
      });


    return result;
  }, [availableIntegrations, searchQuery, filterCategory, showConnectedOnly, showComingSoon, comingSoonIntegrations, isIntegrationConnected, integrationsLoading]);
  
  const displayedTriggers = useMemo(() => {
    if (!selectedIntegration) return [];

    // Don't filter triggers by search query - search only filters integrations
    return selectedIntegration.triggers;
  }, [selectedIntegration]);

  // Define handleResetLoadingStates before it's used in useEffect
  const handleResetLoadingStates = useCallback(() => {
    // Force reset all loading states
    setIsSaving(false)
    setIsExecuting(false)
    isSavingRef.current = false
    // Clear any pending timeouts
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current)
      saveTimeoutRef.current = null
    }
    toast({
      title: "Loading States Reset",
      description: "All loading states have been reset.",
      variant: "default"
    })
  }, [])

  // Add global error handler to prevent stuck loading states
  useEffect(() => {
    const handleGlobalError = (event: ErrorEvent) => {
      // Skip null or undefined errors
      if (event.error === null || event.error === undefined) {
        return
      }
      
      // Reset loading states on any global error
      setIsSaving(false)
      setIsExecuting(false)
      isSavingRef.current = false
    }

    const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
      // Reset loading states on unhandled promise rejection
      setIsSaving(false)
      setIsExecuting(false)
      isSavingRef.current = false
    }

    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      if (hasUnsavedChanges) {
        event.preventDefault()
        event.returnValue = "You have unsaved changes. Are you sure you want to leave?"
        return "You have unsaved changes. Are you sure you want to leave?"
      }
    }

    // Add keyboard shortcut for emergency reset (Ctrl/Cmd + Shift + R)
    const handleKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.shiftKey && event.key === 'R') {
        event.preventDefault()
        console.log('🔧 Emergency reset triggered via keyboard shortcut')
        handleResetLoadingStates()
      }
    }

    window.addEventListener('error', handleGlobalError)
    window.addEventListener('unhandledrejection', handleUnhandledRejection)
    window.addEventListener('beforeunload', handleBeforeUnload)
    window.addEventListener('keydown', handleKeyDown)

    return () => {
      window.removeEventListener('error', handleGlobalError)
      window.removeEventListener('unhandledrejection', handleUnhandledRejection)
      window.removeEventListener('beforeunload', handleBeforeUnload)
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [hasUnsavedChanges, handleResetLoadingStates])

  // Track unsaved changes
  const checkForUnsavedChanges = useCallback(() => {
    if (!currentWorkflow) return false
    
    // Skip check if we're in the middle of a save or rebuild operation
    if (isSaving || isRebuildingAfterSave) {
      return false;
    }
    
    // Get a reference to the current ReactFlow nodes and edges
    const currentNodes = getNodes().filter((n: Node) => n.type === 'custom')
    // Filter out UI-only edges (like the dashed "Add Action" edge) from change detection
    const currentEdges = getEdges().filter((edge: Edge) => 
      // Exclude edges that connect to addAction nodes (these are UI-only)
      !edge.target.includes('addAction') && 
      // Exclude dashed edges (these are typically UI helpers)
      !(edge.style?.strokeDasharray)
    )
    
    // If there are no nodes yet, don't mark as changed
    if (currentNodes.length === 0) {
      return false;
    }
    
    // Compare nodes - first sort both arrays by ID to ensure consistent comparison
    const savedNodes = [...(currentWorkflow.nodes || [])].sort((a, b) => a.id.localeCompare(b.id))
    const sortedCurrentNodes = [...currentNodes].sort((a, b) => a.id.localeCompare(b.id))
    
    // Compare node counts
    const nodeCountDiffers = sortedCurrentNodes.length !== savedNodes.length
    
    // Compare node properties
    let nodePropertiesDiffer = false
    if (!nodeCountDiffers) {
      nodePropertiesDiffer = sortedCurrentNodes.some((node, index) => {
        const savedNode = savedNodes[index]
        if (!savedNode) return true
        
        // Compare IDs
        if (node.id !== savedNode.id) return true

        // Compare node types - check multiple possible type fields
        const currentType = node.data?.type || node.data?.nodeType || node.type
        const savedType = savedNode.data?.type || savedNode.data?.nodeType || savedNode.type
        if (currentType !== savedType) return true

        // Compare configurations (ignoring non-essential properties)
        const nodeConfig = node.data?.config || {}
        const savedConfig = savedNode.data?.config || {}

        // Deep comparison that ignores undefined values and empty objects
        const normalizeConfig = (config: any) => {
          const normalized: any = {}
          for (const key in config) {
            if (config[key] !== undefined && config[key] !== null && config[key] !== '') {
              if (typeof config[key] === 'object' && !Array.isArray(config[key])) {
                const nestedNormalized = normalizeConfig(config[key])
                if (Object.keys(nestedNormalized).length > 0) {
                  normalized[key] = nestedNormalized
                }
              } else {
                normalized[key] = config[key]
              }
            }
          }
          return normalized
        }

        const normalizedNodeConfig = normalizeConfig(nodeConfig)
        const normalizedSavedConfig = normalizeConfig(savedConfig)

        if (JSON.stringify(normalizedNodeConfig) !== JSON.stringify(normalizedSavedConfig)) return true

        // Compare positions with a more reasonable tolerance (5 pixels)
        // This accounts for any rounding or floating point precision issues
        const positionDifference =
          Math.abs(node.position.x - savedNode.position.x) > 5 ||
          Math.abs(node.position.y - savedNode.position.y) > 5

        return positionDifference
      })
    }
    
    const nodesChanged = nodeCountDiffers || nodePropertiesDiffer
    
    // Compare edges - sort by ID for consistent comparison
    const savedEdges = [...(currentWorkflow.connections || [])].sort((a, b) => a.id.localeCompare(b.id))
    const sortedCurrentEdges = [...currentEdges].sort((a, b) => a.id.localeCompare(b.id))
    
    // Compare edge counts
    const edgeCountDiffers = sortedCurrentEdges.length !== savedEdges.length
    
    // Compare edge properties
    let edgePropertiesDiffer = false
    if (!edgeCountDiffers) {
      edgePropertiesDiffer = sortedCurrentEdges.some((edge, index) => {
        const savedEdge = savedEdges[index]
        if (!savedEdge) return true
        return edge.id !== savedEdge.id ||
               edge.source !== savedEdge.source ||
               edge.target !== savedEdge.target
      })
    }
    
    const edgesChanged = edgeCountDiffers || edgePropertiesDiffer
    
    // Compare workflow name
    const nameChanged = workflowName !== currentWorkflow.name
    
    const hasChanges = nodesChanged || edgesChanged || nameChanged
    
    
    // Only update the state if it's different from the current state to avoid unnecessary re-renders
    if (hasChanges !== hasUnsavedChanges) {
      setHasUnsavedChanges(hasChanges);
    }
    
    return hasChanges;
  }, [currentWorkflow, getNodes, getEdges, workflowName, isSaving, isRebuildingAfterSave, hasUnsavedChanges])

  // Track the last time we saved to prevent immediate checks after save
  const lastSaveTimeRef = useRef<number>(0);
  
  // Check for unsaved changes with debounce
  useEffect(() => {
    // Skip checks during save/rebuild operations or immediately after a save
    const now = Date.now();
    const timeSinceLastSave = now - lastSaveTimeRef.current;
    const recentlySaved = timeSinceLastSave < 3000; // Within 3 seconds of save

    if (recentlySaved) {
      return;
    }
    
    // Don't check for unsaved changes during save operations or rebuilds to prevent race condition
    if (currentWorkflow && !isSaving && !isRebuildingAfterSave) {
      // Add a longer delay to prevent checking during rebuilds and ensure stability
      const timeoutId = setTimeout(() => {
        // Double-check that we're still not in a save/rebuild state
        if (!isSaving && !isRebuildingAfterSave) {
          checkForUnsavedChanges();
        }
      }, 1500); // Increased debounce time to reduce unnecessary checks
      
      return () => clearTimeout(timeoutId);
    }
  }, [currentWorkflow, nodes, edges, workflowName, isSaving, isRebuildingAfterSave]) // Removed checkForUnsavedChanges from deps

  // Remove unnecessary debug effects that cause re-renders

  // Handle navigation with unsaved changes warning
  const handleNavigation = useCallback((path: string) => {
    console.log('🗺️ Navigating to:', path, 'Has unsaved changes:', hasUnsavedChanges);

    // Reset any stuck loading states before navigation
    if (isSaving || isExecuting) {
      console.log('⚠️ Resetting loading states before navigation');
      setIsSaving(false);
      setIsExecuting(false);
      isSavingRef.current = false;
    }

    if (hasUnsavedChanges) {
      setPendingNavigation(path);
      setShowUnsavedChangesModal(true);
    } else {
      // Use replace to avoid navigation stack issues
      router.replace(path);
    }
  }, [hasUnsavedChanges, router, isSaving, isExecuting])
  // Handle save and continue navigation
  const handleSaveAndNavigate = async () => {
    console.log('🔄 Starting save and navigate...');

    // Prevent multiple clicks - check both state and ref
    if (isSaving || isSavingRef.current) {
      console.log('⚠️ Already saving, skipping...');
      return;
    }

    try {
      // Explicitly set saving state for the modal button
      setIsSaving(true);
      isSavingRef.current = true;

      // Call handleSave
      await handleSave();

      // Add a small delay to ensure state updates are complete
      await new Promise(resolve => setTimeout(resolve, 100));

      // Clear saving state after successful save
      setIsSaving(false);
      isSavingRef.current = false;

      if (pendingNavigation) {
        console.log('✅ Save complete, navigating to:', pendingNavigation);
        // Clear unsaved changes flag before navigation
        setHasUnsavedChanges(false);
        setShowUnsavedChangesModal(false);
        setPendingNavigation(null);

        // Use replace instead of push to avoid navigation issues
        router.replace(pendingNavigation);
      } else {
        console.log('✅ Save complete, navigating to workflows page');
        setHasUnsavedChanges(false);
        setShowUnsavedChangesModal(false);
        router.replace('/workflows');
      }
    } catch (error) {
      console.error('❌ Save and navigate failed:', error);
      toast({
        title: "Save Failed",
        description: "Could not save your changes. Please try again.",
        variant: "destructive"
      });
    } finally {
      // Always ensure loading state is cleared
      setIsSaving(false);
      isSavingRef.current = false;
    }
  }

  // Handle navigation without saving
  const handleNavigateWithoutSaving = () => {
    console.log('⚠️ Navigating without saving');
    setHasUnsavedChanges(false);
    setShowUnsavedChangesModal(false);
    setPendingNavigation(null);

    if (pendingNavigation) {
      router.replace(pendingNavigation);
    } else {
      router.replace('/workflows');
    }
  }

  // Force reload workflow from database
  // Check for Discord integration when workflow is loaded
  useEffect(() => {
    if (currentWorkflow && nodes.length > 0) {
      // Check if any nodes require Discord integration
      const hasDiscordNodes = nodes.some(node => 
        node.data?.providerId === 'discord' || 
        (typeof node.data?.type === 'string' && node.data.type.includes('discord'))
      );
      
      if (hasDiscordNodes) {
        const connectedProviders = getConnectedProviders();
        const hasDiscordIntegration = connectedProviders.includes('discord');
        if (!hasDiscordIntegration) {
          // For now, just log the issue - we'll handle the UI later
        }
      }
    }
  }, [currentWorkflow, nodes, getConnectedProviders]);

  return {
    nodes,
    edges,
    setNodes,
    setEdges,
    onNodesChange,
    optimizedOnNodesChange,
    onEdgesChange,
    onConnect,
    nodeTypes,
    edgeTypes,
    workflowName,
    setWorkflowName,
    workflowDescription,
    setWorkflowDescription,
    isSaving,
    handleSave,
    handleToggleLive,
    isUpdatingStatus,
    handleExecute,
    handleTestSandbox,
    handleExecuteLive,
    showTriggerDialog,
    setShowTriggerDialog,
    showActionDialog,
    setShowActionDialog,
    handleTriggerSelect,
    handleActionSelect,
    selectedIntegration,
    setSelectedIntegration,
    availableIntegrations,
    renderLogo,
    getWorkflowStatus,
    currentWorkflow,
    isExecuting,
    activeExecutionNodeId,
    executionResults,
    configuringNode,
    setConfiguringNode,
    handleSaveConfiguration,
    handleConfigurationClose,
    handleConfigurationSave,
    configuringNodeInfo,
    configuringIntegrationName,
    configuringInitialData,
    collaborators,
    pendingNode,
    setPendingNode,
    selectedTrigger,
    setSelectedTrigger,
    selectedAction,
    setSelectedAction,
    searchQuery,
    setSearchQuery,
    filterCategory,
    setFilterCategory,
    showConnectedOnly,
    setShowConnectedOnly,
    showComingSoon,
    setShowComingSoon,
    isActionAIMode,
    setIsActionAIMode,
    filteredIntegrations,
    displayedTriggers,
    deletingNode,
    setDeletingNode,
    confirmDeleteNode,
    isIntegrationConnected,
    integrationsLoading,
    workflowLoading,
    listeningMode,
    setListeningMode,
    handleResetLoadingStates,
    sourceAddNode,
    setSourceAddNode,
    handleActionDialogClose,
    nodeNeedsConfiguration,
    workflows: workflowsData,
    workflowId,
    hasShownLoading,
    setHasShownLoading,
    hasUnsavedChanges,
    setHasUnsavedChanges,
    showUnsavedChangesModal,
    setShowUnsavedChangesModal,
    pendingNavigation,
    setPendingNavigation,
    handleNavigation,
    handleSaveAndNavigate,
    handleNavigateWithoutSaving,
    showDiscordConnectionModal,
    setShowDiscordConnectionModal,
    handleAddNodeBetween,
    isProcessingChainsRef,
    handleConfigureNode,
    handleDeleteNodeWithConfirmation,
    handleAddActionClick,
    fitView,
    aiAgentActionCallback,
    setAiAgentActionCallback,
    showExecutionHistory,
    setShowExecutionHistory,
    showSandboxPreview,
    setShowSandboxPreview,
    sandboxInterceptedActions,
    setSandboxInterceptedActions,
    // Step execution variables
    isStepMode,
    isPaused,
    currentNodeId,
    nodeStatuses,
    isStepByStep,
    setIsStepByStep,
    stepContinueCallback,
    setStepContinueCallback,
    skipCallback,
    setSkipCallback,
    stopStepExecution,
    pauseExecution,
    executeNodeStepByStep,
    // React Flow functions
    getNodes,
    getEdges,
    // Execution state setters
    setIsExecuting,
    // OAuth loading state
    connectingIntegrationId,
    setConnectingIntegrationId,
    // Force update function
    forceUpdate,
    // Categories for filtering
    categories,
    // Coming soon integrations set
    comingSoonIntegrations,
    // Add the missing function
    openTriggerDialog,
    // Cached integration status for preventing flicker in modals
    cachedIntegrationStatus
  }

  return {
    nodes, edges, setNodes, setEdges, onNodesChange, optimizedOnNodesChange, onEdgesChange, onConnect, nodeTypes, edgeTypes, workflowName, setWorkflowName, workflowDescription, setWorkflowDescription, isSaving, hasUnsavedChanges, handleSave, handleToggleLive, isUpdatingStatus, handleExecute, handleTestSandbox, handleExecuteLive,
    showTriggerDialog, setShowTriggerDialog, showActionDialog, setShowActionDialog, handleTriggerSelect, handleActionSelect, selectedIntegration, setSelectedIntegration,
    availableIntegrations, renderLogo, getWorkflowStatus, currentWorkflow, isExecuting, activeExecutionNodeId, executionResults,
    configuringNode, setConfiguringNode, handleSaveConfiguration, handleConfigurationClose, handleConfigurationSave,
    configuringNodeInfo, configuringIntegrationName, configuringInitialData, collaborators, pendingNode, setPendingNode,
    selectedTrigger, setSelectedTrigger, selectedAction, setSelectedAction, searchQuery, setSearchQuery, filterCategory, setFilterCategory, showConnectedOnly, setShowConnectedOnly, showComingSoon, setShowComingSoon,
    isActionAIMode, setIsActionAIMode, filteredIntegrations, displayedTriggers, deletingNode, setDeletingNode, confirmDeleteNode, isIntegrationConnected, integrationsLoading, workflowLoading, listeningMode, setListeningMode, handleResetLoadingStates,
    sourceAddNode, setSourceAddNode, handleActionDialogClose, nodeNeedsConfiguration, workflows, workflowId, hasShownLoading, setHasShownLoading, setHasUnsavedChanges, showUnsavedChangesModal, setShowUnsavedChangesModal, pendingNavigation, setPendingNavigation,
    handleNavigation, handleSaveAndNavigate, handleNavigateWithoutSaving, showDiscordConnectionModal, setShowDiscordConnectionModal, handleAddNodeBetween, isProcessingChainsRef,
    handleConfigureNode, handleDeleteNodeWithConfirmation, handleAddActionClick, fitView, aiAgentActionCallback, setAiAgentActionCallback, showExecutionHistory, setShowExecutionHistory,
    showSandboxPreview, setShowSandboxPreview, sandboxInterceptedActions, setSandboxInterceptedActions,
    // Step execution variables
    isStepMode, isPaused, currentNodeId, nodeStatuses, isStepByStep, setIsStepByStep,
    stepContinueCallback, setStepContinueCallback, skipCallback, setSkipCallback, stopStepExecution, pauseExecution, executeNodeStepByStep,
    // React Flow functions
    getNodes, getEdges,
    // Execution state setters
    setIsExecuting,
    // OAuth loading state
    connectingIntegrationId, setConnectingIntegrationId,
    // Force update function
    forceUpdate,
    // Categories for filtering
    categories,
    // Coming soon integrations set
    comingSoonIntegrations,
    // Add the missing function
    openTriggerDialog,
    // Cached integration status
    cachedIntegrationStatus
  }
}

// Custom Edge with Plus Button for adding actions between nodes
const CustomEdgeWithButton = ({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  style = {},
  data
}: EdgeProps) => {
  // Debug logging for workflow builder edge positions (for comparison)
  React.useEffect(() => {
    console.log('🔍 [Workflow Builder Edge Debug]', {
      edgeId: id,
      sourceCoords: { x: sourceX, y: sourceY, position: sourcePosition },
      targetCoords: { x: targetX, y: targetY, position: targetPosition }
    })
  }, [id, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition])

  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  })
  
  const [isHovered, setIsHovered] = React.useState(false)
  
  // Handle adding node between source and target
  // Note: onAddNode might not be available for programmatically created edges
  const onAddNode = data?.onAddNode
  
  return (
    <g 
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      style={{ cursor: onAddNode ? 'pointer' : 'default' }}
    >
      <path
        d={edgePath}
        fill="none"
        strokeWidth={40}
        stroke="transparent"
        style={{ pointerEvents: 'stroke' }}
      />
      <path
        id={id}
        style={style}
        className="react-flow__edge-path"
        d={edgePath}
        fill="none"
        strokeWidth={2}
        stroke={style?.stroke || '#d1d5db'}
      />
      
      {onAddNode && (isHovered || data?.alwaysShowButton) ? (
        <foreignObject
          width={30}
          height={30}
          x={labelX - 15}
          y={labelY - 15}
          style={{ overflow: 'visible', pointerEvents: 'all' }}
        >
          <div 
            className="flex items-center justify-center"
            style={{ width: '30px', height: '30px' }}
          >
            <button
              className="w-7 h-7 rounded-full bg-primary text-primary-foreground hover:bg-primary/90 flex items-center justify-center shadow-md transition-all hover:scale-110"
              onClick={(e) => {
                e.stopPropagation()
                if (typeof onAddNode === 'function') {
                  // The onAddNode function in data can have different signatures:
                  // 1. For edges created in workflow loading: (sourceId, targetId, position) => ...
                  // 2. For edges with bound parameters: (position) => ...
                  // 3. For processedEdges: (sourceId, targetId, position) => ...
                  
                  // Try to determine the signature based on function length
                  if (onAddNode.length <= 1) {
                    // Function expects only position (parameters are bound via closure)
                    onAddNode({ x: labelX, y: labelY })
                  } else {
                    // Function expects all three parameters
                    // Need to parse the edge ID to get source and target
                    // Try different ID formats
                    let sourceId, targetId
                    
                    if (id.includes('->')) {
                      // Format: "sourceId->targetId"
                      const parts = id.split('->')
                      sourceId = parts[0]
                      targetId = parts[1]
                    } else if (id.startsWith('e-')) {
                      // Format: "e-sourceId-targetId"
                      const parts = id.substring(2).split('-')
                      if (parts.length >= 2) {
                        // Take first part as source, rest as target (handles IDs with hyphens)
                        sourceId = parts[0]
                        targetId = parts.slice(1).join('-')
                      }
                    } else {
                      // Format: "sourceId-targetId" 
                      // Find the last occurrence of a pattern like "node-timestamp"
                      const matches = id.match(/^(.*?)-(node-\d+)$/)
                      if (matches) {
                        sourceId = matches[1]
                        targetId = matches[2]
                      } else {
                        // Fallback: split by first hyphen after "node"
                        const nodeIndex = id.lastIndexOf('node-')
                        if (nodeIndex > 0) {
                          sourceId = id.substring(0, nodeIndex - 1)
                          targetId = id.substring(nodeIndex)
                        }
                      }
                    }
                    
                    if (sourceId && targetId) {
                      onAddNode(sourceId, targetId, { x: labelX, y: labelY })
                    } else {
                    }
                  }
                }
              }}
            >
              <Plus className="w-4 h-4" />
            </button>
          </div>
        </foreignObject>
      ) : null}
    </g>
  )
}

export default function CollaborativeWorkflowBuilder() {
  return (
    <div className="w-full h-full bg-background">
      <ReactFlowProvider><WorkflowBuilderContent /></ReactFlowProvider>
    </div>
  )
}
function WorkflowBuilderContent() {
  const router = useRouter()
  const { toast } = useToast()
  const { setCurrentWorkflow } = useWorkflowStore()
  const { integrations } = useIntegrationStore()
  
  // Store polling instances to prevent conflicts when connecting multiple integrations
  const pollingInstancesRef = useRef<Map<string, NodeJS.Timeout>>(new Map())
  
  const {
    nodes, edges, setNodes, setEdges, onNodesChange, optimizedOnNodesChange, onEdgesChange, onConnect, nodeTypes, edgeTypes, workflowName, setWorkflowName, workflowDescription, setWorkflowDescription, isSaving, hasUnsavedChanges, handleSave, handleToggleLive, isUpdatingStatus, handleExecute, handleTestSandbox, handleExecuteLive,
    showTriggerDialog, setShowTriggerDialog, showActionDialog, setShowActionDialog, handleTriggerSelect, handleActionSelect, selectedIntegration, setSelectedIntegration,
    availableIntegrations, renderLogo, getWorkflowStatus, currentWorkflow, isExecuting, activeExecutionNodeId, executionResults,
    configuringNode, setConfiguringNode, handleSaveConfiguration, handleConfigurationClose, handleConfigurationSave,
    configuringNodeInfo, configuringIntegrationName, configuringInitialData, collaborators, pendingNode, setPendingNode,
    selectedTrigger, setSelectedTrigger, selectedAction, setSelectedAction, searchQuery, setSearchQuery, filterCategory, setFilterCategory, showConnectedOnly, setShowConnectedOnly, showComingSoon, setShowComingSoon,
    isActionAIMode, setIsActionAIMode, filteredIntegrations, displayedTriggers, deletingNode, setDeletingNode, confirmDeleteNode, isIntegrationConnected, integrationsLoading, workflowLoading, listeningMode, setListeningMode, handleResetLoadingStates,
    sourceAddNode, setSourceAddNode, handleActionDialogClose, nodeNeedsConfiguration, workflows, workflowId, hasShownLoading, setHasShownLoading, setHasUnsavedChanges, showUnsavedChangesModal, setShowUnsavedChangesModal, pendingNavigation, setPendingNavigation,
    handleNavigation, handleSaveAndNavigate, handleNavigateWithoutSaving, showDiscordConnectionModal, setShowDiscordConnectionModal, handleAddNodeBetween, isProcessingChainsRef,
    handleConfigureNode, handleDeleteNodeWithConfirmation, handleAddActionClick, fitView, aiAgentActionCallback, setAiAgentActionCallback, showExecutionHistory, setShowExecutionHistory,
    showSandboxPreview, setShowSandboxPreview, sandboxInterceptedActions, setSandboxInterceptedActions,
    // Step execution variables
    isStepMode, isPaused, currentNodeId, nodeStatuses, isStepByStep, setIsStepByStep,
    stepContinueCallback, setStepContinueCallback, skipCallback, setSkipCallback, stopStepExecution, pauseExecution, executeNodeStepByStep,
    // React Flow functions
    getNodes, getEdges,
    // Execution state setters
    setIsExecuting,
    // OAuth loading state
    connectingIntegrationId, setConnectingIntegrationId,
    // Force update function
    forceUpdate,
    // Categories for filtering
    categories,
    // Coming soon integrations set
    comingSoonIntegrations,
    // Add the missing function
    openTriggerDialog,
    // Cached integration status
    cachedIntegrationStatus
  } = useWorkflowBuilderState()

  // Helper: normalize Add Action buttons to always appear at end of each AI Agent chain
  const normalizeAddActionButtons = useCallback(() => {
    try {
      const all = getNodes()
      const aiAgents = all.filter((n: any) => n.data?.type === 'ai_agent')
      if (aiAgents.length === 0) return
      const nodeMap: Record<string, any> = {}
      all.forEach(n => (nodeMap[n.id] = n))
      const addIds = new Set(all.filter((n: any) => n.type === 'addAction').map((n: any) => n.id))
      if (addIds.size > 0) {
        setNodes(nodes => nodes.filter((n: any) => !addIds.has(n.id)))
        setEdges(eds => eds.filter((e: any) => !addIds.has(e.source) && !addIds.has(e.target)))
      }
      const findLast = (startId: string): any => {
        let cur = nodeMap[startId]
        const visited = new Set<string>()
        while (cur && !visited.has(cur.id)) {
          visited.add(cur.id)
          const out = getEdges().filter((e: any) => e.source === cur.id)
          const next = out.map((e: any) => nodeMap[e.target]).find((n: any) => n && n.type !== 'addAction')
          if (!next) break
          cur = next
        }
        return cur
      }
      const newNodes: any[] = []
      const newEdges: any[] = []
      aiAgents.forEach((agent: any) => {
        const outs = getEdges().filter((e: any) => e.source === agent.id)
        const firsts = outs.map((e: any) => nodeMap[e.target]).filter((n: any) => n && n.type !== 'addAction')
        if (firsts.length === 0) {
          // No chains/actions found — don't add anything, AI Agent will handle its own chain creation
          // Chain placeholders have their own internal Add Action buttons
        } else {
          firsts.forEach((fn: any, idx: number) => {
            // Skip if this is a chain placeholder - it has its own internal Add Action button
            if (fn.data?.type === 'chain_placeholder') {
              console.log('Skipping chain placeholder:', fn.id)
              return
            }

            const last = findLast(fn.id)
            if (!last) return

            // Only add Add Action nodes after actual action nodes, not placeholders
            if (last.data?.type !== 'chain_placeholder') {
              const addId = `add-action-${agent.id}-chain${idx}-${Date.now()}-${Math.random().toString(36).slice(2,8)}`
              newNodes.push({ id: addId, type: 'addAction', position: { x: last.position.x, y: last.position.y + 150 }, data: { parentId: last.id, parentAIAgentId: agent.id } })
              newEdges.push({ id: `e-${last.id}-${addId}-${Date.now()}-${Math.random().toString(36).slice(2,8)}`, source: last.id, target: addId, type: 'straight' })
            } else {
              console.log('Last node is a placeholder, not adding Add Action node:', last.id)
            }
          })
        }
      })
      if (newNodes.length) setNodes(nds => [...nds, ...newNodes])
      if (newEdges.length) setEdges(eds => [...eds, ...newEdges])
    } catch (e) {
    }
  }, [getNodes, getEdges, setNodes, setEdges])

  // Pre-Activation Check modal state
  const [showPrecheck, setShowPrecheck] = useState(false)
  const [precheckRunning, setPrecheckRunning] = useState(false)
  const [precheckResults, setPrecheckResults] = useState<{ name: string; ok: boolean; info?: string }[]>([])

  const runPreActivationCheck = useCallback(async () => {
    const results: { name: string; ok: boolean; info?: string }[] = []
    try {
      setPrecheckRunning(true)
      const all = getNodes()
      const edgesList = getEdges()
      const trigger = all.find((n: any) => n?.data?.isTrigger)
      const aiAgent = all.find((n: any) => n?.data?.type === 'ai_agent')

      // Structural checks
      results.push({ name: 'Trigger present', ok: !!trigger })
      results.push({ name: 'AI Agent present', ok: !!aiAgent })
      results.push({ name: 'Has connections', ok: (edgesList?.length || 0) > 0 })

      // Trigger-specific configuration guards
      if (trigger) {
        const t = trigger.data?.type
        if (t === 'discord_trigger_new_message') {
          const g = trigger.data?.config?.guildId
          const c = trigger.data?.config?.channelId
          results.push({ name: 'Discord server selected', ok: !!g })
          results.push({ name: 'Discord channel selected', ok: !!c })
        }
        if (t === 'discord_trigger_slash_command') {
          const g = trigger.data?.config?.guildId
          results.push({ name: 'Discord server selected', ok: !!g })
        }
        if (t === 'webhook') {
          const p = trigger.data?.config?.path
          const m = trigger.data?.config?.method
          results.push({ name: 'Webhook path set', ok: !!p })
          results.push({ name: 'Webhook method set', ok: !!m })
        }
      }

      // Integration connectivity checks based on nodes present
      const providers = new Set<string>()
      all.forEach((n: any) => {
        const pid = n?.data?.providerId
        if (pid) providers.add(pid)
      })

      const providerList = Array.from(providers)
      providerList.forEach((pid) => {
        if (pid === 'ai') return
        const ok = isIntegrationConnected ? isIntegrationConnected(pid as any) : true
        results.push({ name: `${pid} connected`, ok })
      })
    } finally {
      setPrecheckResults(results)
      setPrecheckRunning(false)
    }
  }, [getNodes, getEdges, isIntegrationConnected])

  // Update nodes with execution status when nodeStatuses changes
  useEffect(() => {
    if (Object.keys(nodeStatuses).length > 0 || currentNodeId) {
      setNodes((nds) => 
        nds.map((node) => {
          if (node.type === 'custom') {
            return {
              ...node,
              data: {
                ...node.data,
                executionStatus: nodeStatuses[node.id] || null,
                isActiveExecution: currentNodeId === node.id
              }
            }
          }
          return node
        })
      )
    }
  }, [nodeStatuses, currentNodeId, setNodes])

  // Normalize Add Action buttons after initial load
  useEffect(() => {
    // Slight delay to ensure nodes/edges are applied
    const t = setTimeout(() => {
      try { normalizeAddActionButtons() } catch {}
    }, 150)
    return () => clearTimeout(t)
  // Run once on mount or when workflowId changes
  }, [workflowId])

  // Add handleAddNodeBetween to all custom edges that don't already have it
  const processedEdges = useMemo(() => {
    return edges.map(edge => {
      if (edge.type === 'custom') {
        // If edge already has onAddNode, preserve it
        // Otherwise, create one using the edge's source and target
        if (edge.data?.onAddNode) {
          return edge  // Keep existing handler
        }
        
        return {
          ...edge,
          data: {
            ...edge.data,
            onAddNode: () => {
              // Use the edge's source and target directly
              handleInsertAction(edge.source, edge.target)
            }
          }
        }
      }
      return edge
    })
  }, [edges, handleAddNodeBetween])

  // Helper function to capitalize category names
  const formatCategoryName = (category: string): string => {
    if (category === 'all') return 'All Categories';
    if (category === 'ai') return 'AI';
    if (category === 'crm') return 'CRM';
    // Capitalize each word
    return category
      .split(/[\s-_]+/)
      .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join(' ');
  };

  const handleOpenTriggerDialog = useCallback(() => {
    openTriggerDialog()
  }, [openTriggerDialog])

  // Debug loading states (reduced frequency)
  // Utility: clear any stuck fetch/execute/save flags used in this component
  const clearStuckRequests = useCallback(() => {
    try {
      // Reset executing flag and saving ref
      setIsExecuting(false)
      isSavingRef.current = false
      // No-op placeholder for any future network aborts
    } catch {}
  }, [setIsExecuting])

  // Use a more robust loading condition that prevents double loading
  // Only show loading if we're actually in a loading state AND we don't have the required data
  const shouldShowLoading = () => {
    // If we have a workflowId but no currentWorkflow, we're loading
    if (workflowId && !currentWorkflow) {
      return true
    }
    
    // Do not block the entire builder on integrations loading; dialogs handle their own loading
    
    // If workflow is loading and we don't have the current workflow, show loading
    if (workflowLoading && !currentWorkflow) {
      return true
    }
    
    return false
  }

  // Track if we should show loading and prevent double loading
  const isLoading = shouldShowLoading()
  
  // Use useEffect to manage hasShownLoading state to prevent infinite re-renders
  useEffect(() => {
    if (isLoading && !hasShownLoading) {
      setHasShownLoading(true)
    } else if (!isLoading && hasShownLoading) {
      setHasShownLoading(false)
    }
  }, [isLoading, hasShownLoading])

  if (isLoading) {
    // Only log loading screen reason once per loading cycle to prevent console spam
    return <WorkflowLoadingScreen />
  }
  
  return (
    <div style={{ height: "calc(100vh - 65px)", position: "relative" }}>
      {/* Top UI - Always visible */}
      <div className="absolute top-0 left-0 right-0 z-10 pointer-events-none">
        <div className="flex justify-between items-start p-4 pointer-events-auto">
          <div className="flex items-center space-x-4 flex-1 min-w-0">
            <Button variant="ghost" size="icon" onClick={() => handleNavigation("/workflows")} className="flex-shrink-0"><ArrowLeft className="w-5 h-5" /></Button>
            <div className="flex flex-col space-y-1 flex-1 min-w-0">
              <Input 
                value={workflowName} 
                onChange={(e) => setWorkflowName(e.target.value)} 
                onBlur={handleSave} 
                className="text-xl font-semibold !border-none !outline-none !ring-0 p-0 bg-transparent w-auto min-w-[200px] max-w-full" 
                style={{ 
                  boxShadow: "none",
                  width: `${Math.max(200, (workflowName?.length || 0) * 10 + 20)}px`
                }}
                placeholder="Untitled Workflow"
                title={workflowName || "Untitled Workflow"}
              />
            </div>
          </div>
            <div className="flex items-center space-x-2 flex-shrink-0">
            <RoleGuard requiredRole="admin">
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button variant="outline" onClick={() => { setShowPrecheck(true); runPreActivationCheck(); }}>
                      Pre-Activation Check
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>Run readiness checks before activating</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </RoleGuard>
            
            {/* Pre-Activation Check Modal */}
            <Dialog open={showPrecheck} onOpenChange={setShowPrecheck}>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Pre-Activation Check</DialogTitle>
                  <DialogDescription>We run a few readiness checks before activation.</DialogDescription>
                </DialogHeader>
                <div className="space-y-2 py-2">
                  {precheckRunning ? (
                    <div className="text-sm text-slate-600">Running checks...</div>
                  ) : precheckResults.length === 0 ? (
                    <div className="text-sm text-slate-600">No checks run yet.</div>
                  ) : (
                    <ul className="space-y-2">
                      {precheckResults.map((r, i) => (
                        <li key={i} className="flex items-center justify-between">
                          <span className={`text-sm ${r.ok ? 'text-green-600' : 'text-red-600'}`}>
                            {r.ok ? '✓' : '✗'} {r.name}{r.info ? ` — ${r.info}` : ''}
                          </span>
                          {!r.ok && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => {
                                // Provide quick fix navigation for common items
                                const nodes = getNodes()
                                const trigger = nodes.find((n: any) => n?.data?.isTrigger)
                                if (trigger && r.name.toLowerCase().includes('discord')) {
                                  handleConfigureNode(trigger.id)
                                  setShowPrecheck(false)
                                  return
                                }
                                if (trigger && r.name.toLowerCase().includes('webhook')) {
                                  handleConfigureNode(trigger.id)
                                  setShowPrecheck(false)
                                  return
                                }
                              }}
                            >
                              Fix
                            </Button>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => runPreActivationCheck()} disabled={precheckRunning}>Re-run</Button>
                  <Button 
                    onClick={() => setShowPrecheck(false)}
                    disabled={precheckRunning}
                    variant={precheckResults.every(r => r.ok) && precheckResults.length > 0 ? 'default' : 'secondary'}
                  >
                    {precheckResults.every(r => r.ok) && precheckResults.length > 0 ? 'Close (All Good)' : 'Close'}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
            {/* Admin-only maintenance: Clean up Add Action buttons */}
            <RoleGuard requiredRole="admin">
              <Button variant="outline" onClick={() => {
                try {
                  const allNodes = getNodes()
                  const aiAgents = allNodes.filter((n: any) => n.data?.type === 'ai_agent')
                  if (aiAgents.length === 0) return
                  
                  // Build new nodes/edges by removing all addAction nodes under AI Agents,
                  // then re-adding exactly one addAction after the last action in each chain
                  const nodeMap: Record<string, any> = {}
                  allNodes.forEach(n => nodeMap[n.id] = n)
                  
                  // Remove existing addAction nodes related to AI agents
                  const nodesWithoutAdd = allNodes.filter((n: any) => n.type !== 'addAction')
                  const addNodesToRemove = allNodes.filter((n: any) => n.type === 'addAction')
                  const addNodeIds = new Set(addNodesToRemove.map((n: any) => n.id))
                  
                  setNodes(nodes => nodes.filter((n: any) => !addNodeIds.has(n.id)))
                  setEdges(eds => eds.filter((e: any) => !addNodeIds.has(e.source) && !addNodeIds.has(e.target)))
                  
                  // Helper: find last node in a chain by walking edges forward
                  const findLastInChain = (startId: string, edgeList: any[]): any => {
                    let current = nodeMap[startId]
                    const visited = new Set<string>()
                    while (true) {
                      if (!current || visited.has(current.id)) break
                      visited.add(current.id)
                      const outs = edgeList.filter((e: any) => e.source === current.id)
                      const next = outs
                        .map((e: any) => nodeMap[e.target])
                        .find((n: any) => n && n.type !== 'addAction')
                      if (!next) break
                      current = next
                    }
                    return current
                  }
                  
                  // For each AI Agent, compute first nodes of each chain and append a clean addAction after the last node
                  const newAddNodes: any[] = []
                  const newAddEdges: any[] = []
                  const currentEdges = (edges as any) || []
                  aiAgents.forEach((agent: any) => {
                    const firstEdges = currentEdges.filter((e: any) => e.source === agent.id)
                    const firstNodes = firstEdges
                      .map((e: any) => nodeMap[e.target])
                      .filter((n: any) => n && n.type !== 'addAction')
                    firstNodes.forEach((fn: any, idx: number) => {
                      const last = findLastInChain(fn.id, currentEdges)
                      if (!last) return
                      const addId = `add-action-${agent.id}-chain${idx}-${Date.now()}-${Math.random().toString(36).slice(2,8)}`
                      const addNode = {
                        id: addId,
                        type: 'addAction',
                        position: { x: last.position.x, y: last.position.y + 150 },
                        data: { parentId: last.id, parentAIAgentId: agent.id }
                      }
                      newAddNodes.push(addNode)
                      newAddEdges.push({ id: `e-${last.id}-${addId}-${Date.now()}-${Math.random().toString(36).slice(2,8)}`, source: last.id, target: addId, type: 'straight' })
                    })
                  })

                  setNodes(nds => [...nds, ...newAddNodes])
                  setEdges(eds => [...eds, ...newAddEdges])
                  toast({ title: 'Add buttons cleaned', description: `${newAddNodes.length} buttons repositioned at chain ends.` })
                } catch (e) {
                  toast({ title: 'Cleanup failed', description: 'Could not reposition add buttons.', variant: 'destructive' })
                }
              }}>Clean Up Add Buttons</Button>
            </RoleGuard>
            <Badge variant={getWorkflowStatus().variant}>{getWorkflowStatus().text}</Badge>
            {hasUnsavedChanges && (
              <Badge variant="outline" className="text-orange-600 border-orange-600">
                Unsaved Changes
              </Badge>
            )}
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild><Button onClick={() => handleSave()} disabled={isSaving || isExecuting} variant="secondary">{isSaving ? <Loader2 className="w-5 h-5 mr-2 animate-spin" /> : <Save className="w-5 h-5 mr-2" />}Save</Button></TooltipTrigger>
                <TooltipContent><p>Save your workflow</p></TooltipContent>
              </Tooltip>
            </TooltipProvider>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button 
                    onClick={handleToggleLive} 
                    disabled={isUpdatingStatus || isSaving || hasUnsavedChanges}
                    variant={currentWorkflow?.status === 'active' ? "destructive" : "default"}
                  >
                    {isUpdatingStatus ? (
                      <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                    ) : currentWorkflow?.status === 'active' ? (
                      <Pause className="w-5 h-5 mr-2" />
                    ) : (
                      <Radio className="w-5 h-5 mr-2" />
                    )}
                    {currentWorkflow?.status === 'active' ? 'Deactivate' : 'Activate Workflow'}
                  </Button>
                </TooltipTrigger>
                <TooltipContent className="max-w-sm">
                  <p className="font-semibold mb-1">
                    {currentWorkflow?.status === 'active' ? 'Deactivate Workflow' : 'Activate Workflow'}
                  </p>
                  <p className="text-xs">
                    {hasUnsavedChanges 
                      ? "Save your changes before activating the workflow" 
                      : currentWorkflow?.status === 'active' 
                        ? "Stop the workflow from running automatically on triggers" 
                        : "Enable automatic execution when trigger events occur (e.g., new email, webhook)"
                    }
                  </p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
            {/* Test Button with Dropdown for Sandbox/Live modes */}
            {(isStepMode || listeningMode) ? (
              // Show stop button when test is running
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="secondary"
                      onClick={handleTestSandbox}
                      disabled={isSaving}
                    >
                      <Shield className="w-5 h-5 mr-2" />
                      {isStepMode ? "Exit Test Mode" : "Stop Sandbox"}
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent className="max-w-sm">
                    <p className="font-semibold mb-1">
                      {isStepMode ? "Exit Test Mode" : "Stop Sandbox Mode"}
                    </p>
                    <p className="text-xs">
                      {isStepMode
                        ? "Exit step-by-step test mode and clear all execution states"
                        : "Stop testing your workflow"
                      }
                    </p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            ) : (
              // Show dropdown when not testing
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    disabled={isSaving || isExecuting}
                    variant="default"
                  >
                    {isExecuting ? (
                      <>
                        <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                        Testing...
                      </>
                    ) : (
                      <>
                        <TestTube className="w-5 h-5 mr-2" />
                        Test
                      </>
                    )}
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-[320px]">
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <DropdownMenuItem
                          onClick={handleTestSandbox}
                          disabled={isSaving || isExecuting}
                          className="flex items-start cursor-pointer p-3"
                        >
                          <FlaskConical className="w-4 h-4 mr-3 mt-0.5 text-blue-500" />
                          <div className="flex flex-col">
                            <span className="font-medium">Sandbox Mode</span>
                            <span className="text-xs text-muted-foreground">Safe testing environment</span>
                          </div>
                        </DropdownMenuItem>
                      </TooltipTrigger>
                      <TooltipContent side="left" className="max-w-xs">
                        <p className="font-semibold mb-1">Test Workflow in Sandbox</p>
                        <p className="text-xs">
                          Run workflow with test trigger data in a safe environment. External API calls are intercepted and simulated. Perfect for debugging and testing without affecting real data.
                        </p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>

                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <DropdownMenuItem
                          onClick={handleExecuteLive}
                          disabled={isSaving || isExecuting}
                          className="flex items-start cursor-pointer p-3"
                        >
                          <Rocket className="w-4 h-4 mr-3 mt-0.5 text-orange-500" />
                          <div className="flex flex-col">
                            <span className="font-medium">Live Mode</span>
                            <span className="text-xs text-muted-foreground">Execute with real data</span>
                          </div>
                        </DropdownMenuItem>
                      </TooltipTrigger>
                      <TooltipContent side="left" className="max-w-xs">
                        <p className="font-semibold mb-1">Run with Live Data</p>
                        <p className="text-xs">
                          Execute workflow immediately with test trigger data. <span className="text-yellow-500 font-semibold">Warning:</span> This will send real emails, post real messages, and perform actual actions in your connected services.
                        </p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </DropdownMenuContent>
              </DropdownMenu>
            )}

            {/* Show preview button when in sandbox mode and have intercepted actions */}
            {listeningMode && sandboxInterceptedActions.length > 0 && (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant={showSandboxPreview ? "default" : "outline"}
                      size="icon"
                      onClick={() => setShowSandboxPreview(!showSandboxPreview)}
                      className="relative"
                    >
                      <Shield className="w-5 h-5" />
                      {sandboxInterceptedActions.length > 0 && (
                        <span className="absolute -top-1 -right-1 h-4 w-4 rounded-full bg-blue-500 text-white text-xs flex items-center justify-center">
                          {sandboxInterceptedActions.length}
                        </span>
                      )}
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p className="font-semibold">
                      {showSandboxPreview ? "Hide" : "Show"} Sandbox Preview
                    </p>
                    <p className="text-xs">
                      {sandboxInterceptedActions.length} intercepted action{sandboxInterceptedActions.length !== 1 ? 's' : ''}
                    </p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}
            
            {/* Execution History Button */}
            {workflowId && (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button 
                      onClick={() => setShowExecutionHistory(true)} 
                      variant="outline"
                    >
                      <History className="w-5 h-5 mr-2" />
                      History
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent><p>View execution history</p></TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}

            {/* Emergency reset button - only show if loading states are stuck */}
            {(isSaving || isExecuting) && (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button 
                      onClick={handleResetLoadingStates}
                      variant="outline" 
                      size="sm"
                      className="text-orange-600 border-orange-600 hover:bg-orange-50"
                    >
                      <RefreshCw className="w-4 h-4 mr-1" />
                      Reset
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>Reset stuck loading states</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}
          </div>
        </div>
      </div>

      {nodes.length === 0 ? (
        // Empty state outside of ReactFlow
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-background p-4">
          <div className="text-center max-w-md flex flex-col items-center">
            <div 
              className="w-20 h-20 rounded-full border-2 border-dashed border-border flex items-center justify-center mb-6 cursor-pointer hover:border-muted-foreground hover:shadow-sm transition-all"
              onClick={handleOpenTriggerDialog}
            >
              <Plus className="h-10 w-10 text-muted-foreground hover:text-foreground" />
            </div>
            <h2 className="text-[32px] font-bold mb-2">Start your Chain</h2>
            <p className="text-muted-foreground mb-8 text-center leading-relaxed text-lg">
              Chains start with a trigger – an event that kicks off<br />
              your workflow
            </p>
            <button 
              onClick={handleOpenTriggerDialog}
              className="bg-primary text-primary-foreground px-8 py-3 rounded-md hover:bg-primary/90 transition-colors font-medium text-lg shadow-sm hover:shadow"
            >
              Choose a trigger
            </button>
          </div>
        </div>
      ) : (
        // Regular ReactFlow when there are nodes
        <>
          <ReactFlow 
          nodes={nodes} 
          edges={processedEdges} 
          onNodesChange={optimizedOnNodesChange} 
          onEdgesChange={onEdgesChange} 
          onConnect={onConnect} 
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          onNodeDrag={(event, node) => {
            // Prevent dragging Add Action nodes
            if (node.type === 'addAction') {
              return
            }
            // Track position changes during drag
            setHasUnsavedChanges(true)
          }}
          onNodeDragStart={(event, node) => {
            // Prevent starting drag on Add Action nodes
            if (node.type === 'addAction') {
              event.preventDefault()
              event.stopPropagation()
              return false
            }
          }}
          onNodeDragStop={(event, node) => {
            // Prevent dragging Add Action nodes
            if (node.type === 'addAction') {
              return
            }
            
            // Update node position in state and mark as unsaved
            setNodes((nds: Node[]) => 
              nds.map((n: Node) => {
                // Update the dragged node itself
                if (n.id === node.id) {
                  return { ...n, position: node.position }
                }
                // Update any AddAction nodes that have this node as their parent
                if (n.type === 'addAction' && n.data?.parentId === node.id) {
                  return {
                    ...n,
                    position: {
                      x: node.position.x,
                      y: node.position.y + 160
                    }
                  }
                }
                return n
              })
            )
            setHasUnsavedChanges(true)
            
            // Force a small delay to ensure position is updated
            setTimeout(() => {
            }, 50)
          }}
          fitView 
          className="bg-background" 
          proOptions={{ hideAttribution: true }}
          defaultEdgeOptions={{
            type: 'straight',
            style: { strokeWidth: 1, stroke: 'hsl(var(--border))' },
            animated: false
          }}
          defaultViewport={{ x: 0, y: 0, zoom: 1.2 }}
        >
          <Background variant={BackgroundVariant.Dots} gap={12} size={1} color="hsl(var(--muted))" />
          <Controls className="left-4 bottom-4 top-auto" />
          <CollaboratorCursors collaborators={collaborators || []} />
        </ReactFlow>
        
        {/* Step-by-step execution control panel */}
        {isStepMode && (
          <StepExecutionPanel
            totalNodes={getNodes().filter((n: Node) => n.type === 'custom').length}
            currentNodeName={currentNodeId ? getNodes().find((n: Node) => n.id === currentNodeId)?.data?.title : undefined}
            currentNodeIsTrigger={currentNodeId ? getNodes().find((n: Node) => n.id === currentNodeId)?.data?.isTrigger : false}
            onContinue={() => {
              
              if (stepContinueCallback) {
                stepContinueCallback()
                setStepContinueCallback(null)
              } else {
              }
            }}
            onSkip={async () => {
              // Skip the current node and move to next
              if (currentNodeId) {
                
                // Access the store functions from the outer scope
                const stepStore = useWorkflowStepExecutionStore.getState()
                
                // Mark current node as success (skipped) 
                stepStore.setNodeStatus(currentNodeId, 'success')
                
                // Find the next node
                const edges = getEdges()
                const nodes = getNodes().filter((n: Node) => n.type === 'custom')
                const currentNode = nodes.find(n => n.id === currentNodeId)
                const nextEdge = edges.find(e => e.source === currentNodeId)
                
                if (nextEdge) {
                  const nextNode = nodes.find(n => n.id === nextEdge.target)
                  if (nextNode) {
                    
                    // If there's a continue callback waiting, resolve it to unblock the current node
                    if (stepContinueCallback) {
                      stepContinueCallback()
                      setStepContinueCallback(null)
                    }
                    
                    // Get the output data from the current node (if any)
                    const currentNodeResult = stepStore.nodeResults[currentNodeId]
                    const outputData = currentNodeResult?.output || {}
                    
                    // Execute the next node in step mode
                    await executeNodeStepByStep(nextNode as CustomNode, nodes as CustomNode[], edges, outputData, false)
                  }
                } else {
                  // No more nodes, workflow complete
                  stepStore.setCurrentNode(null)
                  toast({
                    title: "Workflow Complete", 
                    description: "All nodes have been processed.",
                  })
                  
                  // If there's a continue callback waiting, resolve it
                  if (stepContinueCallback) {
                    stepContinueCallback()
                    setStepContinueCallback(null)
                  }
                }
              }
            }}
            onStop={() => {
              // Stop the entire execution and reset everything
              const stepStore = useWorkflowStepExecutionStore.getState()
              stepStore.stopStepExecution()
              setIsStepByStep(false)
              setListeningMode(false)
              setIsExecuting(false)
              setStepContinueCallback(null)
              
              // Clear all node execution statuses to reset visual states
              const currentNodes = getNodes()
              const resetNodes = currentNodes.map((node: Node) => ({
                ...node,
                data: {
                  ...node.data,
                  executionStatus: null,
                  isActiveExecution: false,
                  isListening: false,
                  errorMessage: null,
                  errorTimestamp: null
                }
              }))
              setNodes(resetNodes)
              
              toast({
                title: "Execution Stopped",
                description: "Workflow test has been stopped and reset."
              })
            }}
          />
        )}
        </>
      )}

      <Dialog open={showTriggerDialog} onOpenChange={setShowTriggerDialog}>
        <DialogContent className="sm:max-w-[900px] h-[90vh] max-h-[90vh] w-full bg-gradient-to-br from-slate-50 to-white border-0 shadow-2xl flex flex-col overflow-hidden" style={{ paddingRight: '2rem' }}>
          <DialogHeader className="pb-3 border-b border-slate-200">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-gradient-to-br from-blue-500 to-purple-600 rounded-lg text-white">
                  <Bell className="w-5 h-5" />
                </div>
                <div>
                  <DialogTitle className="text-xl font-semibold text-slate-900 flex items-center gap-2">
                    Select a Trigger
                    <Badge variant="secondary" className="bg-blue-100 text-blue-800 border-blue-200">Trigger</Badge>
                  </DialogTitle>
                  <DialogDescription className="text-sm text-slate-600 mt-1">
                    Choose an integration and a trigger to start your workflow.
                  </DialogDescription>
                </div>
              </div>
              {/* Rely on default Dialog close button to avoid double X */}
            </div>
          </DialogHeader>
          
          <div className="pt-3 pb-3 border-b border-slate-200">
            <div className="flex flex-col space-y-3">
              <div className="flex items-center space-x-4">
                <div className="relative flex-grow">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                  <Input
                    placeholder="Search integrations or triggers..."
                    className="pl-10"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                  />
                </div>
                <Select value={filterCategory} onValueChange={setFilterCategory}>
                  <SelectTrigger className="w-[200px]">
                    <SelectValue placeholder="Filter by category" />
                  </SelectTrigger>
                  <SelectContent>
                    {categories.map(cat => (
                      <SelectItem key={cat} value={cat}>{formatCategoryName(cat)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center justify-end">
                <label className="flex items-center space-x-2 text-sm text-muted-foreground cursor-pointer hover:text-foreground transition-colors">
                  <input
                    type="checkbox"
                    checked={showComingSoon}
                    onChange={(e) => setShowComingSoon(e.target.checked)}
                    className="rounded border-gray-300 text-primary focus:ring-primary w-4 h-4"
                  />
                  <span>Show coming soon integrations</span>
                </label>
              </div>
            </div>
          </div>

          <div className="flex-1 flex min-h-0 overflow-hidden">
            <ScrollArea className="w-2/5 border-r border-border flex-1" style={{ scrollbarGutter: 'stable' }}>
              <div className="pt-2 pb-3 pl-3 pr-5">
              {filteredIntegrations.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-8 text-center">
                  <div className="text-muted-foreground mb-2">
                    <svg className="w-12 h-12 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                    </svg>
                  </div>
                  <p className="text-sm text-muted-foreground">No integrations match your search</p>
                </div>
              ) : (
                filteredIntegrations
                  .filter(integration => integration.triggers && integration.triggers.length > 0)
                  .map((integration) => {
                  // Use cached status if available, otherwise check current status
                  const isConnected = cachedIntegrationStatus[integration.id] !== undefined
                    ? cachedIntegrationStatus[integration.id]
                    : isIntegrationConnected(integration.id);
                  const isComingSoon = comingSoonIntegrations.has(integration.id);
                  
                  return (
                    <div
                      key={integration.id}
                      className={`flex items-center p-3 rounded-md ${
                        isComingSoon 
                          ? 'cursor-not-allowed opacity-60'
                          : isConnected 
                            ? `cursor-pointer ${selectedIntegration?.id === integration.id ? 'bg-primary/10 ring-1 ring-primary/20' : 'hover:bg-muted/50'}`
                            : 'opacity-60'
                      }`}
                      onClick={() => !isComingSoon && isConnected && setSelectedIntegration(integration)}
                    >
                      {renderLogo(integration.id, integration.name)}
                      <span className="font-semibold ml-4 flex-grow">{integration.name}</span>
                      {isComingSoon ? (
                        <Badge variant="secondary" className="ml-2 shrink-0">
                          Coming soon
                        </Badge>
                      ) : !isConnected &&
                           integration.id !== 'core' &&
                           integration.id !== 'logic' &&
                           integration.id !== 'schedule' &&
                           integration.id !== 'manual' &&
                           integration.id !== 'ai' ? (
                        <Button
                          size="sm"
                          variant="outline"
                          className="mr-2"
                          disabled={connectingIntegrationId === integration.id}
                          onClick={async (e) => {
                            e.stopPropagation();
                            setConnectingIntegrationId(integration.id);
                            
                            // Check if this integration needs reauthorization
                            const integrationRecord = integrations?.find(i => i.provider === integration.id);
                            const needsReauth = integrationRecord?.status === 'needs_reauthorization' || 
                                               integrationRecord?.status === 'expired' ||
                                               integrationRecord?.status === 'invalid' ||
                                               integrationRecord?.status === 'error';
                            
                            // Generate OAuth URL dynamically
                            try {
                              const response = await fetch('/api/integrations/auth/generate-url', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ 
                                  provider: integration.id, 
                                  forceFresh: needsReauth // Force fresh auth if reauthorization needed
                                })
                              });
                              
                              const data = await response.json();
                              console.log('OAuth URL response:', data);
                              const url = data.authUrl || data.url; // Support both authUrl and url properties
                              
                              if (url) {
                                // Open OAuth popup
                                const width = 600;
                                const height = 700;
                                const left = window.innerWidth / 2 - width / 2;
                                const top = window.innerHeight / 2 - height / 2;
                                
                                console.log('Opening OAuth popup with URL:', url);
                                console.log('Integration:', integration.id);
                                
                                const popup = window.open(
                                  url,
                                  `${integration.id}_oauth`,
                                  `width=${width},height=${height},left=${left},top=${top}`
                                );
                                
                                // Check if popup was successfully opened
                                if (!popup) {
                                  console.error('Popup was blocked or failed to open!');
                                  setConnectingIntegrationId(null);
                                  toast({
                                    title: "Popup Blocked",
                                    description: "Please allow popups for this site or we'll redirect you instead.",
                                    variant: "destructive",
                                  });
                                  // Fallback to redirect
                                  setTimeout(() => {
                                    window.location.href = url;
                                  }, 2000);
                                  return;
                                }
                                
                                // Check if popup was immediately closed (could indicate an error)
                                let popupCheckTimeout = setTimeout(() => {
                                  if (popup.closed) {
                                    console.warn('Popup closed immediately after opening - possible popup blocker');
                                    console.warn('URL was:', url);
                                    setConnectingIntegrationId(null);
                                    
                                    // Don't process this as a success - popup was likely blocked
                                    window.removeEventListener('message', handleMessage);
                                    const polling = pollingInstancesRef.current.get(selectedIntegration.id);
                                    if (polling) {
                                      clearInterval(polling);
                                      pollingInstancesRef.current.delete(selectedIntegration.id);
                                      console.log(`🔒 [${selectedIntegration.id}] Cleared polling after popup closed`);
                                    }
                                    
                                    // Show popup blocked message
                                    toast({
                                      title: "Popup Blocked",
                                      description: "Please allow popups for this site and try again.",
                                      variant: "destructive",
                                    });
                                    return; // Exit early to prevent further processing
                                  } else {
                                    console.log('Popup is still open after 100ms - good sign');
                                  }
                                }, 100);
                                
                                // Listen for OAuth completion
                                const handleMessage = async (event: MessageEvent) => {
                                  console.log('📨 Received message:', {
                                    type: event.data?.type,
                                    data: event.data,
                                    origin: event.origin
                                  });
                                  
                                  if (event.data?.type === 'oauth-complete') {
                                    console.log('✅ OAuth complete message received!', event.data);
                                    window.removeEventListener('message', handleMessage);
                                    if (popup && !popup.closed) {
                                      popup.close();
                                    }
                                    
                                    // Clear connecting state immediately
                                    setConnectingIntegrationId(null);
                                    
                                    // Refresh integrations to get updated status
                                    if (event.data.success) {
                                      // Force refresh integrations using the store directly
                                      await useIntegrationStore.getState().fetchIntegrations(true);
                                      
                                      // Store the integration to select
                                      const integrationToSelect = integration;
                                      
                                      // Wait for the integration to actually be connected in the store
                                      let retries = 0;
                                      const maxRetries = 10;
                                      while (retries < maxRetries) {
                                        await new Promise(resolve => setTimeout(resolve, 500));
                                        
                                        // Check if the integration is now connected
                                        const storeIntegrations = useIntegrationStore.getState().integrations;
                                        const connectedIntegration = storeIntegrations.find(
                                          i => i.provider === integrationToSelect.id && i.status === 'connected'
                                        );
                                        
                                        if (connectedIntegration) {
                                          console.log('✅ Integration confirmed as connected:', integrationToSelect.id);
                                          break;
                                        }
                                        
                                        console.log(`⏳ Waiting for integration to be connected... (attempt ${retries + 1}/${maxRetries})`);
                                        
                                        // Try fetching again
                                        if (retries % 2 === 0) {
                                          await useIntegrationStore.getState().fetchIntegrations(true);
                                        }
                                        
                                        retries++;
                                      }
                                      
                                      // Force a re-render by clearing and resetting selection
                                      setSelectedIntegration(null);
                                      
                                      // Small delay to ensure state update
                                      await new Promise(resolve => setTimeout(resolve, 50));
                                      
                                      // Now select the integration
                                      setSelectedIntegration(integrationToSelect);
                                      
                                      // Scroll to the integration after modal reopens
                                      setTimeout(() => {
                                        if (integrationToSelect && integrationToSelect.id) {
                                          const element = document.getElementById(`action-integration-${integrationToSelect.id}`);
                                          console.log(`🎯 Scrolling to integration:`, integrationToSelect.id, 'Element found:', !!element);
                                          
                                          if (element) {
                                            // Get the scrollable container (ScrollArea viewport)
                                            const scrollContainer = element.closest('[data-radix-scroll-area-viewport]');
                                            console.log('📜 Scroll container found:', !!scrollContainer);
                                            
                                            if (scrollContainer) {
                                              // Calculate the exact position
                                              const containerRect = scrollContainer.getBoundingClientRect();
                                              const elementRect = element.getBoundingClientRect();
                                              const relativeTop = elementRect.top - containerRect.top;
                                              const currentScroll = scrollContainer.scrollTop;
                                              const targetScroll = currentScroll + relativeTop - 16; // 16px padding from top
                                              
                                              // Scroll to the calculated position
                                              scrollContainer.scrollTo({
                                                top: targetScroll,
                                                behavior: 'smooth'
                                              });
                                            }
                                          }
                                        } else {
                                          console.log('⚠️ No integration to select or scroll to');
                                        }
                                      }, 800);
                                      
                                      toast({
                                        title: needsReauth ? "Reconnection Successful" : "Connection Successful",
                                        description: `Successfully ${needsReauth ? 'reconnected' : 'connected'} to ${integration.name}`,
                                      });
                                    } else {
                                      console.log('❌ OAuth failed:', event.data.error);
                                      toast({
                                        title: "Connection Failed",
                                        description: event.data.error || "Failed to connect. Please try again.",
                                        variant: "destructive"
                                      });
                                    }
                                    
                                    // Clear loading state
                                    setConnectingIntegrationId(null);
                                  }
                                };
                                
                                window.addEventListener('message', handleMessage);
                                
                                // Set up BroadcastChannel listener for Trello and other same-origin OAuth flows
                                let broadcastChannel: BroadcastChannel | null = null;
                                try {
                                  broadcastChannel = new BroadcastChannel('oauth_channel');
                                  broadcastChannel.onmessage = (event) => {
                                    console.log('📡 Received OAuth via BroadcastChannel:', event.data);
                                    if (event.data.provider === integration.id.toLowerCase()) {
                                      handleMessage({ 
                                        data: event.data,
                                        origin: window.location.origin 
                                      } as MessageEvent);
                                      broadcastChannel?.close();
                                    }
                                  };
                                } catch (e) {
                                  console.log('BroadcastChannel not available');
                                }
                                
                                // Also poll localStorage as a fallback (COOP-safe)
                                // Create a unique key for this polling instance
                                const pollingKey = `${selectedIntegration.id}_${Date.now()}`;
                                
                                // Clear ALL existing polling instances to prevent conflicts
                                pollingInstancesRef.current.forEach((polling, key) => {
                                  console.log(`🛑 Clearing existing polling for ${key}`);
                                  clearInterval(polling);
                                });
                                pollingInstancesRef.current.clear();
                                
                                const pollLocalStorage = () => {
                                  try {
                                    // Check for OAuth response in localStorage
                                    const keys = Object.keys(localStorage).filter(k => k.startsWith('oauth_response_'));
                                    
                                    if (keys.length > 0) {
                                      console.log(`🔍 [${selectedIntegration.id}] Found localStorage keys starting with oauth_response_:`, keys);
                                      
                                      for (const key of keys) {
                                        const rawData = localStorage.getItem(key);
                                        
                                        const data = JSON.parse(rawData || '{}');
                                        
                                        // More flexible provider matching - handle case differences and name variations
                                        const providerLower = (data.provider || '').toLowerCase();
                                        const integrationIdLower = integration?.id?.toLowerCase() || '';
                                        const integrationNameLower = integration?.name?.toLowerCase() || '';
                                        
                                        // Skip if integration is null or missing ID
                                        if (!integration || !integrationIdLower) {
                                          continue;
                                        }
                                        
                                        // Check if provider matches integration ID or name (case-insensitive)
                                        const isMatch = providerLower === integrationIdLower || 
                                                       providerLower === integrationNameLower ||
                                                       providerLower.includes(integrationIdLower) ||
                                                       integrationIdLower.includes(providerLower);
                                        
                                        if (isMatch) {
                                          console.log(`✅ [${integration.id}] Provider match found! Processing OAuth response:`, data);
                                          console.log(`Matched: provider="${data.provider}" with integration="${integration.id}"`);
                                          console.log(`Integration details:`, { id: integration.id, name: integration.name, provider: integration.provider });
                                          localStorage.removeItem(key);
                                          
                                          // Process the OAuth response
                                          handleMessage({ 
                                            data: {
                                              type: 'oauth-complete',
                                              success: data.success,
                                              error: data.error,
                                              provider: data.provider,
                                              message: data.message
                                            },
                                            origin: window.location.origin
                                          } as MessageEvent);
                                          
                                          // Clear the polling for this integration
                                          const polling = pollingInstancesRef.current.get(selectedIntegration.id);
                                          if (polling) {
                                            clearInterval(polling);
                                            pollingInstancesRef.current.delete(selectedIntegration.id);
                                            console.log(`✅ [${selectedIntegration.id}] Cleared polling after successful match`);
                                          }
                                          break;
                                        } else {
                                          console.log(`❌ [${selectedIntegration.id}] Provider mismatch: "${data.provider}" !== "${selectedIntegration.id}" or "${selectedIntegration.name}"`);
                                        }
                                      }
                                    }
                                  } catch (e) {
                                    console.error(`Error checking localStorage for ${selectedIntegration.id}:`, e);
                                  }
                                };
                                
                                // Clean up old OAuth responses for this provider before starting
                                const oldOAuthKeys = Object.keys(localStorage).filter(k => 
                                  k.startsWith('oauth_response_') && k.includes(selectedIntegration.id.toLowerCase())
                                );
                                oldOAuthKeys.forEach(key => {
                                  console.log(`🧹 [${selectedIntegration.id}] Cleaning up old OAuth response: ${key}`);
                                  localStorage.removeItem(key);
                                });
                                
                                // Start polling localStorage
                                console.log(`🔄 [${selectedIntegration.id}] Starting localStorage polling for OAuth response...`);
                                const localStoragePolling = setInterval(pollLocalStorage, 500);
                                pollingInstancesRef.current.set(selectedIntegration.id, localStoragePolling);
                                
                                // Do an immediate check as well but delay slightly to avoid race condition
                                setTimeout(() => {
                                  pollLocalStorage();
                                }, 100);
                                
                                // Stop polling after 30 seconds (increased from default)
                                setTimeout(() => {
                                  const polling = pollingInstancesRef.current.get(selectedIntegration.id);
                                  if (polling) {
                                    clearInterval(polling);
                                    pollingInstancesRef.current.delete(selectedIntegration.id);
                                    console.log(`⏱️ [${selectedIntegration.id}] Stopped localStorage polling after 30 seconds`);
                                  }
                                }, 30000);
                                
                                // Clean up old test entries
                                const keysToClean = Object.keys(localStorage).filter(k => k.includes('oauth_response_test'));
                                keysToClean.forEach(key => {
                                  localStorage.removeItem(key);
                                });
                                
                                // Clean up if popup is closed manually
                                const checkClosed = setInterval(() => {
                                  if (popup && popup.closed) {
                                    clearInterval(checkClosed);
                                    const polling = pollingInstancesRef.current.get(selectedIntegration.id);
                                    if (polling) {
                                      clearInterval(polling);
                                      pollingInstancesRef.current.delete(selectedIntegration.id);
                                      console.log(`🔒 [${selectedIntegration.id}] Cleared polling after popup closed`);
                                    }
                                    window.removeEventListener('message', handleMessage);
                                    // Clear the connecting state when popup is closed
                                    setConnectingIntegrationId(null);
                                    
                                    // Check localStorage one final time
                                    setTimeout(pollLocalStorage, 100);
                                    
                                    // Clear loading state after a delay if no response
                                    setTimeout(() => {
                                      setConnectingIntegrationId(null);
                                    }, 2000);
                                  }
                                }, 1000);
                              }
                            } catch (error) {
                              console.error('Error generating OAuth URL:', error);
                              setConnectingIntegrationId(null);
                              toast({
                                title: needsReauth ? "Reconnection Error" : "Connection Error",
                                description: `Failed to ${needsReauth ? 'reconnect' : 'connect'}. Please try again.`,
                                variant: "destructive",
                              });
                            }
                          }}
                        >
                          {connectingIntegrationId === integration.id ? (
                            <>
                              <Loader2 className="mr-2 h-3 w-3 animate-spin" />
                              Connecting...
                            </>
                          ) : (() => {
                            const integrationRecord = integrations?.find(i => i.provider === integration.id);
                            // Check for various states that need reauthorization
                            const needsReauth = integrationRecord?.status === 'needs_reauthorization' || 
                                               integrationRecord?.status === 'expired' ||
                                               integrationRecord?.status === 'invalid' ||
                                               integrationRecord?.status === 'error';
                            return needsReauth ? 'Reconnect' : 'Connect';
                          })()}
                        </Button>
                      ) : (
                        <ChevronRight className="w-5 h-5 text-muted-foreground" />
                      )}
                    </div>
                  );
                })
              )}
              </div>
            </ScrollArea>
            <div className="w-3/5 flex-1">
              <ScrollArea className="h-full" style={{ scrollbarGutter: 'stable' }}>
                <div className="p-4">
                {selectedIntegration ? (
                  <div className="h-full">
                    {!isIntegrationConnected(selectedIntegration.id) ? (
                      // Show message for unconnected integrations
                      <div className="flex flex-col items-center justify-center h-full text-center">
                        <div className="text-muted-foreground mb-4">
                          <svg className="w-16 h-16 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                          </svg>
                        </div>
                        <h3 className="text-lg font-semibold mb-2">Connect {selectedIntegration.name}</h3>
                        <p className="text-sm text-muted-foreground mb-4">
                          You need to connect your {selectedIntegration.name} account to use these triggers.
                        </p>
                        <Button
                          variant="default"
                          onClick={async () => {
                            // Check if this integration needs reauthorization
                            const integrationRecord = integrations?.find(i => i.provider === selectedIntegration.id);
                            const needsReauth = integrationRecord?.status === 'needs_reauthorization' || 
                                               integrationRecord?.status === 'expired' ||
                                               integrationRecord?.status === 'invalid' ||
                                               integrationRecord?.status === 'error';
                            
                            // Generate OAuth URL dynamically
                            try {
                              const response = await fetch('/api/integrations/auth/generate-url', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ 
                                  provider: selectedIntegration.id, 
                                  forceFresh: needsReauth // Force fresh auth if reauthorization needed
                                })
                              });
                              
                              const data = await response.json();
                              console.log('OAuth URL response:', data);
                              const url = data.authUrl || data.url; // Support both authUrl and url properties
                              
                              if (url) {
                                // Open OAuth popup
                                const width = 600;
                                const height = 700;
                                const left = window.innerWidth / 2 - width / 2;
                                const top = window.innerHeight / 2 - height / 2;
                                
                                console.log('Opening OAuth popup with URL:', url);
                                const popup = window.open(
                                  url,
                                  `${selectedIntegration.id}_oauth`,
                                  `width=${width},height=${height},left=${left},top=${top}`
                                );
                                
                                if (!popup || popup.closed || typeof popup.closed == 'undefined') {
                                  console.error('Popup was blocked!');
                                  setConnectingIntegrationId(null);
                                  // Fallback to redirect if popup is blocked
                                  toast({
                                    title: "Popup Blocked",
                                    description: "Please allow popups for this site or we'll redirect you instead.",
                                    variant: "destructive",
                                  });
                                  // Optional: fallback to redirect
                                  setTimeout(() => {
                                    window.location.href = url;
                                  }, 2000);
                                  return;
                                }
                                
                                // Listen for OAuth completion
                                const handleMessage = async (event: MessageEvent) => {
                                  console.log('📨 Received message:', {
                                    type: event.data?.type,
                                    data: event.data,
                                    origin: event.origin
                                  });
                                  
                                  // Handle both oauth-complete (from oauth/callback page) and oauth-success (from createPopupResponse)
                                  if (event.data?.type === 'oauth-complete' || event.data?.type === 'oauth-success') {
                                    console.log('✅ OAuth complete message received!', event.data);
                                    window.removeEventListener('message', handleMessage);
                                    if (popup && !popup.closed) {
                                      popup.close();
                                    }
                                    
                                    // Clear the connecting state
                                    setConnectingIntegrationId(null);
                                    
                                    // Refresh integrations to get updated status
                                    if (event.data.success) {
                                      console.log('🔄 OAuth success! Refreshing integrations...');
                                      
                                      // Force refresh integrations using the store directly
                                      await useIntegrationStore.getState().fetchIntegrations(true);
                                      
                                      // Wait a bit longer for stores to fully update
                                      await new Promise(resolve => setTimeout(resolve, 500));
                                      
                                      // Get the latest integrations after refresh
                                      const updatedIntegrations = useIntegrationStore.getState().integrations;
                                      
                                      // Store the integration to select (use the selectedIntegration from the click event)
                                      const integrationToSelect = selectedIntegration;
                                      
                                      // Force the modal to close and reopen to ensure complete refresh
                                      const wasShowingAction = showActionDialog;
                                      const wasShowingTrigger = showTriggerDialog;
                                      
                                      // Close the dialog
                                      setShowActionDialog(false);
                                      setShowTriggerDialog(false);
                                      
                                      // Wait a moment for the close to process
                                      await new Promise(resolve => setTimeout(resolve, 100));
                                      
                                      // Reopen the dialog
                                      if (wasShowingAction) {
                                        openActionDialog();
                                      }
                                      if (wasShowingTrigger) {
                                        openTriggerDialog();
                                      }
                                      
                                      // Wait for dialog to render
                                      await new Promise(resolve => setTimeout(resolve, 200));
                                      
                                      // Select the integration that was just connected
                                      setSelectedIntegration(integrationToSelect);
                                      
                                      // Force a re-render
                                      forceUpdate({});
                                      
                                      // Scroll to the integration after a delay to ensure DOM is updated
                                      setTimeout(() => {
                                        if (integrationToSelect && integrationToSelect.id) {
                                          const element = document.getElementById(`action-integration-${integrationToSelect.id}`);
                                          console.log(`🎯 Scrolling to integration:`, integrationToSelect.id, 'Element found:', !!element);
                                          
                                          if (element) {
                                            // Get the scrollable container (ScrollArea viewport)
                                            const scrollContainer = element.closest('[data-radix-scroll-area-viewport]');
                                            console.log('📜 Scroll container found:', !!scrollContainer);
                                            
                                            if (scrollContainer) {
                                              // Calculate the exact position
                                              const containerRect = scrollContainer.getBoundingClientRect();
                                              const elementRect = element.getBoundingClientRect();
                                              const relativeTop = elementRect.top - containerRect.top;
                                              const currentScroll = scrollContainer.scrollTop;
                                              const targetScroll = currentScroll + relativeTop - 16; // 16px padding from top
                                              
                                              // Scroll to the calculated position
                                              scrollContainer.scrollTo({
                                                top: targetScroll,
                                                behavior: 'smooth'
                                              });
                                            }
                                          }
                                        } else {
                                          console.log('⚠️ No integration to select or scroll to');
                                        }
                                      }, 800);
                                      
                                      toast({
                                        title: needsReauth ? "Reconnection Successful" : "Connection Successful",
                                        description: `Successfully ${needsReauth ? 'reconnected' : 'connected'} to ${integrationToSelect.name}`,
                                      });
                                    } else {
                                      // Show error toast if connection failed
                                      toast({
                                        title: "Connection Failed",
                                        description: event.data.error || event.data.message || "Failed to connect integration",
                                        variant: "destructive",
                                      });
                                    }
                                  }
                                };
                                
                                window.addEventListener('message', handleMessage);
                                
                                // Set up BroadcastChannel listener for Trello and other same-origin OAuth flows
                                let broadcastChannel: BroadcastChannel | null = null;
                                try {
                                  broadcastChannel = new BroadcastChannel('oauth_channel');
                                  broadcastChannel.onmessage = (event) => {
                                    console.log('📡 Received OAuth via BroadcastChannel:', event.data);
                                    if (event.data.provider === integration.id.toLowerCase()) {
                                      handleMessage({ 
                                        data: event.data,
                                        origin: window.location.origin 
                                      } as MessageEvent);
                                      broadcastChannel?.close();
                                    }
                                  };
                                } catch (e) {
                                  console.log('BroadcastChannel not available');
                                }
                                
                                // Also poll localStorage as a fallback (COOP-safe)
                                // Create a unique key for this polling instance
                                const pollingKey = `${selectedIntegration.id}_${Date.now()}`;
                                
                                // Clear ALL existing polling instances to prevent conflicts
                                pollingInstancesRef.current.forEach((polling, key) => {
                                  console.log(`🛑 Clearing existing polling for ${key}`);
                                  clearInterval(polling);
                                });
                                pollingInstancesRef.current.clear();
                                
                                const pollLocalStorage = () => {
                                  try {
                                    // Check for OAuth response in localStorage
                                    const keys = Object.keys(localStorage).filter(k => k.startsWith('oauth_response_'));
                                    
                                    if (keys.length > 0) {
                                      console.log(`🔍 [${selectedIntegration.id}] Found localStorage keys starting with oauth_response_:`, keys);
                                      
                                      for (const key of keys) {
                                        const rawData = localStorage.getItem(key);
                                        
                                        const data = JSON.parse(rawData || '{}');
                                        
                                        // More flexible provider matching - handle case differences and name variations
                                        const providerLower = (data.provider || '').toLowerCase();
                                        const integrationIdLower = selectedIntegration?.id?.toLowerCase() || '';
                                        const integrationNameLower = selectedIntegration?.name?.toLowerCase() || '';
                                        
                                        // Skip if selectedIntegration is null or missing ID
                                        if (!selectedIntegration || !integrationIdLower) {
                                          continue;
                                        }
                                        
                                        // Check if provider matches integration ID or name (case-insensitive)
                                        const isMatch = providerLower === integrationIdLower || 
                                                       providerLower === integrationNameLower ||
                                                       providerLower.includes(integrationIdLower) ||
                                                       integrationIdLower.includes(providerLower);
                                        
                                        if (isMatch) {
                                          console.log(`✅ [${selectedIntegration.id}] Provider match found! Processing OAuth response:`, data);
                                          console.log(`Matched: provider="${data.provider}" with integration="${selectedIntegration.id}"`);
                                          console.log(`Integration details:`, { id: selectedIntegration.id, name: selectedIntegration.name, provider: selectedIntegration.provider });
                                          localStorage.removeItem(key);
                                          
                                          // Process the OAuth response
                                          handleMessage({ 
                                            data: {
                                              type: 'oauth-complete',
                                              success: data.success,
                                              error: data.error,
                                              provider: data.provider,
                                              message: data.message
                                            },
                                            origin: window.location.origin
                                          } as MessageEvent);
                                          
                                          // Clear the polling for this integration
                                          const polling = pollingInstancesRef.current.get(selectedIntegration.id);
                                          if (polling) {
                                            clearInterval(polling);
                                            pollingInstancesRef.current.delete(selectedIntegration.id);
                                            console.log(`✅ [${selectedIntegration.id}] Cleared polling after successful match`);
                                          }
                                          break;
                                        } else {
                                          console.log(`❌ [${selectedIntegration.id}] Provider mismatch: "${data.provider}" !== "${selectedIntegration.id}" or "${selectedIntegration.name}"`);
                                        }
                                      }
                                    }
                                  } catch (e) {
                                    console.error(`Error checking localStorage for ${selectedIntegration.id}:`, e);
                                  }
                                };
                                
                                // Clean up old OAuth responses for this provider before starting
                                const oldOAuthKeys = Object.keys(localStorage).filter(k => 
                                  k.startsWith('oauth_response_') && k.includes(selectedIntegration.id.toLowerCase())
                                );
                                oldOAuthKeys.forEach(key => {
                                  console.log(`🧹 [${selectedIntegration.id}] Cleaning up old OAuth response: ${key}`);
                                  localStorage.removeItem(key);
                                });
                                
                                // Start polling localStorage
                                console.log(`🔄 [${selectedIntegration.id}] Starting localStorage polling for OAuth response...`);
                                const localStoragePolling = setInterval(pollLocalStorage, 500);
                                pollingInstancesRef.current.set(selectedIntegration.id, localStoragePolling);
                                
                                // Do an immediate check as well but delay slightly to avoid race condition
                                setTimeout(() => {
                                  pollLocalStorage();
                                }, 100);
                                
                                // Stop polling after 30 seconds (increased from default)
                                setTimeout(() => {
                                  const polling = pollingInstancesRef.current.get(selectedIntegration.id);
                                  if (polling) {
                                    clearInterval(polling);
                                    pollingInstancesRef.current.delete(selectedIntegration.id);
                                    console.log(`⏱️ [${selectedIntegration.id}] Stopped localStorage polling after 30 seconds`);
                                  }
                                }, 30000);
                                
                                // Clean up old test entries
                                const keysToClean = Object.keys(localStorage).filter(k => k.includes('oauth_response_test'));
                                keysToClean.forEach(key => {
                                  localStorage.removeItem(key);
                                });
                                
                                // Clean up if popup is closed manually
                                const checkClosed = setInterval(() => {
                                  if (popup && popup.closed) {
                                    clearInterval(checkClosed);
                                    const polling = pollingInstancesRef.current.get(selectedIntegration.id);
                                    if (polling) {
                                      clearInterval(polling);
                                      pollingInstancesRef.current.delete(selectedIntegration.id);
                                      console.log(`🔒 [${selectedIntegration.id}] Cleared polling after popup closed`);
                                    }
                                    window.removeEventListener('message', handleMessage);
                                    // Clear the connecting state when popup is closed
                                    setConnectingIntegrationId(null);
                                    
                                    // Check localStorage one final time
                                    setTimeout(pollLocalStorage, 100);
                                    
                                    // Clear loading state after a delay if no response
                                    setTimeout(() => {
                                      setConnectingIntegrationId(null);
                                    }, 2000);
                                  }
                                }, 1000);
                              }
                            } catch (error) {
                              console.error('Error generating OAuth URL:', error);
                              setConnectingIntegrationId(null);
                              toast({
                                title: needsReauth ? "Reconnection Error" : "Connection Error",
                                description: `Failed to ${needsReauth ? 'reconnect' : 'connect'}. Please try again.`,
                                variant: "destructive",
                              });
                            }
                          }}
                        >
                          {(() => {
                            const integrationRecord = integrations?.find(i => i.provider === selectedIntegration.id);
                            // Check for various states that need reauthorization
                            const needsReauth = integrationRecord?.status === 'needs_reauthorization' || 
                                               integrationRecord?.status === 'expired' ||
                                               integrationRecord?.status === 'invalid' ||
                                               integrationRecord?.status === 'error';
                            return needsReauth 
                              ? `Reconnect ${selectedIntegration.name}` 
                              : `Connect ${selectedIntegration.name}`;
                          })()}
                        </Button>
                      </div>
                    ) : displayedTriggers.length > 0 ? (
                      <div className="grid grid-cols-1 gap-3">
                        {displayedTriggers.map((trigger, index) => {
                          const isTriggerComingSoon = Boolean((trigger as any).comingSoon) || (selectedIntegration && comingSoonIntegrations.has(selectedIntegration.id))
                          return (
                            <div
                              key={`${trigger.type}-${trigger.title}-${index}`}
                              className={`relative p-4 border rounded-lg transition-all ${
                                isTriggerComingSoon ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer'
                              } ${selectedTrigger?.type === trigger.type ? 'border-primary bg-primary/10 ring-1 ring-primary/20' : 'border-border hover:border-muted-foreground hover:shadow-sm'}`}
                              onClick={() => {
                                if (isTriggerComingSoon) return
                                setSelectedTrigger(trigger)
                              }}
                              onDoubleClick={() => {
                                if (isTriggerComingSoon) return
                                setSelectedTrigger(trigger)
                                if (selectedIntegration) {
                                  handleTriggerSelect(selectedIntegration, trigger)
                                }
                              }}
                              aria-disabled={isTriggerComingSoon}
                            >
                              <div className="flex items-center gap-2">
                                <p className="font-medium flex-1 min-w-0 truncate">{trigger.title}</p>
                                {isTriggerComingSoon && (
                                  <Badge variant="secondary" className="ml-2 shrink-0 whitespace-nowrap text-[10px] h-5 px-2 rounded-full bg-amber-100 text-amber-800 border border-amber-200 uppercase tracking-wide">Coming soon</Badge>
                                )}
                              </div>
                              <p className="text-sm text-muted-foreground mt-1">{trigger.description}</p>
                            </div>
                          )
                        })}
                      </div>
                    ) : (
                      // Show actions for connected integrations
                      <div className="flex flex-col items-center justify-center py-8 text-center">
                        <div className="text-muted-foreground mb-2">
                          <svg className="w-12 h-12 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                          </svg>
                        </div>
                        <p className="text-sm text-muted-foreground mb-2">No triggers available</p>
                        <p className="text-xs text-muted-foreground/70">
                          {selectedIntegration.name} doesn't have any triggers defined yet
                        </p>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="flex items-center justify-center h-full text-muted-foreground">
                    <p>Select an integration to see its triggers</p>
                  </div>
                )}
                </div>
              </ScrollArea>
            </div>
          </div>

          <DialogFooter className="p-4 flex justify-between items-center">
            <div className="text-sm text-muted-foreground">
              {selectedIntegration && (
                <>
                  <span className="font-medium">Integration:</span> {selectedIntegration.name}
                  {selectedTrigger && <span className="ml-4"><span className="font-medium">Trigger:</span> {selectedTrigger.title}</span>}
                </>
              )}
            </div>
            <div className="flex space-x-2">
              <DialogClose asChild><Button variant="outline">Cancel</Button></DialogClose>
              <Button 
                disabled={!selectedTrigger || !selectedIntegration}
                onClick={() => {
                  if (selectedIntegration && selectedTrigger) {
                    handleTriggerSelect(selectedIntegration, selectedTrigger)
                  }
                }}
              >
                Continue →
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {/* Action Selection Dialog - Primary - FORCE REFRESHED */}
      {showActionDialog && (
        <Dialog open={showActionDialog} onOpenChange={handleActionDialogClose}>
          <DialogContent className="sm:max-w-[900px] h-[90vh] max-h-[90vh] w-full bg-gradient-to-br from-slate-50 to-white border-0 shadow-2xl flex flex-col overflow-hidden" style={{ paddingRight: '2rem' }} data-testid="action-selection-dialog">
            <DialogHeader className="pb-3 border-b border-slate-200">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-gradient-to-br from-blue-500 to-purple-600 rounded-lg text-white">
                  <Zap className="w-5 h-5" />
                </div>
                <div>
                  <DialogTitle className="text-xl font-semibold text-slate-900 flex items-center gap-2">
                    Select an Action
                    <Badge variant="secondary" className="bg-green-100 text-green-800 border-green-200">Action</Badge>
                  </DialogTitle>
                  <DialogDescription className="text-sm text-slate-600 mt-1">
                    Choose an integration and an action to add to your workflow.
                  </DialogDescription>
                </div>
              </div>
              
              {/* AI/Manual Toggle - Only show if AI Agent exists in workflow */}
              {(() => {
                const hasAIAgent = getNodes().some(n => n.data?.type === 'ai_agent');
                if (!hasAIAgent) return null;
                
                return (
                  <div className="flex items-center gap-2 mr-8">
                    <Label htmlFor="ai-mode-toggle" className="text-sm font-medium">
                      Configuration:
                    </Label>
                    <div className="flex items-center bg-muted rounded-lg p-1">
                      <Button
                        id="ai-mode"
                        variant={isActionAIMode ? "default" : "ghost"}
                        size="sm"
                        className="px-3 py-1 h-7"
                        onClick={() => setIsActionAIMode(true)}
                      >
                        <Bot className="w-3 h-3 mr-1" />
                        AI
                      </Button>
                      <Button
                        id="manual-mode"
                        variant={!isActionAIMode ? "default" : "ghost"}
                        size="sm"
                        className="px-3 py-1 h-7"
                        onClick={() => setIsActionAIMode(false)}
                      >
                        <Settings className="w-3 h-3 mr-1" />
                        Manual
                      </Button>
                    </div>
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <HelpCircle className="h-4 w-4 text-muted-foreground cursor-help" />
                        </TooltipTrigger>
                        <TooltipContent className="max-w-xs">
                          <p className="text-xs">
                            <strong>AI Mode:</strong> Action fields will be automatically configured by AI at runtime.<br/>
                            <strong>Manual Mode:</strong> Configure action fields yourself with specific values.
                          </p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </div>
                );
              })()}
            </div>
          </DialogHeader>
          
          <div className="pt-3 pb-3 border-b border-slate-200">
            <div className="flex flex-col space-y-3">
              <div className="flex items-center space-x-4">
                <div className="relative flex-grow">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                  <Input
                    placeholder="Search integrations or actions..."
                    className="pl-10"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                  />
                </div>
                <Select value={filterCategory} onValueChange={setFilterCategory}>
                  <SelectTrigger className="w-[200px]">
                    <SelectValue placeholder="Filter by category" />
                  </SelectTrigger>
                  <SelectContent>
                    {categories.map(cat => (
                      <SelectItem key={cat} value={cat}>{formatCategoryName(cat)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center justify-end">
                <label className="flex items-center space-x-2 text-sm text-muted-foreground cursor-pointer hover:text-foreground transition-colors">
                  <input
                    type="checkbox"
                    checked={showComingSoon}
                    onChange={(e) => setShowComingSoon(e.target.checked)}
                    className="rounded border-gray-300 text-primary focus:ring-primary w-4 h-4"
                  />
                  <span>Show coming soon integrations</span>
                </label>
              </div>
            </div>
          </div>

          <div className="flex-1 flex min-h-0 overflow-hidden">
            <ScrollArea className="w-2/5 border-r border-border flex-1" style={{ scrollbarGutter: 'stable' }}>
              <div className="pt-2 pb-3 pl-3 pr-5">
              {(() => {
                // Filter integrations for action dialog
                const filteredIntegrationsForActions = availableIntegrations.filter(int => {
                  // Filter out coming soon integrations by default
                  if (!showComingSoon && comingSoonIntegrations.has(int.id)) {
                    return false;
                  }

                  // Filter by category if selected
                  if (filterCategory !== 'all' && int.category !== filterCategory) {
                    return false
                  }

                  // Core integration only has triggers, not actions - filter it out from action dialog
                  if (int.id === 'core') {
                    return false
                  }
                  
                  // Filter out integrations that have no compatible actions
                  const compatibleActions = int.actions
                  
                  if (compatibleActions.length === 0) {
                    return false
                  }
                  
                  if (searchQuery) {
                    const query = searchQuery.toLowerCase()
                    const matchesIntegration = int.name.toLowerCase().includes(query) || int.description.toLowerCase().includes(query)
                    const matchesAction = compatibleActions.some(action => 
                      (action.title?.toLowerCase() || '').includes(query) || (action.description?.toLowerCase() || '').includes(query)
                    )
                    return matchesIntegration || matchesAction
                  }
                  return compatibleActions.length > 0
                });
                
                // Sort to put Logic and AI first
                const sortedIntegrations = filteredIntegrationsForActions.sort((a, b) => {
                  if (a.id === 'logic') return -1
                  if (b.id === 'logic') return 1
                  if (a.id === 'ai') return -1
                  if (b.id === 'ai') return 1
                  return a.name.localeCompare(b.name)
                })


                if (sortedIntegrations.length === 0) {
                  return (
                    <div className="flex flex-col items-center justify-center py-8 text-center">
                      <div className="text-muted-foreground mb-2">
                        <svg className="w-12 h-12 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                        </svg>
                      </div>
                      <p className="text-sm text-muted-foreground">No integrations match your search</p>
                    </div>
                  );
                }

                // Use the already filtered and sorted integrations
                return sortedIntegrations.map((integration) => {
                  // Use cached status if available, otherwise check current status
                  const isConnected = cachedIntegrationStatus[integration.id] !== undefined
                    ? cachedIntegrationStatus[integration.id]
                    : isIntegrationConnected(integration.id);
                  const isComingSoon = comingSoonIntegrations.has(integration.id);
                  
                  return (
                    <div
                      key={integration.id}
                      id={`action-integration-${integration.id}`}
                      className={`flex items-center p-3 rounded-md ${
                        isComingSoon 
                          ? 'cursor-not-allowed opacity-60'
                          : isConnected 
                            ? `cursor-pointer ${selectedIntegration?.id === integration.id ? 'bg-primary/10 ring-1 ring-primary/20' : 'hover:bg-muted/50'}`
                            : 'opacity-60'
                      }`}
                      onClick={() => !isComingSoon && isConnected && setSelectedIntegration(integration)}
                    >
                      {renderLogo(integration.id, integration.name)}
                      <span className="font-semibold ml-4 flex-grow">{integration.name}</span>
                      {isComingSoon ? (
                        <Badge variant="secondary" className="ml-2 shrink-0">
                          Coming soon
                        </Badge>
                      ) : !isConnected &&
                           integration.id !== 'core' &&
                           integration.id !== 'logic' &&
                           integration.id !== 'schedule' &&
                           integration.id !== 'manual' &&
                           integration.id !== 'ai' ? (
                        <Button
                          size="sm"
                          variant="outline"
                          className="mr-2"
                          disabled={connectingIntegrationId === integration.id}
                          onClick={async (e) => {
                            e.stopPropagation();
                            setConnectingIntegrationId(integration.id);
                            
                            // Check if this integration needs reauthorization
                            const integrationRecord = integrations?.find(i => i.provider === integration.id);
                            const needsReauth = integrationRecord?.status === 'needs_reauthorization' || 
                                               integrationRecord?.status === 'expired' ||
                                               integrationRecord?.status === 'invalid' ||
                                               integrationRecord?.status === 'error';
                            
                            // Generate OAuth URL dynamically
                            try {
                              const response = await fetch('/api/integrations/auth/generate-url', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ 
                                  provider: integration.id, 
                                  forceFresh: needsReauth // Force fresh auth if reauthorization needed
                                })
                              });
                              
                              const data = await response.json();
                              console.log('OAuth URL response:', data);
                              const url = data.authUrl || data.url; // Support both authUrl and url properties
                              
                              if (url) {
                                // Open OAuth popup
                                const width = 600;
                                const height = 700;
                                const left = window.innerWidth / 2 - width / 2;
                                const top = window.innerHeight / 2 - height / 2;
                                
                                console.log('Opening OAuth popup with URL:', url);
                                console.log('Integration:', integration.id);
                                
                                const popup = window.open(
                                  url,
                                  `${integration.id}_oauth`,
                                  `width=${width},height=${height},left=${left},top=${top}`
                                );
                                
                                // Check if popup was successfully opened
                                if (!popup) {
                                  console.error('Popup was blocked or failed to open!');
                                  setConnectingIntegrationId(null);
                                  toast({
                                    title: "Popup Blocked",
                                    description: "Please allow popups for this site or we'll redirect you instead.",
                                    variant: "destructive",
                                  });
                                  // Fallback to redirect
                                  setTimeout(() => {
                                    window.location.href = url;
                                  }, 2000);
                                  return;
                                }
                                
                                // Check if popup was immediately closed (could indicate an error)
                                let popupCheckTimeout = setTimeout(() => {
                                  if (popup.closed) {
                                    console.warn('Popup closed immediately after opening - possible popup blocker');
                                    console.warn('URL was:', url);
                                    setConnectingIntegrationId(null);
                                    
                                    // Don't process this as a success - popup was likely blocked
                                    window.removeEventListener('message', handleMessage);
                                    const polling = pollingInstancesRef.current.get(selectedIntegration.id);
                                    if (polling) {
                                      clearInterval(polling);
                                      pollingInstancesRef.current.delete(selectedIntegration.id);
                                      console.log(`🔒 [${selectedIntegration.id}] Cleared polling after popup closed`);
                                    }
                                    
                                    // Show popup blocked message
                                    toast({
                                      title: "Popup Blocked",
                                      description: "Please allow popups for this site and try again.",
                                      variant: "destructive",
                                    });
                                    return; // Exit early to prevent further processing
                                  } else {
                                    console.log('Popup is still open after 100ms - good sign');
                                  }
                                }, 100);
                                
                                // Listen for OAuth completion
                                const handleMessage = async (event: MessageEvent) => {
                                  console.log('📨 Received message:', {
                                    type: event.data?.type,
                                    data: event.data,
                                    origin: event.origin
                                  });
                                  
                                  if (event.data?.type === 'oauth-complete') {
                                    console.log('✅ OAuth complete message received!', event.data);
                                    window.removeEventListener('message', handleMessage);
                                    if (popup && !popup.closed) {
                                      popup.close();
                                    }
                                    
                                    // Clear connecting state immediately
                                    setConnectingIntegrationId(null);
                                    
                                    // Refresh integrations to get updated status
                                    if (event.data.success) {
                                      // Force refresh integrations using the store directly
                                      await useIntegrationStore.getState().fetchIntegrations(true);
                                      
                                      // Store the integration to select
                                      const integrationToSelect = integration;
                                      
                                      // Wait for the integration to actually be connected in the store
                                      let retries = 0;
                                      const maxRetries = 10;
                                      while (retries < maxRetries) {
                                        await new Promise(resolve => setTimeout(resolve, 500));
                                        
                                        // Check if the integration is now connected
                                        const storeIntegrations = useIntegrationStore.getState().integrations;
                                        const connectedIntegration = storeIntegrations.find(
                                          i => i.provider === integrationToSelect.id && i.status === 'connected'
                                        );
                                        
                                        if (connectedIntegration) {
                                          console.log('✅ Integration confirmed as connected:', integrationToSelect.id);
                                          break;
                                        }
                                        
                                        console.log(`⏳ Waiting for integration to be connected... (attempt ${retries + 1}/${maxRetries})`);
                                        
                                        // Try fetching again
                                        if (retries % 2 === 0) {
                                          await useIntegrationStore.getState().fetchIntegrations(true);
                                        }
                                        
                                        retries++;
                                      }
                                      
                                      // Force a re-render by clearing and resetting selection
                                      setSelectedIntegration(null);
                                      
                                      // Small delay to ensure state update
                                      await new Promise(resolve => setTimeout(resolve, 50));
                                      
                                      // Now select the integration
                                      setSelectedIntegration(integrationToSelect);
                                      
                                      // Scroll to the integration after modal reopens
                                      setTimeout(() => {
                                        if (integrationToSelect && integrationToSelect.id) {
                                          const element = document.getElementById(`action-integration-${integrationToSelect.id}`);
                                          console.log(`🎯 Scrolling to integration:`, integrationToSelect.id, 'Element found:', !!element);
                                          
                                          if (element) {
                                            // Get the scrollable container (ScrollArea viewport)
                                            const scrollContainer = element.closest('[data-radix-scroll-area-viewport]');
                                            console.log('📜 Scroll container found:', !!scrollContainer);
                                            
                                            if (scrollContainer) {
                                              // Calculate the exact position
                                              const containerRect = scrollContainer.getBoundingClientRect();
                                              const elementRect = element.getBoundingClientRect();
                                              const relativeTop = elementRect.top - containerRect.top;
                                              const currentScroll = scrollContainer.scrollTop;
                                              const targetScroll = currentScroll + relativeTop - 16; // 16px padding from top
                                              
                                              // Scroll to the calculated position
                                              scrollContainer.scrollTo({
                                                top: targetScroll,
                                                behavior: 'smooth'
                                              });
                                            }
                                          }
                                        } else {
                                          console.log('⚠️ No integration to select or scroll to');
                                        }
                                      }, 800);
                                      
                                      toast({
                                        title: needsReauth ? "Reconnection Successful" : "Connection Successful",
                                        description: `Successfully ${needsReauth ? 'reconnected' : 'connected'} to ${integration.name}`,
                                      });
                                    } else {
                                      console.log('❌ OAuth failed:', event.data.error);
                                      toast({
                                        title: "Connection Failed",
                                        description: event.data.error || "Failed to connect. Please try again.",
                                        variant: "destructive"
                                      });
                                    }
                                    
                                    // Clear loading state
                                    setConnectingIntegrationId(null);
                                  }
                                };
                                
                                window.addEventListener('message', handleMessage);
                                
                                // Set up BroadcastChannel listener for Trello and other same-origin OAuth flows
                                let broadcastChannel: BroadcastChannel | null = null;
                                try {
                                  broadcastChannel = new BroadcastChannel('oauth_channel');
                                  broadcastChannel.onmessage = (event) => {
                                    console.log('📡 Received OAuth via BroadcastChannel:', event.data);
                                    if (event.data.provider === integration.id.toLowerCase()) {
                                      handleMessage({ 
                                        data: event.data,
                                        origin: window.location.origin 
                                      } as MessageEvent);
                                      broadcastChannel?.close();
                                    }
                                  };
                                } catch (e) {
                                  console.log('BroadcastChannel not available');
                                }
                                
                                // Also poll localStorage as a fallback (COOP-safe)
                                // Create a unique key for this polling instance
                                const pollingKey = `${integration.id}_${Date.now()}`;
                                
                                // Clear ALL existing polling instances to prevent conflicts
                                pollingInstancesRef.current.forEach((polling, key) => {
                                  console.log(`🛑 Clearing existing polling for ${key}`);
                                  clearInterval(polling);
                                });
                                pollingInstancesRef.current.clear();
                                
                                const pollLocalStorage = () => {
                                  try {
                                    // Check for OAuth response in localStorage
                                    const keys = Object.keys(localStorage).filter(k => k.startsWith('oauth_response_'));
                                    
                                    if (keys.length > 0) {
                                      console.log(`🔍 [${integration.id}] Found localStorage keys starting with oauth_response_:`, keys);
                                      
                                      for (const key of keys) {
                                        const rawData = localStorage.getItem(key);
                                        
                                        const data = JSON.parse(rawData || '{}');
                                        
                                        // More flexible provider matching - handle case differences and name variations
                                        const providerLower = (data.provider || '').toLowerCase();
                                        const integrationIdLower = integration?.id?.toLowerCase() || '';
                                        const integrationNameLower = integration?.name?.toLowerCase() || '';
                                        
                                        // Skip if integration is null or missing ID
                                        if (!integration || !integrationIdLower) {
                                          continue;
                                        }
                                        
                                        // Check if provider matches integration ID or name (case-insensitive)
                                        const isMatch = providerLower === integrationIdLower || 
                                                       providerLower === integrationNameLower ||
                                                       providerLower.includes(integrationIdLower) ||
                                                       integrationIdLower.includes(providerLower);
                                        
                                        if (isMatch) {
                                          console.log(`✅ [${integration.id}] Provider match found! Processing OAuth response:`, data);
                                          console.log(`Matched: provider="${data.provider}" with integration="${integration.id}"`);
                                          console.log(`Integration details:`, { id: integration.id, name: integration.name, provider: integration.provider });
                                          localStorage.removeItem(key);
                                          
                                          // Process the OAuth response
                                          handleMessage({ 
                                            data: {
                                              type: 'oauth-complete',
                                              success: data.success,
                                              error: data.error,
                                              provider: data.provider,
                                              message: data.message
                                            },
                                            origin: window.location.origin
                                          } as MessageEvent);
                                          
                                          // Clear the polling for this integration
                                          const polling = pollingInstancesRef.current.get(integration.id);
                                          if (polling) {
                                            clearInterval(polling);
                                            pollingInstancesRef.current.delete(integration.id);
                                            console.log(`✅ [${integration.id}] Cleared polling after successful match`);
                                          }
                                          break;
                                        } else {
                                          console.log(`❌ [${integration.id}] Provider mismatch: "${data.provider}" !== "${integration.id}" or "${integration.name}"`);
                                        }
                                      }
                                    }
                                  } catch (e) {
                                    console.error(`Error checking localStorage for ${integration.id}:`, e);
                                  }
                                };
                                
                                // Clean up ALL old OAuth responses before starting a new one
                                // This prevents race conditions where old responses interfere
                                const oldOAuthKeys = Object.keys(localStorage).filter(k => 
                                  k.startsWith('oauth_response_')
                                );
                                oldOAuthKeys.forEach(key => {
                                  console.log(`🧹 [${integration.id}] Cleaning up old OAuth response: ${key}`);
                                  localStorage.removeItem(key);
                                });
                                
                                // Start polling localStorage
                                console.log(`🔄 [${integration.id}] Starting localStorage polling for OAuth response...`);
                                const localStoragePolling = setInterval(pollLocalStorage, 500);
                                pollingInstancesRef.current.set(integration.id, localStoragePolling);
                                
                                // Do an immediate check as well but delay slightly to avoid race condition
                                setTimeout(() => {
                                  pollLocalStorage();
                                }, 100);
                                
                                // Stop polling after 30 seconds (increased from default)
                                setTimeout(() => {
                                  const polling = pollingInstancesRef.current.get(integration.id);
                                  if (polling) {
                                    clearInterval(polling);
                                    pollingInstancesRef.current.delete(integration.id);
                                    console.log(`⏱️ [${integration.id}] Stopped localStorage polling after 30 seconds`);
                                  }
                                }, 30000);
                                
                                // Clean up old test entries
                                const keysToClean = Object.keys(localStorage).filter(k => k.includes('oauth_response_test'));
                                keysToClean.forEach(key => {
                                  localStorage.removeItem(key);
                                });
                                
                                // Clean up if popup is closed manually
                                const checkClosed = setInterval(() => {
                                  if (popup && popup.closed) {
                                    clearInterval(checkClosed);
                                    const polling = pollingInstancesRef.current.get(integration.id);
                                    if (polling) {
                                      clearInterval(polling);
                                      pollingInstancesRef.current.delete(integration.id);
                                      console.log(`🔒 [${integration.id}] Cleared polling after popup closed`);
                                    }
                                    window.removeEventListener('message', handleMessage);
                                    
                                    // Check localStorage one final time with a longer delay
                                    // This catches OAuth responses that arrive just as the popup closes
                                    setTimeout(() => {
                                      console.log(`🔍 [${integration.id}] Final check after popup close...`);
                                      pollLocalStorage();
                                      
                                      // Check again after a short delay
                                      setTimeout(() => {
                                        pollLocalStorage();
                                        // Clear the connecting state only after final checks
                                        setConnectingIntegrationId(null);
                                      }, 500);
                                    }, 100);
                                  }
                                }, 1000);
                              }
                            } catch (error) {
                              console.error('Error generating OAuth URL:', error);
                              setConnectingIntegrationId(null);
                              toast({
                                title: needsReauth ? "Reconnection Error" : "Connection Error",
                                description: `Failed to ${needsReauth ? 'reconnect' : 'connect'}. Please try again.`,
                                variant: "destructive",
                              });
                            }
                          }}
                        >
                          {connectingIntegrationId === integration.id ? (
                            <>
                              <Loader2 className="mr-2 h-3 w-3 animate-spin" />
                              Connecting...
                            </>
                          ) : (() => {
                            const integrationRecord = integrations?.find(i => i.provider === integration.id);
                            // Check for various states that need reauthorization
                            const needsReauth = integrationRecord?.status === 'needs_reauthorization' || 
                                               integrationRecord?.status === 'expired' ||
                                               integrationRecord?.status === 'invalid' ||
                                               integrationRecord?.status === 'error';
                            return needsReauth ? 'Reconnect' : 'Connect';
                          })()}
                        </Button>
                      ) : (
                        <ChevronRight className="w-5 h-5 text-muted-foreground" />
                      )}
                    </div>
                  );
                });
              })()}
              </div>
            </ScrollArea>
            <div className="w-3/5 flex-1">
              <ScrollArea className="h-full" style={{ scrollbarGutter: 'stable' }}>
                <div className="p-4">
                {selectedIntegration ? (
                  <div className="h-full">
                    {!isIntegrationConnected(selectedIntegration.id) ? (
                      // Show message for unconnected integrations
                      <div className="flex flex-col items-center justify-center h-full text-center">
                        <div className="text-muted-foreground mb-4">
                          <svg className="w-16 h-16 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                          </svg>
                        </div>
                        <h3 className="text-lg font-semibold mb-2">Connect {selectedIntegration.name}</h3>
                        <p className="text-sm text-muted-foreground mb-4">
                          You need to connect your {selectedIntegration.name} account to use these actions.
                        </p>
                        <Button
                          variant="default"
                          onClick={async () => {
                            // Check if this integration needs reauthorization
                            const integrationRecord = integrations?.find(i => i.provider === selectedIntegration.id);
                            const needsReauth = integrationRecord?.status === 'needs_reauthorization' || 
                                               integrationRecord?.status === 'expired' ||
                                               integrationRecord?.status === 'invalid' ||
                                               integrationRecord?.status === 'error';
                            
                            // Generate OAuth URL dynamically
                            try {
                              const response = await fetch('/api/integrations/auth/generate-url', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ 
                                  provider: selectedIntegration.id, 
                                  forceFresh: needsReauth // Force fresh auth if reauthorization needed
                                })
                              });
                              
                              const data = await response.json();
                              console.log('OAuth URL response:', data);
                              const url = data.authUrl || data.url; // Support both authUrl and url properties
                              
                              if (url) {
                                // Open OAuth popup
                                const width = 600;
                                const height = 700;
                                const left = window.innerWidth / 2 - width / 2;
                                const top = window.innerHeight / 2 - height / 2;
                                
                                console.log('Opening OAuth popup with URL:', url);
                                const popup = window.open(
                                  url,
                                  `${selectedIntegration.id}_oauth`,
                                  `width=${width},height=${height},left=${left},top=${top}`
                                );
                                
                                if (!popup || popup.closed || typeof popup.closed == 'undefined') {
                                  console.error('Popup was blocked!');
                                  setConnectingIntegrationId(null);
                                  // Fallback to redirect if popup is blocked
                                  toast({
                                    title: "Popup Blocked",
                                    description: "Please allow popups for this site or we'll redirect you instead.",
                                    variant: "destructive",
                                  });
                                  // Optional: fallback to redirect
                                  setTimeout(() => {
                                    window.location.href = url;
                                  }, 2000);
                                  return;
                                }
                                
                                // Listen for OAuth completion
                                const handleMessage = async (event: MessageEvent) => {
                                  console.log('📨 Received message:', {
                                    type: event.data?.type,
                                    data: event.data,
                                    origin: event.origin
                                  });
                                  
                                  // Handle both oauth-complete (from oauth/callback page) and oauth-success (from createPopupResponse)
                                  if (event.data?.type === 'oauth-complete' || event.data?.type === 'oauth-success') {
                                    console.log('✅ OAuth complete message received!', event.data);
                                    window.removeEventListener('message', handleMessage);
                                    if (popup && !popup.closed) {
                                      popup.close();
                                    }
                                    
                                    // Clear the connecting state
                                    setConnectingIntegrationId(null);
                                    
                                    // Refresh integrations to get updated status
                                    if (event.data.success) {
                                      console.log('🔄 OAuth success! Refreshing integrations...');
                                      
                                      // Force refresh integrations using the store directly
                                      await useIntegrationStore.getState().fetchIntegrations(true);
                                      
                                      // Wait a bit longer for stores to fully update
                                      await new Promise(resolve => setTimeout(resolve, 500));
                                      
                                      // Get the latest integrations after refresh
                                      const updatedIntegrations = useIntegrationStore.getState().integrations;
                                      
                                      // Store the integration to select (use the selectedIntegration from the click event)
                                      const integrationToSelect = selectedIntegration;
                                      
                                      // Force the modal to close and reopen to ensure complete refresh
                                      const wasShowingAction = showActionDialog;
                                      const wasShowingTrigger = showTriggerDialog;
                                      
                                      // Close the dialog
                                      setShowActionDialog(false);
                                      setShowTriggerDialog(false);
                                      
                                      // Wait a moment for the close to process
                                      await new Promise(resolve => setTimeout(resolve, 100));
                                      
                                      // Reopen the dialog
                                      if (wasShowingAction) {
                                        openActionDialog();
                                      }
                                      if (wasShowingTrigger) {
                                        openTriggerDialog();
                                      }
                                      
                                      // Wait for dialog to render
                                      await new Promise(resolve => setTimeout(resolve, 200));
                                      
                                      // Select the integration that was just connected
                                      setSelectedIntegration(integrationToSelect);
                                      
                                      // Force a re-render
                                      forceUpdate({});
                                      
                                      // Scroll to the integration after a delay to ensure DOM is updated
                                      setTimeout(() => {
                                        if (integrationToSelect && integrationToSelect.id) {
                                          const element = document.getElementById(`action-integration-${integrationToSelect.id}`);
                                          console.log(`🎯 Scrolling to integration:`, integrationToSelect.id, 'Element found:', !!element);
                                          
                                          if (element) {
                                            // Get the scrollable container (ScrollArea viewport)
                                            const scrollContainer = element.closest('[data-radix-scroll-area-viewport]');
                                            console.log('📜 Scroll container found:', !!scrollContainer);
                                            
                                            if (scrollContainer) {
                                              // Calculate the exact position
                                              const containerRect = scrollContainer.getBoundingClientRect();
                                              const elementRect = element.getBoundingClientRect();
                                              const relativeTop = elementRect.top - containerRect.top;
                                              const currentScroll = scrollContainer.scrollTop;
                                              const targetScroll = currentScroll + relativeTop - 16; // 16px padding from top
                                              
                                              // Scroll to the calculated position
                                              scrollContainer.scrollTo({
                                                top: targetScroll,
                                                behavior: 'smooth'
                                              });
                                            }
                                          }
                                        } else {
                                          console.log('⚠️ No integration to select or scroll to');
                                        }
                                      }, 800);
                                      
                                      toast({
                                        title: needsReauth ? "Reconnection Successful" : "Connection Successful",
                                        description: `Successfully ${needsReauth ? 'reconnected' : 'connected'} to ${integrationToSelect.name}`,
                                      });
                                    } else {
                                      // Show error toast if connection failed
                                      toast({
                                        title: "Connection Failed",
                                        description: event.data.error || event.data.message || "Failed to connect integration",
                                        variant: "destructive",
                                      });
                                    }
                                  }
                                };
                                
                                window.addEventListener('message', handleMessage);
                                
                                // Set up BroadcastChannel listener for Trello and other same-origin OAuth flows
                                let broadcastChannel: BroadcastChannel | null = null;
                                try {
                                  broadcastChannel = new BroadcastChannel('oauth_channel');
                                  broadcastChannel.onmessage = (event) => {
                                    console.log('📡 Received OAuth via BroadcastChannel:', event.data);
                                    if (event.data.provider === integration.id.toLowerCase()) {
                                      handleMessage({ 
                                        data: event.data,
                                        origin: window.location.origin 
                                      } as MessageEvent);
                                      broadcastChannel?.close();
                                    }
                                  };
                                } catch (e) {
                                  console.log('BroadcastChannel not available');
                                }
                                
                                // Also poll localStorage as a fallback (COOP-safe)
                                // Create a unique key for this polling instance
                                const pollingKey = `${selectedIntegration.id}_${Date.now()}`;
                                
                                // Clear ALL existing polling instances to prevent conflicts
                                pollingInstancesRef.current.forEach((polling, key) => {
                                  console.log(`🛑 Clearing existing polling for ${key}`);
                                  clearInterval(polling);
                                });
                                pollingInstancesRef.current.clear();
                                
                                const pollLocalStorage = () => {
                                  try {
                                    // Check for OAuth response in localStorage
                                    const keys = Object.keys(localStorage).filter(k => k.startsWith('oauth_response_'));
                                    
                                    if (keys.length > 0) {
                                      console.log(`🔍 [${selectedIntegration.id}] Found localStorage keys starting with oauth_response_:`, keys);
                                      
                                      for (const key of keys) {
                                        const rawData = localStorage.getItem(key);
                                        
                                        const data = JSON.parse(rawData || '{}');
                                        
                                        // More flexible provider matching - handle case differences and name variations
                                        const providerLower = (data.provider || '').toLowerCase();
                                        const integrationIdLower = selectedIntegration?.id?.toLowerCase() || '';
                                        const integrationNameLower = selectedIntegration?.name?.toLowerCase() || '';
                                        
                                        // Skip if selectedIntegration is null or missing ID
                                        if (!selectedIntegration || !integrationIdLower) {
                                          continue;
                                        }
                                        
                                        // Check if provider matches integration ID or name (case-insensitive)
                                        const isMatch = providerLower === integrationIdLower || 
                                                       providerLower === integrationNameLower ||
                                                       providerLower.includes(integrationIdLower) ||
                                                       integrationIdLower.includes(providerLower);
                                        
                                        if (isMatch) {
                                          console.log(`✅ [${selectedIntegration.id}] Provider match found! Processing OAuth response:`, data);
                                          console.log(`Matched: provider="${data.provider}" with integration="${selectedIntegration.id}"`);
                                          console.log(`Integration details:`, { id: selectedIntegration.id, name: selectedIntegration.name, provider: selectedIntegration.provider });
                                          localStorage.removeItem(key);
                                          
                                          // Process the OAuth response
                                          handleMessage({ 
                                            data: {
                                              type: 'oauth-complete',
                                              success: data.success,
                                              error: data.error,
                                              provider: data.provider,
                                              message: data.message
                                            },
                                            origin: window.location.origin
                                          } as MessageEvent);
                                          
                                          // Clear the polling for this integration
                                          const polling = pollingInstancesRef.current.get(selectedIntegration.id);
                                          if (polling) {
                                            clearInterval(polling);
                                            pollingInstancesRef.current.delete(selectedIntegration.id);
                                            console.log(`✅ [${selectedIntegration.id}] Cleared polling after successful match`);
                                          }
                                          break;
                                        } else {
                                          console.log(`❌ [${selectedIntegration.id}] Provider mismatch: "${data.provider}" !== "${selectedIntegration.id}" or "${selectedIntegration.name}"`);
                                        }
                                      }
                                    }
                                  } catch (e) {
                                    console.error(`Error checking localStorage for ${selectedIntegration.id}:`, e);
                                  }
                                };
                                
                                // Clean up old OAuth responses for this provider before starting
                                const oldOAuthKeys = Object.keys(localStorage).filter(k => 
                                  k.startsWith('oauth_response_') && k.includes(selectedIntegration.id.toLowerCase())
                                );
                                oldOAuthKeys.forEach(key => {
                                  console.log(`🧹 [${selectedIntegration.id}] Cleaning up old OAuth response: ${key}`);
                                  localStorage.removeItem(key);
                                });
                                
                                // Start polling localStorage
                                console.log(`🔄 [${selectedIntegration.id}] Starting localStorage polling for OAuth response...`);
                                const localStoragePolling = setInterval(pollLocalStorage, 500);
                                pollingInstancesRef.current.set(selectedIntegration.id, localStoragePolling);
                                
                                // Do an immediate check as well but delay slightly to avoid race condition
                                setTimeout(() => {
                                  pollLocalStorage();
                                }, 100);
                                
                                // Stop polling after 30 seconds (increased from default)
                                setTimeout(() => {
                                  const polling = pollingInstancesRef.current.get(selectedIntegration.id);
                                  if (polling) {
                                    clearInterval(polling);
                                    pollingInstancesRef.current.delete(selectedIntegration.id);
                                    console.log(`⏱️ [${selectedIntegration.id}] Stopped localStorage polling after 30 seconds`);
                                  }
                                }, 30000);
                                
                                // Clean up old test entries
                                const keysToClean = Object.keys(localStorage).filter(k => k.includes('oauth_response_test'));
                                keysToClean.forEach(key => {
                                  localStorage.removeItem(key);
                                });
                                
                                // Clean up if popup is closed manually
                                const checkClosed = setInterval(() => {
                                  if (popup && popup.closed) {
                                    clearInterval(checkClosed);
                                    const polling = pollingInstancesRef.current.get(selectedIntegration.id);
                                    if (polling) {
                                      clearInterval(polling);
                                      pollingInstancesRef.current.delete(selectedIntegration.id);
                                      console.log(`🔒 [${selectedIntegration.id}] Cleared polling after popup closed`);
                                    }
                                    window.removeEventListener('message', handleMessage);
                                    // Clear the connecting state when popup is closed
                                    setConnectingIntegrationId(null);
                                    
                                    // Check localStorage one final time
                                    setTimeout(pollLocalStorage, 100);
                                    
                                    // Clear loading state after a delay if no response
                                    setTimeout(() => {
                                      setConnectingIntegrationId(null);
                                    }, 2000);
                                  }
                                }, 1000);
                              }
                            } catch (error) {
                              console.error('Error generating OAuth URL:', error);
                              setConnectingIntegrationId(null);
                              toast({
                                title: needsReauth ? "Reconnection Error" : "Connection Error",
                                description: `Failed to ${needsReauth ? 'reconnect' : 'connect'}. Please try again.`,
                                variant: "destructive",
                              });
                            }
                          }}
                        >
                          {(() => {
                            const integrationRecord = integrations?.find(i => i.provider === selectedIntegration.id);
                            // Check for various states that need reauthorization
                            const needsReauth = integrationRecord?.status === 'needs_reauthorization' || 
                                               integrationRecord?.status === 'expired' ||
                                               integrationRecord?.status === 'invalid' ||
                                               integrationRecord?.status === 'error';
                            return needsReauth 
                              ? `Reconnect ${selectedIntegration.name}` 
                              : `Connect ${selectedIntegration.name}`;
                          })()}
                        </Button>
                      </div>
                    ) : (
                      // Show actions for connected integrations
                      <div className="grid grid-cols-1 gap-3">
                        {selectedIntegration.actions
                          .filter(action => {
                            // AI Agent is always shown - validation happens in config modal
                            // If no sourceAddNode, allow AI Agent to show (it will be restricted when actually adding)

                            // Don't filter actions by search query - search only filters integrations
                            return true
                          })
                          .map((action) => {
                            const isComingSoon = action.comingSoon
                            const existingAIAgent = nodes.find(n => n.data?.type === 'ai_agent')
                            const isAIAgentDisabled = action.type === 'ai_agent' && existingAIAgent
                            
                            return (
                              <div
                                key={action.type}
                                className={`p-4 border rounded-lg transition-all ${
                                  isComingSoon || isAIAgentDisabled
                                    ? 'border-muted bg-muted/30 cursor-not-allowed opacity-60' 
                                    : selectedAction?.type === action.type 
                                      ? 'border-primary bg-primary/10 ring-1 ring-primary/20' 
                                      : 'border-border hover:border-muted-foreground hover:shadow-sm cursor-pointer'
                                }`}
                                onClick={() => {
                                  if (isComingSoon) return
                                  if (isAIAgentDisabled) {
                                    toast({
                                      title: "AI Agent Already Exists",
                                      description: "You can only have one AI Agent node per workflow. Use the existing AI Agent to configure multiple action chains.",
                                      variant: "destructive"
                                    })
                                    return
                                  }
                                  setSelectedAction(action)
                                  // If action doesn't need configuration, add it immediately
                                  if (selectedIntegration && !nodeNeedsConfiguration(action)) {
                                    handleActionSelect(selectedIntegration, action)
                                  }
                                }}
                              onDoubleClick={() => {
                                if (isComingSoon) return
                                if (isAIAgentDisabled) {
                                  toast({
                                    title: "AI Agent Already Exists",
                                    description: "You can only have one AI Agent node per workflow. Use the existing AI Agent to configure multiple action chains.",
                                    variant: "destructive"
                                  })
                                  return
                                }
                                setSelectedAction(action)
                                if (selectedIntegration) {
                                  handleActionSelect(selectedIntegration, action)
                                }
                              }}
                            >
                              <div className="flex items-start justify-between">
                                <div className="flex-1">
                                  <p className={`font-medium ${isComingSoon || isAIAgentDisabled ? 'text-muted-foreground' : ''}`}>
                                    {action.title || 'Unnamed Action'}
                                  </p>
                                  <p className="text-sm text-muted-foreground mt-1">
                                    {action.description || 'No description available'}
                                  </p>
                                </div>
                                {isComingSoon && (
                                  <span className="text-xs bg-muted text-muted-foreground px-2 py-1 rounded-full ml-2">
                                    {/* Icon only on extra small screens */}
                                    <span className="inline sm:hidden">⏳</span>
                                    {/* "Soon" on small screens */}
                                    <span className="hidden sm:inline md:hidden">Soon</span>
                                    {/* "Coming Soon" on medium and larger screens */}
                                    <span className="hidden md:inline">Coming Soon</span>
                                  </span>
                                )}
                                {isAIAgentDisabled && (
                                  <span className="text-xs bg-orange-100 text-orange-800 px-2 py-1 rounded-full ml-2">
                                    Already Added
                                  </span>
                                )}
                              </div>
                            </div>
                          )
                          })}
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="flex items-center justify-center h-full text-muted-foreground">
                    <p>Select an integration to see its actions</p>
                  </div>
                )}
                </div>
              </ScrollArea>
            </div>
          </div>

          <div className="p-4 flex justify-between items-center">
            <div className="text-sm text-muted-foreground">
              {selectedIntegration && (
                <>
                  <span className="font-medium">Integration:</span> {selectedIntegration.name}
                  {selectedAction && <span className="ml-4"><span className="font-medium">Action:</span> {selectedAction.title || 'Unnamed Action'}</span>}
                </>
              )}
            </div>
            <div className="flex space-x-2">
              <DialogClose asChild><Button variant="outline">Cancel</Button></DialogClose>
              <Button 
                disabled={!selectedAction || !selectedIntegration || selectedAction?.comingSoon}
                onClick={() => {
                  if (selectedIntegration && selectedAction && !selectedAction.comingSoon) {
                    handleActionSelect(selectedIntegration, selectedAction)
                  }
                }}
              >
                Continue →
              </Button>
            </div>
          </div>
        </DialogContent>
        </Dialog>
      )}
      {configuringNode && (
        <>
          {/* Use AI Agent config modal for AI Agent nodes */}
          {configuringNode.nodeComponent.type === "ai_agent" ? (
            <AIAgentConfigModal
              isOpen={!!configuringNode}
              onClose={() => {
                setConfiguringNode(null);
                setPendingNode(null);
                // Don't reopen the action selection modal - let the user manually add more actions if needed
              }}
              onAddActionToWorkflow={(configuringNode.id === 'pending-action' || configuringNode.id === 'pending-trigger') ? undefined : (action, config) => {
                // Handle adding a new action from the AI Agent modal
                
                // Find the AI Agent node
                const aiAgentNode = nodes.find(n => n.data?.type === 'ai_agent');
                if (!aiAgentNode) {
                  return;
                }
                
                // Find the last action node connected to the AI Agent
                const aiAgentEdges = edges.filter(e => e.source === aiAgentNode.id || e.target === aiAgentNode.id);
                let lastNode = aiAgentNode;
                let maxDistance = 0;
                
                // Find the furthest node in the chain
                const findFurthestNode = (nodeId: string, distance: number) => {
                  const outgoingEdges = edges.filter(e => e.source === nodeId);
                  if (outgoingEdges.length === 0) {
                    if (distance > maxDistance) {
                      maxDistance = distance;
                      const node = nodes.find(n => n.id === nodeId);
                      if (node) lastNode = node;
                    }
                  } else {
                    outgoingEdges.forEach(edge => {
                      findFurthestNode(edge.target, distance + 1);
                    });
                  }
                };
                
                findFurthestNode(aiAgentNode.id, 0);
                
                // Create the new action node
                const timestamp = Date.now();
                const newNodeId = `node-${timestamp}`;
                const actionComponent = ALL_NODE_COMPONENTS.find(n => n.type === action.type);
                
                const newNode = {
                  id: newNodeId,
                  type: 'custom',
                  position: {
                    x: lastNode.position.x + (lastNode === aiAgentNode ? 450 : 0),
                    y: lastNode.position.y + (lastNode === aiAgentNode ? 0 : 200)
                  },
                  data: {
                    title: actionComponent?.title || action.title || action.type,
                    description: actionComponent?.description || action.description || '',
                    type: action.type,
                    providerId: action.providerId || action.integration?.id,
                    config: config || {},
                    onConfigure: () => handleConfigureNode(newNodeId),
                    onDelete: () => handleDeleteNodeWithConfirmation(newNodeId)
                  }
                };
                
                // Create Add Action node to attach after the new action
                const addActionNodeId = `add-action-${newNodeId}`;
                const addActionNode = {
                  id: addActionNodeId,
                  type: 'addAction',
                  position: {
                    x: newNode.position.x,
                    y: newNode.position.y + 200
                  },
                  data: {
                    parentId: newNodeId,
                    onClick: () => handleAddActionClick(addActionNodeId, newNodeId)
                  }
                };
                
                // Add the new node, Add Action node, and edges
                setNodes(nds => {
                  // Remove any existing Add Action nodes that were connected to the last node
                  const filteredNodes = nds.filter(n => !(n.type === 'addAction' && n.data?.parentId === lastNode.id));
                  return [...filteredNodes, newNode, addActionNode];
                });
                
                setEdges(eds => {
                  // Remove edges to old Add Action nodes
                  const filteredEdges = eds.filter(e => !e.target.startsWith('add-action-'));
                  return [
                    ...filteredEdges,
                    {
                      id: `e-${lastNode.id}-${newNodeId}-${Date.now()}-${Math.random().toString(36).slice(2,8)}`,
                      source: lastNode.id,
                      target: newNodeId,
                      type: 'custom'
                    },
                    {
                      id: `e-${newNodeId}-${addActionNodeId}-${Date.now()}-${Math.random().toString(36).slice(2,8)}`,
                      source: newNodeId,
                      target: addActionNodeId,
                      type: 'straight',
                      animated: true,
                      style: {
                        stroke: '#b1b1b7',
                        strokeWidth: 2,
                        strokeDasharray: '5,5'
                      }
                    }
                  ];
                });
                
                // If the action needs configuration and not in AI mode, open the config modal
                if (action.needsConfiguration) {
                  setTimeout(() => {
                    setConfiguringNode({
                      id: newNodeId,
                      integration: action.integration,
                      nodeComponent: actionComponent || action
                    });
                  }, 100);
                }
              }}
              onSave={async (config) => {
                console.log('🚨 [AI Agent onSave] Called with config:', config);
                console.log('🚨 [AI Agent onSave] configuringNode:', configuringNode);
                console.log('🚨 [AI Agent onSave] pendingNode:', pendingNode);

                // Store the chains layout data before saving configuration
                const chainsToProcess = config.chainsLayout;
                console.log('🔴 [AI Agent Save] chainsToProcess:', chainsToProcess);
                console.log('🔴 [AI Agent Save] Has nodes:', !!chainsToProcess?.nodes);
                console.log('🔴 [AI Agent Save] chainsLayout:', JSON.stringify(config.chainsLayout, null, 2));
                console.log('🔴 [AI Agent Save] Nodes count:', chainsToProcess?.nodes?.length);
                console.log('🔴 [AI Agent Save] Has edges:', !!chainsToProcess?.edges);

                // Save the AI Agent configuration and get the new node ID if it's a pending node
                let finalAIAgentNodeId = configuringNode.id;

                console.log('🟣 [AI Agent Save] Checking if AI Agent node exists');
                console.log('🟣 [AI Agent Save] configuringNode.id:', configuringNode.id);
                console.log('🟣 [AI Agent Save] nodes count:', nodes.length);
                console.log('🟣 [AI Agent Save] pendingNode exists:', !!pendingNode);

                // Check if the AI Agent node already exists in the workflow
                const existingAIAgentNode = nodes.find(n => n.id === configuringNode.id);
                console.log('🟣 [AI Agent Save] existingAIAgentNode:', existingAIAgentNode);

                // If the AI Agent node doesn't exist, we need to create it first
                // This happens when we're adding a new AI Agent node (pendingNode is set)
                if (!existingAIAgentNode && configuringNode.nodeComponent?.type === 'ai_agent' && pendingNode) {
                  // For pending AI Agent nodes, we need to actually create and add the node first
                  console.log('🔵 [AI Agent Save] Creating new AI Agent node from pending node');
                  console.log('🔵 [AI Agent Save] configuringNode.id:', configuringNode.id);
                  console.log('🔵 [AI Agent Save] pendingNode:', pendingNode);
                  console.log('🔵 [AI Agent Save] pendingNode.sourceNodeInfo:', pendingNode.sourceNodeInfo);

                  // Use the ID from configuringNode which was already generated
                  const newNodeId = configuringNode.id;

                  // Get the position from the pendingNode's sourceNodeInfo
                  const sourceNode = nodes.find(n => n.id === pendingNode.sourceNodeInfo?.parentId);
                  const position = sourceNode ? {
                    x: sourceNode.position.x,
                    y: sourceNode.position.y + 160
                  } : { x: 250, y: 250 };

                  console.log('🟢 [AI Agent Save] Source node found:', !!sourceNode);
                  console.log('🟢 [AI Agent Save] Position calculated:', position);

                  // Create the new AI Agent node
                  const newNode = {
                    id: newNodeId,
                    type: 'custom',
                    position: position,
                    data: {
                      title: configuringNode.nodeComponent.title || 'AI Agent',
                      description: configuringNode.nodeComponent.description || '',
                      type: 'ai_agent',
                      providerId: configuringNode.nodeComponent.providerId || 'ai',
                      config: config,
                      onConfigure: (id: string) => handleConfigureNode(id),
                      onDelete: (id: string) => handleDeleteNodeWithConfirmation(id),
                      onRename: (id: string, newTitle: string) => handleRenameNode(id, newTitle),
                      onAddChain: configuringNode.nodeComponent.supportsChains ?
                        (id: string) => {
                          console.log('AI Agent onAddChain clicked for node:', id);
                          // Defer execution to ensure refs are available
                          setTimeout(() => {
                            const allNodes = getNodes();
                            const aiAgentNode = allNodes.find(n => n.id === id);
                            if (!aiAgentNode) {
                              console.error('AI Agent node not found:', id);
                              return;
                            }

                            // Directly implement the add chain logic here
                            // Find all nodes that are children of this AI agent
                            const childNodes = allNodes.filter(n =>
                              (n.data?.parentAIAgentId === id ||
                               n.id.startsWith(`${id}-chain`) ||
                               n.id.includes(`${id}-node`)) &&
                              n.type !== 'addAction'
                            );

                            // Find the highest chain index
                            let highestChainIndex = -1;
                            childNodes.forEach(node => {
                              const chainIndex = node.data?.parentChainIndex;
                              if (typeof chainIndex === 'number' && chainIndex > highestChainIndex) {
                                highestChainIndex = chainIndex;
                              }
                            });

                            const newChainNumber = highestChainIndex + 2;
                            const newChainIndex = highestChainIndex + 1;

                            // Calculate position
                            const horizontalSpacing = 550;
                            const baseY = aiAgentNode.position.y + 200;
                            let newX: number;

                            if (childNodes.length === 0) {
                              newX = aiAgentNode.position.x;
                            } else {
                              let rightmostX = -Infinity;
                              childNodes.forEach(node => {
                                if (node.position.x > rightmostX) {
                                  rightmostX = node.position.x;
                                }
                              });
                              newX = rightmostX + horizontalSpacing;
                            }

                            // Create chain placeholder
                            const timestamp = Date.now();
                            const randomId = Math.random().toString(36).substr(2, 9);
                            const newNodeId = `${id}-chain${newChainIndex}-placeholder-${timestamp}-${randomId}`;

                            const newNode = {
                              id: newNodeId,
                              type: 'custom',
                              position: { x: newX, y: baseY },
                              data: {
                                title: `Chain ${newChainIndex + 1}`,
                                description: 'Click + Add Action to add your first action',
                                type: 'chain_placeholder',
                                providerId: 'core',
                                isTrigger: false,
                                isAIAgentChild: true,
                                parentAIAgentId: id,
                                parentChainIndex: newChainIndex,
                                config: {},
                                onConfigure: (id: string) => {
                                  // Use getNodes to find the node and configure it
                                  const nodes = getNodes();
                                  const node = nodes.find(n => n.id === id);
                                  if (node) {
                                    console.log('Configure placeholder:', id);
                                  }
                                },
                                onDelete: (id: string) => {
                                  // Delete the placeholder
                                  setNodes(nds => nds.filter(n => n.id !== id));
                                  setEdges(eds => eds.filter(e => e.source !== id && e.target !== id));
                                },
                                onRename: (id: string, newTitle: string) => {
                                  // Rename the placeholder
                                  setNodes(nds => nds.map(n =>
                                    n.id === id
                                      ? { ...n, data: { ...n.data, title: newTitle } }
                                      : n
                                  ));
                                },
                                isPlaceholder: true,
                                hasAddButton: true,
                                onAddAction: () => {
                                  // Open action selection with AI mode for chain placeholders
                                  console.log('Add action clicked for placeholder:', newNodeId);
                                  // We need to trigger the action dialog, but we can't access handleAddActionClick
                                  // Instead, dispatch a custom event that the main component can listen to
                                  const event = new CustomEvent('chain-placeholder-add-action', {
                                    detail: {
                                      nodeId: newNodeId,
                                      parentId: newNodeId,
                                      isFromChainPlaceholder: true
                                    }
                                  });
                                  window.dispatchEvent(event);
                                }
                              }
                            };

                            // Add the node and edge
                            setNodes(nds => [...nds, newNode]);

                            const aiToPlaceholderEdge = {
                              id: `e-${id}-${newNodeId}-${Date.now()}-${Math.random().toString(36).slice(2,8)}`,
                              source: id,
                              target: newNodeId,
                              type: 'custom',
                              animated: false,
                              style: { stroke: '#94a3b8', strokeWidth: 2 },
                              data: {
                                onAddNode: () => {
                                  handleInsertAction(id, newNodeId);
                                }
                              }
                            };

                            setEdges(eds => [...eds, aiToPlaceholderEdge]);

                            // Auto-zoom
                            setTimeout(() => {
                              fitView({
                                padding: 0.2,
                                includeHiddenNodes: false,
                                duration: 400,
                                maxZoom: 2,
                                minZoom: 0.05
                              });
                            }, 50);

                            toast({
                              title: "New Chain Added",
                              description: `Chain ${newChainIndex + 1} has been added. Click to add actions to your chain.`
                            });
                          }, 0);
                        } : undefined,
                      hasChains: chainsToProcess && (chainsToProcess.nodes?.length > 0 || chainsToProcess.chains?.length > 0),
                      isAIMode: false // AI Agent nodes don't use the action AI mode
                    }
                  };

                  console.log('🟢 [AI Agent Save] Creating node with data:', newNode.data);

                  // Add the node to the workflow IMMEDIATELY and ensure it's available
                  setNodes((nds) => {
                    console.log('🟢 [AI Agent Save] Inside setNodes - Adding AI Agent node to workflow');
                    console.log('🟢 [AI Agent Save] Current nodes count:', nds.length);
                    // Filter out ALL Add Action nodes since AI Agent will handle its own chains
                    const filteredNodes = nds.filter(n => n.type !== 'addAction');
                    const nodesWithAIAgent = [...filteredNodes, newNode];
                    console.log('🟢 [AI Agent Save] New nodes count with AI Agent:', nodesWithAIAgent.length);
                    console.log('🟢 [AI Agent Save] AI Agent node added with ID:', newNodeId);
                    return nodesWithAIAgent;
                  });

                  // If there's a parent node, add an edge
                  if (pendingNode.sourceNodeInfo?.parentId) {
                    console.log('🟡 [AI Agent Save] Adding edge from parent:', pendingNode.sourceNodeInfo.parentId, 'to:', newNodeId);
                    const newEdge = {
                      id: `edge-${pendingNode.sourceNodeInfo.parentId}-${newNodeId}`,
                      source: pendingNode.sourceNodeInfo.parentId,
                      target: newNodeId,
                      type: 'custom',
                      animated: true,
                      style: { stroke: '#94a3b8', strokeWidth: 2 },
                      data: {
                        onAddNode: () => console.log('Add node to edge')
                      }
                    };
                    setEdges((eds) => {
                      console.log('🟡 [AI Agent Save] Adding edge, current edges count:', eds.length);
                      // First, remove any edges connected to add action nodes
                      const filteredEdges = eds.filter(e => {
                        // Check if the edge is connected to an add action node
                        // We need to check the node types from the current nodes state
                        const nodes = getNodes();
                        const sourceNode = nodes.find(n => n.id === e.source);
                        const targetNode = nodes.find(n => n.id === e.target);
                        return sourceNode?.type !== 'addAction' && targetNode?.type !== 'addAction';
                      });
                      return [...filteredEdges, newEdge];
                    });
                  }

                  // Close the action dialog if it's open
                  setShowActionDialog(false);

                  // Mark as having unsaved changes
                  setHasUnsavedChanges(true);

                  finalAIAgentNodeId = newNodeId;
                  console.log('✅ [AI Agent Save] AI Agent node created successfully with ID:', finalAIAgentNodeId);
                } else {
                  console.log('📝 [AI Agent Save] Updating existing AI Agent node configuration');
                  // For existing nodes, just update the configuration
                  await handleSaveConfiguration(configuringNode, config);
                  // DON'T RETURN HERE - we still need to process chains!
                }

                // Prevent duplicate chain processing - check and set flag immediately
                if (isProcessingChainsRef.current) {
                  console.log('⚠️ [AI Agent Save] Chain processing already in progress, skipping');
                  return;
                }
                isProcessingChainsRef.current = true;
                console.log('🔓 [AI Agent Save] Chain processing lock acquired');
                // Capture the final node ID for use in the setTimeout
                const aiAgentNodeIdToUse = finalAIAgentNodeId;
                // Process chains after a longer delay to ensure the AI Agent node has been added to state
                // This is especially important for pending nodes that are being added for the first time
                // Increase delay for new nodes to ensure React has time to update
                const delayTime = !existingAIAgentNode ? 500 : 100;
                console.log('🟡 [AI Agent Save] Setting timeout with delay:', delayTime, 'ms');

                setTimeout(() => {

                  // Check if we have the new comprehensive format with full node/edge data
                  // hasFullLayout should be true even if nodes array is empty (for empty chains)
                  const hasFullLayout = chainsToProcess?.nodes !== undefined && chainsToProcess?.edges !== undefined;
                  const chainsData = chainsToProcess?.chains || chainsToProcess;
                  const aiAgentPosition = chainsToProcess?.aiAgentPosition;
                  const layoutConfig = chainsToProcess?.layout || { verticalSpacing: 120, horizontalSpacing: 150 };

                  console.log('🟡 [setTimeout] Processing chains, hasFullLayout:', hasFullLayout);
                  console.log('🟡 [setTimeout] chainsToProcess:', chainsToProcess);
                  console.log('🟡 [setTimeout] Has nodes:', !!chainsToProcess?.nodes);
                  console.log('🟡 [setTimeout] Nodes to process:', chainsToProcess?.nodes);
                  console.log('🟡 [setTimeout] Edges to process:', chainsToProcess?.edges);
                  console.log('🟡 [setTimeout] aiAgentNodeIdToUse:', aiAgentNodeIdToUse);
                  console.log('🟡 [setTimeout] chainsData:', chainsData);
                  console.log('🟡 [setTimeout] Is chainsData array?', Array.isArray(chainsData));

                  // Log the condition evaluation
                  const hasNodes = chainsToProcess?.nodes && chainsToProcess.nodes.length > 0;
                  const hasPlaceholders = chainsToProcess?.chainPlaceholderPositions && chainsToProcess.chainPlaceholderPositions.length > 0;
                  const hasChains = chainsData && Array.isArray(chainsData) && chainsData.length > 0;

                  console.log('🟡 [setTimeout] hasNodes:', hasNodes, 'count:', chainsToProcess?.nodes?.length);
                  console.log('🟡 [setTimeout] hasPlaceholders:', hasPlaceholders, 'count:', chainsToProcess?.chainPlaceholderPositions?.length);
                  console.log('🟡 [setTimeout] hasChains:', hasChains, 'count:', chainsData?.length);

                  // We should process if we have any chain-related data
                  const shouldProcess = chainsToProcess && (hasFullLayout || hasChains);
                  console.log('🟡 [setTimeout] Should process chains?', shouldProcess);
                  console.log('🟡 [setTimeout] chainsToProcess exists?', !!chainsToProcess);
                  console.log('🟡 [setTimeout] chainsToProcess type:', typeof chainsToProcess);

                  // Check if there are any chains to process (including empty chains with placeholders)
                  // Process if we have any chain-related data at all
                  if (shouldProcess) {

                    const aiAgentNodeId = aiAgentNodeIdToUse;

                    // Get the latest nodes from React Flow to ensure we have the newly added AI Agent node
                    const latestNodes = getNodes();
                    console.log('🟡 [setTimeout] Got latest nodes from getNodes():', latestNodes.length);
                    console.log('🟡 [setTimeout] Latest AI Agent nodes:', latestNodes.filter(n => n.data?.type === 'ai_agent').map(n => ({ id: n.id, type: n.data?.type })));
                  
                  // Use setNodes to access current state and find the AI Agent node
                  setNodes((currentNodes) => {
                    // Work with a mutable copy of nodes that we can update
                    let workingNodes = [...currentNodes];

                    // Collect all new nodes and edges first
                    const newNodesToAdd: any[] = [];
                    const newEdgesToAdd: any[] = [];
                    const addedNodeIds = new Set<string>(); // Track node IDs to prevent duplicates

                    console.log('🟢 [Chain Processing] Looking for AI Agent node');
                    console.log('🟢 [Chain Processing] aiAgentNodeId:', aiAgentNodeId);
                    console.log('🟢 [Chain Processing] Total nodes in workingNodes:', workingNodes.length);
                    console.log('🟢 [Chain Processing] AI Agent nodes:', workingNodes.filter(n => n.data?.type === 'ai_agent').map(n => ({ id: n.id, type: n.data?.type })));

                    // Find the AI Agent node using the proper ID or from latest nodes
                    let aiAgentNode;

                    // First try to find using the actual ID
                    if (aiAgentNodeId && aiAgentNodeId !== 'pending-action') {
                      aiAgentNode = workingNodes.find(n => n.id === aiAgentNodeId);
                      console.log('🔵 [Chain Processing] Found AI Agent by ID:', aiAgentNode ? aiAgentNode.id : 'NOT FOUND');
                    }

                    // If not found and we have latest nodes from getNodes(), try there
                    if (!aiAgentNode && latestNodes && latestNodes.length > 0) {
                      console.log('🟠 [Chain Processing] Trying to find in latestNodes...');
                      if (aiAgentNodeId && aiAgentNodeId !== 'pending-action') {
                        aiAgentNode = latestNodes.find(n => n.id === aiAgentNodeId);
                      } else {
                        // Find the most recently added AI Agent node
                        aiAgentNode = latestNodes
                          .filter(n => n.data?.type === 'ai_agent')
                          .sort((a, b) => {
                            // Sort by ID (assuming IDs are like "node-timestamp")
                            const aTime = parseInt(a.id.split('-')[1] || '0');
                            const bTime = parseInt(b.id.split('-')[1] || '0');
                            return bTime - aTime; // Most recent first
                          })[0];
                      }

                      if (aiAgentNode) {
                        console.log('✅ [Chain Processing] Found AI Agent in latestNodes:', aiAgentNode.id);
                        // Add the AI Agent node to workingNodes if it's not already there
                        if (!workingNodes.find(n => n.id === aiAgentNode.id)) {
                          console.log('➕ [Chain Processing] Adding AI Agent to workingNodes');
                          workingNodes.push(aiAgentNode);
                        }
                      }
                    }

                    // Last resort: find by type in workingNodes
                    if (!aiAgentNode && aiAgentNodeId === 'pending-action') {
                      aiAgentNode = workingNodes
                        .filter(n => n.data?.type === 'ai_agent')
                        .sort((a, b) => {
                          // Sort by ID (assuming IDs are like "node-timestamp")
                          const aTime = parseInt(a.id.split('-')[1] || '0');
                          const bTime = parseInt(b.id.split('-')[1] || '0');
                          return bTime - aTime; // Most recent first
                        })[0];
                      console.log('🔵 [Chain Processing] Found AI Agent by type:', aiAgentNode ? aiAgentNode.id : 'NOT FOUND');
                    }


                    if (!aiAgentNode) {
                      console.error('❌ [Chain Processing] AI Agent node not found! This is the issue.');
                      console.error('❌ [Chain Processing] Was looking for ID:', aiAgentNodeId);
                      console.error('❌ [Chain Processing] Current nodes count:', workingNodes.length);
                      console.error('❌ [Chain Processing] AI Agent nodes in current state:', workingNodes.filter(n => n.data?.type === 'ai_agent').map(n => n.id));
                      return currentNodes; // Return unchanged nodes
                    }
                    
                    // Use the actual found node ID consistently throughout
                    const actualAIAgentId = aiAgentNode.id;
                    
                    // Clear the emptiedChains flag when adding chains from the visual builder
                    const aiAgentNodeIndex = workingNodes.findIndex(n => n.id === actualAIAgentId);
                    if (aiAgentNodeIndex !== -1 && workingNodes[aiAgentNodeIndex].data?.emptiedChains) {
                      workingNodes[aiAgentNodeIndex] = {
                        ...workingNodes[aiAgentNodeIndex],
                        data: {
                          ...workingNodes[aiAgentNodeIndex].data,
                          emptiedChains: [] // Clear the emptiedChains array
                        }
                      };
                    }
                    
                    // Check if this AI Agent already has chain nodes (editing existing vs new)
                    const existingChainNodes = workingNodes.filter(n => 
                      n.data?.parentAIAgentId === actualAIAgentId && 
                      n.data?.isAIAgentChild
                    );
                    
                    if (existingChainNodes.length > 0) {
                      
                      // Remove existing chain nodes and their edges
                      const chainNodeIds = existingChainNodes.map(n => n.id);
                      const addActionNodeIds = workingNodes
                        .filter(n => n.type === 'addAction' && (
                          n.data?.parentAIAgentId === actualAIAgentId ||
                          chainNodeIds.some(id => n.id.includes(id))
                        ))
                        .map(n => n.id);
                      
                      const allNodesToRemove = [...chainNodeIds, ...addActionNodeIds];
                      
                      // Filter out the old chain nodes
                      workingNodes = workingNodes.filter(n => !allNodesToRemove.includes(n.id));
                      
                      // Also remove edges connected to these nodes
                      setEdges((currentEdges) => {
                        return currentEdges.filter(e => 
                          !allNodesToRemove.includes(e.source) && 
                          !allNodesToRemove.includes(e.target)
                        );
                      });
                    }
                    
                    // Decide which processing method to use
                    // Use the same condition variables we defined earlier
                    if (hasFullLayout && (hasNodes || hasPlaceholders)) {
                      // If we have full layout data, recreate the exact structure
                      
                      // Create nodes with exact positions from AI Agent builder (if any)
                      if (chainsToProcess.nodes && chainsToProcess.nodes.length > 0) {
                        console.log('🟢 [Chain Processing] Creating nodes from chainsToProcess.nodes:', chainsToProcess.nodes.length);
                        chainsToProcess.nodes.forEach((nodeData: any, nodeIndex: number) => {
                        const timestamp = Date.now();
                        // Generate a cleaner node ID to avoid long concatenations
                        // Use chain index and node index for uniqueness
                        const chainIndex = nodeData.parentChainIndex || 0;
                        const newNodeId = `${actualAIAgentId}-chain${chainIndex}-node${nodeIndex}-${timestamp}`;
                        const actionComponent = ALL_NODE_COMPONENTS.find(n => n.type === nodeData.type);
                        
                        // Calculate position offset
                        const offsetX = aiAgentNode.position.x - (aiAgentPosition?.x || 400);
                        const offsetY = aiAgentNode.position.y - (aiAgentPosition?.y || 200);
                        
                        
                        const newNode = {
                          id: newNodeId,
                          type: 'custom',
                          position: {
                            x: nodeData.position.x + offsetX,
                            y: nodeData.position.y + offsetY
                          },
                          data: {
                            title: nodeData.title || actionComponent?.title || nodeData.type,
                            description: nodeData.description || actionComponent?.description || '',
                            type: nodeData.type,
                            providerId: nodeData.providerId,
                            config: nodeData.config || {},
                            onConfigure: (id: string) => handleConfigureNode(id),
                            onDelete: (id: string) => handleDeleteNodeWithConfirmation(id),
                            onRename: (id: string, newTitle: string) => handleRenameNode(id, newTitle),
                            onAddChain: undefined,
                            isAIAgentChild: true,
                            parentAIAgentId: actualAIAgentId,
                            parentChainIndex: nodeData.parentChainIndex, // Include chain index from the visual builder
                            originalNodeId: nodeData.id, // Keep track of original ID for edge mapping
                            // Add chain placeholder specific properties
                            ...(nodeData.type === 'chain_placeholder' ? {
                              isPlaceholder: true,
                              hasAddButton: true,
                              onAddAction: () => {
                                handleAddActionClick(newNodeId, newNodeId, true);
                              }
                            } : {})
                          }
                        };
                        
                        // Check for duplicate before adding
                        if (!addedNodeIds.has(newNode.id)) {
                          newNodesToAdd.push(newNode);
                          addedNodeIds.add(newNode.id);
                        } else {
                        }
                      });
                      }
                      
                      // Create edges based on the original edge structure (if any)
                      const nodeIdMap = new Map();
                      newNodesToAdd.forEach(node => {
                        nodeIdMap.set(node.data.originalNodeId, node.id);
                      });
                      
                      // Track which nodes are first in their chains (directly connected to AI Agent)
                      const chainStartNodes = new Set();
                      
                      if (chainsToProcess.edges && chainsToProcess.edges.length > 0) {
                        chainsToProcess.edges.forEach((edgeData: any) => {
                        const sourceId = edgeData.source === 'ai-agent' ? actualAIAgentId : nodeIdMap.get(edgeData.source);
                        const targetId = nodeIdMap.get(edgeData.target);
                        
                        // If source is AI Agent, mark target as chain start
                        if (edgeData.source === 'ai-agent' && targetId) {
                          chainStartNodes.add(targetId);
                        }
                        
                        if (sourceId && targetId) {
                          const edgeId = `edge-${sourceId}-${targetId}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
                          const newEdge = {
                            id: edgeId,
                            source: sourceId,
                            target: targetId,
                            type: 'custom',
                            animated: true,
                            style: { stroke: '#94a3b8', strokeWidth: 2 },
                            data: {
                              onAddNode: () => {
                                handleInsertAction(sourceId, targetId);
                              }
                            }
                          };
                          newEdgesToAdd.push(newEdge);
                        }
                      });
                      }
                      
                      // Add "Add Action" nodes at the end of each chain
                      // First, group nodes by chain based on edges from AI Agent
                      const chainGroups = new Map(); // chainStartNodeId -> array of nodes in chain
                      const processedInChain = new Set();
                      
                      
                      // Process each chain starting from nodes directly connected to AI Agent
                      // Convert chainStartNodes to array and sort by X position to ensure consistent ordering
                      const chainStartArray = Array.from(chainStartNodes).sort((a, b) => {
                        const nodeA = newNodesToAdd.find(n => n.id === a);
                        const nodeB = newNodesToAdd.find(n => n.id === b);
                        return (nodeA?.position.x || 0) - (nodeB?.position.x || 0);
                      });
                      
                      chainStartArray.forEach((chainStartId, chainIndex) => {
                        if (!chainGroups.has(chainStartId)) {
                          chainGroups.set(chainStartId, []);
                        }
                        
                        // Follow the chain from this start node
                        let currentId = chainStartId;
                        const chainNodes = [];
                        
                        while (currentId && !processedInChain.has(currentId)) {
                          const node = newNodesToAdd.find(n => n.id === currentId);
                          if (node && node.type !== 'addAction') {
                            // Add parentChainIndex metadata to the node
                            node.data.parentChainIndex = chainIndex;
                            chainNodes.push(node);
                            processedInChain.add(currentId);
                            
                            // Find next node in chain
                            const nextEdge = newEdgesToAdd.find(e => 
                              e.source === currentId && 
                              e.target !== actualAIAgentId &&
                              !e.target.includes('add-action')
                            );
                            currentId = nextEdge?.target || null;
                          } else {
                            break;
                          }
                        }
                        
                        if (chainNodes.length > 0) {
                          chainGroups.set(chainStartId, chainNodes);
                        }
                      });
                      
                      // Add Add Action button at the end of each chain
                      chainGroups.forEach((nodes, startId) => {
                      });
                      
                      // Determine expected number of chains from the layout data
                      const expectedChainCount = chainsToProcess.chains?.length || 2;
                      const placeholderPositions = chainsToProcess.chainPlaceholderPositions || [];

                      console.log('🔵 [Chain Placeholders] placeholderPositions:', placeholderPositions);
                      console.log('🔵 [Chain Placeholders] expectedChainCount:', expectedChainCount);
                      console.log('🔵 [Chain Placeholders] chainsToProcess.chains:', chainsToProcess.chains);
                      console.log('🔵 [Chain Placeholders] chainGroups:', chainGroups);

                      // Process all chains, including empty ones
                      for (let chainIndex = 0; chainIndex < expectedChainCount; chainIndex++) {
                        console.log('🔵 [Chain Placeholders] Processing chain index:', chainIndex);
                        // Find nodes for this chain index in chainGroups
                        const chainNodes = Array.from(chainGroups.values())[chainIndex] || [];
                        
                        if (chainNodes.length > 0) {
                          // Chain has actions - add Add Action after last node ONLY if it's not a chain placeholder
                          const lastNode = chainNodes[chainNodes.length - 1];

                          // Skip creating add action node if the last node is a chain placeholder (it has its own internal button)
                          if (lastNode.data?.type !== 'chain_placeholder') {
                            const addActionId = `add-action-${actualAIAgentId}-chain${chainIndex}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

                            const addActionNode = {
                              id: addActionId,
                              type: 'addAction',
                              position: {
                                x: lastNode.position.x,
                                y: lastNode.position.y + layoutConfig.verticalSpacing
                              },
                              data: {
                                parentId: lastNode.id,
                                parentAIAgentId: actualAIAgentId,
                                parentChainIndex: chainIndex,
                                isChainAddAction: true,
                                onClick: () => handleAddActionClick(addActionId, lastNode.id)
                              }
                            };

                            // Check for duplicate before adding
                            if (!addedNodeIds.has(addActionNode.id)) {
                              newNodesToAdd.push(addActionNode);
                              addedNodeIds.add(addActionNode.id);
                            } else {
                            }

                            // Add edge to Add Action node with unique ID
                            const edgeToAddAction = {
                              id: `e-${lastNode.id}-${addActionId}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
                              source: lastNode.id,
                              target: addActionId,
                              type: 'straight',
                              animated: true,
                              style: {
                                stroke: '#b1b1b7',
                                strokeWidth: 2,
                                strokeDasharray: '5,5'
                              }
                            };
                            newEdgesToAdd.push(edgeToAddAction);
                          }
                        } else if (placeholderPositions[chainIndex]) {
                          // Create a chain placeholder with internal Add Action button
                          console.log('🟢 [Chain Placeholders] Creating placeholder for chain', chainIndex);
                          const placeholderPos = placeholderPositions[chainIndex];
                          console.log('🟢 [Chain Placeholders] Placeholder position:', placeholderPos);
                          const offsetX = aiAgentNode.position.x - (aiAgentPosition?.x || 400);
                          const offsetY = aiAgentNode.position.y - (aiAgentPosition?.y || 200);

                          const placeholderId = `${actualAIAgentId}-chain${chainIndex}-placeholder-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

                          const placeholderNode = {
                            id: placeholderId,
                            type: 'custom',
                            position: {
                              x: placeholderPos.x + offsetX,
                              y: placeholderPos.y + offsetY
                            },
                            data: {
                              title: `Chain ${chainIndex + 1}`,
                              description: 'Click + Add Action to add your first action',
                              type: 'chain_placeholder',
                              providerId: 'core',
                              isTrigger: false,
                              isAIAgentChild: true,
                              parentAIAgentId: actualAIAgentId,
                              parentChainIndex: chainIndex,
                              config: {},
                              onConfigure: handleConfigureNode,
                              onDelete: handleDeleteNodeWithConfirmation,
                              onRename: handleRenameNode,
                              isPlaceholder: true,
                              hasAddButton: true,
                              onAddAction: () => {
                                handleAddActionClick(placeholderId, placeholderId, true);
                              }
                            }
                          };

                          if (!addedNodeIds.has(placeholderId)) {
                            newNodesToAdd.push(placeholderNode);
                            addedNodeIds.add(placeholderId);

                            // Add edge from AI Agent to placeholder with unique ID
                            const edgeToPlaceholder = {
                              id: `e-${actualAIAgentId}-${placeholderId}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
                              source: actualAIAgentId,
                              target: placeholderId,
                              type: 'custom',
                              animated: false,
                              style: { stroke: '#94a3b8', strokeWidth: 2 },
                              data: {
                                onAddNode: () => {
                                  handleInsertAction(actualAIAgentId, placeholderId);
                                }
                              }
                            };
                            newEdgesToAdd.push(edgeToPlaceholder);
                          }
                        }
                      }
                      
                      // Add all new nodes to the current nodes
                      const finalNodes = [...currentNodes, ...newNodesToAdd];
                      
                      // Update edges after nodes are added
                      setTimeout(() => {
                        setEdges((currentEdges) => [...currentEdges, ...newEdgesToAdd]);
                      }, 100);
                      
                      // Reset the processing flag
                      isProcessingChainsRef.current = false;
                      
                      return finalNodes;
                    } else if (chainsData && Array.isArray(chainsData) && chainsData.length > 0) {
                      // Fallback to old chain-based logic if we don't have full layout data
                      // For each chain, create the action nodes
                      
                      chainsData.forEach((chain: any, chainIndex: number) => {
                      // Process all chains, even empty ones
                      if (Array.isArray(chain)) {
                        if (chain.length > 0) {
                        // Create separate chain with proper connection to AI Agent
                        let previousNodeId: string | null = null;
                        let lastPosition: { x: number; y: number } | null = null;
                        
                        // Create nodes for each action in the chain
                        chain.forEach((action, actionIndex) => {
                          const timestamp = Date.now();
                          const newNodeId = `${actualAIAgentId}-chain${chainIndex}-action${actionIndex}-${timestamp}-${actionIndex}`;
                          const actionComponent = ALL_NODE_COMPONENTS.find(n => n.type === action.type);
                          
                          // Use the position from the AI Agent builder if available
                          let nodePosition: { x: number; y: number };
                          if (action.position) {
                            // Use exact position from AI Agent builder, adjusted for AI Agent's position in main workflow
                            // The position is relative to where the AI Agent was in the modal (400, 200)
                            nodePosition = {
                              x: action.position.x + (aiAgentNode.position.x - (aiAgentPosition?.x || 400)),
                              y: action.position.y + (aiAgentNode.position.y - (aiAgentPosition?.y || 200))
                            };
                          } else {
                            // Fallback to calculated position
                            const baseX = aiAgentNode.position.x + (chainIndex + 1) * 250;
                            const baseY = aiAgentNode.position.y + 150;
                            nodePosition = {
                              x: baseX,
                              y: baseY + (actionIndex * 200)
                            };
                          }
                          
                          const newNode = {
                            id: newNodeId,
                            type: 'custom',
                            position: nodePosition,
                            data: {
                              title: action.title || actionComponent?.title || action.type,
                              description: action.description || actionComponent?.description || '',
                              type: action.type,
                              providerId: action.providerId,
                              config: action.config || {},
                              onConfigure: (id: string) => handleConfigureNode(id),
                              onDelete: (id: string) => handleDeleteNodeWithConfirmation(id),
                              onRename: (id: string, newTitle: string) => handleRenameNode(id, newTitle),
                              onAddChain: undefined,
                              isAIAgentChild: true,
                              parentAIAgentId: actualAIAgentId,
                              parentChainIndex: chainIndex
                            }
                          };
                          
                          // Check for duplicate before adding
                          if (!addedNodeIds.has(newNode.id)) {
                            newNodesToAdd.push(newNode);
                            addedNodeIds.add(newNode.id);
                          } else {
                          }
                          
                          // Create edge - first node connects to AI Agent, rest connect to previous
                          if (actionIndex === 0) {
                            // First action in chain connects to AI Agent
                            // Use a more unique ID with chain index, action index, timestamp and random component
                            const edgeId = `edge-aiagent-chain${chainIndex}-${timestamp}-${Math.random().toString(36).substr(2, 9)}`;
                            const newEdge = {
                              id: edgeId,
                              source: actualAIAgentId,
                              target: newNodeId,
                              type: 'custom',
                              animated: true,
                              style: { stroke: '#94a3b8', strokeWidth: 2 },
                              data: {
                                onAddNode: () => {
                                  handleInsertAction(actualAIAgentId, newNodeId);
                                }
                              }
                            };
                            newEdgesToAdd.push(newEdge);
                          } else if (previousNodeId) {
                            // Subsequent actions connect to previous action
                            const edgeId = `edge-chain${chainIndex}-link${actionIndex}-${timestamp}-${Math.random().toString(36).substr(2, 9)}`;
                            const newEdge = {
                              id: edgeId,
                              source: previousNodeId!,
                              target: newNodeId,
                              type: 'custom',
                              animated: true,
                              style: { stroke: '#94a3b8', strokeWidth: 2 },
                              data: {
                                onAddNode: () => {
                                  handleInsertAction(previousNodeId!, newNodeId);
                                }
                              }
                            };
                            newEdgesToAdd.push(newEdge);
                          }
                          
                          previousNodeId = newNodeId;
                          lastPosition = nodePosition;
                        });
                        
                        // Step 3: For each chain's final action node, verify an AddAction node exists
                        // Add an "Add Action" node at the end of each chain
                        if (previousNodeId && lastPosition) {

                          const addActionTimestamp = Date.now() + chainIndex * 100; // Ensure uniqueness with chainIndex offset
                          const randomId = Math.random().toString(36).substr(2, 9);
                          const addActionId = `add-action-${actualAIAgentId}-chain${chainIndex}-${addActionTimestamp}-${randomId}`;
                          const addActionNode = {
                            id: addActionId,
                            type: 'addAction',
                            position: {
                              x: (lastPosition as { x: number; y: number }).x,
                              y: (lastPosition as { x: number; y: number }).y + 160
                            },
                            data: {
                              parentId: previousNodeId,
                              // Don't mark Add Action nodes as AI agent children so they don't get filtered out
                              // isAIAgentChild: true,  // REMOVED - this causes them to be deleted on next save
                              parentAIAgentId: actualAIAgentId,
                              parentChainIndex: chainIndex,
                              isChainAddAction: true,  // Mark this as a chain Add Action for identification
                              onClick: () => {
                                // Use the Add Action node's own ID and its parent ID
                                handleAddActionClick(addActionId, previousNodeId || '');
                              }
                            }
                          };
                          newNodesToAdd.push(addActionNode);

                          // Add edge to Add Action node - use unique timestamp and random for edge ID
                          const edgeRandomId = Math.random().toString(36).substr(2, 9);
                          const edgeToAddAction = {
                            id: `edge-to-addaction-${actualAIAgentId}-chain${chainIndex}-${addActionTimestamp}-${edgeRandomId}`,
                            source: previousNodeId,
                            target: addActionId,
                            type: 'straight',
                            animated: true,
                            style: {
                              stroke: '#b1b1b7',
                              strokeWidth: 2,
                              strokeDasharray: '5,5'
                            }
                          };
                          newEdgesToAdd.push(edgeToAddAction);
                        }
                        } else {
                          // Empty chain - create a chain placeholder with internal Add Action button

                          // Calculate position for the empty chain placeholder
                          const baseX = aiAgentNode.position.x + (chainIndex * 250) + 150;
                          const baseY = aiAgentNode.position.y + 150;

                          const placeholderTimestamp = Date.now() + chainIndex * 100;
                          const randomId = Math.random().toString(36).substr(2, 9);
                          const placeholderId = `${actualAIAgentId}-chain${chainIndex}-placeholder-${placeholderTimestamp}-${randomId}`;

                          const placeholderNode = {
                            id: placeholderId,
                            type: 'custom',
                            position: {
                              x: baseX,
                              y: baseY
                            },
                            data: {
                              title: `Chain ${chainIndex + 1}`,
                              description: 'Click + Add Action to add your first action',
                              type: 'chain_placeholder',
                              providerId: 'core',
                              isTrigger: false,
                              isAIAgentChild: true,
                              parentAIAgentId: actualAIAgentId,
                              parentChainIndex: chainIndex,
                              config: {},
                              onConfigure: handleConfigureNode,
                              onDelete: handleDeleteNodeWithConfirmation,
                              onRename: handleRenameNode,
                              isPlaceholder: true,
                              hasAddButton: true,
                              onAddAction: () => {
                                // When Add Action inside placeholder is clicked, replace the placeholder
                                handleAddActionClick(placeholderId, placeholderId);
                              }
                            }
                          };
                          newNodesToAdd.push(placeholderNode);

                          // Add edge from AI Agent to placeholder
                          const edgeRandomId = Math.random().toString(36).substr(2, 9);
                          const edgeToPlaceholder = {
                            id: `edge-to-placeholder-${actualAIAgentId}-chain${chainIndex}-${placeholderTimestamp}-${edgeRandomId}`,
                            source: actualAIAgentId,
                            target: placeholderId,
                            type: 'custom',
                            animated: false,
                            style: {
                              stroke: '#94a3b8',
                              strokeWidth: 2
                            },
                            data: {
                              onAddNode: () => {
                                handleInsertAction(actualAIAgentId, placeholderId);
                              }
                            }
                          };
                          newEdgesToAdd.push(edgeToPlaceholder);
                        }
                      }
                    });
                    
                    // Log summary and verify we have one Add Action per chain
                    const addActionNodesCreated = newNodesToAdd.filter(n => n.type === 'addAction');
                    
                    // Verify each chain has exactly one Add Action node
                    const chainAddActionCounts: Record<number, number> = {};
                    addActionNodesCreated.forEach(n => {
                      const chainIdx = n.data.parentChainIndex;
                      chainAddActionCounts[chainIdx] = (chainAddActionCounts[chainIdx] || 0) + 1;
                    });
                    
                    // Check if any chain is missing an Add Action node
                    for (let i = 0; i < chainsData.length; i++) {
                      if (!chainAddActionCounts[i]) {
                      } else if (chainAddActionCounts[i] > 1) {
                      }
                    }
                    
                    // Update nodes - remove existing AI Agent children and add new ones
                    
                    // First remove any existing AI Agent child nodes and Add Action nodes
                    // Use the actual AI Agent node ID found above
                    
                    // Log all Add Action nodes before filtering
                    const allAddActionNodes = currentNodes.filter(n => n.type === 'addAction');
                    
                    // Create a set of new node IDs we're about to add
                    const newNodeIds = new Set(newNodesToAdd.map(n => n.id));
                    
                    const removedNodes: any[] = [];
                    const filteredNodes = workingNodes.filter(n => {
                      // Don't remove nodes we're about to add (prevents removing nodes we just created)
                      if (newNodeIds.has(n.id)) {
                        return true;
                      }
                      
                      // Remove OLD AI Agent child nodes (but not the ones we're adding now)
                      if (n.data?.isAIAgentChild && n.data?.parentAIAgentId === actualAIAgentId) {
                        // Only remove if it's not in our new nodes list
                        removedNodes.push({ id: n.id, type: 'Old AI Agent child' });
                        return false;
                      }
                      
                      // Don't remove any Add Action nodes here - they'll be handled separately
                      // Add Action nodes are the "+" buttons that allow extending chains
                      // We need to keep them to maintain the chain structure
                      if (n.type === 'addAction') {
                        return true; // Keep all Add Action nodes
                      }
                      // Keep all other nodes
                      return true;
                    });
                    
                    // Log the Add Action nodes we're about to add
                    const newAddActionNodes = newNodesToAdd.filter(n => n.type === 'addAction');
                    
                    // Update the AI Agent node to remove onAddChain
                    const updatedFilteredNodes = filteredNodes.map(node => {
                      if (node.id === actualAIAgentId) {
                        // Preserve any existing hasChains flag from handleSaveConfiguration
                        return {
                          ...node,
                          data: {
                            ...node.data,
                            onAddChain: undefined,  // Remove the Add Chain button
                            hasChains: true,
                            chainCount: chainsData.length,
                            // Preserve the config that was saved
                            config: node.data?.config
                          }
                        };
                      }
                      return node;
                    });
                    
                    
                    // Check for duplicate node IDs before adding
                    const existingNodeIds = new Set(updatedFilteredNodes.map(n => n.id));
                    const uniqueNewNodes = newNodesToAdd.filter(newNode => {
                      if (existingNodeIds.has(newNode.id)) {
                        return false;
                      }
                      existingNodeIds.add(newNode.id);
                      return true;
                    });
                    
                    // Then add new nodes
                    const updatedNodes = [...updatedFilteredNodes, ...uniqueNewNodes];
                    
                    // Log final Add Action nodes in the updated nodes
                    const finalAddActionNodes = updatedNodes.filter(n => n.type === 'addAction');
                    
                    // Store edges to add them after nodes are updated
                    if (newEdgesToAdd.length > 0) {
                      setTimeout(() => {
                        setEdges((eds) => {
                          // Get current nodes from React Flow at the time edges are being updated
                          const currentNodesSnapshot = getNodes();
                          
                          // Keep existing edges that reference valid nodes; do not strip AI Agent chains
                          const filteredEdges = eds.filter(e => {
                            const sourceNode = currentNodesSnapshot.find(n => n.id === e.source);
                            const targetNode = currentNodesSnapshot.find(n => n.id === e.target);
                            return !!sourceNode && !!targetNode;
                          });
                          
                          // Deduplicate new edges before adding
                          const edgeIdSet = new Set(filteredEdges.map(e => e.id));
                          const uniqueNewEdges = newEdgesToAdd.filter(edge => {
                            if (edgeIdSet.has(edge.id)) {
                              return false;
                            }
                            edgeIdSet.add(edge.id);
                            return true;
                          });
                          
                          return [...filteredEdges, ...uniqueNewEdges];
                        });
                      }, 100);
                    }
                    
                    return updatedNodes;
                  }
                  // If no branches matched, return unchanged nodes
                  console.log('⚠️ [setTimeout] No chains to process - returning unchanged nodes');
                  console.log('⚠️ [setTimeout] Final check - chainsToProcess was:', chainsToProcess);
                  return currentNodes;
                }); // End of setNodes
                    
                  // Auto-save after chains are added and update view
                  setTimeout(() => {
                    // Auto-save the workflow with the chains
                    handleSave();
                    
                    // Fit view to show all nodes with proper settings
                    try {
                      if (typeof fitView === 'function') {
                        fitView({ 
                          padding: 0.2,
                          includeHiddenNodes: false,
                          duration: 400,
                          maxZoom: 1,
                          minZoom: 0.1
                        });
                      } else {
                      }
                    } catch (error) {
                    }
                    
                    const chainCount = chainsData?.length || 0;
                    toast({
                      title: "AI Agent Chains Added",
                      description: `${chainCount} chain(s) have been added to the workflow`
                    });
                    
                    // Reset the processing flag
                    isProcessingChainsRef.current = false;
                  }, 300);
                  } else {
                    // Reset flag if no chains to process
                    isProcessingChainsRef.current = false;
                  }
                }, delayTime); // Use dynamic delay based on whether node exists
                
                // Close the modal after successful save
                setConfiguringNode(null);
                setPendingNode(null);
                
                // Ensure flag is reset after processing completes or if we exit early
                setTimeout(() => {
                  isProcessingChainsRef.current = false;
                }, 1000); // Reset after all processing should be complete
              }}
              onUpdateConnections={(sourceNodeId, targetNodeId) => {
                // Create or update the edge between the selected input node and the AI Agent
                const newEdge = {
                  id: `e${sourceNodeId}-${targetNodeId}`,
                  source: sourceNodeId,
                  target: targetNodeId,
                  type: 'smoothstep'
                };
                
                // Remove any existing edges to the AI Agent
                const filteredEdges = edges.filter(edge => edge.target !== targetNodeId);
                
                // Add the new edge
                setEdges([...filteredEdges, newEdge]);
              }}
              initialData={configuringNode.config}
              workflowData={{ nodes, edges }}
              currentNodeId={configuringNode.id}
              onOpenActionDialog={() => {
                // Set a dummy source node for AI Agent action selection
                setSourceAddNode({ 
                  id: 'ai-agent-source', 
                  parentId: configuringNode?.id || 'ai-agent' 
                });
                openActionDialog();
              }}
              onActionSelect={(callback) => {
                // Store the callback for when an action is selected from the main dialog
                setAiAgentActionCallback(() => callback)
              }}
            />
          ) : (
            <ConfigurationModal
              isOpen={!!configuringNode}
              onClose={handleConfigurationClose}
              onSave={handleConfigurationSave}
              onBack={() => {
                // Save the integration and source info before closing
                const savedIntegration = pendingNode?.integration;
                const savedSourceInfo = (pendingNode as any)?.sourceNodeInfo;
                
                // Close configuration modal (this will clear pendingNode)
                handleConfigurationClose();
                
                // Restore the action dialog with saved info
                if (savedSourceInfo) {
                  setSourceAddNode(savedSourceInfo);
                  // Restore the previously selected integration
                  if (savedIntegration) {
                    setSelectedIntegration(savedIntegration);
                  }
                  // Clear the selected action so user can choose a different one
                  setSelectedAction(null);
                  openActionDialog();
                  
                  // Scroll to the selected integration after a brief delay to ensure dialog is rendered
                  if (savedIntegration) {
                    setTimeout(() => {
                      const element = document.getElementById(`action-integration-${savedIntegration.id}`);
                      if (element) {
                        // Get the scrollable container (ScrollArea viewport)
                        const scrollContainer = element.closest('[data-radix-scroll-area-viewport]');
                        if (scrollContainer) {
                          // Calculate the position to scroll the element to the top
                          const elementTop = element.offsetTop;
                          scrollContainer.scrollTop = elementTop - 8; // Subtract 8px for a bit of padding
                        }
                      }
                    }, 100);
                  }
                }
              }}
              nodeInfo={configuringNodeInfo}
              integrationName={configuringIntegrationName}
              initialData={configuringInitialData}
              workflowData={{ nodes, edges, id: workflowId }}
              currentNodeId={configuringNode?.id}
            />
          )}
        </>
      )}

      {/* Delete Confirmation Dialog */}
      <Dialog open={!!deletingNode} onOpenChange={(open: boolean) => !open && setDeletingNode(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Delete Node</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete "{deletingNode?.name}"? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex justify-end space-x-2">
            <Button variant="outline" onClick={() => setDeletingNode(null)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={confirmDeleteNode}>
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Unsaved Changes Warning Modal */}
      <Dialog open={showUnsavedChangesModal} onOpenChange={setShowUnsavedChangesModal}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Unsaved Changes</DialogTitle>
            <DialogDescription>
              You have unsaved changes to your workflow. Would you like to save them before leaving?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex justify-end space-x-2">
            <Button variant="outline" onClick={handleNavigateWithoutSaving}>
              Don't Save
            </Button>
            <Button onClick={handleSaveAndNavigate} disabled={isSaving}>
              {isSaving ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Saving...
                </>
              ) : (
                'Save & Continue'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Discord Connection Modal */}
      <Dialog open={showDiscordConnectionModal} onOpenChange={setShowDiscordConnectionModal}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Discord Connection Required</DialogTitle>
            <DialogDescription>
              It seems like your workflow requires Discord integration, but no Discord integration has been found.
              Please add a Discord integration to your workflow.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex justify-end space-x-2">
            <Button variant="outline" onClick={() => setShowDiscordConnectionModal(false)}>
              Cancel
            </Button>
            <Button onClick={() => {
              // Add Discord integration setup logic here
              setShowDiscordConnectionModal(false);
            }}>
              Add Discord Integration
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Enhanced Execution History with Detailed Logging */}
      <ExecutionHistoryModal
        open={showExecutionHistory}
        onClose={() => setShowExecutionHistory(false)}
        workflowId={workflowId || ''}
        workflowName={workflowName}
      />

      {/* Sandbox Preview Panel */}
      <SandboxPreviewPanel
        isOpen={showSandboxPreview}
        onClose={() => setShowSandboxPreview(false)}
        interceptedActions={sandboxInterceptedActions}
        workflowName={workflowName}
        onClearActions={() => setSandboxInterceptedActions([])}
      />

      {/* Error Notification Popup */}
      {workflowId && <ErrorNotificationPopup workflowId={workflowId} />}
      
      {/* Integration Re-auth Notification - Only on workflow builder */}
      <ReAuthNotification />
    </div>
  )
}

// Add React.memo to prevent unnecessary re-renders
const IntegrationItem = React.memo(({ integration, selectedIntegration, onSelect, renderLogo }: {
  integration: IntegrationInfo
  selectedIntegration: IntegrationInfo | null
  onSelect: (integration: IntegrationInfo) => void
  renderLogo: (id: string, name: string) => React.ReactNode
}) => (
  <div
    className={`flex items-center p-3 rounded-md cursor-pointer ${
      selectedIntegration?.id === integration.id 
        ? 'bg-primary/10 ring-1 ring-primary/20' 
        : 'hover:bg-muted/50'
    }`}
    onClick={() => onSelect(integration)}
  >
    {renderLogo(integration.id, integration.name)}
    <span className="font-semibold ml-4 flex-grow">{integration.name}</span>
    <ChevronRight className="w-5 h-5 text-muted-foreground" />
  </div>
))

// Virtual scrolling component for large lists
const VirtualIntegrationList = React.memo(({ 
  integrations, 
  selectedIntegration, 
  onSelect, 
  renderLogo 
}: {
  integrations: IntegrationInfo[]
  selectedIntegration: IntegrationInfo | null
  onSelect: (integration: IntegrationInfo) => void
  renderLogo: (id: string, name: string) => React.ReactNode
}) => {
  const [scrollTop, setScrollTop] = useState(0)
  const [containerHeight, setContainerHeight] = useState(400)
  const itemHeight = 56 // Fixed height for each integration item
  const bufferSize = 5 // Extra items to render for smooth scrolling
  
  const visibleStart = Math.max(0, Math.floor(scrollTop / itemHeight) - bufferSize)
  const visibleEnd = Math.min(
    integrations.length,
    Math.ceil((scrollTop + containerHeight) / itemHeight) + bufferSize
  )
  
  const visibleIntegrations = integrations.slice(visibleStart, visibleEnd)
  
  return (
    <div
      className="overflow-auto"
      style={{ height: containerHeight }}
      onScroll={(e) => setScrollTop(e.currentTarget.scrollTop)}
    >
      <div style={{ height: integrations.length * itemHeight, position: 'relative' }}>
        <div
          style={{
            transform: `translateY(${visibleStart * itemHeight}px)`,
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
          }}
        >
          {visibleIntegrations.map((integration, index) => (
            <div key={integration.id} style={{ height: itemHeight }}>
              <IntegrationItem
                integration={integration}
                selectedIntegration={selectedIntegration}
                onSelect={onSelect}
                renderLogo={renderLogo}
              />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
})