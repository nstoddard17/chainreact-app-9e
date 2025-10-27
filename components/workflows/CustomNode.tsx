"use client"

import React, { memo, useState, useRef, useEffect, useMemo, useCallback } from "react"
import { Handle, Position, type NodeProps, useUpdateNodeInternals, useReactFlow } from "@xyflow/react"
import { ALL_NODE_COMPONENTS } from "@/lib/workflows/nodes"
import { Trash2, TestTube, Plus, Edit2, Layers, Unplug, Sparkles, ChevronDown, ChevronUp, Loader2, CheckCircle2, AlertTriangle, Info } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { useWorkflowTestStore } from "@/stores/workflowTestStore"
import { useIntegrationStore } from "@/stores/integrationStore"
import { NodeContextMenu } from "./NodeContextMenu"

import { logger } from '@/lib/utils/logger'
import { getIntegrationLogoClasses } from "@/lib/integrations/logoStyles"
import { cn } from "@/lib/utils"

// The data object passed to the node will now contain these callbacks.
type ConfigureOptions = {
  focusField?: string
}

interface CustomNodeData {
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
  parentChainIndex?: number
  isAIAgentChild?: boolean
  parentAIAgentId?: string
  needsSetup?: boolean
  aiStatus?: 'creating' | 'configuring' | 'configured' | 'testing' | 'ready' | 'error' | string
  aiBadgeText?: string
  aiBadgeVariant?: 'success' | 'warning' | 'info' | 'danger' | 'default' | string
  aiTestSummary?: string | null
  autoExpand?: boolean
  aiFallbackFields?: string[]
  aiProgressConfig?: {
    key: string
    value: any
    displayValue?: string
    viaFallback?: boolean
  }[]
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
  },
  {
    key: 'status',
    title: 'Status Card (optional)',
    tooltip: 'Add a colored status block for release or incident updates.',
    defaultOpen: false,
    fields: ['statusTitle', 'statusMessage', 'statusColor', 'statusFields']
  },
  {
    key: 'approval',
    title: 'Approval Card (optional)',
    tooltip: 'Adds Approve/Deny buttons and routes decisions back into the workflow.',
    defaultOpen: false,
    fields: ['messageType', 'approvalTitle', 'approvalDescription', 'approvalApproveText', 'approvalDenyText']
  },
  {
    key: 'advanced',
    title: 'Delivery Options',
    tooltip: 'Threading, link previews, username/icon overrides, polls, and custom blocks.',
    defaultOpen: false,
    fields: ['threadTimestamp', 'linkNames', 'unfurlLinks', 'unfurlMedia', 'asUser', 'username', 'icon', 'buttonConfig', 'pollQuestion', 'pollOptions', 'customBlocks']
  }
]

const DEFAULT_SLACK_SECTION_STATE = SLACK_CONFIG_SECTIONS.reduce<Record<string, boolean>>((acc, section) => {
  acc[section.key] = section.defaultOpen
  return acc
}, {})

const INTERNAL_PROVIDER_IDS = new Set(['logic', 'core', 'manual', 'schedule', 'webhook', 'ai', 'utility'])

