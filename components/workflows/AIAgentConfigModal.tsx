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
import { useIntegrationSelection } from '@/hooks/workflows/useIntegrationSelection'

interface AIAgentConfigModalProps {
  isOpen: boolean
  onClose: () => void
  onSave: (config: Record<string, any>) => void
  onUpdateConnections?: (sourceNodeId: string, targetNodeId: string) => void
  initialData?: Record<string, any>
  workflowData?: { nodes: any[], edges: any[] }
  currentNodeId?: string
  onOpenActionDialog?: () => void
  onActionSelect?: (action: any) => void
  onAddActionToWorkflow?: (action: any, config: any) => void
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
  onOpenActionDialog,
  onActionSelect,
  onAddActionToWorkflow
}: AIAgentConfigModalProps) {
  const { toast } = useToast()
  const promptRef = useRef<HTMLTextAreaElement>(null)
  const nodes = workflowData?.nodes || []
  const { comingSoonIntegrations, isIntegrationConnected, availableIntegrations, categories } = useIntegrationSelection()
  
  // Progressive disclosure state
  const [isAdvancedMode, setIsAdvancedMode] = useState(false)
  const [activeTab, setActiveTab] = useState('prompt')
  
  // Collapsible sections
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set())
  
  // Configuration state
  const [config, setConfig] = useState(() => {
    // Build initial config, making sure chains is properly initialized
    const baseConfig = {
      title: 'AI Agent',
      systemPrompt: '',
      model: 'gpt-4o-mini',
      apiSource: 'chainreact',
      customApiKey: '',
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
    
    if (initialData) {
      return {
        ...baseConfig,
        ...initialData,
        // Ensure chains is always an array
        chains: initialData.chains || [],
        // Preserve chainsLayout if it exists
        chainsLayout: initialData.chainsLayout || null
      }
    }
    
    return baseConfig
  })

  // UI state
  const [showModelDetails, setShowModelDetails] = useState(false)
  const [selectedTone, setSelectedTone] = useState(config.tone)
  const [isTestingPrompt, setIsTestingPrompt] = useState(false)
  const [isTestingModel, setIsTestingModel] = useState(false)
  const [isDiscovering, setIsDiscovering] = useState(false)
  
  // Action selector state
  const [isAIMode, setIsAIMode] = useState(true)
  const [actionSearchQuery, setActionSearchQuery] = useState('')
  const [actionFilterCategory, setActionFilterCategory] = useState('all')
  const [showComingSoon, setShowComingSoon] = useState(false) // Hide coming soon by default
  const [selectedActionIntegration, setSelectedActionIntegration] = useState<any>(null)
  const [selectedActionInModal, setSelectedActionInModal] = useState<any>(null)
  const [discoveredActions, setDiscoveredActions] = useState<any[]>([])
  const [testResults, setTestResults] = useState<any>(null)
  const [showVariablePanel, setShowVariablePanel] = useState(true)
  const [draggedVariable, setDraggedVariable] = useState<any>(null)
  const [estimatedCost, setEstimatedCost] = useState(0)
  const [estimatedLatency, setEstimatedLatency] = useState('~1s')
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [showWizard, setShowWizard] = useState(false)
  const pendingActionCallbackRef = useRef<any>(null)
  const [showActionSelector, setShowActionSelector] = useState(false)
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false)
  
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
    console.log('🔵 [AIAgentConfigModal] handleSave called')
    console.log('🔵 [AIAgentConfigModal] Current full config:', config)
    console.log('🔵 [AIAgentConfigModal] config.chainsLayout:', config.chainsLayout)
    console.log('🔵 [AIAgentConfigModal] Full layout data:', config.chainsLayout)
    
    // Validation
    // In guided mode, the master prompt is optional (AI will auto-determine actions)
    // In advanced mode, we still allow empty prompt for automatic mode
    // So we removed the systemPrompt validation entirely
    
    if (config.apiSource === 'custom' && !config.customApiKey) {
      setErrors({ customApiKey: 'API key is required for custom source' })
      setActiveTab('model')
      return
    }

    setIsSaving(true)
    try {
      console.log('🤖 [AIAgentConfigModal] Saving AI Agent configuration:', config)
      console.log('🤖 [AIAgentConfigModal] onSave function exists:', !!onSave)
      await onSave(config)
      console.log('✅ [AIAgentConfigModal] AI Agent configuration saved successfully')
      setHasUnsavedChanges(false)
      toast({
        title: "Configuration Saved",
        description: "AI Agent settings have been updated"
      })
      // Don't close immediately - let the parent handle closing after state update
    } catch (error) {
      console.error('❌ [AIAgentConfigModal] Failed to save AI Agent configuration:', error)
      toast({
        title: "Save Failed",
        description: "Could not save configuration",
        variant: "destructive"
      })
    } finally {
      setIsSaving(false)
    }
  }

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

  // Get available integrations for action selector
  const getFilteredIntegrations = () => {
    // Get unique integrations from ALL_NODE_COMPONENTS
    const integrationMap = new Map()

    ALL_NODE_COMPONENTS.filter(node =>
      !node.isTrigger &&  // Properly exclude triggers
      node.type !== 'ai_agent' &&
      !node.type.includes('trigger')
    ).forEach(node => {
      const providerId = node.providerId || node.type.split('-')[0]
      if (!integrationMap.has(providerId)) {
        // Get the proper integration name from INTEGRATION_CONFIGS
        const integrationConfig = INTEGRATION_CONFIGS[providerId as keyof typeof INTEGRATION_CONFIGS]
        const integrationName = integrationConfig?.name || providerId.charAt(0).toUpperCase() + providerId.slice(1)

        integrationMap.set(providerId, {
          id: providerId,
          name: integrationName,
          actions: []
        })
      }
      integrationMap.get(providerId).actions.push(node)
    })

    let integrations = Array.from(integrationMap.values())

    // Filter out coming soon integrations by default
    if (!showComingSoon) {
      integrations = integrations.filter(int => !comingSoonIntegrations.has(int.id));
    }
    
    // Apply category filter
    if (actionFilterCategory !== 'all') {
      integrations = integrations.filter(int => {
        // Simple category mapping based on provider
        const categoryMap: Record<string, string> = {
          'gmail': 'Communication',
          'slack': 'Communication',
          'discord': 'Communication',
          'notion': 'Productivity',
          'airtable': 'Data',
          'sheets': 'Data',
          'openai': 'AI',
          'anthropic': 'AI'
        }
        return categoryMap[int.id] === actionFilterCategory
      })
    }
    
    // Apply search filter
    if (actionSearchQuery) {
      const query = actionSearchQuery.toLowerCase()
      integrations = integrations.filter(int => 
        int.name.toLowerCase().includes(query) ||
        int.actions.some((action: any) => 
          action.title?.toLowerCase().includes(query) ||
          action.description?.toLowerCase().includes(query)
        )
      )
    }

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
  
  // Render integration logo - matching main workflow builder
  const renderIntegrationLogo = (integrationId: string, integrationName: string) => {
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
  
  // Handle action selection
  const handleActionSelection = (action: any) => {
    console.log('🎯 [AIAgentConfigModal] handleActionSelection called with action:', action)
    console.log('🎯 [AIAgentConfigModal] Action details:', {
      type: action.type,
      title: action.title,
      description: action.description,
      providerId: action.providerId,
      allFields: Object.keys(action)
    })
    console.log('🎯 [AIAgentConfigModal] pendingActionCallback status:', pendingActionCallbackRef.current ? 'EXISTS' : 'NULL')
    console.log('🎯 [AIAgentConfigModal] isAIMode:', isAIMode)
    if (isAIMode) {
      // In AI mode, add action with all fields set to AI
      const aiConfig: Record<string, any> = {}

      const collectAIPlaceholders = (schema: any[]) => {
        if (!Array.isArray(schema)) return

        schema.forEach(field => {
          if (!field || !field.name) return

          // Skip purely visual elements
          if (['label', 'separator', 'description'].includes(field.type)) return

          // Special handling for Discord: server and channel need manual selection
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
        console.log('📤 [AIAgentConfigModal] pendingActionCallback exists, type:', typeof pendingActionCallbackRef.current)
        // pendingActionCallbackRef.current is the callback itself
        const actualCallback = pendingActionCallbackRef.current
        console.log('📤 [AIAgentConfigModal] actualCallback:', actualCallback ? 'EXISTS' : 'NULL', typeof actualCallback)
        if (actualCallback) {
          // Pass the full action object along with config
          const configToPass = { ...aiConfig }
          console.log('📤 [AIAgentConfigModal] Calling callback with action:', action, 'config:', configToPass)
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
      
      // Close dialog and reset state
      setShowActionSelector(false)
      setSelectedActionIntegration(null)
      setSelectedActionInModal(null)
      setActionSearchQuery('')

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
      setShowActionSelector(false)
      
      // Add to chain via callback for visual builder (manual mode)
      if (pendingActionCallbackRef.current) {
        console.log('📤 [AIAgentConfigModal] (manual) pendingActionCallback exists, getting actual callback')
        const actualCallback = pendingActionCallbackRef.current
        console.log('📤 [AIAgentConfigModal] (manual) actualCallback:', actualCallback ? 'EXISTS' : 'NULL')
        if (actualCallback) {
          const manualConfig = {}
          console.log('📤 [AIAgentConfigModal] Calling callback with (manual mode) action:', action, 'config:', manualConfig)
          // Pass the full action object, not just type and providerId
          actualCallback(action, manualConfig)
        }
        pendingActionCallbackRef.current = null
        setHasUnsavedChanges(true)
      }
      
      // Add to the main workflow with manual config flag
      if (onAddActionToWorkflow) {
        const integrationInfo = availableIntegrations.find(i => i.id === (action.providerId || selectedActionIntegration?.id))
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
                      {config.apiSource === 'custom' ? '🔑 Custom' : '⚡ ChainReact'}
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
                      chains={config.chainsLayout?.chains || config.chains || []}
                      chainsLayout={config.chainsLayout}
                      onChainsChange={(chainsData) => {
                        // chainsData contains full layout: { chains: [...], nodes: [...], edges: [...], aiAgentPosition: {...} }
                        console.log('🔄 [AIAgentConfigModal] onChainsChange called with:', chainsData)
                        console.log('🔄 [AIAgentConfigModal] Full layout data:', chainsData)
                        setConfig(prev => {
                          // Store the full layout data, not just chains
                          const newConfig = { ...prev, chainsLayout: chainsData, chains: chainsData.chains || [] }
                          console.log('🔄 [AIAgentConfigModal] Updated config with full layout:', newConfig.chainsLayout)
                          return newConfig
                        })
                      }}
                      onOpenActionDialog={() => {
                        console.log('🚀 [AIAgentConfigModal] onOpenActionDialog called')
                        setShowActionSelector(true)
                      }}
                      onActionSelect={(callback) => {
                        console.log('🚀 [AIAgentConfigModal] onActionSelect called with callback:', typeof callback)
                        // Store the callback in a ref to avoid state timing issues
                        pendingActionCallbackRef.current = callback
                        console.log('🚀 [AIAgentConfigModal] pendingActionCallback set in ref')
                        // Don't open dialog here - onOpenActionDialog will handle it
                      }}
                      workflowData={workflowData}
                      currentNodeId={currentNodeId}
                    />
                  </div>

                  {/* Master Prompt - Only show in advanced mode */}
                  {isAdvancedMode && (
                    <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label htmlFor="prompt" className="flex items-center gap-2">
                        Master Prompt
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <HelpCircle className="h-3 w-3 text-muted-foreground cursor-help" />
                          </TooltipTrigger>
                          <TooltipContent className="max-w-xs">
                            <div className="space-y-2 text-xs">
                              <p className="font-semibold">Master Prompt (Optional):</p>
                              <p>Override the AI's default behavior with custom instructions. Leave blank to let the AI automatically determine the best actions based on your workflow.</p>
                              <div className="space-y-1">
                                <p className="font-medium">Examples:</p>
                                <ul className="list-disc list-inside space-y-1">
                                  <li>"Summarize the email from [trigger.email]"</li>
                                  <li>"Generate a professional response"</li>
                                  <li>"Extract key information and format as JSON"</li>
                                  <li>"Translate {`{{content}}`} to Spanish"</li>
                                </ul>
                              </div>
                              <p className="text-yellow-600 mt-2">💡 You don't need to explain how workflows work - we handle that automatically!</p>
                            </div>
                          </TooltipContent>
                        </Tooltip>
                      </Label>
                      <span className="text-xs text-muted-foreground">
                        Describe what the AI should do
                      </span>
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
                          const newText = text + ' ' + draggedVariable.value
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
                      <div className="flex items-center justify-between">
                        <Label htmlFor="api-source" className="text-sm">
                          API Source
                        </Label>
                        <Select
                          value={config.apiSource}
                          onValueChange={(value) => setConfig(prev => ({ ...prev, apiSource: value }))}
                        >
                          <SelectTrigger className="w-[200px]">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="chainreact">
                              <div className="flex items-center gap-2">
                                <Zap className="w-4 h-4" />
                                ChainReact API
                              </div>
                            </SelectItem>
                            <SelectItem value="custom">
                              <div className="flex items-center gap-2">
                                <Key className="w-4 h-4" />
                                Custom API Key
                              </div>
                            </SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      {config.apiSource === 'custom' && (
                        <div className="space-y-2">
                          <Label htmlFor="api-key" className="text-sm">
                            API Key
                            <span className="ml-2 text-xs text-muted-foreground">
                              Your key won't count against plan limits
                            </span>
                          </Label>
                          <Input
                            id="api-key"
                            type="password"
                            value={config.customApiKey}
                            onChange={(e) => setConfig(prev => ({ ...prev, customApiKey: e.target.value }))}
                            placeholder="sk-..."
                            className={errors.customApiKey ? "border-red-500" : ""}
                          />
                          {errors.customApiKey && (
                            <p className="text-xs text-red-500">{errors.customApiKey}</p>
                          )}
                        </div>
                      )}
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
                    console.log('🟢 [AIAgentConfigModal] Save button clicked!')
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
      
      {/* Action Selector Dialog - Matching Main Workflow Builder Design */}
      {showActionSelector && (
        <Dialog open={showActionSelector} onOpenChange={setShowActionSelector}>
          <DialogContent className="sm:max-w-[900px] h-[90vh] max-h-[90vh] w-full bg-gradient-to-br from-slate-50 to-white border-0 shadow-2xl flex flex-col overflow-hidden" style={{ paddingRight: '2rem' }}>
            <DialogHeader className="pb-3 border-b border-slate-200">
              <div className="flex items-center justify-between w-full">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-gradient-to-br from-blue-500 to-purple-600 rounded-lg text-white">
                    <Zap className="w-5 h-5" />
                  </div>
                  <div>
                    <DialogTitle className="text-xl font-semibold text-slate-900 flex items-center gap-2">
                      Select an Action
                      <Badge variant="secondary" className="bg-green-100 text-green-800 border-green-200">AI Chain</Badge>
                    </DialogTitle>
                    <DialogDescription className="text-sm text-slate-600 mt-1">
                      Choose an action to add to your AI agent chain.
                    </DialogDescription>
                  </div>
                </div>
                
                {/* AI/Manual Toggle */}
                <div className="flex items-center gap-2 mr-8">
                  <Label htmlFor="ai-mode-toggle" className="text-sm font-medium">
                    Configuration:
                  </Label>
                  <div className="flex items-center bg-muted rounded-lg p-1">
                    <Button
                      id="ai-mode"
                      variant={isAIMode ? "default" : "ghost"}
                      size="sm"
                      className="px-3 py-1 h-7"
                      onClick={() => setIsAIMode(true)}
                    >
                      <Bot className="w-3 h-3 mr-1" />
                      AI
                    </Button>
                    <Button
                      id="manual-mode"
                      variant={!isAIMode ? "default" : "ghost"}
                      size="sm"
                      className="px-3 py-1 h-7"
                      onClick={() => setIsAIMode(false)}
                    >
                      <Settings className="w-3 h-3 mr-1" />
                      Manual
                    </Button>
                  </div>
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
                </div>
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
                      value={actionSearchQuery}
                      onChange={(e) => setActionSearchQuery(e.target.value)}
                    />
                  </div>
                  <Select value={actionFilterCategory} onValueChange={setActionFilterCategory}>
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
                  <label className="flex items-center space-x-2 text-sm text-muted-foreground cursor-pointer">
                    <input
                      type="checkbox"
                      checked={showComingSoon}
                      onChange={(e) => setShowComingSoon(e.target.checked)}
                      className="rounded border-gray-300 text-primary focus:ring-primary"
                    />
                    <span>Show Coming Soon</span>
                  </label>
                </div>
              </div>
            </div>
            
            <div className="flex-1 flex min-h-0 overflow-hidden">
              <ScrollArea className="w-2/5 border-r border-border flex-1" style={{ scrollbarGutter: 'stable' }}>
                <div className="pt-2 pb-3 pl-3 pr-5">
                  {/* Integration List */}
                  {getFilteredIntegrations().map((integration, index) => {
                    const isConnected = isIntegrationConnected(integration.id)
                    const isComingSoon = comingSoonIntegrations.has(integration.id)
                    
                    return (
                      <div
                        key={`${integration.id}-${index}`}
                        className={`flex items-center p-3 rounded-md ${
                          isComingSoon
                            ? 'cursor-not-allowed opacity-60'
                            : 'cursor-pointer'
                        } ${
                          selectedActionIntegration?.id === integration.id 
                            ? 'bg-primary/10 ring-1 ring-primary/20' 
                            : 'hover:bg-muted/50'
                        }`}
                        onClick={() => {
                          if (!isComingSoon) {
                            setSelectedActionIntegration(integration)
                          }
                        }}
                      >
                        {renderIntegrationLogo(integration.id, integration.name)}
                        <span className="font-semibold ml-4 flex-grow truncate">
                          {integration.name}
                        </span>
                        {isComingSoon ? (
                          <Badge variant="secondary" className="ml-2 shrink-0">
                            Coming soon
                          </Badge>
                        ) : !isConnected && !['logic', 'core', 'manual', 'schedule', 'webhook'].includes(integration.id) ? (
                          <Button
                            size="sm"
                            variant="outline"
                            className="ml-2 shrink-0"
                            onClick={(e) => {
                              e.stopPropagation()
                              const config = INTEGRATION_CONFIGS[integration.id as keyof typeof INTEGRATION_CONFIGS]
                              if (config?.oauthUrl) {
                                window.location.href = config.oauthUrl
                              }
                            }}
                          >
                            <LinkIcon className="w-3 h-3 mr-1" />
                            Connect
                          </Button>
                        ) : null}
                      </div>
                    )
                  })}
                </div>
              </ScrollArea>
              
              <div className="w-3/5 flex-1">
                <ScrollArea className="h-full" style={{ scrollbarGutter: 'stable' }}>
                  <div className="p-4">
                    {/* Add instruction for double-click */}
                    {selectedActionIntegration && (isIntegrationConnected(selectedActionIntegration.id) || ['logic', 'core', 'manual', 'schedule', 'webhook'].includes(selectedActionIntegration.id)) && (
                      <div className="mb-3 text-sm text-muted-foreground bg-muted/50 p-2 rounded-md">
                        💡 <strong>Tip:</strong> Double-click an action to select it
                      </div>
                    )}
                    
                    {selectedActionIntegration ? (
                      !isIntegrationConnected(selectedActionIntegration.id) && !['logic', 'core', 'manual', 'schedule', 'webhook'].includes(selectedActionIntegration.id) ? (
                        // Show message for unconnected integrations
                        <div className="flex flex-col items-center justify-center h-full text-center">
                          <div className="text-muted-foreground mb-4">
                            <svg className="w-16 h-16 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                            </svg>
                          </div>
                          <h3 className="text-lg font-semibold mb-2">Connect {selectedActionIntegration.name}</h3>
                          <p className="text-sm text-muted-foreground mb-4">
                            You need to connect your {selectedActionIntegration.name} account to use these actions.
                          </p>
                          <Button
                            variant="default"
                            onClick={() => {
                              const config = INTEGRATION_CONFIGS[selectedActionIntegration.id as keyof typeof INTEGRATION_CONFIGS]
                              if (config?.oauthUrl) {
                                window.location.href = config.oauthUrl
                              }
                            }}
                          >
                            <LinkIcon className="w-4 h-4 mr-2" />
                            Connect {selectedActionIntegration.name}
                          </Button>
                        </div>
                      ) : (
                        <div className="h-full">
                          <div className="grid grid-cols-1 gap-3">
                            {selectedActionIntegration.actions
                            .filter((action: any) => {
                              if (actionSearchQuery) {
                                const query = actionSearchQuery.toLowerCase()
                                return (
                                  (action.title?.toLowerCase() || '').includes(query) || 
                                  (action.description?.toLowerCase() || '').includes(query)
                                )
                              }
                              return true
                            })
                            .map((action: any) => {
                              const isComingSoon = action.comingSoon
                              
                              return (
                                <div
                                  key={action.type}
                                  className={`p-4 border rounded-lg transition-all ${
                                    isComingSoon
                                      ? 'border-muted bg-muted/30 cursor-not-allowed opacity-60' 
                                      : selectedActionInModal?.type === action.type
                                        ? 'border-primary bg-primary/10 ring-1 ring-primary/20'
                                        : 'border-border hover:border-muted-foreground hover:shadow-sm cursor-pointer'
                                  }`}
                                  onClick={() => {
                                    if (isComingSoon) return
                                    // Single click just selects the action
                                    setSelectedActionInModal(action)
                                  }}
                                  onDoubleClick={() => {
                                    if (isComingSoon) return
                                    console.log('🎯 [AIAgentConfigModal] Action double-clicked:', {
                                      type: action.type,
                                      title: action.title,
                                      hasTitle: !!action.title,
                                      description: action.description,
                                      providerId: action.providerId,
                                      allKeys: Object.keys(action)
                                    })
                                    setSelectedActionInModal(action)
                                    handleActionSelection(action)
                                  }}
                                >
                                  <div className="flex items-start justify-between">
                                    <div className="flex-1">
                                      <p className={`font-medium ${isComingSoon ? 'text-muted-foreground' : ''}`}>
                                        {action.title || 'Unnamed Action'}
                                      </p>
                                      <p className="text-sm text-muted-foreground mt-1">
                                        {action.description || 'No description available'}
                                      </p>
                                    </div>
                                    <div className="flex items-center gap-2 ml-2">
                                      {isAIMode && !isComingSoon && (
                                        <span className="text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded-full">
                                          AI Config
                                        </span>
                                      )}
                                      {action.isAIEnabled && !isComingSoon && (
                                        <span className="text-xs bg-purple-100 text-purple-800 px-2 py-1 rounded-full">
                                          AI Ready
                                        </span>
                                      )}
                                      {isComingSoon && (
                                        <span className="text-xs bg-muted text-muted-foreground px-2 py-1 rounded-full">
                                          {/* Icon only on extra small screens */}
                                          <span className="inline sm:hidden">⏳</span>
                                          {/* "Soon" on small screens */}
                                          <span className="hidden sm:inline md:hidden">Soon</span>
                                          {/* "Coming Soon" on medium and larger screens */}
                                          <span className="hidden md:inline">Coming Soon</span>
                                        </span>
                                      )}
                                    </div>
                                  </div>
                                </div>
                              )
                            })}
                          </div>
                        </div>
                      )
                    ) : (
                      <div className="flex items-center justify-center h-full text-muted-foreground">
                        <p>Select an integration to see its actions</p>
                      </div>
                    )}
                  </div>
                </ScrollArea>
              </div>
            </div>
            
            {/* Footer with selection info and buttons - matching main workflow builder */}
            <div className="p-4 border-t border-slate-200 bg-slate-50/50">
              <div className="flex justify-between items-center">
                <div className="flex items-center gap-4">
                  <div className="text-sm text-muted-foreground">
                    {selectedActionIntegration && (
                      <>
                        <span className="font-medium">Integration:</span> {selectedActionIntegration.name}
                        {selectedActionInModal && (
                          <>
                            <span className="mx-2">•</span>
                            <span className="font-medium">Action:</span> {selectedActionInModal.title}
                          </>
                        )}
                      </>
                    )}
                  </div>
                  <div className="text-sm text-muted-foreground">
                    {isAIMode ? (
                      <span className="text-blue-600 font-medium">
                        <Bot className="w-3 h-3 inline mr-1" />
                        AI will configure all fields
                      </span>
                    ) : (
                      <span className="text-orange-600 font-medium">
                        <Settings className="w-3 h-3 inline mr-1" />
                        Manual configuration required
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    onClick={() => setShowActionSelector(false)}
                  >
                    Cancel
                  </Button>
                  <Button
                    disabled={!selectedActionIntegration || !selectedActionInModal}
                    onClick={() => {
                      if (selectedActionIntegration && selectedActionInModal) {
                        // Handle the action selection
                        if (isAIMode) {
                          handleAddActionWithAI(selectedActionInModal)
                        } else {
                          handleAddAction(selectedActionInModal)
                        }
                      }
                    }}
                  >
                    Continue →
                  </Button>
                </div>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </Dialog>
    </TooltipProvider>
  )
}
