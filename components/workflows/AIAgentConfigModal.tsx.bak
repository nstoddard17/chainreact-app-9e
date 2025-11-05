"use client"

import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import {
  Dialog,
  DialogContent,
  DialogContentWithoutClose,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { Slider } from '@/components/ui/slider'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { Skeleton } from '@/components/ui/skeleton'
import { 
  Bot, Sparkles, Brain, Zap, Settings, Code, Eye, Search,
  DollarSign, Info, AlertCircle, CheckCircle, X, Plus,
  ChevronRight, ChevronDown, Variable, Lightbulb, Target,
  Wand2, BookOpen, MessageSquare, Gauge, Key, HelpCircle,
  ArrowRight, Save, Play, Database, Clock, Shield,
  Download, Copy, GraduationCap, ToggleLeft, ToggleRight,
  FileText, Palette, Lock, Unlock, RefreshCw, TrendingUp,
  Activity, Coins, Layers, Shuffle, Workflow, LinkIcon, Loader2
} from 'lucide-react'
import { LightningLoader } from '@/components/ui/lightning-loader'
import { useToast } from '@/hooks/use-toast'
import { AIVariablePanel } from './AIVariablePanel'
import { useAIVariables } from '@/hooks/useAIVariables'
import { cn } from '@/lib/utils'
import { loadNodeConfig, saveNodeConfig } from "@/lib/workflows/configPersistence"
import { useWorkflowTestStore } from "@/stores/workflowTestStore"
import { useIntegrationStore } from "@/stores/integrationStore"
import { motion, AnimatePresence } from 'framer-motion'
import AIAgentVisualChainBuilderWrapper from './AIAgentVisualChainBuilder'
import { ALL_NODE_COMPONENTS } from '@/lib/workflows/nodes'
import { INTEGRATION_CONFIGS } from '@/lib/integrations/availableIntegrations'
// ActionSelectionDialog removed - using IntegrationsSidePanel/inline action selection
import { useIntegrationSelection } from '@/hooks/workflows/useIntegrationSelection'
import { APIKeySelector, ModelSelector } from './APIKeySelector'

import { logger } from '@/lib/utils/logger'

interface AIAgentConfigModalProps {
  isOpen: boolean
  onClose: () => void
  onSave: (config: Record<string, any>) => void
  onUpdateConnections?: (sourceNodeId: string, targetNodeId: string) => void
  initialData?: Record<string, any>
  workflowData?: { nodes: any[], edges: any[] }
  currentNodeId?: string
  autoOpenActionSelector?: boolean
  // Action dialog props - passed from parent workflow builder
  showActionDialog?: boolean
  setShowActionDialog?: (show: boolean) => void
  selectedIntegration?: any
  setSelectedIntegration?: (integration: any) => void
  selectedAction?: any
  setSelectedAction?: (action: any) => void
  searchQuery?: string
  setSearchQuery?: (query: string) => void
  filterCategory?: string
  setFilterCategory?: (category: string) => void
  showConnectedOnly?: boolean
  setShowConnectedOnly?: (show: boolean) => void
  availableIntegrations?: any[]
  categories?: string[]
  renderLogo?: (id: string, name: string) => React.ReactNode
  isIntegrationConnected?: (id: string) => boolean
  comingSoonIntegrations?: Set<string>
  handleActionSelect?: (integration: any, action: any) => void
  filterIntegrations?: (integrations: any[], query: string, category: string, connected: boolean) => any[]
  getDisplayedActions?: (integration: any | null, query: string) => any[]
  handleActionDialogClose?: () => void
  loadingIntegrations?: boolean
  refreshIntegrations?: () => void
}

// Group models by recommendation
const MODEL_GROUPS = {
  recommended: [
    {
      id: 'gpt-4o',
      name: 'GPT-4o',
      provider: 'OpenAI',
      badges: ['🚀 Latest', '🧠 Most Capable', '📚 128k Context'],
      description: 'Most advanced model for complex reasoning and analysis',
      costPer1k: { input: 0.005, output: 0.015 },
      contextWindow: 128000,
      latency: '~2-3s'
    },
    {
      id: 'gpt-4o-mini',
      name: 'GPT-4o Mini',
      provider: 'OpenAI',
      badges: ['⚖️ Balanced', '💰 Cost-Efficient', '📚 128k Context'],
      description: 'Great balance of capability and cost for most tasks',
      costPer1k: { input: 0.00015, output: 0.0006 },
      contextWindow: 128000,
      latency: '~1s'
    },
    {
      id: 'gpt-4-turbo',
      name: 'GPT-4 Turbo',
      provider: 'OpenAI',
      badges: ['⚡ Fast', '🧠 Smart', '📚 128k Context'],
      description: 'Previous generation, still very capable',
      costPer1k: { input: 0.01, output: 0.03 },
      contextWindow: 128000,
      latency: '~2s'
    },
    {
      id: 'claude-3-sonnet',
      name: 'Claude 3 Sonnet',
      provider: 'Anthropic',
      badges: ['⚖️ Balanced', '✍️ Creative', '📚 100k Context'],
      description: 'Great balance of speed and capability',
      costPer1k: { input: 0.003, output: 0.015 },
      contextWindow: 100000,
      latency: '~1.5s'
    }
  ],
  other: [
    {
      id: 'gpt-3.5-turbo',
      name: 'GPT-3.5 Turbo',
      provider: 'OpenAI',
      badges: ['💰 Budget', '⚡ Ultra-Fast'],
      description: 'Good for simple tasks and high volume',
      costPer1k: { input: 0.0005, output: 0.0015 },
      contextWindow: 16000,
      latency: '~0.5s'
    },
    {
      id: 'claude-3-opus',
      name: 'Claude 3 Opus',
      provider: 'Anthropic',
      badges: ['🎯 Most Capable', '📚 200k Context'],
      description: 'Top performance for complex analysis',
      costPer1k: { input: 0.015, output: 0.075 },
      contextWindow: 200000,
      latency: '~3s'
    },
    {
      id: 'gemini-pro',
      name: 'Gemini Pro',
      provider: 'Google',
      badges: ['🌐 Multimodal', '💰 Free Tier'],
      description: 'Supports images and has generous free tier',
      costPer1k: { input: 0.0005, output: 0.0015 },
      contextWindow: 32000,
      latency: '~1s'
    }
  ]
}

// Tone preview samples
const TONE_SAMPLES = {
  professional: {
    icon: '💼',
    sample: 'Thank you for your inquiry. I will process your request and provide a comprehensive response.',
    description: 'Formal and business-appropriate'
  },
  casual: {
    icon: '😊',
    sample: 'Hey there! Let me help you out with that.',
    description: 'Relaxed and friendly'
  },
  friendly: {
    icon: '👋',
    sample: 'Hi! I\'d be happy to help you with this.',
    description: 'Warm and approachable'
  },
  technical: {
    icon: '🔧',
    sample: 'Processing input parameters. Executing workflow automation sequence.',
    description: 'Precise and detailed'
  },
  conversational: {
    icon: '💬',
    sample: 'Great question! Let\'s work through this together.',
    description: 'Natural dialogue style'
  },
  formal: {
    icon: '🎩',
    sample: 'Dear User, I acknowledge receipt of your communication.',
    description: 'Very formal and traditional'
  }
}

// Quick start templates
const QUICK_START_TEMPLATES = [
  {
    id: 'email_reply',
    name: 'Email Auto-Reply',
    icon: '✉️',
    prompt: 'Analyze the email in [message] and generate a helpful, professional response. Address the main points and include {{AI:next_steps}} if needed.',
    model: 'gpt-4o',
    tone: 'professional'
  },
  {
    id: 'content_summary',
    name: 'Content Summarizer',
    icon: '📝',
    prompt: 'Review the content from {{trigger.data}} and {{AI:summarize}}. Extract key points and {{AI:assess_priority}}.',
    model: 'gpt-4o-mini',
    tone: 'technical'
  },
  {
    id: 'task_router',
    name: 'Task Router',
    icon: '🚦',
    prompt: 'Based on [message], determine the appropriate team/action and {{AI:categorize}}. Generate routing instructions.',
    model: 'gpt-4o-mini',
    tone: 'technical'
  }
]

export function AIAgentConfigModal({
  isOpen,
  onClose,
  onSave,
  onUpdateConnections,
  initialData,
  workflowData,
  currentNodeId,
  autoOpenActionSelector,
  // Action dialog props
  showActionDialog,
  setShowActionDialog,
  selectedIntegration,
  setSelectedIntegration,
  selectedAction,
  setSelectedAction,
  searchQuery,
  setSearchQuery,
  filterCategory,
  setFilterCategory,
  showConnectedOnly,
  setShowConnectedOnly,
  availableIntegrations,
  categories,
  renderLogo,
  isIntegrationConnected,
  comingSoonIntegrations,
  handleActionSelect,
  filterIntegrations,
  getDisplayedActions,
  handleActionDialogClose,
  loadingIntegrations,
  refreshIntegrations
}: AIAgentConfigModalProps) {
  const { toast } = useToast()
  const promptRef = useRef<HTMLTextAreaElement>(null)
  const nodes = workflowData?.nodes || []
  
  // Progressive disclosure state
  const [isAdvancedMode, setIsAdvancedMode] = useState(false)
  const [activeTab, setActiveTab] = useState('prompt')

  // Collapsible sections
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set())

  // Remount key for chain builder to force re-initialization on modal open
  const [chainBuilderKey, setChainBuilderKey] = useState(0)
  
  // Configuration state
  const [config, setConfig] = useState(() => {
    // Build initial config, making sure chains is properly initialized
    const baseConfig = {
      title: 'AI Agent',
      systemPrompt: '',
      model: 'gpt-4o-mini',
      selectedApiKeyId: '', // ID of the selected API key from user settings
      tone: 'professional',
      temperature: 0.7,
      maxTokens: 2000,
      outputFormat: 'text',
      includeContext: true,
      enableSafety: true,
      maxRetries: 3,
      timeout: 30000,
      targetActions: [] as string[],
      chains: [] as any[],
      chainsLayout: null as any // Add chainsLayout to store full layout data
    }
    
    // Merge with initial data if provided (for non-chain config like model, prompt, etc.)
    if (initialData) {
      Object.assign(baseConfig, initialData)
      // Ensure chains is always an array
      if (initialData.chains && !Array.isArray(initialData.chains)) {
        baseConfig.chains = []
      }
    }

    // ALWAYS prioritize workflowData if it contains chain nodes
    // This ensures changes made in the main workflow builder are reflected in the modal
    if (workflowData && workflowData.nodes && workflowData.nodes.length > 0) {
      // Check if this is just a trigger node (new AI Agent)
      const onlyHasTrigger = workflowData.nodes.length === 1 &&
                              (workflowData.nodes[0].data?.isTrigger ||
                               workflowData.nodes[0].id === 'trigger')

      if (!onlyHasTrigger) {
        logger.debug('🔄 [AIAgentConfigModal] Building chainsLayout from current workflow state:', workflowData)

        // Group nodes by chain index
        const chainGroups = new Map<number, any[]>()
        workflowData.nodes.forEach(node => {
          const chainIndex = node.data?.parentChainIndex ?? 0
          if (!chainGroups.has(chainIndex)) {
            chainGroups.set(chainIndex, [])
          }
          chainGroups.get(chainIndex)?.push(node)
        })

        // Create chains array from grouped nodes
        const chains = Array.from(chainGroups.entries()).map(([index, nodes]) => ({
          id: `chain-${index}`,
          name: `Chain ${index + 1}`,
          nodes: nodes.map(n => n.id)
        }))

        baseConfig.chains = chains
        baseConfig.chainsLayout = {
          chains,
          nodes: workflowData.nodes,
          edges: workflowData.edges,
          aiAgentPosition: { x: 400, y: 200 } // Default position for AI Agent in chain builder
        }

        logger.debug('🔄 [AIAgentConfigModal] Using current workflow state for chainsLayout')
      } else {
        logger.debug('🔄 [AIAgentConfigModal] New AI Agent with only trigger - skipping chainsLayout creation')
      }
    } else if (initialData?.chainsLayout) {
      // Only fallback to saved chainsLayout if workflowData is not available
      baseConfig.chainsLayout = initialData.chainsLayout
      logger.debug('🔄 [AIAgentConfigModal] Fallback: using saved chainsLayout from config')
    }

    return baseConfig
  })

  // UI state
  const [showModelDetails, setShowModelDetails] = useState(false)
  const [selectedTone, setSelectedTone] = useState(config.tone)
  const [isTestingPrompt, setIsTestingPrompt] = useState(false)
  const [isTestingModel, setIsTestingModel] = useState(false)
  const [isDiscovering, setIsDiscovering] = useState(false)
  
  // Action selector state - isAIMode defaults to true for AI Agent chains
  const [isAIMode, setIsAIMode] = useState(true)
  const [discoveredActions, setDiscoveredActions] = useState<any[]>([])
  const [testResults, setTestResults] = useState<any>(null)
  const [showVariablePanel, setShowVariablePanel] = useState(true)
  const [draggedVariable, setDraggedVariable] = useState<any>(null)
  const [estimatedCost, setEstimatedCost] = useState(0)
  const [estimatedLatency, setEstimatedLatency] = useState('~1s')
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [showWizard, setShowWizard] = useState(false)
  const pendingActionCallbackRef = useRef<any>(null)
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false)
  const [configuringNodeId, setConfiguringNodeId] = useState<string | null>(null)
  const [configuringNodeData, setConfiguringNodeData] = useState<any>(null)
  
  // Loading states
  const [isLoadingSavedConfig, setIsLoadingSavedConfig] = useState(false)
  const [isSaving, setIsSaving] = useState(false)

  // Calculate cost and latency dynamically
  useEffect(() => {
    const modelGroup = [...MODEL_GROUPS.recommended, ...MODEL_GROUPS.other]
    const model = modelGroup.find(m => m.id === config.model)
    if (model) {
      const avgTokens = config.maxTokens / 2
      const inputCost = (avgTokens / 1000) * model.costPer1k.input
      const outputCost = (avgTokens / 1000) * model.costPer1k.output
      setEstimatedCost(inputCost + outputCost)
      setEstimatedLatency(model.latency)
    }
  }, [config.model, config.maxTokens])
  
  // Load initial data when modal opens - but don't reset if we already have data
  useEffect(() => {
    // Only update config if this is the first time opening with new initialData
    // This prevents resetting chains when the modal is re-opened
    if (initialData && isOpen && !config.chains?.length && initialData.chains?.length) {
      setConfig(prev => ({
        ...prev,
        ...initialData,
        chains: initialData.chains || [],
        chainsLayout: initialData.chainsLayout || null
      }))
    }
  }, [initialData, isOpen])

  // Auto-open action selector when modal opens with the flag
  useEffect(() => {
    if (isOpen && autoOpenActionSelector && setShowActionDialog) {
      // Small delay to ensure modal is fully rendered
      setTimeout(() => {
        setShowActionDialog(true)
      }, 100)
    }
  }, [isOpen, autoOpenActionSelector, setShowActionDialog])

  // Auto-generate master prompt when chains change
  useEffect(() => {
    // Only auto-generate if chains exist and user hasn't manually edited the prompt
    if (config.chainsLayout?.chains && config.chainsLayout.chains.length > 0) {
      const autoGeneratedPrompt = generateMasterPromptFromChains(config.chainsLayout)
      // Only update if the prompt is empty or matches a previously auto-generated format
      // This prevents overwriting user's manual edits
      if (!config.systemPrompt || config.systemPrompt.includes('You are an intelligent AI agent that analyzes incoming workflow data')) {
        setConfig(prev => ({
          ...prev,
          systemPrompt: autoGeneratedPrompt,
          masterPrompt: autoGeneratedPrompt
        }))
      }
    }
  }, [config.chainsLayout])

  // Force chain builder to remount when modal opens to ensure fresh initialization
  useEffect(() => {
    if (isOpen) {
      setChainBuilderKey(prev => prev + 1)
    }
  }, [isOpen])

  // Note: Removed the useEffect that was overriding onActionSelect - it was causing issues with callback handling

  const toggleSection = (section: string) => {
    setExpandedSections(prev => {
      const newSet = new Set(prev)
      if (newSet.has(section)) {
        newSet.delete(section)
      } else {
        newSet.add(section)
      }
      return newSet
    })
  }

  const handleQuickTest = async (testType: 'prompt' | 'model' | 'full') => {
    const setLoading = testType === 'prompt' ? setIsTestingPrompt : setIsTestingModel
    setLoading(true)
    
    try {
      // Simulate test execution
      await new Promise(resolve => setTimeout(resolve, 1500))
      
      const mockResults = {
        prompt: {
          variables: ['[name]', '[email]', '{{trigger.data}}'],
          resolved: 'Hello John Doe, regarding your email...',
          tokens: 125
        },
        model: {
          response: 'Sample AI response based on your configuration',
          latency: estimatedLatency,
          cost: estimatedCost.toFixed(4)
        },
        full: {
          input: 'Test input data',
          output: 'Generated output',
          variables: ['[name]', '[email]'],
          cost: estimatedCost.toFixed(4),
          latency: estimatedLatency,
          tokens: { input: 100, output: 150 }
        }
      }
      
      setTestResults(mockResults[testType === 'full' ? 'full' : testType])
      
      toast({
        title: "Test Complete",
        description: `${testType} test executed successfully`
      })
    } catch (error) {
      toast({
        title: "Test Failed",
        description: "Could not complete test",
        variant: "destructive"
      })
    } finally {
      setLoading(false)
    }
  }

  const handleExportTestLog = () => {
    const log = {
      timestamp: new Date().toISOString(),
      config,
      testResults,
      variables: ['[name]', '[email]', '{{trigger.data}}'],
      estimatedCost,
      estimatedLatency
    }

    const blob = new Blob([JSON.stringify(log, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `ai-agent-test-${Date.now()}.json`
    a.click()
    URL.revokeObjectURL(url)

    toast({
      title: "Log Exported",
      description: "Test log downloaded successfully"
    })
  }

  /**
   * Auto-generate master prompt from chains
   * This creates a comprehensive prompt that explains what each chain does
   */
  const generateMasterPromptFromChains = (chainsLayout: any): string => {
    if (!chainsLayout?.chains || chainsLayout.chains.length === 0) {
      return "You are an AI agent that analyzes workflow data and determines the appropriate actions to take."
    }

    const chains = chainsLayout.chains || []
    const nodes = chainsLayout.nodes || []

    let prompt = "You are an intelligent AI agent that analyzes incoming workflow data and decides which action chains to execute.\n\n"
    prompt += "## Available Action Chains:\n\n"

    chains.forEach((chain: any, index: number) => {
      const chainNumber = index + 1
      const chainName = chain.name || `Chain ${chainNumber}`
      const chainDesc = chain.description || ""

      // Find nodes that belong to this chain
      // Note: nodes from visual builder have flat structure (parentChainIndex at top level, not in data)
      const chainNodes = nodes.filter((n: any) => {
        const chainIndex = n.parentChainIndex ?? n.data?.parentChainIndex
        return chainIndex === index
      })

      prompt += `### ${chainNumber}. ${chainName}\n`
      if (chainDesc) {
        prompt += `**Purpose:** ${chainDesc}\n`
      }

      // Describe the actions in this chain
      if (chainNodes.length > 0) {
        prompt += `**Actions:**\n`
        chainNodes.forEach((node: any, nodeIndex: number) => {
          // Handle both flat structure (from visual builder) and nested structure (from other sources)
          const nodeType = node.type || node.data?.type || 'unknown'
          const nodeTitle = node.title || node.data?.title || node.data?.nodeComponent?.title || nodeType

          // Get node description from ALL_NODE_COMPONENTS
          const nodeComponent = ALL_NODE_COMPONENTS.find(nc => nc.type === nodeType)
          const nodeDescription = nodeComponent?.description || ""

          prompt += `  ${nodeIndex + 1}. **${nodeTitle}**: ${nodeDescription}\n`
        })
      }

      // Add selection criteria if provided
      if (chain.conditions && chain.conditions.length > 0) {
        prompt += `**When to use:** When `
        const conditionStrings = chain.conditions.map((cond: any) =>
          `${cond.field} ${cond.operator} "${cond.value}"`
        )
        prompt += conditionStrings.join(" AND ")
        prompt += "\n"
      }

      prompt += "\n"
    })

    prompt += "## Your Task:\n\n"
    prompt += "1. Analyze the incoming trigger data and workflow context\n"
    prompt += "2. Determine which action chain(s) are most appropriate based on the data\n"
    prompt += "3. Select one or more chains that should be executed\n"
    prompt += "4. Provide clear reasoning for your selection\n\n"
    prompt += "**Important:** You can select multiple chains if the situation requires it. Be specific and confident in your decisions."

    return prompt
  }

  const handleTemplateSelect = (template: typeof QUICK_START_TEMPLATES[0]) => {
    setConfig(prev => ({
      ...prev,
      systemPrompt: template.prompt,
      model: template.model,
      tone: template.tone
    }))
    setShowWizard(false)
    toast({
      title: "Template Applied",
      description: `${template.name} template loaded`
    })
  }

  const handleSave = async () => {
    
    // Validation
    // In guided mode, the master prompt is optional (AI will auto-determine actions)
    // In advanced mode, we still allow empty prompt for automatic mode
    // So we removed the systemPrompt validation entirely

    // API key is now optional - will use platform key if not provided
    // This validation is removed to allow using platform API key by default

    setIsSaving(true)
    try {
      // Auto-generate master prompt from chains if not manually set
      const finalConfig = { ...config }
      if (config.chainsLayout?.chains && config.chainsLayout.chains.length > 0) {
        // Generate master prompt that describes all available chains
        const autoGeneratedPrompt = generateMasterPromptFromChains(config.chainsLayout)
        finalConfig.masterPrompt = autoGeneratedPrompt
        finalConfig.systemPrompt = autoGeneratedPrompt // Keep both for compatibility
      }

      await onSave(finalConfig)
      setHasUnsavedChanges(false)
      toast({
        title: "Configuration Saved",
        description: "AI Agent settings have been updated"
      })
      // Don't close immediately - let the parent handle closing after state update
    } catch (error) {
      logger.error('❌ [AIAgentConfigModal] Failed to save AI Agent configuration:', error)
      toast({
        title: "Save Failed",
        description: "Could not save configuration",
        variant: "destructive"
      })
    } finally {
      setIsSaving(false)
    }
  }

  // Handle action selection (node configuration)
  const handleConfigureNode = useCallback((nodeId: string) => {
    logger.debug('⚙️ [AIAgentConfigModal] Configure node requested:', nodeId)

    // Find the node data from the chains layout
    const nodeData = config.chainsLayout?.nodes?.find((n: any) => n.id === nodeId)

    if (nodeData) {
      logger.debug('⚙️ [AIAgentConfigModal] Found node data:', nodeData)
      setConfiguringNodeId(nodeId)
      setConfiguringNodeData(nodeData)
      // Configuration will be handled by showing the configuration form
    } else {
      logger.warn('⚙️ [AIAgentConfigModal] Node not found:', nodeId)
    }
  }, [config.chainsLayout])

  const handleActionSelection = (action: any) => {
    logger.debug('🎯 [AIAgentConfigModal] handleActionSelection called with action:', action)
    logger.debug('🎯 [AIAgentConfigModal] Action details:', {
      type: action.type,
      title: action.title,
      description: action.description,
      providerId: action.providerId,
      allFields: Object.keys(action)
    })
    logger.debug('🎯 [AIAgentConfigModal] pendingActionCallback status:', pendingActionCallbackRef.current ? 'EXISTS' : 'NULL')
    logger.debug('🎯 [AIAgentConfigModal] isAIMode:', isAIMode)
    if (isAIMode) {
      // In AI mode, add action with all fields set to AI
      const aiConfig: Record<string, any> = {}

      const collectAIPlaceholders = (schema: any[]) => {
        if (!Array.isArray(schema)) return

        schema.forEach(field => {
          if (!field || !field.name) return

          // Skip purely visual elements
          if (['label', 'separator', 'description'].includes(field.type)) return

          // Special handling for integrations that need manual selection

          // Discord: server and channel need manual selection
          if (action.providerId === 'discord') {
            // For all Discord actions, server needs manual selection
            if (field.name === 'guildId') {
              // Leave empty for manual configuration
              return
            }
            // For channel-based actions, channel also needs manual selection
            if (['discord_action_send_message', 'discord_action_edit_message',
                 'discord_action_delete_message', 'discord_action_fetch_messages'].includes(action.type)) {
              if (field.name === 'channelId') {
                // Leave empty for manual configuration
                return
              }
            }
            // For role/user actions, these also need manual selection
            if (action.type === 'discord_action_assign_role') {
              if (field.name === 'userId' || field.name === 'roleId') {
                // Leave empty for manual configuration
                return
              }
            }
          }

          // Microsoft Teams: team and channel need manual selection
          if (action.providerId === 'teams') {
            if (field.name === 'teamId' || field.name === 'channelId' || field.name === 'chatId') {
              // Leave empty for manual configuration
              return
            }
          }

          // Slack: channel can optionally be manual (keeping current dynamic behavior)
          // Not forcing manual selection as Slack's dynamic dropdowns work well

          // Trello: board and list need manual selection
          if (action.providerId === 'trello') {
            if (field.name === 'boardId' || field.name === 'listId' || field.name === 'cardId') {
              // Leave empty for manual configuration
              return
            }
          }

          // Notion: database and page need manual selection for complex workflows
          if (action.providerId === 'notion') {
            if (field.name === 'databaseId' || field.name === 'database' ||
                field.name === 'pageId' || field.name === 'page' ||
                field.name === 'parentPageId' || field.name === 'parentDatabase') {
              // Leave empty for manual configuration
              return
            }
          }

          // Google Calendar: calendar selection can be manual
          if (action.providerId === 'google-calendar' || action.providerId === 'google_calendar') {
            if (field.name === 'calendarId' || field.name === 'calendar') {
              // Leave empty for manual configuration
              return
            }
          }

          // OneDrive and Google Drive: folder selection can be manual
          if (action.providerId === 'onedrive' || action.providerId === 'google-drive' || action.providerId === 'google_drive') {
            if (field.name === 'folderId' || field.name === 'parentFolderId' || field.name === 'destinationFolderId') {
              // Leave empty for manual configuration
              return
            }
          }

          // OneNote: notebook and section need manual selection
          if (action.providerId === 'onenote' || action.providerId === 'microsoft-onenote') {
            if (field.name === 'notebookId' || field.name === 'sectionId' || field.name === 'pageId') {
              // Leave empty for manual configuration
              return
            }
          }

          aiConfig[field.name] = `{{AI_FIELD:${field.name}}}`
        })
      }

      if (Array.isArray(action.configSchema)) {
        collectAIPlaceholders(action.configSchema)
      } else if (Array.isArray(action.fields)) {
        collectAIPlaceholders(action.fields)
      }

      // Mark that AI auto configuration is expected when saving chain metadata
      aiConfig.__aiAutoConfig = true
      
      // Add to chain via callback for visual builder
      if (pendingActionCallbackRef.current) {
        logger.debug('📤 [AIAgentConfigModal] pendingActionCallback exists, type:', typeof pendingActionCallbackRef.current)
        // pendingActionCallbackRef.current is the callback itself
        const actualCallback = pendingActionCallbackRef.current
        logger.debug('📤 [AIAgentConfigModal] actualCallback:', actualCallback ? 'EXISTS' : 'NULL', typeof actualCallback)
        if (actualCallback) {
          // Pass the full action object along with config
          const configToPass = { ...aiConfig }
          logger.debug('📤 [AIAgentConfigModal] Calling callback with action:', action, 'config:', configToPass)
          // Pass the full action object, not just type and providerId
          actualCallback(action, configToPass)
        }
        pendingActionCallbackRef.current = null
        setHasUnsavedChanges(true)
      }
      
      // Also add to the main workflow immediately
      if (onAddActionToWorkflow) {
        const integrationInfo = availableIntegrations.find(i => i.id === (action.providerId || selectedActionIntegration?.id))
        onAddActionToWorkflow({
          ...action,
          integration: integrationInfo
        }, aiConfig)
      }
      
      // Close dialog
      if (setShowActionDialog) {
        setShowActionDialog(false)
      }

      // Special toast for Discord actions
      if (action.providerId === 'discord') {
        const needsManualConfig = []
        if (['discord_action_send_message', 'discord_action_edit_message',
             'discord_action_delete_message', 'discord_action_fetch_messages'].includes(action.type)) {
          needsManualConfig.push('server', 'channel')
        } else if (action.type === 'discord_action_assign_role') {
          needsManualConfig.push('server', 'user', 'role')
        } else {
          needsManualConfig.push('server')
        }

        toast({
          title: "Discord Action Added",
          description: `${action.title} added with AI configuration. Please manually configure: ${needsManualConfig.join(', ')}.`,
          duration: 5000
        })
      } else {
        toast({
          title: "Action Added",
          description: `${action.title} added with AI configuration and added to workflow`
        })
      }
    } else {
      // In Manual mode, we need to add the action and open config
      if (setShowActionDialog) {
        setShowActionDialog(false)
      }

      // Add to chain via callback for visual builder (manual mode)
      if (pendingActionCallbackRef.current) {
        logger.debug('📤 [AIAgentConfigModal] (manual) pendingActionCallback exists, getting actual callback')
        const actualCallback = pendingActionCallbackRef.current
        logger.debug('📤 [AIAgentConfigModal] (manual) actualCallback:', actualCallback ? 'EXISTS' : 'NULL')
        if (actualCallback) {
          const manualConfig = {}
          logger.debug('📤 [AIAgentConfigModal] Calling callback with (manual mode) action:', action, 'config:', manualConfig)
          // Pass the full action object, not just type and providerId
          actualCallback(action, manualConfig)
        }
        pendingActionCallbackRef.current = null
        setHasUnsavedChanges(true)
      }

      // Add to the main workflow with manual config flag
      if (onAddActionToWorkflow && availableIntegrations) {
        const integrationInfo = availableIntegrations.find(i => i.id === (action.providerId || selectedIntegration?.id))
        onAddActionToWorkflow({
          ...action,
          integration: integrationInfo,
          needsConfiguration: true
        }, {})
      }

      toast({
        title: "Manual Configuration",
        description: "Configure the action in the workflow builder"
      })
    }
  }

  // Tabs configuration based on mode
  const tabs = isAdvancedMode 
    ? ['prompt', 'model', 'behavior', 'preview']
    : ['prompt', 'model', 'preview']

  const tabLabels: Record<string, string> = {
    prompt: 'Prompt',
    model: 'Model',
    behavior: 'Behavior',
    preview: 'Preview'
  }

  return (
    <TooltipProvider>
      <Dialog open={isOpen} onOpenChange={onClose}>
        <DialogContentWithoutClose className="max-w-[1400px] w-[95vw] h-[95vh] p-0 overflow-hidden">
          <div className="flex h-full max-h-[95vh]">
            {/* Main Content */}
            <div className="flex-1 flex flex-col overflow-hidden min-h-0">
            {/* Header with mode toggle */}
            <DialogHeader className="px-6 py-4 border-b bg-gradient-to-r from-blue-500/10 to-purple-500/10">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-gradient-to-br from-blue-500 to-purple-500 rounded-lg">
                    <Bot className="w-5 h-5 text-white" />
                  </div>
                  <div>
                    <DialogTitle className="text-lg font-semibold">Configure AI Agent</DialogTitle>
                    <DialogDescription className="text-sm">
                      {isAdvancedMode ? 'Advanced Configuration' : 'Guided Setup'} Mode
                    </DialogDescription>
                  </div>
                </div>
                
                <div className="flex items-center gap-4">
                  {/* Variables Toggle Button */}
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setShowVariablePanel(!showVariablePanel)}
                    className="gap-2"
                  >
                    <Variable className="w-4 h-4" />
                    {showVariablePanel ? 'Hide' : 'Show'} Variables
                  </Button>

                  {/* Status Pills */}
                  <div className="flex gap-2">
                    <Badge variant="outline" className="text-xs">
                      {MODEL_GROUPS.recommended.find(m => m.id === config.model)?.name || 
                       MODEL_GROUPS.other.find(m => m.id === config.model)?.name}
                    </Badge>
                    <Badge variant="outline" className="text-xs">
                      {config.selectedApiKeyId ? '🔑 Your API Key' : '⚡ Platform API'}
                    </Badge>
                    <Badge variant="outline" className="text-xs">
                      {TONE_SAMPLES[config.tone]?.icon} {config.tone}
                    </Badge>
                  </div>

                  {/* Mode Toggle */}
                  <div className="flex items-center gap-2">
                    <Label htmlFor="mode-toggle" className="text-sm">
                      {isAdvancedMode ? 'Advanced' : 'Guided'}
                    </Label>
                    <Switch
                      id="mode-toggle"
                      checked={isAdvancedMode}
                      onCheckedChange={setIsAdvancedMode}
                    />
                  </div>

                  {/* Close Button */}
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={onClose}
                    className="h-8 w-8 p-0 hover:bg-red-50 hover:text-red-600 rounded-full transition-all duration-200 group"
                  >
                    <X className="w-4 h-4 transition-transform duration-200 group-hover:scale-110" />
                  </Button>
                </div>
              </div>
            </DialogHeader>

            {/* Quick Start Wizard */}
            {showWizard && (
              <Alert className="mx-6 mt-4">
                <GraduationCap className="w-4 h-4" />
                <AlertTitle>Quick Start</AlertTitle>
                <AlertDescription>
                  <div className="mt-2 flex gap-2">
                    {QUICK_START_TEMPLATES.map(template => (
                      <Button
                        key={template.id}
                        variant="outline"
                        size="sm"
                        onClick={() => handleTemplateSelect(template)}
                        className="gap-2"
                      >
                        <span>{template.icon}</span>
                        {template.name}
                      </Button>
                    ))}
                  </div>
                </AlertDescription>
              </Alert>
            )}

            {/* Tabs */}
            <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col min-h-0">
              <TabsList className="mx-6 mt-4 grid w-fit" style={{ gridTemplateColumns: `repeat(${tabs.length}, 1fr)` }}>
                {tabs.map(tab => (
                  <TabsTrigger key={tab} value={tab} className="gap-2">
                    {tab === 'prompt' && <MessageSquare className="w-4 h-4" />}
                    {tab === 'model' && <Brain className="w-4 h-4" />}
                    {tab === 'behavior' && <Palette className="w-4 h-4" />}
                    {tab === 'actions' && <Target className="w-4 h-4" />}
                    {tab === 'preview' && <Eye className="w-4 h-4" />}
                    {tabLabels[tab]}
                    {/* Quick Test indicator */}
                    {(tab === 'prompt' && isTestingPrompt) ||
                     (tab === 'model' && isTestingModel) ? (
                      <LightningLoader size="sm" />
                    ) : null}
                  </TabsTrigger>
                ))}
              </TabsList>

              <div className="flex-1 min-h-0 overflow-hidden">
                {/* Prompt Tab */}
                <TabsContent value="prompt" className="h-full mt-0" forceMount hidden={activeTab !== 'prompt'}>
                  <ScrollArea className="h-[calc(95vh-260px)]">  {/* Adjust height based on header and footer */}
                    <div className="px-6 py-4 space-y-4">
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <h3 className="text-lg font-semibold">AI Task Configuration</h3>
                      <p className="text-sm text-muted-foreground">
                        Tell the AI what to do - we handle the workflow complexity
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setShowWizard(!showWizard)}
                      >
                        <Wand2 className="w-4 h-4 mr-2" />
                        Templates
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleQuickTest('prompt')}
                        disabled={isTestingPrompt}
                      >
                        {isTestingPrompt ? (
                          <LightningLoader size="sm" className="mr-2" />
                        ) : (
                          <Play className="w-4 h-4 mr-2" />
                        )}
                        Quick Test
                      </Button>
                    </div>
                  </div>

                  {/* System Prompt Info */}
                  <Alert className="mb-4">
                    <Info className="h-4 w-4" />
                    <AlertTitle>AI Agent - Automatic Mode</AlertTitle>
                    <AlertDescription>
                      {isAdvancedMode ? (
                        "You can customize the AI's behavior using the Master Prompt below. Leave it blank to use automatic mode."
                      ) : (
                        "The AI will automatically analyze your workflow and determine the best actions to take. Switch to Advanced Mode if you need custom behavior."
                      )}
                    </AlertDescription>
                  </Alert>

                  {/* Master Prompt - Only show in advanced mode */}
                  {isAdvancedMode && (
                    <div className="space-y-2 mb-6">
                    <div className="flex items-center justify-between">
                      <Label htmlFor="prompt" className="flex items-center gap-2">
                        Master Prompt
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <HelpCircle className="h-3 w-3 text-muted-foreground cursor-help" />
                          </TooltipTrigger>
                          <TooltipContent className="max-w-xs">
                            <div className="space-y-2 text-xs">
                              <p className="font-semibold">Master Prompt (Auto-Generated):</p>
                              <p>This prompt is automatically generated from your action chains below. You can edit it to customize the AI's behavior, or leave it as-is.</p>
                              <div className="space-y-1">
                                <p className="font-medium">Custom Examples:</p>
                                <ul className="list-disc list-inside space-y-1">
                                  <li>"Summarize the email from [trigger.email]"</li>
                                  <li>"Generate a professional response"</li>
                                  <li>"Extract key information and format as JSON"</li>
                                  <li>"Translate {`{{content}}`} to Spanish"</li>
                                </ul>
                              </div>
                              <p className="text-yellow-600 mt-2">💡 The prompt updates automatically as you add/remove actions!</p>
                            </div>
                          </TooltipContent>
                        </Tooltip>
                      </Label>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          if (config.chainsLayout?.chains) {
                            const autoGeneratedPrompt = generateMasterPromptFromChains(config.chainsLayout)
                            setConfig(prev => ({
                              ...prev,
                              systemPrompt: autoGeneratedPrompt,
                              masterPrompt: autoGeneratedPrompt
                            }))
                            toast({
                              title: "Prompt Regenerated",
                              description: "Master prompt updated from current chains"
                            })
                          }
                        }}
                        className="h-7 text-xs"
                      >
                        <RefreshCw className="w-3 h-3 mr-1" />
                        Regenerate
                      </Button>
                    </div>
                    <div
                      className={cn(
                        "relative rounded-lg border",
                        draggedVariable && "border-blue-500 bg-blue-50/50"
                      )}
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={(e) => {
                        e.preventDefault()
                        if (draggedVariable && promptRef.current) {
                          const text = config.systemPrompt
                          const newText = `${text } ${ draggedVariable.value}`
                          setConfig(prev => ({ ...prev, systemPrompt: newText }))
                          setDraggedVariable(null)
                        }
                      }}
                    >
                      <Textarea
                        ref={promptRef}
                        id="prompt"
                        value={config.systemPrompt}
                        onChange={(e) => setConfig(prev => ({ ...prev, systemPrompt: e.target.value }))}
                        placeholder="e.g., Summarize the content and extract action items..."
                        className="min-h-[200px] border-0 resize-none"
                      />
                      {draggedVariable && (
                        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                          <Badge variant="secondary" className="bg-blue-100">
                            Drop to insert {draggedVariable.value}
                          </Badge>
                        </div>
                      )}
                    </div>
                  </div>
                  )}

                  {/* Visual Chain Builder */}
                  <div className="mt-6 space-y-4">
                    <div>
                      <h3 className="text-lg font-semibold flex items-center gap-2">
                        <Workflow className="w-5 h-5" />
                        Action Chains
                      </h3>
                      <p className="text-sm text-muted-foreground">
                        Build parallel workflows that execute based on AI decisions
                      </p>
                    </div>
                    
                    <AIAgentVisualChainBuilderWrapper
                      key={chainBuilderKey}
                      chains={config.chainsLayout?.chains || config.chains || []}
                      chainsLayout={config.chainsLayout}
                      workflowData={workflowData}
                      currentNodeId={currentNodeId}
                      onChainsChange={(chainsData) => {
                        // chainsData contains full layout: { chains: [...], nodes: [...], edges: [...], aiAgentPosition: {...} }
                        logger.debug('🔄 [AIAgentConfigModal] onChainsChange called with:', chainsData)
                        logger.debug('🔄 [AIAgentConfigModal] Full layout data:', chainsData)
                        setConfig(prev => {
                          // Store the full layout data, not just chains
                          const newConfig = { ...prev, chainsLayout: chainsData, chains: chainsData.chains || [] }
                          logger.debug('🔄 [AIAgentConfigModal] Updated config with full layout:', newConfig.chainsLayout)
                          return newConfig
                        })
                      }}
                      onOpenActionDialog={() => {
                        logger.debug('🚀 [AIAgentConfigModal] onOpenActionDialog called')
                        if (setShowActionDialog) {
                          setShowActionDialog(true)
                        }
                      }}
                      onActionSelect={(callback) => {
                        logger.debug('🚀 [AIAgentConfigModal] onActionSelect called with callback:', typeof callback)
                        // Store the callback in a ref to avoid state timing issues
                        pendingActionCallbackRef.current = callback
                        logger.debug('🚀 [AIAgentConfigModal] pendingActionCallback set in ref')
                        // Don't open dialog here - onOpenActionDialog will handle it
                      }}
                      onConfigureNode={handleConfigureNode}
                    />
                  </div>

                  {/* Variable Resolution Preview */}
                  {testResults?.prompt && (
                    <Card>
                      <CardHeader className="py-3">
                        <CardTitle className="text-sm">Variable Resolution Preview</CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-2">
                        <div className="flex flex-wrap gap-2">
                          {testResults.prompt.variables.map((v: string) => (
                            <Badge key={v} variant="secondary" className="font-mono text-xs">
                              {v} → <span className="text-green-600">resolved</span>
                            </Badge>
                          ))}
                        </div>
                        <div className="p-2 bg-muted rounded text-sm">
                          {testResults.prompt.resolved}
                        </div>
                        <div className="flex justify-between text-xs text-muted-foreground">
                          <span>Estimated tokens: {testResults.prompt.tokens}</span>
                          <span>Cost: ${(testResults.prompt.tokens * 0.00001).toFixed(4)}</span>
                        </div>
                      </CardContent>
                    </Card>
                  )}
                    </div>
                  </ScrollArea>
                </TabsContent>

                {/* Model Tab */}
                <TabsContent value="model" className="h-full mt-0" forceMount hidden={activeTab !== 'model'}>
                  <ScrollArea className="h-[calc(95vh-260px)]">
                    <div className="px-6 py-4 space-y-4">
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <h3 className="text-lg font-semibold">AI Model Selection</h3>
                      <p className="text-sm text-muted-foreground">
                        Choose the right model for your needs
                      </p>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleQuickTest('model')}
                      disabled={isTestingModel}
                    >
                      {isTestingModel ? (
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      ) : (
                        <Play className="w-4 h-4 mr-2" />
                      )}
                      Quick Test
                    </Button>
                  </div>

                  {/* Recommended Models */}
                  <div className="space-y-3">
                    <Label className="text-sm font-medium">Recommended Models</Label>
                    <div className="grid gap-3">
                      {MODEL_GROUPS.recommended.map(model => (
                        <Card
                          key={model.id}
                          className={cn(
                            "cursor-pointer transition-all",
                            config.model === model.id && "border-blue-500 bg-blue-50/50"
                          )}
                          onClick={() => setConfig(prev => ({ ...prev, model: model.id }))}
                        >
                          <CardContent className="p-4">
                            <div className="flex items-start justify-between">
                              <div className="space-y-1">
                                <div className="flex items-center gap-2">
                                  <h4 className="font-medium">{model.name}</h4>
                                  <Badge variant="outline" className="text-xs">
                                    {model.provider}
                                  </Badge>
                                </div>
                                <p className="text-sm text-muted-foreground">
                                  {model.description}
                                </p>
                                <div className="flex gap-2 mt-2">
                                  {model.badges.map(badge => (
                                    <Badge key={badge} variant="secondary" className="text-xs">
                                      {badge}
                                    </Badge>
                                  ))}
                                </div>
                              </div>
                              {config.model === model.id && (
                                <CheckCircle className="w-5 h-5 text-blue-500" />
                              )}
                            </div>
                            {/* Inline cost/latency */}
                            <div className="mt-3 flex items-center gap-4 text-xs text-muted-foreground">
                              <span className="flex items-center gap-1">
                                <Clock className="w-3 h-3" />
                                {model.latency}
                              </span>
                              <span className="flex items-center gap-1">
                                <Coins className="w-3 h-3" />
                                ${model.costPer1k.input}/1k in, ${model.costPer1k.output}/1k out
                              </span>
                            </div>
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  </div>

                  {/* Other Models (Collapsible) */}
                  <Collapsible>
                    <CollapsibleTrigger asChild>
                      <Button variant="ghost" className="w-full justify-between">
                        Other Models
                        <ChevronDown className="w-4 h-4" />
                      </Button>
                    </CollapsibleTrigger>
                    <CollapsibleContent className="space-y-3 mt-3">
                      {MODEL_GROUPS.other.map(model => (
                        <Card
                          key={model.id}
                          className={cn(
                            "cursor-pointer transition-all",
                            config.model === model.id && "border-blue-500 bg-blue-50/50"
                          )}
                          onClick={() => setConfig(prev => ({ ...prev, model: model.id }))}
                        >
                          <CardContent className="p-4">
                            <div className="flex items-start justify-between">
                              <div className="space-y-1">
                                <div className="flex items-center gap-2">
                                  <h4 className="font-medium">{model.name}</h4>
                                  <Badge variant="outline" className="text-xs">
                                    {model.provider}
                                  </Badge>
                                </div>
                                <p className="text-sm text-muted-foreground">
                                  {model.description}
                                </p>
                                <div className="flex gap-2 mt-2">
                                  {model.badges.map(badge => (
                                    <Badge key={badge} variant="secondary" className="text-xs">
                                      {badge}
                                    </Badge>
                                  ))}
                                </div>
                              </div>
                              {config.model === model.id && (
                                <CheckCircle className="w-5 h-5 text-blue-500" />
                              )}
                            </div>
                            <div className="mt-3 flex items-center gap-4 text-xs text-muted-foreground">
                              <span className="flex items-center gap-1">
                                <Clock className="w-3 h-3" />
                                {model.latency}
                              </span>
                              <span className="flex items-center gap-1">
                                <Coins className="w-3 h-3" />
                                ${model.costPer1k.input}/1k in, ${model.costPer1k.output}/1k out
                              </span>
                            </div>
                          </CardContent>
                        </Card>
                      ))}
                    </CollapsibleContent>
                  </Collapsible>

                  {/* API Source */}
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-sm flex items-center gap-2">
                        API Configuration
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <HelpCircle className="h-3 w-3 text-muted-foreground cursor-help" />
                          </TooltipTrigger>
                          <TooltipContent className="max-w-xs">
                            <div className="space-y-2 text-xs">
                              <p className="font-semibold">API Source Options:</p>
                              <ul className="list-disc list-inside space-y-1">
                                <li><strong>ChainReact API:</strong> Uses your plan's included AI credits</li>
                                <li><strong>Custom API Key:</strong> Use your own OpenAI/Anthropic key (no credit limits)</li>
                              </ul>
                            </div>
                          </TooltipContent>
                        </Tooltip>
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      {/* OpenAI API Key Selection - Optional */}
                      <div className="space-y-2">
                        <Label className="text-sm flex items-center gap-2">
                          OpenAI API Key
                          <Badge variant="secondary" className="text-xs">Optional</Badge>
                        </Label>
                        <APIKeySelector
                          value={config.selectedApiKeyId}
                          onChange={(keyId) => setConfig(prev => ({ ...prev, selectedApiKeyId: keyId }))}
                        />
                        <p className="text-xs text-muted-foreground">
                          By default, uses our platform API key. Add your own key in settings to bypass usage limits.
                        </p>
                      </div>

                      {/* Model Selection */}
                      <div className="space-y-2">
                        <Label className="text-sm">
                          OpenAI Model
                        </Label>
                        <ModelSelector
                          value={config.model}
                          onChange={(model) => setConfig(prev => ({ ...prev, model }))}
                          showDetails={true}
                        />
                      </div>
                    </CardContent>
                  </Card>

                  {/* Advanced Model Settings */}
                  <Collapsible open={expandedSections.has('model-advanced')}>
                    <CollapsibleTrigger asChild>
                      <Button
                        variant="ghost"
                        className="w-full justify-between"
                        onClick={() => toggleSection('model-advanced')}
                      >
                        Advanced Settings
                        <ChevronDown className={cn(
                          "w-4 h-4 transition-transform",
                          expandedSections.has('model-advanced') && "rotate-180"
                        )} />
                      </Button>
                    </CollapsibleTrigger>
                    <CollapsibleContent className="space-y-4 mt-4">
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <Label htmlFor="temperature" className="text-sm flex items-center gap-2">
                            Temperature: {config.temperature}
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <HelpCircle className="h-3 w-3 text-muted-foreground cursor-help" />
                              </TooltipTrigger>
                              <TooltipContent className="max-w-xs">
                                <div className="space-y-2 text-xs">
                                  <p className="font-semibold">Temperature Control:</p>
                                  <p>Controls randomness in AI responses (0.0 to 1.0)</p>
                                  <ul className="list-disc list-inside space-y-1">
                                    <li><strong>0.0-0.3:</strong> Very consistent, factual responses</li>
                                    <li><strong>0.4-0.6:</strong> Balanced creativity and consistency</li>
                                    <li><strong>0.7-1.0:</strong> More creative and varied responses</li>
                                  </ul>
                                  <p className="font-medium">Recommended: 0.7 for most use cases</p>
                                </div>
                              </TooltipContent>
                            </Tooltip>
                          </Label>
                          <span className="text-xs text-muted-foreground">
                            Lower = more deterministic, Higher = more creative
                          </span>
                        </div>
                        <Slider
                          id="temperature"
                          min={0}
                          max={1}
                          step={0.1}
                          value={[config.temperature]}
                          onValueChange={([value]) => setConfig(prev => ({ ...prev, temperature: value }))}
                        />
                      </div>

                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <Label htmlFor="max-tokens" className="text-sm flex items-center gap-2">
                            Max Tokens: {config.maxTokens}
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <HelpCircle className="h-3 w-3 text-muted-foreground cursor-help" />
                              </TooltipTrigger>
                              <TooltipContent className="max-w-xs">
                                <div className="space-y-2 text-xs">
                                  <p className="font-semibold">Max Tokens Guide:</p>
                                  <p>Maximum length of the AI response (1 token ≈ 0.75 words)</p>
                                  <ul className="list-disc list-inside space-y-1">
                                    <li><strong>100-500:</strong> Short responses (tweets, titles)</li>
                                    <li><strong>500-1000:</strong> Medium responses (paragraphs)</li>
                                    <li><strong>1000-2000:</strong> Long responses (emails, articles)</li>
                                    <li><strong>2000-4000:</strong> Very long content</li>
                                  </ul>
                                  <p className="text-yellow-600">⚠️ Higher values increase cost</p>
                                </div>
                              </TooltipContent>
                            </Tooltip>
                          </Label>
                          <span className="text-xs text-muted-foreground">
                            Maximum response length
                          </span>
                        </div>
                        <Slider
                          id="max-tokens"
                          min={100}
                          max={4000}
                          step={100}
                          value={[config.maxTokens]}
                          onValueChange={([value]) => setConfig(prev => ({ ...prev, maxTokens: value }))}
                        />
                      </div>
                    </CollapsibleContent>
                  </Collapsible>
                    </div>
                  </ScrollArea>
                </TabsContent>

                {/* Behavior Tab (Advanced Mode Only) */}
                {isAdvancedMode && (
                  <TabsContent value="behavior" className="h-full mt-0" forceMount hidden={activeTab !== 'behavior'}>
                    <ScrollArea className="h-[calc(95vh-260px)]">
                      <div className="px-6 py-4 space-y-4">
                    <div>
                      <h3 className="text-lg font-semibold">Response Behavior</h3>
                      <p className="text-sm text-muted-foreground">
                        Configure how the AI responds and formats output
                      </p>
                    </div>

                    {/* Tone Selection with Previews */}
                    <Collapsible 
                      open={expandedSections.has('tone')}
                      onOpenChange={(isOpen) => {
                        setExpandedSections(prev => {
                          const newSet = new Set(prev)
                          if (isOpen) {
                            newSet.add('tone')
                          } else {
                            newSet.delete('tone')
                          }
                          return newSet
                        })
                      }}
                    >
                      <CollapsibleTrigger asChild>
                        <div className="flex items-center justify-between p-3 border rounded-lg cursor-pointer hover:bg-muted/50">
                          <div className="flex items-center gap-2">
                            <MessageSquare className="w-4 h-4" />
                            <span className="font-medium">Tone & Style</span>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <HelpCircle className="h-3 w-3 text-muted-foreground cursor-help" onClick={(e) => e.stopPropagation()} />
                              </TooltipTrigger>
                              <TooltipContent className="max-w-xs">
                                <div className="space-y-2 text-xs">
                                  <p className="font-semibold">Tone Settings:</p>
                                  <p>Controls how the AI communicates in its responses.</p>
                                  <p>Choose based on your audience and use case.</p>
                                </div>
                              </TooltipContent>
                            </Tooltip>
                            <Badge variant="secondary">
                              {TONE_SAMPLES[config.tone]?.icon} {config.tone}
                            </Badge>
                          </div>
                          <ChevronDown className={cn(
                            "w-4 h-4 transition-transform",
                            expandedSections.has('tone') && "rotate-180"
                          )} />
                        </div>
                      </CollapsibleTrigger>
                      <CollapsibleContent className="mt-4">
                        <div className="grid grid-cols-2 gap-3">
                          {Object.entries(TONE_SAMPLES).map(([key, tone]) => (
                            <Card
                              key={key}
                              className={cn(
                                "cursor-pointer transition-all",
                                config.tone === key && "border-blue-500 bg-blue-50/50"
                              )}
                              onClick={() => setConfig(prev => ({ ...prev, tone: key }))}
                            >
                              <CardContent className="p-3">
                                <div className="flex items-start gap-3">
                                  <span className="text-2xl">{tone.icon}</span>
                                  <div className="flex-1 space-y-1">
                                    <div className="flex items-center justify-between">
                                      <h4 className="font-medium capitalize">{key}</h4>
                                      {config.tone === key && (
                                        <CheckCircle className="w-4 h-4 text-blue-500" />
                                      )}
                                    </div>
                                    <p className="text-xs text-muted-foreground">
                                      {tone.description}
                                    </p>
                                    <div className="mt-2 p-2 bg-muted rounded text-xs italic">
                                      "{tone.sample}"
                                    </div>
                                  </div>
                                </div>
                              </CardContent>
                            </Card>
                          ))}
                        </div>
                      </CollapsibleContent>
                    </Collapsible>

                    {/* Formatting Options */}
                    <Collapsible 
                      open={expandedSections.has('formatting')}
                      onOpenChange={(isOpen) => {
                        setExpandedSections(prev => {
                          const newSet = new Set(prev)
                          if (isOpen) {
                            newSet.add('formatting')
                          } else {
                            newSet.delete('formatting')
                          }
                          return newSet
                        })
                      }}
                    >
                      <CollapsibleTrigger asChild>
                        <div className="flex items-center justify-between p-3 border rounded-lg cursor-pointer hover:bg-muted/50">
                          <div className="flex items-center gap-2">
                            <FileText className="w-4 h-4" />
                            <span className="font-medium">Output Formatting</span>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <HelpCircle className="h-3 w-3 text-muted-foreground cursor-help" onClick={(e) => e.stopPropagation()} />
                              </TooltipTrigger>
                              <TooltipContent className="max-w-xs">
                                <div className="space-y-2 text-xs">
                                  <p className="font-semibold">Output Format:</p>
                                  <ul className="list-disc list-inside space-y-1">
                                    <li><strong>Plain Text:</strong> Simple unformatted text</li>
                                    <li><strong>Markdown:</strong> Formatted with headers, lists, etc.</li>
                                    <li><strong>HTML:</strong> Web-ready formatted content</li>
                                    <li><strong>JSON:</strong> Structured data for APIs</li>
                                  </ul>
                                </div>
                              </TooltipContent>
                            </Tooltip>
                          </div>
                          <ChevronDown className={cn(
                            "w-4 h-4 transition-transform",
                            expandedSections.has('formatting') && "rotate-180"
                          )} />
                        </div>
                      </CollapsibleTrigger>
                      <CollapsibleContent className="mt-4 space-y-4">
                        <div className="space-y-2">
                          <Label htmlFor="output-format" className="text-sm">Format</Label>
                          <Select
                            value={config.outputFormat}
                            onValueChange={(value) => setConfig(prev => ({ ...prev, outputFormat: value }))}
                          >
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="text">Plain Text</SelectItem>
                              <SelectItem value="markdown">Markdown</SelectItem>
                              <SelectItem value="html">HTML</SelectItem>
                              <SelectItem value="json">JSON</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>

                        <div className="flex items-center justify-between">
                          <Label htmlFor="include-context" className="text-sm flex items-center gap-2">
                            Include workflow context
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <HelpCircle className="h-3 w-3 text-muted-foreground cursor-help" />
                              </TooltipTrigger>
                              <TooltipContent className="max-w-xs">
                                <div className="space-y-2 text-xs">
                                  <p className="font-semibold">Workflow Context:</p>
                                  <p>When enabled, the AI receives information about previous nodes' outputs and the overall workflow structure, allowing for more contextual responses.</p>
                                </div>
                              </TooltipContent>
                            </Tooltip>
                          </Label>
                          <Switch
                            id="include-context"
                            checked={config.includeContext}
                            onCheckedChange={(checked) => setConfig(prev => ({ ...prev, includeContext: checked }))}
                          />
                        </div>
                      </CollapsibleContent>
                    </Collapsible>

                    {/* Advanced Settings (Safety, Retry, etc.) */}
                    <Collapsible 
                      open={expandedSections.has('advanced')}
                      onOpenChange={(isOpen) => {
                        setExpandedSections(prev => {
                          const newSet = new Set(prev)
                          if (isOpen) {
                            newSet.add('advanced')
                          } else {
                            newSet.delete('advanced')
                          }
                          return newSet
                        })
                      }}
                    >
                      <CollapsibleTrigger asChild>
                        <div className="flex items-center justify-between p-3 border rounded-lg cursor-pointer hover:bg-muted/50">
                          <div className="flex items-center gap-2">
                            <Settings className="w-4 h-4" />
                            <span className="font-medium">Advanced Settings</span>
                          </div>
                          <ChevronDown className={cn(
                            "w-4 h-4 transition-transform",
                            expandedSections.has('advanced') && "rotate-180"
                          )} />
                        </div>
                      </CollapsibleTrigger>
                      <CollapsibleContent className="mt-4 space-y-4">
                        <div className="flex items-center justify-between">
                          <div className="space-y-0.5">
                            <div className="flex items-center gap-2">
                              <Label htmlFor="safety" className="text-sm">Safety Filtering</Label>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <HelpCircle className="h-3 w-3 text-muted-foreground cursor-help" />
                                </TooltipTrigger>
                                <TooltipContent className="max-w-xs">
                                  <div className="space-y-2 text-xs">
                                    <p className="font-semibold">Safety Filter:</p>
                                    <p>Automatically filters out:</p>
                                    <ul className="list-disc list-inside space-y-1">
                                      <li>Harmful or toxic content</li>
                                      <li>Personal information (PII)</li>
                                      <li>Inappropriate language</li>
                                      <li>Sensitive topics</li>
                                    </ul>
                                    <p className="text-yellow-600">⚠️ Recommended for public-facing content</p>
                                  </div>
                                </TooltipContent>
                              </Tooltip>
                            </div>
                            <p className="text-xs text-muted-foreground">
                              Filter harmful or sensitive content
                            </p>
                          </div>
                          <Switch
                            id="safety"
                            checked={config.enableSafety}
                            onCheckedChange={(checked) => setConfig(prev => ({ ...prev, enableSafety: checked }))}
                          />
                        </div>

                        <div className="space-y-2">
                          <Label htmlFor="retries" className="text-sm">
                            Max Retries: {config.maxRetries}
                          </Label>
                          <Slider
                            id="retries"
                            min={0}
                            max={5}
                            step={1}
                            value={[config.maxRetries]}
                            onValueChange={([value]) => setConfig(prev => ({ ...prev, maxRetries: value }))}
                          />
                        </div>

                        <div className="space-y-2">
                          <Label htmlFor="timeout" className="text-sm">
                            Timeout: {config.timeout / 1000}s
                          </Label>
                          <Slider
                            id="timeout"
                            min={5000}
                            max={60000}
                            step={5000}
                            value={[config.timeout]}
                            onValueChange={([value]) => setConfig(prev => ({ ...prev, timeout: value }))}
                          />
                        </div>
                      </CollapsibleContent>
                    </Collapsible>
                      </div>
                    </ScrollArea>
                  </TabsContent>
                )}

                {/* Actions Tab (Advanced Mode Only) */}
                {isAdvancedMode && (
                  <TabsContent value="actions" className="h-full mt-0" forceMount hidden={activeTab !== 'actions'}>
                    <ScrollArea className="h-[calc(95vh-260px)]">
                      <div className="px-6 py-4 space-y-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <h3 className="text-lg font-semibold">Action Discovery</h3>
                        <p className="text-sm text-muted-foreground">
                          AI can trigger these workflow actions
                        </p>
                      </div>
                      <Button
                        variant="outline"
                        onClick={() => {/* handleDiscoverActions */}}
                        disabled={isDiscovering}
                      >
                        {isDiscovering ? (
                          <LightningLoader size="sm" className="mr-2" />
                        ) : (
                          <Search className="w-4 h-4 mr-2" />
                        )}
                        Discover Actions
                      </Button>
                    </div>

                    {/* Action Search */}
                    <div className="relative">
                      <Search className="absolute left-3 top-3 w-4 h-4 text-muted-foreground" />
                      <Input
                        placeholder="Search for actions (e.g., 'send email', 'create task')..."
                        className="pl-10"
                        onChange={(e) => {/* handleActionSearch */}}
                      />
                    </div>

                    {/* Discovered Actions as Cards */}
                    <div className="grid grid-cols-2 gap-3">
                      {discoveredActions.map((action: any) => (
                        <Card
                          key={action.id}
                          className={cn(
                            "cursor-pointer transition-all",
                            config.targetActions.includes(action.id) && "border-blue-500 bg-blue-50/50"
                          )}
                          onClick={() => {
                            setConfig(prev => ({
                              ...prev,
                              targetActions: prev.targetActions.includes(action.id)
                                ? prev.targetActions.filter(a => a !== action.id)
                                : [...prev.targetActions, action.id]
                            }))
                          }}
                        >
                          <CardContent className="p-4">
                            <div className="flex items-start justify-between">
                              <div className="flex items-start gap-3">
                                <div className="p-2 bg-muted rounded">
                                  {action.icon || <Zap className="w-4 h-4" />}
                                </div>
                                <div>
                                  <h4 className="font-medium">{action.name}</h4>
                                  <p className="text-xs text-muted-foreground mt-1">
                                    {action.description}
                                  </p>
                                </div>
                              </div>
                              <Badge variant={action.confidence > 80 ? "default" : "secondary"}>
                                {action.confidence}%
                              </Badge>
                            </div>
                          </CardContent>
                        </Card>
                      ))}
                    </div>

                    {/* You Might Also Want Section */}
                    {discoveredActions.length > 0 && (
                      <div className="mt-6">
                        <h4 className="text-sm font-medium mb-3">You might also want</h4>
                        <div className="flex flex-wrap gap-2">
                          {['slack_send', 'gmail_send', 'notion_create'].map(action => (
                            <Button
                              key={action}
                              variant="outline"
                              size="sm"
                              onClick={() => {/* Add to target actions */}}
                            >
                              <Plus className="w-3 h-3 mr-1" />
                              {action}
                            </Button>
                          ))}
                        </div>
                      </div>
                    )}
                      </div>
                    </ScrollArea>
                  </TabsContent>
                )}

                {/* Preview Tab */}
                <TabsContent value="preview" className="h-full mt-0" forceMount hidden={activeTab !== 'preview'}>
                  <ScrollArea className="h-[calc(95vh-260px)]">
                    <div className="px-6 py-4 space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-lg font-semibold">Test & Preview</h3>
                      <p className="text-sm text-muted-foreground">
                        See how your AI agent will behave
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={handleExportTestLog}
                      >
                        <Download className="w-4 h-4 mr-2" />
                        Export Log
                      </Button>
                      <Button
                        variant="default"
                        size="sm"
                        onClick={() => handleQuickTest('full')}
                      >
                        <Play className="w-4 h-4 mr-2" />
                        Run Full Test
                      </Button>
                    </div>
                  </div>

                  {/* Side-by-side layout */}
                  <div className="grid grid-cols-2 gap-4">
                    {/* Input Panel */}
                    <Card>
                      <CardHeader>
                        <CardTitle className="text-sm">Sample Input</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <Textarea
                          placeholder="Enter sample workflow data..."
                          className="min-h-[200px]"
                          defaultValue={JSON.stringify({
                            trigger: { email: { from: "user@example.com", subject: "Help needed" } },
                            data: { message: "I need assistance with my account" }
                          }, null, 2)}
                        />
                      </CardContent>
                    </Card>

                    {/* Output Panel */}
                    <Card>
                      <CardHeader>
                        <CardTitle className="text-sm">AI Output Preview</CardTitle>
                      </CardHeader>
                      <CardContent>
                        {testResults?.full ? (
                          <div className="space-y-3">
                            <div className="p-3 bg-muted rounded">
                              <pre className="text-sm whitespace-pre-wrap">
                                {testResults.full.output}
                              </pre>
                            </div>
                            <div className="flex justify-between text-xs text-muted-foreground">
                              <span>Tokens: {testResults.full.tokens.input} + {testResults.full.tokens.output}</span>
                              <span>Cost: ${testResults.full.cost}</span>
                              <span>Latency: {testResults.full.latency}</span>
                            </div>
                          </div>
                        ) : (
                          <div className="flex items-center justify-center h-[200px] text-muted-foreground">
                            <Play className="w-8 h-8" />
                            <span className="ml-2">Run test to see output</span>
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  </div>

                  {/* Cost & Performance Estimates */}
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-sm">Performance Estimates</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="grid grid-cols-3 gap-4">
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <Coins className="w-4 h-4 text-yellow-500" />
                            <span className="text-sm font-medium">Cost per Run</span>
                          </div>
                          <p className="text-2xl font-bold">${estimatedCost.toFixed(4)}</p>
                          <p className="text-xs text-muted-foreground">Based on avg usage</p>
                        </div>
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <Clock className="w-4 h-4 text-blue-500" />
                            <span className="text-sm font-medium">Latency</span>
                          </div>
                          <p className="text-2xl font-bold">{estimatedLatency}</p>
                          <p className="text-xs text-muted-foreground">Typical response time</p>
                        </div>
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <Activity className="w-4 h-4 text-green-500" />
                            <span className="text-sm font-medium">Reliability</span>
                          </div>
                          <p className="text-2xl font-bold">99.9%</p>
                          <p className="text-xs text-muted-foreground">Uptime SLA</p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                    </div>
                  </ScrollArea>
                </TabsContent>
              </div>
            </Tabs>

            {/* Footer */}
            <div className="flex justify-between items-center h-[70px] px-6 border-t border-slate-200 bg-white flex-shrink-0">
              <div className="flex items-center gap-3">
                <Button
                  type="button"
                  variant="outline"
                  onClick={onClose}
                  className="flex items-center gap-2"
                >
                  <X className="h-4 w-4" />
                  Cancel
                </Button>
              </div>
              
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-3 text-sm text-muted-foreground">
                  <div className="flex items-center gap-1">
                    <Activity className="w-4 h-4" />
                    <span>Est. ${estimatedCost.toFixed(4)}/run</span>
                  </div>
                  <span>•</span>
                  <div className="flex items-center gap-1">
                    <Clock className="w-4 h-4" />
                    <span>{estimatedLatency}</span>
                  </div>
                </div>
                <Button 
                  onClick={() => {
                    logger.debug('🟢 [AIAgentConfigModal] Save button clicked!')
                    handleSave()
                  }} 
                  disabled={isSaving}
                  className="flex items-center gap-2 bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700 text-white shadow-lg hover:shadow-xl transition-all duration-200"
                >
                  {isSaving ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Saving...
                    </>
                  ) : (
                    <>
                      <Save className="w-4 h-4" />
                      Save Configuration
                    </>
                  )}
                </Button>
              </div>
            </div>
          </div>

          {/* Variable Panel (collapsible sidebar on right) */}
          <AnimatePresence>
            {showVariablePanel && (
              <motion.div
                initial={{ width: 0, opacity: 0 }}
                animate={{ width: 350, opacity: 1 }}
                exit={{ width: 0, opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="border-l bg-muted/30 h-full overflow-hidden"
              >
                <AIVariablePanel
                  nodes={nodes}
                  currentNodeId={currentNodeId}
                  onVariableSelect={(variable) => {
                    // Insert variable at cursor position
                    if (promptRef.current) {
                      const start = promptRef.current.selectionStart
                      const end = promptRef.current.selectionEnd
                      const text = config.systemPrompt
                      const newText = text.substring(0, start) + variable.value + text.substring(end)
                      setConfig(prev => ({ ...prev, systemPrompt: newText }))
                      
                      // Reset cursor position
                      setTimeout(() => {
                        if (promptRef.current) {
                          promptRef.current.selectionStart = start + variable.value.length
                          promptRef.current.selectionEnd = start + variable.value.length
                          promptRef.current.focus()
                        }
                      }, 0)
                    }
                  }}
                  onDragStart={setDraggedVariable}
                  onClose={() => setShowVariablePanel(false)}
                />
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </DialogContentWithoutClose>

      {/* Action Selector Dialog - Removed, now using inline action selection or IntegrationsSidePanel */}

      {/* Node Configuration Dialog */}
      {configuringNodeId && configuringNodeData && (
        <Dialog open={true} onOpenChange={(open) => {
          if (!open) {
            setConfiguringNodeId(null)
            setConfiguringNodeData(null)
          }
        }}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Configure {configuringNodeData.data?.title || 'Action'}</DialogTitle>
              <DialogDescription>
                Configure the settings for this action node
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4">
              {/* Show configuration form based on node type */}
              {configuringNodeData.data?.providerId && configuringNodeData.data?.type && (
                <div className="p-4 border rounded-lg bg-muted/20">
                  <p className="text-sm text-muted-foreground mb-2">
                    Provider: <span className="font-medium">{configuringNodeData.data.providerId}</span>
                  </p>
                  <p className="text-sm text-muted-foreground mb-2">
                    Type: <span className="font-medium">{configuringNodeData.data.type}</span>
                  </p>
                  <p className="text-sm text-muted-foreground">
                    Current Config: <span className="font-mono text-xs">{JSON.stringify(configuringNodeData.data.config || {}, null, 2)}</span>
                  </p>
                </div>
              )}

              <div className="text-sm text-muted-foreground">
                <AlertCircle className="w-4 h-4 inline mr-2" />
                Configuration form for chain actions will be available soon.
                For now, actions are configured with AI mode or default settings.
              </div>
            </div>

            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => {
                  setConfiguringNodeId(null)
                  setConfiguringNodeData(null)
                }}
              >
                Close
              </Button>
              <Button onClick={() => {
                // TODO: Save configuration changes
                logger.debug('💾 [AIAgentConfigModal] Saving configuration for node:', configuringNodeId)

                // Update the node in chainsLayout
                if (config.chainsLayout?.nodes) {
                  const updatedNodes = config.chainsLayout.nodes.map((n: any) => {
                    if (n.id === configuringNodeId) {
                      return {
                        ...n,
                        data: {
                          ...n.data,
                          // Update config here when form is implemented
                        }
                      }
                    }
                    return n
                  })

                  setConfig(prev => ({
                    ...prev,
                    chainsLayout: {
                      ...prev.chainsLayout,
                      nodes: updatedNodes
                    }
                  }))
                }

                setConfiguringNodeId(null)
                setConfiguringNodeData(null)
              }}>
                Save Changes
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </Dialog>
    </TooltipProvider>
  )
}
