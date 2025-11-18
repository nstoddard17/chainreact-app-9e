"use client"

import React, { memo, useState, useRef, useEffect, useMemo, useCallback } from "react"
import { Handle, Position, type NodeProps, useUpdateNodeInternals, useReactFlow } from "@xyflow/react"
import { ALL_NODE_COMPONENTS } from "@/lib/workflows/nodes"
import { Trash2, TestTube, Plus, Edit2, Layers, Unplug, Sparkles, ChevronDown, ChevronUp, Loader2, CheckCircle2, AlertTriangle, Info, GitFork, ArrowRight, PlusCircle, AlertCircle, MoreVertical, Play, Snowflake, StopCircle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { useWorkflowTestStore } from "@/stores/workflowTestStore"
import { useIntegrationStore } from "@/stores/integrationStore"
import { NodeContextMenu } from "./NodeContextMenu"

import { logger } from '@/lib/utils/logger'
import { getIntegrationLogoClasses } from "@/lib/integrations/logoStyles"
import { cn } from "@/lib/utils"
import './builder/styles/node-states.css'
import { InlineNodePicker } from './InlineNodePicker'
import type { NodeComponent } from '@/lib/workflows/nodes/types'
import { FieldVisibilityEngine } from '@/lib/workflows/fields/visibility'

export type NodeState = 'skeleton' | 'ready' | 'running' | 'passed' | 'failed'

const AI_STATUS_HIDE_BADGE_STATES = new Set([
  'preparing',
  'creating',
  'configuring',
  'configured',
  'testing',
  'retesting',
  'fixing',
  'testing_successful'
])

// The data object passed to the node will now contain these callbacks.
type ConfigureOptions = {
  focusField?: string
}

export interface CustomNodeData {
  title: string
  description: string
  type: string
  providerId?: string
  isTrigger?: boolean
  config?: Record<string, any>
  testData?: Record<string, any>
  savedDynamicOptions?: Record<string, any[]>
  validationState?: {
    missingRequired?: string[]
    allRequiredFields?: string[]
    lastValidatedAt?: string
    lastUpdatedAt?: string
    isValid?: boolean
  }
  note?: string // Optional note explaining why this node was added (useful for AI-inserted nodes like transformers)
  onConfigure: (id: string, options?: ConfigureOptions) => void
  onDelete: (id: string) => void
  onAddChain?: (nodeId: string) => void
  onRename?: (id: string, newTitle: string) => void
  onEditingStateChange?: (id: string, isEditing: boolean) => void
  onAddAction?: () => void
  onTestNode?: (nodeId: string) => void
  onTestFlowFromHere?: (nodeId: string) => void
  onFreeze?: (nodeId: string) => void
  onStop?: (nodeId: string) => void
  hasAddButton?: boolean
  isPlaceholder?: boolean
  error?: string
  executionStatus?: 'pending' | 'running' | 'completed' | 'error' | null
  isActiveExecution?: boolean
  isListening?: boolean
  errorMessage?: string
  errorTimestamp?: string
  resultMessage?: string // Success/warning message from action execution
  parentChainIndex?: number
  isAIAgentChild?: boolean
  parentAIAgentId?: string
  needsSetup?: boolean
  aiStatus?: 'creating' | 'configuring' | 'configured' | 'testing' | 'ready' | 'error' | string
  aiBadgeText?: string
  aiBadgeVariant?: 'success' | 'warning' | 'info' | 'danger' | 'default' | 'string'
  aiTestSummary?: string | null
  autoExpand?: boolean
  aiFallbackFields?: string[]
  aiProgressConfig?: {
    key: string
    value: any
    displayValue?: string
    viaFallback?: boolean
  }[]
  // Phase 1: Node state management
  state?: NodeState
  preview?: {
    title?: string
    content: string | string []
  }
  // Zapier-style add node button
  isLastNode?: boolean
  onAddNodeAfter?: (afterNodeId: string, nodeType: string, component: any, sourceHandle?: string) => void
  selectedNodeIds?: string[]
  isBeingConfigured?: boolean // Highlight when this node is actively being edited
}

type SlackConfigSection = {
  key: string
  title: string
  tooltip: string
  defaultOpen: boolean
  fields: string[]
}

const SLACK_CONFIG_SECTIONS: SlackConfigSection[] = [
  {
    key: 'basics',
    title: 'Message Basics',
    tooltip: 'Channel, body, and attachments that make up the primary Slack message.',
    defaultOpen: true,
    fields: ['channel', 'message', 'attachments']
  }
]

const DEFAULT_SLACK_SECTION_STATE = SLACK_CONFIG_SECTIONS.reduce<Record<string, boolean>>((acc, section) => {
  acc[section.key] = section.defaultOpen
  return acc
}, {})

const INTERNAL_PROVIDER_IDS = new Set(['logic', 'core', 'manual', 'schedule', 'webhook', 'ai', 'utility'])
const DEFAULT_PATH_COLORS = ['#2563EB', '#EA580C', '#059669', '#9333EA', '#BE123C', '#14B8A6']
const ELSE_HANDLE_COLOR = '#64748B'

function hexToRgba(hex: string, alpha: number): string {
  let normalized = hex.replace('#', '')
  if (normalized.length === 3) {
    normalized = normalized.split('').map((char) => char + char).join('')
  }
  if (normalized.length !== 6) {
    return `rgba(100, 116, 139, ${alpha})`
  }
  const r = parseInt(normalized.slice(0, 2), 16)
  const g = parseInt(normalized.slice(2, 4), 16)
  const b = parseInt(normalized.slice(4, 6), 16)
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

/**
 * Format a path condition for display
 */
function formatConditionSummary(condition: any): string {
  if (!condition || !condition.field) return ''

  const operatorLabels: Record<string, string> = {
    'equals': '=',
    'not_equals': '≠',
    'contains': 'contains',
    'not_contains': 'excludes',
    'greater_than': '>',
    'less_than': '<',
    'greater_than_or_equal': '≥',
    'less_than_or_equal': '≤',
    'is_empty': 'is empty',
    'is_not_empty': 'is not empty',
    'is_true': 'is true',
    'is_false': 'is false',
    'starts_with': 'starts with',
    'ends_with': 'ends with'
  }

  const fieldName = condition.field.split('.').pop() || condition.field
  const operator = operatorLabels[condition.operator] || condition.operator

  if (['is_empty', 'is_not_empty', 'is_true', 'is_false'].includes(condition.operator)) {
    return `${fieldName} ${operator}`
  }

  const value = condition.value || ''
  const truncatedValue = value.length > 20 ? value.substring(0, 20) + '...' : value
  return `${fieldName} ${operator} ${truncatedValue}`
}

function CustomNode({ id, data, selected }: NodeProps) {
  const updateNodeInternalsHook = useUpdateNodeInternals?.()
  const reactFlowInstance = useReactFlow()
  const updateNodeInternals = typeof updateNodeInternalsHook === 'function'
    ? updateNodeInternalsHook
    : typeof reactFlowInstance?.updateNodeInternals === 'function'
      ? reactFlowInstance.updateNodeInternals
      : null
  const nodeData = data as CustomNodeData & { debugListeningMode?: boolean; debugExecutionStatus?: string }

  // Phase 1: Node state helpers
  const nodeState = nodeData.state || 'ready'
  const isSkeletonState = nodeState === 'skeleton'
  const visualNodeState = useMemo<NodeState>(() => {
    if (nodeState === 'running' || nodeState === 'passed' || nodeState === 'failed') {
      return nodeState
    }
    if (nodeData.executionStatus === 'running' || nodeData.isActiveExecution) return 'running'
    if (nodeData.executionStatus === 'completed' || nodeData.executionStatus === 'success') return 'passed'
    if (nodeData.executionStatus === 'error') return 'failed'
    return nodeState
  }, [nodeData.executionStatus, nodeData.isActiveExecution, nodeState])

  const getStatusBadge = (state: NodeState, hasRequiredFieldsMissing: boolean): { text: string; className: string; icon?: React.ReactNode; iconOnly?: boolean } => {
    // For ready nodes, check if required fields are missing
    if (state === 'ready' && hasRequiredFieldsMissing) {
      return {
        text: 'Incomplete',
        className: 'badge-incomplete',
        icon: <AlertCircle className="w-4 h-4" />,
        iconOnly: true // Only show the icon, not the text
      }
    }

    switch (state) {
      case 'skeleton':
        return { text: 'Setup Required', className: 'badge-skeleton' }
      case 'running':
        return { text: 'Running', className: 'badge-running' }
      case 'passed':
        return { text: 'Success', className: 'badge-passed' }
      case 'failed':
        return { text: 'Failed', className: 'badge-failed' }
      case 'ready':
      default:
        return { text: 'Ready', className: 'badge-ready' }
    }
  }

  // Helper function to get handle styling based on node state
  const getHandleStyle = (state: NodeState) => {
    const baseStyle = {
      background: 'linear-gradient(180deg, rgba(248, 250, 252, 0.95), rgba(236, 242, 250, 0.95))',
      borderColor: 'rgba(148, 163, 184, 0.35)',
      boxShadow: '0 4px 10px rgba(15, 23, 42, 0.08)',
    }

    switch (state) {
      case 'passed':
        return {
          background: 'linear-gradient(180deg, rgba(229, 250, 239, 0.95), rgba(209, 241, 223, 0.95))',
          borderColor: 'rgba(34, 197, 94, 0.35)',
          boxShadow: '0 4px 12px rgba(34, 197, 94, 0.16)',
        }
      case 'failed':
        return {
          background: 'linear-gradient(180deg, rgba(254, 242, 242, 0.95), rgba(254, 226, 226, 0.95))',
          borderColor: 'rgba(248, 113, 113, 0.4)',
          boxShadow: '0 4px 12px rgba(248, 113, 113, 0.16)',
        }
      default:
        return baseStyle
    }
  }

  const handleStyle = getHandleStyle(visualNodeState)

  const [isEditingTitle, setIsEditingTitle] = useState(false)
  const [editedTitle, setEditedTitle] = useState("")
  const [isConfigExpanded, setIsConfigExpanded] = useState<boolean>(() => {
    // Auto-expand when configuring or if autoExpand is set
    return Boolean(nodeData.autoExpand) || nodeData.aiStatus === 'configuring'
  }) // Track if config section is expanded
  const [slackSectionsOpen, setSlackSectionsOpen] = useState<Record<string, boolean>>(DEFAULT_SLACK_SECTION_STATE)
  const [isPreviewExpanded, setIsPreviewExpanded] = useState(true) // Phase 1: Preview auto-expanded for running/passed/failed nodes
  const [logoLoadFailed, setLogoLoadFailed] = useState(false)
  const [isNodePickerOpen, setIsNodePickerOpen] = useState(false) // For Zapier-style add node button
  const [activePickerPath, setActivePickerPath] = useState<string | null>(null) // Track which path's picker is open
  const titleInputRef = useRef<HTMLInputElement>(null)

  const {
    title,
    description,
    type,
    providerId,
    isTrigger,
    config,
    savedDynamicOptions,
    validationState,
    note,
    onConfigure,
    onDelete,
    onDeleteSelected,
    onAddChain,
    onRename,
    onAddAction,
    onTestNode,
    onTestFlowFromHere,
    onFreeze,
    onStop,
    hasAddButton,
    isPlaceholder,
    error,
    executionStatus,
    isActiveExecution,
    isListening,
    errorMessage,
    errorTimestamp,
    resultMessage,
    parentChainIndex,
    isAIAgentChild,
    parentAIAgentId,
    needsSetup,
    debugListeningMode,
    debugExecutionStatus,
    aiStatus,
    aiBadgeText,
    aiBadgeVariant,
    aiTestSummary,
    autoExpand,
    testData,
    aiFallbackFields,
    aiProgressConfig,
    selectedNodeIds,
    isLastNode,
    onAddNodeAfter,
    isBeingConfigured,
  } = nodeData

  const component = ALL_NODE_COMPONENTS.find((c) => c.type === type)
  const isPathNode = type === 'path'
  const isAIRouterNode = type === 'ai_router'
  const isPathConditionNode = type === 'path_condition'

  // Check if all required fields are filled
  // Use validationState from ConfigurationForm if available (smart check with visibility awareness)
  // Otherwise fall back to simple config check
  // Memo to check required fields - use validationState if available, otherwise check visibility-aware
  const hasRequiredFieldsMissing = useMemo(() => {
    const isGetTableSchema = type === 'airtable_action_get_table_schema';

    // Path 1: If we have validation state from the configuration form, use it (most reliable)
    if (data.validationState) {
      const isValid = data.validationState.isValid
      const hasMissingRequired = (data.validationState.missingRequired?.length ?? 0) > 0

      if (isGetTableSchema) {
        console.log('[Get Table Schema Debug] Validation State:', {
          isValid,
          hasMissingRequired,
          missingRequired: data.validationState.missingRequired,
          config
        });
      }

      if (isValid === true) return false
      if (isValid === false) return true
      return hasMissingRequired
    }

    // Path 2: Fallback check using FieldVisibilityEngine (respects visibility conditions)
    if (!component?.configSchema || !config) return false

    try {
      const nodeInfo = {
        type: type,
        providerId: data.providerId,
        configSchema: component.configSchema
      }

      const missingFields = FieldVisibilityEngine.getMissingRequiredFields(
        component.configSchema,
        config,
        nodeInfo
      )

      if (isGetTableSchema) {
        console.log('[Get Table Schema Debug] FieldVisibilityEngine Check:', {
          missingFields,
          config,
          configSchema: component.configSchema
        });
      }

      return missingFields.length > 0
    } catch (error) {
      // Path 3: Error fallback - use simple check (less accurate but safe)
      logger.debug('[CustomNode] Visibility check error, using simple fallback', { type, error })
      return component.configSchema.some((field: any) => {
        if (!field.required) return false
        const value = config[field.name]
        return value === undefined || value === null || value === ''
      })
    }
    // IMPORTANT: Keep original dependencies to prevent infinite loops
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [component?.configSchema, config, data.validationState, type])

  const statusBadge = getStatusBadge(visualNodeState, hasRequiredFieldsMissing)

  const shouldShowStatusBadge = useMemo(() => {
    // Always show badges for explicit execution states or validation warnings
    if (visualNodeState === 'running' || visualNodeState === 'passed' || visualNodeState === 'failed') {
      return true
    }
    if (visualNodeState === 'ready' && hasRequiredFieldsMissing) {
      return true
    }

    const normalizedStatus = (aiStatus || '').toLowerCase()
    return !AI_STATUS_HIDE_BADGE_STATES.has(normalizedStatus)
  }, [aiStatus, hasRequiredFieldsMissing, visualNodeState])

  type OutputHandleConfig = {
    id: string
    label: string
    color?: string
  }

  const outputHandles: OutputHandleConfig[] = useMemo(() => {
    if (isPathNode) {
      // Get connected Path Condition nodes
      const flowEdges = reactFlowInstance?.getEdges() || []
      const flowNodes = reactFlowInstance?.getNodes() || []

      // Find edges that originate from this Path Router node
      const connectedEdges = flowEdges.filter((edge: any) => edge.source === id)

      // Find connected Path Condition nodes
      const pathConditionNodes = connectedEdges
        .map((edge: any) => {
          const targetNode = flowNodes.find((n: any) => n.id === edge.target)
          if (targetNode?.data?.type === 'path_condition') {
            return {
              edge,
              node: targetNode
            }
          }
          return null
        })
        .filter(Boolean)

      // Create handles based on connected Path Condition nodes
      const handles = pathConditionNodes.map((item: any, index: number) => ({
        id: item.edge.sourceHandle || `path_${index}`,
        label: item.node.data.config?.pathName || `Path ${String.fromCharCode(65 + index)}`,
        color: DEFAULT_PATH_COLORS[index % DEFAULT_PATH_COLORS.length],
      }))

      // Only add else branch if there are actual path condition nodes connected
      if (handles.length > 0) {
        handles.push({ id: 'else', label: 'Else', color: ELSE_HANDLE_COLOR })
      }

      return handles
    }

    if (isAIRouterNode) {
      const rawOutputs = Array.isArray(config?.outputPaths) ? config?.outputPaths : []
      return rawOutputs.map((path: any, index: number) => ({
        id: path?.id || `route_${index}`,
        label: path?.name || `Path ${index + 1}`,
        color: path?.color || DEFAULT_PATH_COLORS[index % DEFAULT_PATH_COLORS.length],
      }))
    }

    return []
  }, [config?.paths, config?.outputPaths, isAIRouterNode, isPathNode, id, reactFlowInstance])

  const handleCount = outputHandles.length
  const hasRouterHandles = (isPathNode || isAIRouterNode) && handleCount > 0
  const handleSpacing = hasRouterHandles ? (handleCount > 4 ? 44 : 36) : 36
  const firstHandleTop = hasRouterHandles ? 96 : 44
  const inputHandleTop = hasRouterHandles
    ? Math.max(68, firstHandleTop + ((handleCount - 1) * handleSpacing) / 2)
    : 44
  const inputHandleTopPx = `${inputHandleTop}px`
  const firstHandleTopPx = `${firstHandleTop}px`

  useEffect(() => {
    if ((isPathNode || isAIRouterNode) && typeof updateNodeInternals === 'function') {
      updateNodeInternals(id)
    }
  }, [id, isAIRouterNode, isPathNode, outputHandles.length, updateNodeInternals])

  const fieldMetadataMap = useMemo(() => {
    const map = new Map<string, any>()
    component?.configSchema?.forEach((field: any) => {
      if (field?.name) {
        map.set(field.name, field)
      }
    })
    return map
  }, [component])
  const isSlackSendMessage = type === 'slack_action_send_message'
  const hasMultipleOutputs = ["if_condition", "switch_case", "try_catch"].includes(type)

  // Check if this node has test data available
  const { isNodeInExecutionPath, getNodeTestResult } = useWorkflowTestStore()
  const hasTestData = isNodeInExecutionPath(id)
  const testResult = getNodeTestResult(id)

  // Check if integration is disconnected
  const { integrations } = useIntegrationStore()
  const isIntegrationDisconnected = (() => {
    // Skip check for system/internal node types
    if (!providerId || INTERNAL_PROVIDER_IDS.has(providerId)) {
      return false
    }

    // Special case: Excel uses OneDrive's OAuth connection
    const actualProvider = providerId === 'microsoft-excel' ? 'onedrive' : providerId

    // Check if integration is connected
    const isConnected = integrations.some(
      integration => integration.provider === actualProvider && integration.status === 'connected'
    )

    return !isConnected
  })()

  // Auto-expand when status changes to configuring
  useEffect(() => {
    if (aiStatus === 'configuring' && !isConfigExpanded) {
      setIsConfigExpanded(true)
    }
  }, [aiStatus])

  // Handle title editing
  useEffect(() => {
    if (isEditingTitle && titleInputRef.current) {
      titleInputRef.current.focus()
      titleInputRef.current.select()
    }
  }, [isEditingTitle])

  useEffect(() => {
    const hasConfig = config && Object.keys(config).length > 0
    const hasTestData = testData && Object.keys(testData).length > 0
    const isActiveStatus = ['preparing', 'creating', 'configuring', 'testing', 'testing_successful'].includes(aiStatus || '')

    console.log('[CUSTOMNODE] 📊 Effect check:', {
      nodeId: id,
      title: title,
      hasConfig,
      hasTestData,
      isActiveStatus,
      autoExpand,
      aiStatus,
      nodeState,
      isSkeletonState,
      isConfigExpanded,
      configKeys: config ? Object.keys(config) : [],
      configValues: config,
      aiProgressConfig
    })

    // Don't auto-expand skeleton nodes - they should stay collapsed
    if (!isConfigExpanded && !isSkeletonState && (autoExpand || hasConfig || hasTestData || isActiveStatus)) {
      console.log('[CUSTOMNODE] 📈 Expanding node:', id)
      setIsConfigExpanded(true)
    }
  }, [autoExpand, config, testData, aiStatus, isConfigExpanded, aiProgressConfig, id, title, nodeState, isSkeletonState])
  
  const handleStartEditTitle = () => {
    setEditedTitle(title || component?.title || 'Unnamed Action')
    setIsEditingTitle(true)
    // Communicate to parent that we're editing (will make node non-draggable)
    if (data.onEditingStateChange) {
      data.onEditingStateChange(id, true)
    }
  }

  const handleSaveTitle = () => {
    const newTitle = editedTitle.trim()
    if (newTitle && newTitle !== title && onRename) {
      onRename(id, newTitle)
    }
    setIsEditingTitle(false)
    // Re-enable dragging
    if (data.onEditingStateChange) {
      data.onEditingStateChange(id, false)
    }
  }

  const handleCancelEdit = () => {
    setIsEditingTitle(false)
    setEditedTitle("")
    // Re-enable dragging
    if (data.onEditingStateChange) {
      data.onEditingStateChange(id, false)
    }
  }
  
  const handleTitleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSaveTitle()
    } else if (e.key === 'Escape') {
      handleCancelEdit()
    }
  }

  const handleToggleSlackSection = (sectionKey: string) => {
    setSlackSectionsOpen(prev => ({
      ...prev,
      [sectionKey]: !prev[sectionKey]
    }))
  }
  
  // Get execution status styling with enhanced visual feedback
  const getExecutionStatusStyle = () => {
    // AI statuses now drive styling via aiOutline
    if (aiStatus) {
      return ""
    }

    // If nodeState is handling the styling (running/passed/failed), don't add conflicting styles
    if (visualNodeState === 'running' || visualNodeState === 'passed' || visualNodeState === 'failed') {
      return ""
    }

    if (!executionStatus && !isListening) return ""

    switch (executionStatus) {
      case 'running':
        // Let nodeState handle running styling
        return ""
      case 'success':
      case 'completed':
        return "border-2 border-green-500 shadow-lg shadow-green-200"
      case 'error':
        return "border-2 border-red-500 shadow-lg shadow-red-200"
      case 'pending':
        return "border-2 border-blue-500 shadow-lg shadow-blue-200"
      case 'waiting':
        return "border-2 border-purple-500 shadow-lg shadow-purple-200"
      default:
        return isListening && isTrigger ? "border-2 border-indigo-500 border-dashed shadow-lg shadow-indigo-200" : ""
    }
  }
  
  // Get execution status indicator for corner
  const getExecutionStatusIndicator = () => null

  // Get error label for top-left corner
  const getErrorLabel = () => {
    if (executionStatus === 'error' && (error || errorMessage)) {
      return (
        <div className="absolute top-1 left-1 bg-red-500 text-white text-xs px-1.5 py-0.5 rounded-sm font-medium shadow-sm z-10">
          ERROR
        </div>
      )
    }
    return null
  }
  
  // Check if this node has configuration options
  const nodeHasConfiguration = (): boolean => {
    if (!component) return false

    // Manual triggers don't show configuration button - they open trigger selection on click
    if (type === 'manual') {
      return false
    }

    // All nodes with a component definition should be configurable
    // This includes triggers, actions, and any node with optional or required fields
    return true
  }

  const handleConfigure = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (onConfigure) {
      onConfigure(id)
    }
  }

  const handleFieldFocusRequest = useCallback((fieldKey: string) => {
    if (!fieldKey) return
    if (onConfigure) {
      onConfigure(id, { focusField: fieldKey })
    }
  }, [id, onConfigure])

  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (onDelete) {
      onDelete(id)
    }
  }

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation()
    console.log('🔍 [CustomNode] Click detected:', {
      nodeId: id,
      type,
      hasOnConfigure: !!onConfigure,
      nodeHasConfiguration: nodeHasConfiguration()
    })

    // Manual triggers open the trigger selection dialog on click
    if (type === 'manual' && onConfigure) {
      console.log('🔍 [CustomNode] Opening manual trigger dialog')
      // For manual triggers, onConfigure should open the trigger selection dialog
      onConfigure(id)
      return
    }

    // Only open configuration if the node has configuration options
    if (nodeHasConfiguration() && onConfigure) {
      console.log('🔍 [CustomNode] Calling onConfigure')
      onConfigure(id)
    } else {
      console.log('🔍 [CustomNode] NOT calling onConfigure:', {
        nodeHasConfiguration: nodeHasConfiguration(),
        hasOnConfigure: !!onConfigure
      })
    }
  }

  const hasValidationIssues = Boolean(validationState?.missingRequired?.length)

  // Convert technical field names to human-readable labels
  const getFieldLabel = (fieldName: string): string => {
    const labelMap: Record<string, string> = {
      // Common fields
      'channelId': 'Channel',
      'webhookUrl': 'Webhook URL',
      'baseId': 'Base',
      'tableName': 'Table',
      'to': 'To',
      'subject': 'Subject',
      'body': 'Body',
      'message': 'Message',
      'username': 'Username',
      'email': 'Email',
      'name': 'Name',
      'recordId': 'Record ID',
      'labelIds': 'Folder',
      // Add more mappings as needed
    }

    return labelMap[fieldName] || fieldName
      .replace(/([A-Z])/g, ' $1') // Add space before capital letters
      .replace(/^./, str => str.toUpperCase()) // Capitalize first letter
      .trim()
  }

  const renderLabelWithTooltip = useCallback((fieldName: string): React.ReactNode => {
    const baseLabel = getFieldLabel(fieldName)
    const fieldMeta = fieldMetadataMap.get(fieldName)
    if (!fieldMeta?.tooltip) {
      return baseLabel
    }

    return (
      <div className="flex items-center gap-1">
        <span>{baseLabel}</span>
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Info className="h-3 w-3 text-muted-foreground" />
            </TooltipTrigger>
            <TooltipContent side="top" align="start" className="max-w-xs text-xs leading-relaxed">
              {fieldMeta.tooltip}
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>
    )
  }, [fieldMetadataMap])

  const hasRenderableValue = (value: any): boolean => {
    if (value === null || value === undefined) return false
    if (typeof value === 'string') return value.trim().length > 0
    return true
  }

  const formatSimpleToken = (val: string) => {
    if (!val) return val
    return val
      .split(/[_-]/)
      .map(token => token.charAt(0).toUpperCase() + token.slice(1))
      .join(' ')
  }

  const getSavedOptionLabel = (fieldName: string, rawValue: any): string | undefined => {
    if (!fieldName) return undefined
    const options = savedDynamicOptions?.[fieldName]
    if (!options) return undefined
    const match = options.find((opt: any) => opt?.value === rawValue)
    return match?.label || (match as any)?.name
  }

  const getSchemaOptionLabel = (fieldName: string | undefined, rawValue: any): string | undefined => {
    if (!fieldName) return undefined
    const meta = fieldMetadataMap.get(fieldName)
    if (!meta?.options) return undefined
    const options = meta.options
    const normalize = (val: any) => typeof val === 'string' ? val : String(val)
    const target = normalize(rawValue)
    const match = options.find((opt: any) => {
      if (typeof opt === 'string') {
        return opt === target
      }
      return opt?.value === rawValue || opt?.value === target
    })
    if (!match) return undefined
    if (typeof match === 'string') {
      return formatSimpleToken(match)
    }
    return match.label || match.name || formatSimpleToken(target)
  }

  const formatDisplayValue = (value: any, fieldKey?: string): string => {
    if (value === null || value === undefined) return 'Not set'
    if (value === '') return 'Empty'

    if (typeof value === 'boolean') {
      return value ? 'Yes' : 'No'
    }

    // Handle arrays intelligently
    if (Array.isArray(value)) {
      const mappedValues = value.map(item => {
        if (fieldKey) {
          const labelFromSchema = getSchemaOptionLabel(fieldKey, item)
          if (labelFromSchema) return labelFromSchema
          const labelFromSaved = getSavedOptionLabel(fieldKey, item)
          if (labelFromSaved) return labelFromSaved
        }
        if (typeof item === 'string') {
          if (item.includes('{{')) return item
          return formatSimpleToken(item)
        }
        if (item && typeof item === 'object') {
          const attachmentName = (item as any).fileName || (item as any).filename || (item as any).name || (item as any).title
          if (attachmentName) {
            return attachmentName
          }
          try {
            return JSON.stringify(item, null, 2)
          } catch {
            return '[Object]'
          }
        }
        return String(item)
      })

      return mappedValues.join('\n')
    }

    if (typeof value === 'object') {
      try {
        return JSON.stringify(value, null, 2)
      } catch {
        return '[Object]'
      }
    }

    const stringValue = String(value)

    if (stringValue.includes('{{AI_FIELD:')) {
      return '✨ AI will generate'
    }

    // For message/text fields, show the full content (including variables)
    // Don't convert to "From trigger.from" - show the actual message template
    const isMessageField = fieldKey && ['message', 'body', 'text', 'content', 'description'].includes(fieldKey.toLowerCase())

    // Try to resolve IDs to friendly names BEFORE checking for variables
    if (fieldKey && !isMessageField) {
      const labelFromSaved = getSavedOptionLabel(fieldKey, value)
      if (labelFromSaved) return labelFromSaved
      const labelFromSchema = getSchemaOptionLabel(fieldKey, value)
      if (labelFromSchema) return labelFromSchema
    }

    // For message fields, return the full text as-is (don't convert variables)
    if (isMessageField) {
      return stringValue.length > 200 ? `${stringValue.substring(0, 200)}...` : stringValue
    }

    // For non-message fields with variables, show variable reference
    if (stringValue.includes('{{') && !isMessageField) {
      const varMatch = stringValue.match(/\{\{([^}]+)\}\}/)
      if (varMatch) {
        return `📎 From ${varMatch[1]}`
      }
    }

    // Format simple tokens (like statuses, IDs without friendly names)
    if (/^[a-z0-9_-]+$/i.test(stringValue) && !stringValue.includes('.')) {
      return formatSimpleToken(stringValue)
    }

    return stringValue.length > 60 ? `${stringValue.substring(0, 60)}...` : stringValue
  }

  const validationMessage = useMemo(() => {
    if (isIntegrationDisconnected || !hasValidationIssues) return ""

    const fieldsToShow = validationState?.allRequiredFields || validationState?.missingRequired || []

    if (fieldsToShow.length === 0) {
      return "Required fields missing"
    }

    if (fieldsToShow.length === 1) {
      return `Required field: ${getFieldLabel(fieldsToShow[0])}`
    }

    return `Required fields: ${fieldsToShow.map(getFieldLabel).join(', ')}`
  }, [isIntegrationDisconnected, hasValidationIssues, validationState])

  const badgeVariantStyles: Record<string, string> = {
    success: 'border-green-500 text-green-600 bg-green-50',
    warning: 'border-amber-500 text-amber-600 bg-amber-50',
    info: 'border-blue-500 text-blue-600 bg-blue-50',
    danger: 'border-red-500 text-red-600 bg-red-50',
    default: 'border-border text-muted-foreground bg-muted/40'
  }

  // Don't show badge during AI operations
  const isAIActive = aiStatus && aiStatus !== 'ready' && aiStatus !== 'error' && executionStatus !== 'completed'
  const badgeLabel = !isAIActive ? (aiBadgeText || (needsSetup && !error && !hasValidationIssues ? 'Setup required' : null)) : null
  const resolvedBadgeVariant = badgeLabel
    ? (aiBadgeText ? (aiBadgeVariant || 'info') : 'warning')
    : null
  const badgeClasses = resolvedBadgeVariant ? (badgeVariantStyles[resolvedBadgeVariant] || badgeVariantStyles.default) : ''

  const summaryVariantStyles: Record<string, string> = {
    success: 'bg-emerald-50 text-emerald-700 border-t border-emerald-200',
    warning: 'bg-amber-50 text-amber-700 border-t border-amber-200',
    info: 'bg-sky-50 text-sky-700 border-t border-sky-200'
  }
  const summaryVariant = aiStatus === 'ready' ? 'success' : aiStatus === 'error' ? 'warning' : 'info'
  const summaryClasses = summaryVariantStyles[summaryVariant] || summaryVariantStyles.info
  const fallbackFields = Array.isArray(aiFallbackFields) ? aiFallbackFields : []

  const isCommentKey = React.useCallback((rawKey: string | number | symbol): boolean => {
    if (typeof rawKey !== 'string') return false
    const trimmed = rawKey.trim().toLowerCase()
    if (!trimmed) return false
    return trimmed.startsWith('//') ||
      trimmed.startsWith('/*') ||
      trimmed.startsWith('#') ||
      trimmed.startsWith('comment') ||
      trimmed.startsWith('note') ||
      trimmed.startsWith('assuming ')
  }, [])

  const progressConfigEntries = useMemo(() => {
    if (!Array.isArray(aiProgressConfig)) return []
    return aiProgressConfig.filter(entry => entry && !isCommentKey(entry.key))
  }, [aiProgressConfig, isCommentKey])

  const progressFallbackKeys = useMemo(() => {
    const set = new Set<string>()
    progressConfigEntries.forEach(({ key, viaFallback }) => {
      if (viaFallback) {
        set.add(key)
      }
    })
    return set
  }, [progressConfigEntries])

  const configEntries = useMemo(() => {
    const baseEntries = Object.entries(config || {}).filter(([key]) => !isCommentKey(key))
    if (baseEntries.length > 0) {
      return baseEntries
    }
    if (progressConfigEntries.length > 0) {
      return progressConfigEntries.map(({ key, value }) => [key, value]) as [string, any][]
    }
    return []
  }, [config, progressConfigEntries, isCommentKey])

  const configDisplayOverrides = useMemo(() => {
    const map = new Map<string, string>()
    progressConfigEntries.forEach(({ key, displayValue }) => {
      if (displayValue) {
        map.set(key, displayValue)
      }
    })
    return map
  }, [progressConfigEntries])
  const testDataEntries = useMemo(() => Object.entries(testData || {}), [testData])
  const hasConfigEntries = configEntries.length > 0
  const hasTestEntries = testDataEntries.length > 0
  // Show auto-configured fields during and after AI configuration
  // Keep them visible even after node is marked as successful ('ready' or 'complete')
  const showConfigSection = ['preparing', 'creating', 'configuring', 'configured', 'testing', 'testing_successful', 'ready', 'complete'].includes(aiStatus || '')
  const displayConfigEntries = useMemo(() => {
    let entries = configEntries.length > 0 ? configEntries :
                  progressConfigEntries.length > 0 ? progressConfigEntries.map(field => [field.key, field.value] as [string, any]) :
                  [] as [string, any][]

    // Filter all nodes: only show non-empty, meaningful fields (hide connection, empty values, AI placeholders)
    // First pass: collect all entries into a map for dependency checking
    const entriesMap = new Map(entries)

    entries = entries.filter(([key, value]) => {
      const keyLower = key.toLowerCase()

      // Always hide connection field (internal, shown in config modal only)
      if (keyLower.includes('connection') || keyLower.includes('integration')) return false

      // Hide dependent fields when their parent field is empty/placeholder
      // Hide "Subject Exact Match" when there's no real subject
      if (keyLower.includes('subjectexactmatch') || keyLower === 'subjectexactmatch') {
        const subject = entriesMap.get('subject')
        if (!subject || subject === '' || (typeof subject === 'string' && subject.toLowerCase().startsWith('ai'))) {
          return false
        }
      }

      // Hide "AI Filter Confidence" when there's no real AI Content Filter
      if (keyLower.includes('aifilterconfidence') || keyLower.includes('confidence')) {
        const aiFilter = entriesMap.get('aiContentFilter') || entriesMap.get('aicontentfilter')
        if (!aiFilter || aiFilter === '' || (typeof aiFilter === 'string' && aiFilter.toLowerCase().includes('automatically generated'))) {
          return false
        }
      }

      // Hide empty/default values
      if (!value || value === '' || value === 'any') return false
      if (Array.isArray(value) && value.length === 0) return false
      if (typeof value === 'object' && Object.keys(value).length === 0) return false

      // Hide AI placeholder/suggestion values
      if (typeof value === 'string') {
        const valueLower = value.toLowerCase()
        // Common AI placeholder patterns
        if (valueLower.startsWith('ai suggestion')) return false
        if (valueLower.startsWith('ai draft')) return false
        if (valueLower.includes('automatically generated')) return false
        if (valueLower.includes('optional) for this workflow')) return false
        if (valueLower === 'placeholder') return false
        if (valueLower === 'auto-generated') return false
        // Hide {{AI_FIELD:...}} placeholders
        if (valueLower.includes('{{ai_field:')) return false
      }

      return true
    })

    return entries
  }, [configEntries, progressConfigEntries])
  const configEntryMap = useMemo(() => Object.fromEntries(displayConfigEntries), [displayConfigEntries])
  const compactConfigEntries = useMemo(() => (
    isConfigExpanded ? displayConfigEntries : displayConfigEntries.slice(0, 4)
  ), [displayConfigEntries, isConfigExpanded])
  const extraConfigCount = Math.max(displayConfigEntries.length - compactConfigEntries.length, 0)
  const showConfigSkeleton = !hasConfigEntries && ['preparing', 'creating', 'configuring'].includes(aiStatus || '')
  const showTestingSection = hasTestEntries || aiStatus === 'testing'
  const showTestingSkeleton = !hasTestEntries && aiStatus === 'testing'


  const aiOutline = useMemo(() => {
    // Check for error/validation states first (highest priority)
    if (isIntegrationDisconnected) {
      return {
        borderClass: 'border-red-500',
        shadowClass: 'shadow-[0_0_0_3px_rgba(239,68,68,0.4)]',
        backgroundClass: 'bg-red-50 dark:bg-red-950/30',
        ringClass: selected ? 'ring-4 ring-red-200' : 'ring-4 ring-red-200'
      }
    }

    if (error || nodeState === 'failed') {
      return {
        borderClass: 'border-red-500',
        shadowClass: 'shadow-[0_0_0_2px_rgba(239,68,68,0.3)]',
        backgroundClass: 'bg-red-50 dark:bg-red-950/30',
        ringClass: selected ? 'ring-4 ring-red-200' : ''
      }
    }

    if (hasValidationIssues || hasRequiredFieldsMissing) {
      return {
        borderClass: 'border-orange-400',
        shadowClass: 'shadow-[0_0_0_2px_rgba(251,146,60,0.35)]',
        backgroundClass: 'bg-orange-50 dark:bg-orange-950/30',
        ringClass: selected ? 'ring-4 ring-orange-200' : ''
      }
    }

    // Check AI status for active states (preparing, configuring, testing, etc.)
    switch (aiStatus) {
      case 'preparing':
      case 'creating':
      case 'configuring':
      case 'configured':
        return {
          borderClass: 'border-sky-500',
          shadowClass: 'shadow-[0_0_0_3px_rgba(56,189,248,0.25)]',
          backgroundClass: 'bg-white dark:bg-gray-950',
          ringClass: selected ? 'ring-4 ring-sky-100' : 'ring-4 ring-sky-100'
        }
      case 'testing':
      case 'retesting':
        return {
          borderClass: 'border-amber-500',
          shadowClass: 'shadow-[0_0_0_3px_rgba(251,191,36,0.28)]',
          backgroundClass: 'bg-white dark:bg-gray-950',
          ringClass: selected ? 'ring-4 ring-amber-100' : 'ring-4 ring-amber-100'
        }
      case 'ready':
        // Show green border for successful/ready nodes, even when selected
        return {
          borderClass: 'border-emerald-500',
          shadowClass: 'shadow-[0_0_0_3px_rgba(16,185,129,0.28)]',
          backgroundClass: 'bg-white dark:bg-gray-950',
          ringClass: selected ? 'ring-4 ring-emerald-100' : 'ring-4 ring-emerald-100'
        }
      case 'error':
        return {
          borderClass: 'border-red-500',
          shadowClass: 'shadow-[0_0_0_3px_rgba(239,68,68,0.28)]',
          backgroundClass: 'bg-red-50 dark:bg-red-950/30',
          ringClass: selected ? 'ring-4 ring-red-100' : 'ring-4 ring-red-100'
        }
      default:
        // Check if node has successful test results when no aiStatus (show success state)
        if (testResult?.success && hasTestData) {
          return {
            borderClass: 'border-emerald-500',
            shadowClass: 'shadow-[0_0_0_2px_rgba(16,185,129,0.2)]',
            backgroundClass: 'bg-white dark:bg-gray-950',
            ringClass: selected ? 'ring-4 ring-emerald-100' : ''
          }
        }

        // Default state (ready) - white background
        if (selected) {
          return { borderClass: 'border-primary', shadowClass: '', backgroundClass: 'bg-white dark:bg-gray-950', ringClass: 'ring-4 ring-primary/20' }
        }
        return {
          borderClass: 'border-border',
          shadowClass: '',
          backgroundClass: 'bg-white dark:bg-gray-950',
          ringClass: ''
        }
    }
  }, [aiStatus, selected, isIntegrationDisconnected, error, hasValidationIssues, testResult, hasTestData, nodeState, hasRequiredFieldsMissing])

  const { borderClass, shadowClass, backgroundClass, ringClass } = aiOutline

  // Override styling when node is being actively configured
  const finalBackgroundClass = isBeingConfigured
    ? 'bg-blue-50 dark:bg-blue-950/30'
    : backgroundClass
  const finalBorderClass = isBeingConfigured
    ? 'border-blue-300 dark:border-blue-700'
    : borderClass

  const idleStatus = React.useMemo(() => {
    // Never show status badges for skeleton nodes
    if (isSkeletonState) {
      return null
    }

    if (aiStatus === 'ready' || aiStatus === 'complete') {
      return null // No text below badge when successful
    }
    if (aiStatus === 'awaiting_user') {
      if (nodeState === 'ready') {
        return null
      }
      return { text: 'Awaiting input', tone: 'info' as const }
    }
    if (!aiStatus) {
      if (executionStatus === 'pending') {
        return { text: 'Pending', tone: 'pending' as const }
      }
      if (executionStatus === 'completed') {
        return { text: 'Successful', tone: 'success' as const }
      }
      return null
    }
    if (aiStatus === 'pending') {
      return { text: 'Pending', tone: 'pending' as const }
    }
    return null
  }, [aiStatus, executionStatus, isSkeletonState, nodeState])

  const statusIndicator = React.useMemo(() => {
    if (!aiStatus) return null

    if (executionStatus === 'completed') {
      return null
    }

    if (aiStatus === 'error') {
      return (
        <div className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium bg-red-100 text-red-700 border border-red-200">
          <AlertTriangle className="w-3 h-3" />
          <span>Needs Attention</span>
        </div>
      )
    }

    const activeStatuses = new Set(['preparing', 'creating', 'configuring', 'configured', 'testing', 'retesting', 'fixing', 'testing_successful'])
    if (!activeStatuses.has(aiStatus)) {
      return null
    }

    let statusText = 'Configuring'
    let badgeClass = 'bg-sky-100 text-sky-700 border border-sky-200'
    let showSpinner = false

    switch (aiStatus) {
      case 'testing':
      case 'retesting':
        statusText = 'Testing'
        badgeClass = 'bg-amber-100 text-amber-700 border border-amber-200'
        showSpinner = true
        break
      case 'fixing':
        statusText = 'Fixing'
        badgeClass = 'bg-orange-100 text-orange-700 border border-orange-200'
        showSpinner = true
        break
      case 'testing_successful':
        statusText = 'Testing is Successful'
        badgeClass = 'bg-emerald-100 text-emerald-700 border border-emerald-200'
        break
      case 'preparing':
      case 'creating':
      case 'configuring':
      case 'configured':
      default:
        statusText = 'Configuring'
        badgeClass = 'bg-sky-100 text-sky-700 border border-sky-200'
        showSpinner = true
        break
    }

    return (
      <div className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${badgeClass}`}>
        {showSpinner && <Loader2 className="w-3 h-3 animate-spin" />}
        <span>{statusText}</span>
      </div>
    )
  }, [aiStatus])

  useEffect(() => {
    if (typeof updateNodeInternals === 'function') {
      updateNodeInternals(id)
    }
  }, [
    id,
    updateNodeInternals,
    isConfigExpanded,
    configEntries.length,
    testDataEntries.length,
    aiStatus,
    autoExpand
  ])

  useEffect(() => {
    // console.log('[CUSTOMNODE STATUS]', {
    //   nodeId: id,
    //   aiStatus,
    //   aiBadgeText,
    //   aiBadgeVariant,
    //   executionStatus,
    //   needsSetup,
    //   fallbackFields
    // })
  }, [id, aiStatus, aiBadgeText, aiBadgeVariant, executionStatus, needsSetup, fallbackFields])

  const renderPathRouterAddButton = () => {
    if (!isPathNode) {
      return null
    }

    // Get current count of connected Path Condition nodes
    const flowEdges = reactFlowInstance?.getEdges() || []
    const flowNodes = reactFlowInstance?.getNodes() || []
    const connectedPathNodes = flowEdges
      .filter((edge: any) => edge.source === id)
      .map((edge: any) => flowNodes.find((n: any) => n.id === edge.target))
      .filter((node: any) => node?.data?.type === 'path_condition')

    const pathCount = connectedPathNodes.length
    const maxPaths = 5

    // Don't show button if we've reached max paths
    if (pathCount >= maxPaths) {
      return null
    }

    // Zapier-style simple plus button
    return (
      <div className="absolute left-1/2 -translate-x-1/2 noDrag noPan pointer-events-auto" style={{ top: '100%', marginTop: '20px', zIndex: 10 }}>
        <Button
          variant="ghost"
          size="sm"
          className="rounded-full h-7 w-7 p-0 bg-background hover:bg-primary/10 border-2 border-dashed border-muted-foreground/30 hover:border-primary transition-all noDrag noPan"
          onClick={(e) => {
            e.stopPropagation()
            // Auto-create Path Condition node
            const pathConditionComponent = ALL_NODE_COMPONENTS.find(c => c.type === 'path_condition')
            if (onAddNodeAfter && pathConditionComponent) {
              onAddNodeAfter(id, 'path_condition', pathConditionComponent, `path_${pathCount}`)
            }
          }}
        >
          <Plus className="w-4 h-4 text-muted-foreground" />
        </Button>
      </div>
    )
  }

  const renderOutputHandles = () => {
    const renderHandles = (handles: OutputHandleConfig[]) => {
      return handles.map((handle, index) => {
        // For Path Router nodes, position handles horizontally at the bottom
        const horizontalSpacing = 80 // Space between handles
        const totalWidth = (handles.length - 1) * horizontalSpacing
        const startLeft = -totalWidth / 2 // Center the handles
        const left = startLeft + index * horizontalSpacing

        const accentColor = handle.color || '#334155'
        const handleBackground = hexToRgba(accentColor, 0.18)
        const handleShadow = `0 4px 12px ${hexToRgba(accentColor, 0.25)}`
        const labelBackground = hexToRgba(accentColor, 0.12)
        const labelBorder = hexToRgba(accentColor, 0.35)
        const labelColor = accentColor
        return (
          <React.Fragment key={`${id}-${handle.id}`}>
            <Handle
              id={handle.id}
              type="source"
              position={Position.Bottom}
              className="!w-10 !h-[18px] !rounded-t-full !rounded-b-none !transition-all !duration-200"
              style={{
                left: `calc(50% + ${left}px)`,
                bottom: "0px",
                transform: "translateX(-50%)",
                zIndex: 6,
                background: 'transparent',
                border: 'none',
                boxShadow: 'none',
                opacity: 0,
                pointerEvents: 'none',
              }}
            />
            <div
              className="absolute flex flex-col items-center gap-1 text-[10.5px] font-semibold pointer-events-none whitespace-nowrap rounded-md px-2.5 py-1 shadow-md"
              style={{
                left: `calc(50% + ${left}px)`,
                bottom: 26,
                transform: "translateX(-50%)",
                color: handle.id === 'else' ? '#64748B' : labelColor,
                background: handle.id === 'else'
                  ? 'linear-gradient(135deg, rgba(100, 116, 139, 0.15) 0%, rgba(100, 116, 139, 0.08) 100%)'
                  : labelBackground,
                border: `1.5px ${handle.id === 'else' ? 'dashed' : 'solid'} ${labelBorder}`,
                backdropFilter: 'blur(8px)',
              }}
            >
              {handle.id === 'else' ? (
                <span className="text-[9px] opacity-70">↓</span>
              ) : (
                handle.color && (
                  <span
                    className="w-2 h-2 rounded-full shadow-sm"
                    style={{
                      backgroundColor: handle.color,
                      border: '1px solid rgba(255, 255, 255, 0.5)'
                    }}
                  />
                )
              )}
              <span
                className="tracking-wider uppercase max-w-[100px] overflow-hidden text-ellipsis whitespace-nowrap"
                title={handle.label}
                style={{
                  letterSpacing: handle.id === 'else' ? '0.05em' : '0.08em',
                  fontWeight: handle.id === 'else' ? 500 : 600
                }}
              >
                {handle.label}
              </span>
            </div>
          </React.Fragment>
        )
      })
    }

    if (isPathNode) {
      // Path Router doesn't use traditional handles - uses floating pills instead
      return null
    }

    if (isAIRouterNode && outputHandles.length > 0) {
      return <>{renderHandles(outputHandles)}</>
    }

    // Regular node: bottom center handle (Make.com style)
    return (
      <div className="absolute left-1/2 -translate-x-1/2" style={{ bottom: '0px', zIndex: 5 }}>
        <Handle
          id="source"
          type="source"
          position={Position.Bottom}
          className="!w-10 !h-[18px] !rounded-t-full !rounded-b-none !transition-all !duration-200"
          style={{
            left: "50%",
            bottom: "0px",
            transform: "translateX(-50%)",
            zIndex: 5,
            background: 'transparent',
            border: 'none',
            boxShadow: 'none',
            opacity: 0,
            pointerEvents: 'none',
          }}
        />
      </div>
    )
  }

  if (isSkeletonState) {
    return (
      <NodeContextMenu
        nodeId={id}
        selectedNodeIds={selectedNodeIds}
        onTestNode={onTestNode}
        onTestFlowFromHere={onTestFlowFromHere}
        onFreeze={onFreeze}
        onStop={onStop}
        onDelete={onDelete}
        onDeleteSelected={onDeleteSelected}
        hasRequiredFieldsMissing={hasRequiredFieldsMissing}
      >
        <div
          className="relative w-[360px] bg-slate-50/80 rounded-lg shadow-sm border-2 border-slate-200 group transition-all duration-200 overflow-hidden"
          data-testid={`node-${id}-skeleton`}
          style={{
            opacity: 0.95,
            width: '360px',
            maxWidth: '360px',
            minWidth: '360px',
            boxSizing: 'border-box',
            flex: 'none',
          }}
        >
          <div className="p-3">
            <div className="flex items-center justify-between gap-2">
              <div className="grid grid-cols-[40px_1fr] gap-2.5 items-center flex-1 min-w-0">
                {/* Logo - Fixed position, vertically centered */}
                <div className="flex items-center justify-center opacity-30">
                  {type === 'chain_placeholder' ? (
                    <Layers className="h-7 w-7 text-muted-foreground flex-shrink-0" />
                  ) : providerId && !logoLoadFailed && !INTERNAL_PROVIDER_IDS.has(providerId) ? (
                    <img
                      src={`/integrations/${providerId}.svg`}
                      alt={`${title || ''} logo`}
                      className={getIntegrationLogoClasses(providerId, "w-7 h-7 object-contain flex-shrink-0")}
                      onError={() => {
                        logger.error(`Failed to load logo for ${providerId} at path: /integrations/${providerId}.svg`)
                        setLogoLoadFailed(true)
                      }}
                      onLoad={() => logger.debug(`Successfully loaded logo for ${providerId}`)}
                    />
                  ) : (
                    component?.icon && React.createElement(component.icon, { className: "h-7 w-7 text-foreground flex-shrink-0" })
                  )}
                </div>
                {/* Content - Flows independently */}
                <div className="min-w-0 pr-2">
                  <div className="flex flex-col gap-1">
                    <div className="flex items-center gap-1.5">
                      <h3 className="text-lg font-semibold text-slate-400 whitespace-nowrap overflow-hidden text-ellipsis flex-1">
                        {title || (component && component.title) || 'Unnamed Action'}
                      </h3>
                      <span className="inline-flex items-center rounded-full bg-orange-100 text-orange-700 text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 flex-shrink-0">
                        Setup Required
                      </span>
                    </div>
                    {(description || (component && component.description)) && (
                      <p className="text-sm text-slate-400 leading-tight line-clamp-1">
                        {description || (component && component.description)}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Input handle - Half-moon on left side */}
          {!isTrigger && (
            <Handle
              id="target"
              type="target"
              position={Position.Left}
              className="!w-[18px] !h-10 !rounded-r-full !rounded-l-none !transition-all !duration-200"
              style={{
                visibility: isTrigger ? "hidden" : "visible",
                left: "0px",
                top: inputHandleTopPx,
                zIndex: 5,
                background: handleStyle.background,
                borderRight: `1.5px solid ${handleStyle.borderColor}`,
                borderTop: 'none',
                borderBottom: 'none',
                borderLeft: 'none',
                boxShadow: handleStyle.boxShadow,
                backdropFilter: 'blur(2px)',
              }}
            />
          )}

          {/* Output handle - Half-moon on right side */}
          <Handle
            id="source"
            type="source"
            position={Position.Right}
            className="!w-[18px] !h-10 !rounded-l-full !rounded-r-none !transition-all !duration-200"
            style={{
              right: "0px",
              top: firstHandleTopPx,
              zIndex: 5,
              background: handleStyle.background,
              borderLeft: `1.5px solid ${handleStyle.borderColor}`,
              borderTop: 'none',
              borderBottom: 'none',
              borderRight: 'none',
              boxShadow: handleStyle.boxShadow,
              backdropFilter: 'blur(2px)',
            }}
          />
        </div>
      </NodeContextMenu>
    )
  }

  return (
    <NodeContextMenu
      nodeId={id}
      selectedNodeIds={selectedNodeIds}
      onTestNode={onTestNode}
      onTestFlowFromHere={onTestFlowFromHere}
      onFreeze={onFreeze}
      onStop={onStop}
      onDelete={onDelete}
      onDeleteSelected={onDeleteSelected}
      hasRequiredFieldsMissing={hasRequiredFieldsMissing}
    >
      {/* Wrapper div to contain both node and plus button */}
      <div className="relative" style={{ width: '360px' }}>
        <div
          className={`workflow-node-card relative w-[360px] ${finalBackgroundClass} rounded-lg shadow-sm border-2 group ${finalBorderClass} ${shadowClass} ${ringClass} ${
            nodeHasConfiguration() ? "cursor-pointer" : ""
          } ${getExecutionStatusStyle()} ${
            visualNodeState === 'running' ? 'node-running' :
            visualNodeState === 'passed' ? 'node-passed' :
            visualNodeState === 'failed' ? 'node-failed' : ''
          }`}
          data-testid={`node-${id}`}
          onClick={handleClick}
          style={{
            opacity: visualNodeState === 'skeleton' ? 0.5 : 1,
            width: '360px',
            maxWidth: '360px',
            minWidth: '360px',
            boxSizing: 'border-box',
            flex: 'none',
          }}
        >
      {/* Three-dots menu - Always visible in top-right corner */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            className="absolute top-2 right-2 p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors noDrag noPan z-20"
            onClick={(e) => e.stopPropagation()}
            aria-label="Node menu"
          >
            <MoreVertical className="w-4 h-4 text-gray-600 dark:text-gray-400" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent className="w-56" align="end">
          {selectedNodeIds && selectedNodeIds.length > 1 && selectedNodeIds.includes(id) ? (
            <DropdownMenuItem
              onClick={(e) => {
                e.stopPropagation()
                onDeleteSelected?.(selectedNodeIds)
              }}
              className="text-destructive focus:text-destructive"
            >
              <Trash2 className="w-4 h-4 mr-2" />
              {`Delete ${selectedNodeIds.length} nodes`}
            </DropdownMenuItem>
          ) : (
            <>
              <DropdownMenuItem
                onClick={(e) => {
                  e.stopPropagation()
                  if (!hasRequiredFieldsMissing) {
                    onTestNode?.(id)
                  }
                }}
                disabled={hasRequiredFieldsMissing}
              >
                <TestTube className="w-4 h-4 mr-2" />
                Test Node
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={(e) => {
                  e.stopPropagation()
                  if (!hasRequiredFieldsMissing) {
                    onTestFlowFromHere?.(id)
                  }
                }}
                disabled={hasRequiredFieldsMissing}
              >
                <Play className="w-4 h-4 mr-2" />
                Test Flow from here
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={(e) => {
                  e.stopPropagation()
                  if (!hasRequiredFieldsMissing) {
                    onFreeze?.(id)
                  }
                }}
                disabled={hasRequiredFieldsMissing}
              >
                <Snowflake className="w-4 h-4 mr-2" />
                Freeze
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={(e) => {
                  e.stopPropagation()
                  if (!hasRequiredFieldsMissing) {
                    onStop?.(id)
                  }
                }}
                disabled={hasRequiredFieldsMissing}
              >
                <StopCircle className="w-4 h-4 mr-2" />
                Stop
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={(e) => {
                  e.stopPropagation()
                  onDelete?.(id)
                }}
                className="text-destructive focus:text-destructive"
              >
                <Trash2 className="w-4 h-4 mr-2" />
                Delete
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Execution status indicator */}
      {getExecutionStatusIndicator()}
      {/* Error label */}
      {getErrorLabel()}
      {error && !isIntegrationDisconnected && (
        <div className="bg-destructive/10 border-b border-destructive/20 px-4 py-2 rounded-t-lg">
          <p className="text-sm text-destructive font-medium">{error}</p>
        </div>
      )}
      {!error && !isIntegrationDisconnected && hasValidationIssues && (
        <div className="bg-red-50 border-b border-red-100 px-4 py-3 rounded-t-lg">
          <div className="flex items-start gap-2">
            <span className="inline-flex items-center rounded-full bg-red-500 text-white text-[11px] font-semibold uppercase tracking-wide px-2 py-0.5">
              Incomplete
            </span>
            <p className="text-sm text-red-600 font-medium leading-snug flex-1">
              {validationMessage}
            </p>
          </div>
        </div>
      )}

      {/* Execution result message (success, warning, or info from action) */}
      {resultMessage && executionStatus === 'completed' && (
        <div className={cn(
          "border-b px-4 py-3",
          resultMessage.includes('✅') || resultMessage.includes('enabled!')
            ? "bg-green-50 border-green-200 dark:bg-green-900/20 dark:border-green-800"
            : resultMessage.includes('⚠️') || resultMessage.includes('NOT enabled')
            ? "bg-amber-50 border-amber-200 dark:bg-amber-900/20 dark:border-amber-800"
            : resultMessage.includes('⏳') || resultMessage.includes('pending')
            ? "bg-blue-50 border-blue-200 dark:bg-blue-900/20 dark:border-blue-800"
            : "bg-gray-50 border-gray-200 dark:bg-gray-900/20 dark:border-gray-800"
        )}>
          <div className="flex items-start gap-2">
            {resultMessage.includes('✅') && (
              <CheckCircle2 className="w-4 h-4 text-green-600 dark:text-green-400 mt-0.5 flex-shrink-0" />
            )}
            {resultMessage.includes('⚠️') && (
              <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 mt-0.5 flex-shrink-0" />
            )}
            {resultMessage.includes('⏳') && (
              <Loader2 className="w-4 h-4 text-blue-600 dark:text-blue-400 mt-0.5 flex-shrink-0 animate-spin" />
            )}
            {resultMessage.includes('ℹ️') && (
              <Info className="w-4 h-4 text-gray-600 dark:text-gray-400 mt-0.5 flex-shrink-0" />
            )}
            <p className={cn(
              "text-xs font-medium leading-snug flex-1 whitespace-pre-wrap",
              resultMessage.includes('✅') || resultMessage.includes('enabled!')
                ? "text-green-700 dark:text-green-300"
                : resultMessage.includes('⚠️') || resultMessage.includes('NOT enabled')
                ? "text-amber-700 dark:text-amber-300"
                : resultMessage.includes('⏳') || resultMessage.includes('pending')
                ? "text-blue-700 dark:text-blue-300"
                : "text-gray-700 dark:text-gray-300"
            )}>
              {resultMessage}
            </p>
          </div>
        </div>
      )}

      {hasTestData && (
        <div className="bg-blue-50 border-b border-blue-200 px-4 py-2">
          <div className="flex items-center gap-2 text-xs text-blue-700">
            <TestTube className="w-3 h-3" />
            <span>Test data available</span>
            {testResult && (
              <span className={`px-1.5 py-0.5 rounded text-xs ${
                testResult.success 
                  ? 'bg-green-100 text-green-700' 
                  : 'bg-red-100 text-red-700'
              }`}>
                {testResult.success ? '✓' : '✗'}
              </span>
            )}
          </div>
        </div>
      )}

      {/* Success badge for nodes with successful test results */}
      {testResult?.success && hasTestData && !isPathConditionNode && !aiStatus && (
        <div className="absolute -top-2 -left-2 z-20 noDrag noPan">
          <Badge
            variant="outline"
            className="px-1.5 py-0.5 text-[10px] font-semibold shadow-md bg-emerald-50 border-emerald-500 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300"
          >
            <CheckCircle2 className="w-3 h-3 mr-0.5 inline" />
            Success
          </Badge>
        </div>
      )}

      {/* Path label badge for Path Condition nodes */}
      {isPathConditionNode && (
        <div className="absolute -top-2 -left-2 z-20 noDrag noPan">
          <Badge
            variant="outline"
            className="px-2 py-0.5 text-[10px] font-bold shadow-md bg-background"
            style={{
              borderColor: DEFAULT_PATH_COLORS[0],
              color: DEFAULT_PATH_COLORS[0],
            }}
          >
            {config?.pathName || 'Path A'}
          </Badge>
        </div>
      )}

      <div className="p-3">
        <div className="flex items-center justify-between gap-2">
          <div className="grid grid-cols-[40px_1fr] gap-2.5 items-center flex-1 min-w-0">
            {/* Logo - Fixed position, vertically centered */}
            <div className="flex items-center justify-center">
              {type === 'chain_placeholder' ? (
                <Layers className="h-7 w-7 text-muted-foreground flex-shrink-0" />
              ) : providerId && !logoLoadFailed && !INTERNAL_PROVIDER_IDS.has(providerId) ? (
                <img
                  src={`/integrations/${providerId}.svg`}
                  alt={`${title || ''} logo`}
                  className={getIntegrationLogoClasses(providerId, "w-7 h-7 object-contain flex-shrink-0")}
                  onError={() => {
                    logger.error(`Failed to load logo for ${providerId} at path: /integrations/${providerId}.svg`)
                    setLogoLoadFailed(true)
                  }}
                  onLoad={() => logger.debug(`Successfully loaded logo for ${providerId}`)}
                />
              ) : (
                component?.icon && React.createElement(component.icon, { className: "h-7 w-7 text-foreground flex-shrink-0" })
              )}
            </div>
            {/* Content - Flows independently */}
            <div className="min-w-0 pr-2">
              {isEditingTitle ? (
                <input
                  ref={titleInputRef}
                  type="text"
                  value={editedTitle}
                  onChange={(e) => setEditedTitle(e.target.value)}
                  onKeyDown={handleTitleKeyPress}
                  onBlur={handleSaveTitle}
                  className="noDrag noPan text-lg font-semibold text-foreground bg-transparent border-b-2 border-primary outline-none w-full"
                  onClick={(e) => e.stopPropagation()}
                  onMouseDown={(e) => e.stopPropagation()}
                />
              ) : (
                <div className="flex flex-col gap-1">
                  <div className="flex items-center gap-1.5">
                    <h3 className="text-lg font-semibold text-foreground whitespace-nowrap overflow-hidden text-ellipsis flex-1">
                      {title || (component && component.title) || 'Unnamed Action'}
                    </h3>
                    {/* Show either the status indicator OR the badge, not both */}
                    {statusIndicator}
                    {!statusIndicator && idleStatus && (
                      idleStatus.tone === 'success' ? (
                        <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-600">
                          <CheckCircle2 className="w-3 h-3" />
                          {idleStatus.text}
                        </span>
                      ) : (
                        <span className="text-xs font-medium text-muted-foreground">
                          {idleStatus.text}
                        </span>
                      )
                    )}
                    {!statusIndicator && !idleStatus && !isAIActive && badgeLabel && !error && !hasValidationIssues && (
                      <span className={`inline-flex items-center rounded-full text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 flex-shrink-0 ${badgeClasses}`}>
                        {badgeLabel}
                      </span>
                    )}
                    {isIntegrationDisconnected && (
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <div className="flex-shrink-0">
                              <Unplug className="h-4 w-4 text-red-500" />
                            </div>
                          </TooltipTrigger>
                          <TooltipContent side="top">
                            <p>Integration disconnected. Reconnect {providerId?.split('-').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ')} to use this node.</p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    )}
                  </div>
                  {description && (
                    <p className="text-sm text-muted-foreground leading-snug line-clamp-1">{description || (component && component.description)}</p>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
        {/* Node note - explanatory text for AI-inserted nodes */}
        {note && (
          <div className="mt-3 flex items-start gap-2 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2">
            <Info className="w-3.5 h-3.5 text-blue-600 flex-shrink-0 mt-0.5" />
            <p className="text-xs text-blue-700 leading-relaxed whitespace-pre-wrap">{note}</p>
          </div>
        )}

        {/* Path Router Summary - Show configured paths and conditions */}
        {isPathNode && config?.paths && Array.isArray(config.paths) && config.paths.length > 0 && (
          <div className="mt-3 rounded-lg border border-border/60 bg-gradient-to-br from-background/90 to-muted/30 overflow-hidden shadow-sm">
            <div className="px-3 py-2 border-b border-border/50 bg-muted/40 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <GitFork className="w-3.5 h-3.5 text-primary" />
                <p className="text-[11px] font-semibold uppercase tracking-wide text-foreground">Path Routing</p>
              </div>
              <Badge variant="secondary" className="text-[9px] px-1.5 py-0.5 bg-primary/10 text-primary">
                {config.paths.length} {config.paths.length === 1 ? 'path' : 'paths'}
              </Badge>
            </div>
            <div className="px-3 py-2.5 space-y-2">
              {config.paths.map((path: any, index: number) => {
                const pathColor = path.color || DEFAULT_PATH_COLORS[index % DEFAULT_PATH_COLORS.length]
                const conditionsText = path.conditions && path.conditions.length > 0
                  ? path.conditions.map((cond: any) => formatConditionSummary(cond)).filter(Boolean).join(' AND ')
                  : 'No conditions'

                return (
                  <div
                    key={path.id || index}
                    className="flex items-start gap-2 rounded-md border px-2.5 py-2 bg-background/60 transition-all hover:bg-background/80"
                    style={{
                      borderColor: hexToRgba(pathColor, 0.3),
                      borderLeftWidth: '3px',
                      borderLeftColor: pathColor
                    }}
                  >
                    <div className="flex items-center gap-1.5 min-w-0 flex-1">
                      <span
                        className="w-2 h-2 rounded-full flex-shrink-0 shadow-sm"
                        style={{
                          backgroundColor: pathColor,
                          border: '1px solid rgba(255, 255, 255, 0.5)'
                        }}
                      />
                      <div className="min-w-0 flex-1">
                        <p className="text-[10.5px] font-semibold text-foreground truncate" title={path.name}>
                          {path.name || `Path ${String.fromCharCode(65 + index)}`}
                        </p>
                        <p
                          className="text-[10px] text-muted-foreground leading-relaxed truncate"
                          title={conditionsText}
                        >
                          {conditionsText}
                        </p>
                      </div>
                    </div>
                    <ArrowRight className="w-3 h-3 text-muted-foreground/60 flex-shrink-0 mt-0.5" />
                  </div>
                )
              })}
              {/* Else path indicator */}
              <div
                className="flex items-start gap-2 rounded-md border border-dashed px-2.5 py-2 bg-muted/20"
                style={{
                  borderColor: hexToRgba(ELSE_HANDLE_COLOR, 0.4),
                  borderLeftWidth: '3px',
                  borderLeftColor: ELSE_HANDLE_COLOR
                }}
              >
                <div className="flex items-center gap-1.5 min-w-0 flex-1">
                  <span className="text-[9px] opacity-60">↳</span>
                  <div className="min-w-0 flex-1">
                    <p className="text-[10.5px] font-medium text-muted-foreground">
                      Else (fallback)
                    </p>
                    <p className="text-[10px] text-muted-foreground/70 italic">
                      Catches all unmatched cases
                    </p>
                  </div>
                </div>
                <ArrowRight className="w-3 h-3 text-muted-foreground/40 flex-shrink-0 mt-0.5" />
              </div>
            </div>
          </div>
        )}

        {/* Phase 1: Preview/Output Display - Kadabra-style results - Auto-expanded, click badge to toggle */}
        {nodeData.preview && isPreviewExpanded && (
          <div className="mt-3 rounded-lg border border-border/60 bg-muted/30 overflow-hidden">
            {nodeData.preview.title && (
              <div className="px-3 py-2 border-b border-border/50 bg-muted/50">
                <p className="text-xs font-semibold text-foreground">{nodeData.preview.title}</p>
              </div>
            )}
            <div className="px-3 py-2.5">
              {Array.isArray(nodeData.preview.content) ? (
                <div className="space-y-1.5">
                  {nodeData.preview.content.map((line, index) => (
                    <div key={index} className="flex items-start gap-2">
                      <div className="w-1 h-1 rounded-full bg-muted-foreground/40 mt-1.5 flex-shrink-0" />
                      <p className="text-xs text-muted-foreground leading-relaxed flex-1">{line}</p>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground leading-relaxed">{nodeData.preview.content}</p>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Configuration section - Position absolutely when running to prevent layout shift */}
      {(showConfigSection || showConfigSkeleton) && (
        <div className={visualNodeState === 'running' && isConfigExpanded ? "relative px-3" : "px-3 pb-3 space-y-3"}>
          <div className={`rounded-xl border border-border/60 bg-background/70 shadow-sm ${
            visualNodeState === 'running' && isConfigExpanded
              ? 'absolute top-0 left-3 right-3 z-50 shadow-xl'
              : ''
          }`}>
            <div className="flex items-center justify-between gap-2 px-3 py-2 border-b border-border/50">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  {isTrigger ? 'Trigger Conditions' : 'Auto-configured fields'}
                </p>
                <p className="text-[11px] text-muted-foreground/80">
                  {isTrigger
                    ? 'This workflow runs when these conditions match'
                    : 'Populated live while the agent configures this node.'}
                </p>
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-muted-foreground hover:text-foreground"
                onClick={(e) => {
                  e.stopPropagation()
                  setIsConfigExpanded(prev => !prev)
                }}
              >
                {isConfigExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              </Button>
            </div>

            {showConfigSkeleton && displayConfigEntries.length === 0 ? (
              <div className="px-3 py-4 space-y-3">
                {Array.from({ length: 3 }).map((_, index) => (
                  <div key={`config-skeleton-${index}`} className="space-y-2">
                    <div className="h-3 w-24 bg-muted rounded animate-pulse" style={{ animationDelay: `${index * 60}ms` }} />
                    <div className="h-8 w-full bg-muted/60 rounded-md animate-pulse" style={{ animationDelay: `${index * 60 + 40}ms` }} />
                  </div>
                ))}
              </div>
            ) : (
              <div className="divide-y divide-border/60">
                {isSlackSendMessage ? (
                  <SlackAutoConfigSummary
                    sections={SLACK_CONFIG_SECTIONS}
                    sectionsState={slackSectionsOpen}
                    onToggleSection={handleToggleSlackSection}
                    configValues={config || {}}
                    configEntryMap={configEntryMap}
                    configDisplayOverrides={configDisplayOverrides}
                    testData={testData || {}}
                    fallbackFields={fallbackFields}
                    progressFallbackKeys={progressFallbackKeys}
                    formatDisplayValue={formatDisplayValue}
                    hasRenderableValue={hasRenderableValue}
                    renderLabel={renderLabelWithTooltip}
                    onFieldClick={handleFieldFocusRequest}
                  />
                ) : compactConfigEntries.length === 0 && isTrigger && !showConfigSkeleton ? (
                  // Empty state for triggers with no filters configured
                  <div className="px-3 py-4">
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <div className="flex-shrink-0">⚡</div>
                      <div>
                        <p className="text-xs font-medium">Triggers on ALL events</p>
                        <p className="text-xs text-muted-foreground/80 mt-0.5">No filters configured - workflow runs for every new item</p>
                      </div>
                    </div>
                  </div>
                ) : (
                  compactConfigEntries.map(([key, value], index) => {
                    const liveValue = (testData || {})[key]
                    const hasLiveValue = hasRenderableValue(liveValue)
                    const configuredDisplay = configDisplayOverrides.get(key)
                    const formattedConfigValue = configuredDisplay ?? formatDisplayValue(value, key)
                    const hasConfiguredValue = configuredDisplay !== undefined
                      ? configuredDisplay.trim().length > 0
                      : hasRenderableValue(value)
                    const isFallback = fallbackFields.includes(key) || progressFallbackKeys.has(key)
                    const isConfiguringPhase = ['preparing', 'creating', 'configuring'].includes(aiStatus || '')
                    const animationDelay = `${index * 45}ms`
                    const rowAnimationStyle: React.CSSProperties | undefined = isAIActive && isConfiguringPhase
                      ? {
                          animationName: 'fadeInUp',
                          animationDuration: '0.3s',
                          animationTimingFunction: 'ease-out',
                          animationFillMode: 'forwards',
                          animationDelay
                        }
                      : undefined

                    const labelContent = renderLabelWithTooltip(key)
                    const rowClasses = cn(
                      "grid grid-cols-[120px_1fr] items-start gap-3 px-3 py-3 text-xs transition-all duration-300 rounded-lg",
                      onConfigure && "cursor-pointer hover:bg-muted/60",
                      isFallback && 'bg-amber-50/40'
                    )

                    return (
                      <div
                        key={key}
                        className={rowClasses}
                        style={rowAnimationStyle}
                        data-node-field={key}
                        role={onConfigure ? 'button' : undefined}
                        tabIndex={onConfigure ? 0 : undefined}
                        onClick={(event) => {
                          event.stopPropagation()
                          handleFieldFocusRequest(key)
                        }}
                        onKeyDown={(event) => {
                          if (!onConfigure) return
                          if (event.key === 'Enter' || event.key === ' ') {
                            event.preventDefault()
                            handleFieldFocusRequest(key)
                          }
                        }}
                      >
                        <div className={`font-semibold uppercase tracking-wide ${isFallback ? 'text-amber-600' : 'text-muted-foreground'}`}>
                          {labelContent}
                        </div>
                        <div className="space-y-1">
                          <div
                            className={cn(
                              'rounded-md border px-3 py-1.5 bg-white/80 shadow-sm text-foreground min-h-[32px]',
                              isFallback ? 'border-amber-300 bg-amber-50/40 text-amber-800' : 'border-border'
                            )}
                          >
                            {hasConfiguredValue ? (
                              <span className="leading-relaxed break-words break-all whitespace-pre-wrap block">{formattedConfigValue}</span>
                            ) : (
                              <span className="flex items-center gap-1 text-muted-foreground"><Loader2 className="h-3 w-3 animate-spin" /> Filling…</span>
                            )}
                          </div>
                          {hasLiveValue && (
                            <div className="flex items-center gap-1 text-[11px] font-medium text-emerald-600">
                              <CheckCircle2 className="h-3 w-3" />
                              <span className="break-words break-all whitespace-pre-wrap">{formatDisplayValue(liveValue, key)}</span>
                            </div>
                          )}
                        </div>
                      </div>
                    )
                  })
                )}
              </div>
            )}

            {!isSlackSendMessage && extraConfigCount > 0 && (
              <div className="px-3 py-2 text-[11px] text-muted-foreground/80">
                Showing {compactConfigEntries.length} of {displayConfigEntries.length} fields · <button className="underline" onClick={(e) => { e.stopPropagation(); setIsConfigExpanded(true) }} type="button">Show all</button>
              </div>
            )}
            {fallbackFields.length > 0 && (
              <div className="px-3 pb-3 text-[11px] text-amber-600">
                Highlighted fields were auto-filled and may require edits to fit your workflow.
              </div>
            )}
          </div>

        {showTestingSection && (
          <div className="rounded-xl border border-emerald-200 bg-emerald-50/50 shadow-inner">
            <div className="flex items-center justify-between px-3 py-2 border-b border-emerald-200/80">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wide text-emerald-700">Live sample data</p>
                <p className="text-[11px] text-emerald-700/80">Captured during the latest test run.</p>
              </div>
              <TestTube className="h-4 w-4 text-emerald-600" />
            </div>
            {showTestingSkeleton ? (
              <div className="px-3 py-4 space-y-2">
                {Array.from({ length: 2 }).map((_, index) => (
                  <div key={`test-skeleton-${index}`} className="h-8 w-full bg-emerald-100/70 rounded-md animate-pulse" style={{ animationDelay: `${index * 70}ms` }} />
                ))}
              </div>
            ) : (
              <div className="divide-y divide-emerald-200/70">
                {testDataEntries.map(([key, value]) => {
                  const sampleDisplay = formatDisplayValue(value, key)
                  return (
                    <div key={key} className="grid grid-cols-[120px_1fr] gap-3 px-3 py-3 text-xs">
                      <div className="font-semibold uppercase tracking-wide text-emerald-700">{getFieldLabel(key)}</div>
                      <div className="flex items-start gap-1 text-emerald-800">
                        <CheckCircle2 className="h-3 w-3 mt-0.5" />
                        <span
                          className="leading-relaxed truncate block max-w-full"
                          title={sampleDisplay}
                        >
                          {sampleDisplay}
                        </span>
                      </div>
                    </div>
                  )
                })}
                {testDataEntries.length === 0 && (
                  <div className="px-3 py-4 text-xs text-emerald-700/70">No sample data returned yet.</div>
                )}
              </div>
            )}
          </div>
        )}

        {aiTestSummary && (
          <div className={cn('rounded-xl border px-3 py-3 text-xs leading-relaxed', summaryClasses)}>
            {aiTestSummary}
          </div>
        )}
        </div>
      )}

      {/* CSS for field animations */}
      <style jsx>{`
        @keyframes fadeInUp {
          from {
            opacity: 0;
            transform: translateY(10px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
      `}</style>

      {/* AI Agent instruction input field */}
      {type === 'ai_agent' && (
        <div className="border-t border-border px-3 py-2 bg-muted/30 hover:bg-muted/50 transition-colors">
          <div className="flex items-start gap-2">
            <div className="flex-shrink-0 mt-1">
              <Sparkles className="w-4 h-4 text-primary" />
            </div>
            <input
              type="text"
              placeholder="Tell AI what to change on this node..."
              className="flex-1 text-sm bg-transparent border-none outline-none text-muted-foreground placeholder:text-muted-foreground/60 focus:text-foreground transition-colors noDrag noPan"
              onClick={(e) => e.stopPropagation()}
              onMouseDown={(e) => e.stopPropagation()}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  // TODO: Handle AI instruction submission
                  const input = e.currentTarget
                  console.log('AI instruction:', input.value)
                  // Clear input after submission
                  input.value = ''
                }
              }}
            />
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="flex-shrink-0 mt-1 cursor-help">
                    <svg className="w-4 h-4 text-muted-foreground hover:text-foreground transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </div>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="max-w-xs">
                  <p className="font-semibold mb-1">AI-Powered Configuration</p>
                  <p className="text-xs">Type instructions in plain English to configure this AI Agent. Examples:</p>
                  <ul className="text-xs mt-1 space-y-0.5 list-disc list-inside">
                    <li>"Summarize customer feedback in 2 sentences"</li>
                    <li>"Extract email addresses from this text"</li>
                    <li>"Translate to Spanish"</li>
                  </ul>
                  <p className="text-xs mt-1 italic">Press Enter to apply changes</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
        </div>
      )}

      {/* Centered Add Action button for chain placeholders - matching AI Agent builder design */}
      {type === 'chain_placeholder' && (hasAddButton || isPlaceholder) && onAddAction && (
        <div className="px-4 pb-4 flex justify-center">
          <Button
            variant="outline"
            size="sm"
            onClick={(e) => {
              e.stopPropagation()
              if (onAddAction) {
                onAddAction()
              } else {
                // Fallback: simulate clicking on the placeholder node itself
                // This should trigger the handleAddActionClick with the placeholder's ID
                logger.warn('Chain placeholder missing onAddAction callback, using fallback')
                // Find the workflow builder's handleAddActionClick function
                const event = new CustomEvent('chain-placeholder-add-action', {
                  detail: { nodeId: id, parentId: id }
                })
                window.dispatchEvent(event)
              }
            }}
            className="gap-2 w-full max-w-[200px]"
          >
            <Plus className="w-4 h-4" />
            Add Action
          </Button>
        </div>
      )}

      {/* Input handle - Half-moon on top (receives from above) - Make.com style */}
      {!isTrigger && (
        <Handle
          id="target"
          type="target"
          position={Position.Top}
          className="!w-10 !h-[18px] !rounded-b-full !rounded-t-none !transition-all !duration-200"
          style={{
            visibility: data.isTrigger ? "hidden" : "visible",
            left: "50%",
            top: "0px",
            transform: "translateX(-50%)",
            zIndex: 5,
            background: 'transparent',
            border: 'none',
            boxShadow: 'none',
            opacity: 0,
            pointerEvents: 'none',
          }}
        />
      )}
    </div>
    {/* End of main node div */}

    {/* Output handle(s) - Rendered outside node container to prevent clipping by overflow-hidden */}
    {renderOutputHandles()}

    {/* Add Path button for Path Router nodes */}
    {renderPathRouterAddButton()}

    </div>
    {/* End of wrapper div */}
    </NodeContextMenu>
  )
}

export default memo(CustomNode)

type SlackAutoConfigSummaryProps = {
  sections: SlackConfigSection[]
  sectionsState: Record<string, boolean>
  onToggleSection: (sectionKey: string) => void
  configValues: Record<string, any>
  configEntryMap: Record<string, any>
  configDisplayOverrides: Map<string, string>
  testData: Record<string, any>
  fallbackFields: string[]
  progressFallbackKeys: Set<string>
  formatDisplayValue: (value: any, fieldKey?: string) => string
  hasRenderableValue: (value: any) => boolean
  renderLabel: (fieldName: string) => React.ReactNode
  onFieldClick: (fieldKey: string) => void
}

function SlackAutoConfigSummary({
  sections,
  sectionsState,
  onToggleSection,
  configValues,
  configEntryMap,
  configDisplayOverrides,
  testData,
  fallbackFields,
  progressFallbackKeys,
  formatDisplayValue,
  hasRenderableValue,
  renderLabel,
  onFieldClick
}: SlackAutoConfigSummaryProps) {
  const renderFieldRow = (fieldKey: string) => {
    const configuredDisplay = configDisplayOverrides.get(fieldKey)
    const resolvedValue = configuredDisplay ?? configEntryMap[fieldKey] ?? configValues[fieldKey]

    // Filter out empty/AI placeholder values (same logic as displayConfigEntries)
    const shouldHideField = () => {
      // Hide empty/default values
      if (!resolvedValue || resolvedValue === '' || resolvedValue === 'any') return true
      if (Array.isArray(resolvedValue) && resolvedValue.length === 0) return true
      if (typeof resolvedValue === 'object' && Object.keys(resolvedValue).length === 0) return true

      // Hide boolean fields in optional sections (defaults like unfurlLinks: true)
      if (typeof resolvedValue === 'boolean') return true

      // Hide AI placeholder/suggestion values
      if (typeof resolvedValue === 'string') {
        const valueLower = resolvedValue.toLowerCase()
        if (valueLower.startsWith('ai suggestion')) return true
        if (valueLower.startsWith('ai draft')) return true
        if (valueLower.includes('automatically generated')) return true
        if (valueLower.includes('optional) for this workflow')) return true
        if (valueLower === 'placeholder') return true
        if (valueLower === 'auto-generated') return true
        if (valueLower.includes('{{ai_field:')) return true
        // Hide 'simple' default value for messageType
        if (fieldKey === 'messageType' && valueLower === 'simple') return true
      }

      return false
    }

    // Don't render if field should be hidden
    if (shouldHideField()) return null

    const hasConfiguredValue = configuredDisplay !== undefined
      ? configuredDisplay.trim().length > 0
      : hasRenderableValue(resolvedValue)
    const formattedConfigValue = configuredDisplay ?? formatDisplayValue(resolvedValue, fieldKey)
    const liveValue = testData?.[fieldKey]
    const hasLiveValue = hasRenderableValue(liveValue)
    const isFallback = fallbackFields.includes(fieldKey) || progressFallbackKeys.has(fieldKey)

    return (
      <div
        key={fieldKey}
        className={cn(
          "grid grid-cols-[140px_1fr] gap-3 px-3 py-3 text-xs rounded-lg",
          "cursor-pointer hover:bg-muted/60",
          isFallback && 'bg-amber-50/40'
        )}
        data-node-field={fieldKey}
        role="button"
        tabIndex={0}
        onClick={(event) => {
          event.stopPropagation()
          onFieldClick(fieldKey)
        }}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault()
            onFieldClick(fieldKey)
          }
        }}
      >
        <div className={`font-semibold uppercase tracking-wide ${isFallback ? 'text-amber-600' : 'text-muted-foreground'}`}>
          {renderLabel(fieldKey)}
        </div>
        <div className="space-y-1">
          <div
            className={cn(
              'rounded-md border px-3 py-1.5 bg-white/80 shadow-sm text-foreground min-h-[32px]',
              isFallback ? 'border-amber-300 bg-amber-50/40 text-amber-800' : 'border-border'
            )}
          >
            {hasConfiguredValue ? (
              <span className="leading-relaxed break-words whitespace-pre-wrap block">{formattedConfigValue}</span>
            ) : (
              <span className="text-muted-foreground">Not configured yet</span>
            )}
          </div>
          {hasLiveValue && (
            <div className="flex items-center gap-1 text-[11px] font-medium text-emerald-600">
              <CheckCircle2 className="h-3 w-3" />
              <span className="break-words">{formatDisplayValue(liveValue, fieldKey)}</span>
            </div>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="divide-y divide-border/60">
      {sections.map((section) => {
        const isOpen = sectionsState[section.key] ?? section.defaultOpen

        // Filter out null fields (hidden fields)
        const visibleFields = section.fields.filter(fieldKey => {
          const configuredDisplay = configDisplayOverrides.get(fieldKey)
          const resolvedValue = configuredDisplay ?? configEntryMap[fieldKey] ?? configValues[fieldKey]

          // Use same filtering logic
          if (!resolvedValue || resolvedValue === '' || resolvedValue === 'any') return false
          if (Array.isArray(resolvedValue) && resolvedValue.length === 0) return false
          if (typeof resolvedValue === 'object' && Object.keys(resolvedValue).length === 0) return false

          // Hide boolean fields (they're usually defaults like unfurlLinks: true)
          // Only show booleans if they're in essential fields (not optional sections)
          if (typeof resolvedValue === 'boolean' && section.key !== 'basics') return false

          if (typeof resolvedValue === 'string') {
            const valueLower = resolvedValue.toLowerCase()
            if (valueLower.startsWith('ai suggestion')) return false
            if (valueLower.startsWith('ai draft')) return false
            if (valueLower.includes('automatically generated')) return false
            if (valueLower.includes('optional) for this workflow')) return false
            if (valueLower === 'placeholder') return false
            if (valueLower === 'auto-generated') return false
            if (valueLower.includes('{{ai_field:')) return false
            // Hide 'simple' default value for messageType
            if (fieldKey === 'messageType' && valueLower === 'simple') return false
          }

          return true
        })

        // Hide section if no visible fields
        if (visibleFields.length === 0) return null

        return (
          <div key={section.key}>
            <div className="flex items-center justify-between gap-2 px-3 py-2 bg-muted/40">
              <div className="flex items-center gap-2">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{section.title}</p>
                {section.tooltip && (
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Info className="h-3.5 w-3.5 text-muted-foreground cursor-help" />
                      </TooltipTrigger>
                      <TooltipContent side="top" className="max-w-xs text-[11px] leading-relaxed">
                        {section.tooltip}
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                )}
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6 text-muted-foreground hover:text-foreground"
                onClick={(e) => {
                  e.stopPropagation()
                  onToggleSection(section.key)
                }}
              >
                {isOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              </Button>
            </div>
            {isOpen && (
              <div className="border-t border-border/60">
                {visibleFields.map(fieldKey => renderFieldRow(fieldKey))}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