function CustomNode({ id, data, selected }: NodeProps) {
  const updateNodeInternalsHook = useUpdateNodeInternals?.()
  const reactFlowInstance = useReactFlow()
  const updateNodeInternals = typeof updateNodeInternalsHook === 'function'
    ? updateNodeInternalsHook
    : typeof reactFlowInstance?.updateNodeInternals === 'function'
      ? reactFlowInstance.updateNodeInternals
      : null
  const nodeData = data as CustomNodeData & { debugListeningMode?: boolean; debugExecutionStatus?: string }
  const [isEditingTitle, setIsEditingTitle] = useState(false)
  const [editedTitle, setEditedTitle] = useState("")
  const [isConfigExpanded, setIsConfigExpanded] = useState<boolean>(() => {
    // Auto-expand when configuring or if autoExpand is set
    return Boolean(nodeData.autoExpand) || nodeData.aiStatus === 'configuring'
  }) // Track if config section is expanded
  const [slackSectionsOpen, setSlackSectionsOpen] = useState<Record<string, boolean>>(DEFAULT_SLACK_SECTION_STATE)
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
  } = nodeData

  const component = ALL_NODE_COMPONENTS.find((c) => c.type === type)
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
      isConfigExpanded,
      configKeys: config ? Object.keys(config) : [],
      configValues: config,
      aiProgressConfig
    })

    if (!isConfigExpanded && (autoExpand || hasConfig || hasTestData || isActiveStatus)) {
      console.log('[CUSTOMNODE] 📈 Expanding node:', id)
      setIsConfigExpanded(true)
    }
  }, [autoExpand, config, testData, aiStatus, isConfigExpanded, aiProgressConfig, id, title])
  
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

    if (!executionStatus && !isListening) return ""

    switch (executionStatus) {
      case 'running':
        return "border-2 border-yellow-500 shadow-lg shadow-yellow-200"
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

    // Manual triggers don't show configuration button - they open trigger selection on double-click
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

  const handleDoubleClick = (e: React.MouseEvent) => {
    e.stopPropagation()
    console.log('🔍 [CustomNode] Double-click detected:', {
      nodeId: id,
      type,
      hasOnConfigure: !!onConfigure,
      nodeHasConfiguration: nodeHasConfiguration()
    })

    // Manual triggers open the trigger selection dialog on double-click
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
    return match?.label
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

    if (stringValue.includes('{{')) {
      const varMatch = stringValue.match(/\{\{([^}]+)\}\}/)
      if (varMatch) {
        return `📎 From ${varMatch[1]}`
      }
    }

    if (fieldKey) {
      const labelFromSchema = getSchemaOptionLabel(fieldKey, value)
      if (labelFromSchema) return labelFromSchema
      const labelFromSaved = getSavedOptionLabel(fieldKey, value)
      if (labelFromSaved) return labelFromSaved
    }

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
  const showConfigSection = hasConfigEntries || ['preparing', 'creating', 'configuring', 'configured', 'testing', 'testing_successful', 'ready'].includes(aiStatus || '')
  const displayConfigEntries = useMemo(() => {
    if (configEntries.length > 0) return configEntries
    if (progressConfigEntries.length > 0) {
      return progressConfigEntries.map(field => [field.key, field.value] as [string, any])
    }
    return [] as [string, any][]
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
        backgroundClass: 'bg-white',
        ringClass: selected ? 'ring-4 ring-red-200' : 'ring-4 ring-red-200'
      }
    }

    if (error) {
      return { borderClass: 'border-destructive', shadowClass: '', backgroundClass: 'bg-card', ringClass: selected ? 'ring-4 ring-destructive/20' : '' }
    }

    if (hasValidationIssues) {
      return {
        borderClass: 'border-red-400',
        shadowClass: 'shadow-[0_0_0_2px_rgba(248,113,113,0.35)]',
        backgroundClass: 'bg-card',
        ringClass: selected ? 'ring-4 ring-red-200' : ''
      }
    }

    // Check AI status for active states (preparing, configuring, testing, ready, etc.)
    switch (aiStatus) {
      case 'preparing':
      case 'creating':
      case 'configuring':
      case 'configured':
        return {
          borderClass: 'border-sky-500',
          shadowClass: 'shadow-[0_0_0_3px_rgba(56,189,248,0.25)]',
          backgroundClass: 'bg-white',
          ringClass: selected ? 'ring-4 ring-sky-100' : 'ring-4 ring-sky-100'
        }
      case 'testing':
      case 'retesting':
        return {
          borderClass: 'border-amber-500',
          shadowClass: 'shadow-[0_0_0_3px_rgba(251,191,36,0.28)]',
          backgroundClass: 'bg-white',
          ringClass: selected ? 'ring-4 ring-amber-100' : 'ring-4 ring-amber-100'
        }
      case 'ready':
        // Show green border for successful/ready nodes, even when selected
        return {
          borderClass: 'border-emerald-500',
          shadowClass: 'shadow-[0_0_0_3px_rgba(16,185,129,0.28)]',
          backgroundClass: 'bg-white',
          ringClass: selected ? 'ring-4 ring-emerald-100' : 'ring-4 ring-emerald-100'
        }
      case 'error':
        return {
          borderClass: 'border-red-500',
          shadowClass: 'shadow-[0_0_0_3px_rgba(239,68,68,0.28)]',
          backgroundClass: 'bg-white',
          ringClass: selected ? 'ring-4 ring-red-100' : 'ring-4 ring-red-100'
        }
      default:
        // Default state - use primary border when selected, border when not
        if (selected) {
          return { borderClass: 'border-primary', shadowClass: '', backgroundClass: 'bg-white', ringClass: 'ring-4 ring-primary/20' }
        }
        return {
          borderClass: 'border-border',
          shadowClass: '',
          backgroundClass: 'bg-card',
          ringClass: ''
        }
    }
  }, [aiStatus, selected, isIntegrationDisconnected, error, hasValidationIssues])

  const { borderClass, shadowClass, backgroundClass, ringClass } = aiOutline

  const idleStatus = React.useMemo(() => {
    if (aiStatus === 'ready' || aiStatus === 'complete') {
      return { text: 'Successful', tone: 'success' as const }
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
  }, [aiStatus, executionStatus])

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
    console.log('[CUSTOMNODE STATUS]', {
      nodeId: id,
      aiStatus,
      aiBadgeText,
      aiBadgeVariant,
      executionStatus,
      needsSetup,
      fallbackFields
    })
  }, [id, aiStatus, aiBadgeText, aiBadgeVariant, executionStatus, needsSetup, fallbackFields])

  return (
    <NodeContextMenu
      nodeId={id}
      onTestNode={onTestNode}
      onTestFlowFromHere={onTestFlowFromHere}
      onFreeze={onFreeze}
      onStop={onStop}
      onDelete={onDelete}
    >
      <div
        className={`relative w-[450px] ${backgroundClass} rounded-lg shadow-sm border-2 group ${borderClass} ${shadowClass} ${ringClass} transition-all duration-200 overflow-hidden ${
          nodeHasConfiguration() ? "cursor-pointer" : ""
        } ${getExecutionStatusStyle()}`}
        data-testid={`node-${id}`}
        onDoubleClick={handleDoubleClick}
      >
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
      

      <div className="p-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-start space-x-2.5 flex-1 min-w-0">
            {type === 'chain_placeholder' ? (
              <Layers className="h-7 w-7 text-muted-foreground flex-shrink-0 mt-0.5" />
            ) : providerId ? (
              <img
                src={`/integrations/${providerId}.svg`}
                alt={`${title || ''} logo`}
                className={getIntegrationLogoClasses(providerId, "w-7 h-7 object-contain flex-shrink-0 mt-0.5")}
                onError={(e) => {
                  logger.error(`Failed to load logo for ${providerId} at path: /integrations/${providerId}.svg`)
                  // Fallback to icon if image fails
                  if (component?.icon) {
                    const parent = e.currentTarget.parentElement
                    if (parent) {
                      e.currentTarget.remove()
                      const iconElement = React.createElement(component.icon, { className: "h-8 w-8 text-foreground" })
                      // This won't work directly, but shows the intent
                    }
                  }
                }}
                onLoad={() => logger.debug(`Successfully loaded logo for ${providerId}`)}
              />
            ) : (
              component?.icon && React.createElement(component.icon, { className: "h-7 w-7 text-foreground flex-shrink-0 mt-0.5" })
            )}
            <div className="min-w-0 flex-1 pr-2">
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
                    <p className="text-sm text-muted-foreground leading-snug line-clamp-2">{description || (component && component.description)}</p>
                  )}
                </div>
              )}
            </div>
          </div>
          <div className="flex items-center space-x-0.5 flex-shrink-0">
            {/* Don't show delete button for chain placeholder nodes */}
            {type !== 'chain_placeholder' && (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={handleDelete}
                      className="h-7 w-7 text-muted-foreground hover:text-destructive flex-shrink-0"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="top">Delete {title}</TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}
          </div>
        </div>
        {/* Node note - explanatory text for AI-inserted nodes */}
        {note && (
          <div className="mt-3 flex items-start gap-2 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2">
            <Info className="w-3.5 h-3.5 text-blue-600 flex-shrink-0 mt-0.5" />
            <p className="text-xs text-blue-700 leading-relaxed whitespace-pre-wrap">{note}</p>
          </div>
        )}
      </div>

      <div className="px-3 pb-3 space-y-3">
        {(showConfigSection || showConfigSkeleton) && (
          <div className="rounded-xl border border-border/60 bg-background/70 shadow-sm">
            <div className="flex items-center justify-between gap-2 px-3 py-2 border-b border-border/50">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Auto-configured fields</p>
                <p className="text-[11px] text-muted-foreground/80">Populated live while the agent configures this node.</p>
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
        )}

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

      {/* Input handle - Half-moon on left side - Fixed to align with header center */}
      {!isTrigger && (
        <Handle
          type="target"
          position={Position.Left}
          className="!w-3 !h-6 !rounded-r-full !rounded-l-none !bg-border !border-2 !border-background !shadow-sm hover:!scale-110 !transition-transform"
          style={{
            visibility: data.isTrigger ? "hidden" : "visible",
            left: "0px",
            top: "40px",  // Fixed position to align with header/icon center
            transform: "none",
          }}
        />
      )}

      {/* Output handle - Half-moon on right side - ALWAYS show for all nodes - Fixed to align with header center */}
      <Handle
        type="source"
        position={Position.Right}
        className="!w-3 !h-6 !rounded-l-full !rounded-r-none !bg-border !border-2 !border-background !shadow-sm hover:!scale-110 !transition-transform"
        style={{
          right: "0px",
          top: "40px",  // Fixed position to align with header/icon center
          transform: "none",
        }}
      />
    </div>
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
                {section.fields.map(fieldKey => renderFieldRow(fieldKey))}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
