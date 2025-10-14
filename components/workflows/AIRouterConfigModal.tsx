"use client"

import { useState, useEffect, useCallback, useMemo } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Dialog, DialogContentWithoutClose, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog"
import { Switch } from "@/components/ui/switch"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Slider } from "@/components/ui/slider"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { 
  Bot, Zap, Brain, Settings, Target, MessageSquare, Clock, 
  Sparkles, Database, Play, Save, AlertCircle, Plus, Trash2, 
  Edit2, ChevronDown, ChevronUp, DollarSign, Key, Shield,
  GitBranch, Cpu, HelpCircle, Copy, Check, X, Eye, EyeOff
} from "lucide-react"
import { cn } from "@/lib/utils"
import { AI_ROUTER_TEMPLATES } from "@/lib/workflows/nodes/providers/ai/aiRouterNode"
import { loadNodeConfig, saveNodeConfig } from "@/lib/workflows/configPersistence"
import { useIntegrationStore } from "@/stores/integrationStore"
import { useWorkflowTestStore } from "@/stores/workflowTestStore"
import { v4 as uuidv4 } from 'uuid'

import { logger } from '@/lib/utils/logger'

interface OutputPath {
  id: string
  name: string
  description?: string
  color: string
  chainId?: string
  condition: {
    type: 'ai_decision' | 'keyword' | 'regex' | 'confidence' | 'fallback'
    value?: string
    minConfidence?: number
  }
}

interface AIRouterConfig {
  template: string
  systemPrompt?: string
  memory: 'none' | 'workflow' | 'conversation' | 'vector'
  memoryProvider?: string
  model: string
  apiSource: 'chainreact' | 'custom'
  customApiKey?: string
  customApiProvider?: string
  outputPaths: OutputPath[]
  decisionMode: 'single' | 'multi' | 'weighted'
  temperature: number
  maxRetries: number
  timeout: number
  includeReasoning: boolean
  costLimit: number
}

interface AIRouterConfigModalProps {
  isOpen: boolean
  onClose: () => void
  onSave: (config: AIRouterConfig) => void
  onUpdateConnections?: (nodeId: string, outputPaths: OutputPath[]) => void
  initialData?: Partial<AIRouterConfig>
  workflowData?: { nodes: any[], edges: any[] }
  currentNodeId?: string
  availableChains?: Array<{ id: string; name?: string }>
}

export default function AIRouterConfigModal({
  isOpen,
  onClose,
  onSave,
  onUpdateConnections,
  initialData = {},
  workflowData,
  currentNodeId,
  availableChains = [],
}: AIRouterConfigModalProps) {
  // Get workflow ID from URL
  const getWorkflowId = useCallback(() => {
    if (typeof window === "undefined") return ""
    const pathParts = window.location.pathname.split('/')
    const builderIndex = pathParts.indexOf('builder')
    return builderIndex !== -1 && pathParts.length > builderIndex + 1 
      ? pathParts[builderIndex + 1] 
      : ""
  }, [])

  // Initialize with template defaults
  const getInitialConfig = (templateId: string = 'support_router'): AIRouterConfig => {
    const template = AI_ROUTER_TEMPLATES[templateId as keyof typeof AI_ROUTER_TEMPLATES]
    return {
      template: templateId,
      systemPrompt: template?.systemPrompt || '',
      memory: 'workflow',
      model: 'gpt-4-turbo',
      apiSource: 'chainreact',
      outputPaths: template?.defaultOutputs || [],
      decisionMode: 'single',
      temperature: 0.3,
      maxRetries: 1,
      timeout: 30,
      includeReasoning: true,
      costLimit: 0.50,
      ...initialData
    }
  }

  const [config, setConfig] = useState<AIRouterConfig>(getInitialConfig(initialData.template))
  const [activeTab, setActiveTab] = useState("basic")
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [isLoadingSavedConfig, setIsLoadingSavedConfig] = useState(false)
  const [editingPath, setEditingPath] = useState<string | null>(null)
  const [showApiKey, setShowApiKey] = useState(false)
  const [estimatedCost, setEstimatedCost] = useState(0)
  const [copiedPathId, setCopiedPathId] = useState<string | null>(null)

  const initialChains = useMemo(() => {
    const maybeChains = (initialData as any)?.chains
    if (Array.isArray(maybeChains)) {
      return maybeChains.filter((chain) => chain && typeof chain === 'object' && chain.id)
    }
    return []
  }, [initialData])

  const chainOptions = useMemo(() => {
    const combined = [...availableChains, ...initialChains]
    const seen = new Set<string>()
    return combined.filter((chain) => {
      if (!chain?.id) return false
      if (seen.has(chain.id)) return false
      seen.add(chain.id)
      return true
    })
  }, [availableChains, initialChains])

  const chainLabelMap = useMemo(() => {
    const map = new Map<string, string>()
    chainOptions.forEach((chain) => {
      if (chain?.id) {
        map.set(chain.id, chain.name || chain.id)
      }
    })
    return map
  }, [chainOptions])

  // Get test data from workflow test store
  const { getNodeInputOutput } = useWorkflowTestStore()

  // Model pricing for cost estimation
  const MODEL_COSTS = {
    'gpt-4-turbo': 0.03,
    'gpt-4o-mini': 0.001,
    'gpt-3.5-turbo': 0.002,
    'claude-3-opus': 0.075,
    'claude-3-sonnet': 0.015,
    'claude-3-haiku': 0.003,
    'gemini-pro': 0.001,
    'mistral-large': 0.008
  }

  // Load saved configuration
  useEffect(() => {
    if (isOpen && currentNodeId && currentNodeId !== 'pending-action') {
      const loadSavedConfig = async () => {
        const workflowId = getWorkflowId()
        if (workflowId) {
          setIsLoadingSavedConfig(true)
          try {
            const savedNodeData = await loadNodeConfig(workflowId, currentNodeId, "ai_router")
            if (savedNodeData?.config) {
              setConfig(prev => ({ ...prev, ...savedNodeData.config }))
            }
          } catch (error) {
            logger.error('Failed to load saved configuration:', error)
          } finally {
            setIsLoadingSavedConfig(false)
          }
        }
      }
      loadSavedConfig()
    }
  }, [isOpen, currentNodeId, getWorkflowId])

  // Update estimated cost when model changes
  useEffect(() => {
    const baseCost = MODEL_COSTS[config.model as keyof typeof MODEL_COSTS] || 0.01
    setEstimatedCost(baseCost)
  }, [config.model])

  // Template change handler
  const handleTemplateChange = (templateId: string) => {
    const template = AI_ROUTER_TEMPLATES[templateId as keyof typeof AI_ROUTER_TEMPLATES]
    if (template) {
      setConfig(prev => ({
        ...prev,
        template: templateId,
        systemPrompt: template.systemPrompt,
        outputPaths: template.defaultOutputs
      }))
    }
  }

  // Output path management
  const addOutputPath = () => {
    const newPath: OutputPath = {
      id: uuidv4(),
      name: `Output ${config.outputPaths.length + 1}`,
      description: '',
      color: `#${ Math.floor(Math.random()*16777215).toString(16)}`,
      chainId: undefined,
      condition: {
        type: 'ai_decision',
        minConfidence: 0.7
      }
    }
    setConfig(prev => ({
      ...prev,
      outputPaths: [...prev.outputPaths, newPath]
    }))
    setEditingPath(newPath.id)
  }

  const updateOutputPath = (pathId: string, updates: Partial<OutputPath>) => {
    setConfig(prev => ({
      ...prev,
      outputPaths: prev.outputPaths.map(path => 
        path.id === pathId ? { ...path, ...updates } : path
      )
    }))
  }

  const deleteOutputPath = (pathId: string) => {
    setConfig(prev => ({
      ...prev,
      outputPaths: prev.outputPaths.filter(path => path.id !== pathId)
    }))
  }

  const duplicateOutputPath = (pathId: string) => {
    const pathToDuplicate = config.outputPaths.find(p => p.id === pathId)
    if (pathToDuplicate) {
      const newPath: OutputPath = {
        ...pathToDuplicate,
        id: uuidv4(),
        name: `${pathToDuplicate.name} (Copy)`
      }
      setConfig(prev => ({
        ...prev,
        outputPaths: [...prev.outputPaths, newPath]
      }))
    }
  }

  // Validation
  const validateConfig = (): boolean => {
    const newErrors: Record<string, string> = {}

    if (config.outputPaths.length < 2) {
      newErrors.outputPaths = "At least 2 output paths are required"
    }

    if (config.template === 'custom' && !config.systemPrompt?.trim()) {
      newErrors.systemPrompt = "System prompt is required for custom template"
    }

    if (config.apiSource === 'custom' && !config.customApiKey) {
      newErrors.customApiKey = "API key is required when using custom API"
    }

    if (config.costLimit <= 0) {
      newErrors.costLimit = "Cost limit must be greater than 0"
    }

    // Check for duplicate path names
    const pathNames = config.outputPaths.map(p => p.name)
    if (new Set(pathNames).size !== pathNames.length) {
      newErrors.paths = "Output path names must be unique"
    }

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  // Save handler
  const handleSave = async () => {
    if (!validateConfig()) return

    // Save configuration
    if (currentNodeId && currentNodeId !== 'pending-action') {
      const workflowId = getWorkflowId()
      if (workflowId) {
        try {
          await saveNodeConfig(workflowId, currentNodeId, "ai_router", config)
        } catch (error) {
          logger.error('Failed to save configuration:', error)
        }
      }
    }

    // Update workflow connections with output paths
    if (onUpdateConnections && currentNodeId) {
      onUpdateConnections(currentNodeId, config.outputPaths)
    }

    onSave(config)
    onClose()
  }

  // Test routing
  const testRouting = async () => {
    // Get test input from connected nodes
    const testInput = getNodeInputOutput(currentNodeId!)?.input || {
      message: "This is a test message for routing"
    }

    // Simulate routing decision
    logger.debug('Testing routing with input:', testInput)
    logger.debug('Configuration:', config)
    
    // Show test results in UI
    // This would trigger actual AI call in production
  }

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContentWithoutClose className="sm:max-w-[1600px] max-h-[95vh] w-full bg-gradient-to-br from-slate-50 to-white border-0 shadow-2xl">
        <div className="flex flex-col h-full">
          {/* Header */}
          <DialogHeader className="pb-3 border-b border-slate-200">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-gradient-to-br from-purple-500 to-blue-600 rounded-lg text-white">
                  <GitBranch className="w-5 h-5" />
                </div>
                <div>
                  <DialogTitle className="text-xl font-semibold text-slate-900 flex items-center gap-2">
                    AI Router Configuration
                    <Badge variant="secondary" className="bg-purple-100 text-purple-800 border-purple-200">
                      Multi-Path
                    </Badge>
                  </DialogTitle>
                  <DialogDescription className="text-sm text-slate-600 mt-1">
                    Configure intelligent routing with multiple output paths
                  </DialogDescription>
                </div>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={onClose}
                className="h-8 w-8 p-0 hover:bg-red-50 hover:text-red-600"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          </DialogHeader>

          {/* Configuration Tabs */}
          <ScrollArea className="flex-1 px-6">
            <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full mt-4">
              <TabsList className="grid w-full grid-cols-4">
                <TabsTrigger value="basic">Template & Paths</TabsTrigger>
                <TabsTrigger value="model">Model & Memory</TabsTrigger>
                <TabsTrigger value="api">API & Billing</TabsTrigger>
                <TabsTrigger value="advanced">Advanced</TabsTrigger>
              </TabsList>

              {/* Basic Tab - Template and Output Paths */}
              <TabsContent value="basic" className="space-y-6 mt-6">
                {/* Template Selection */}
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Target className="w-5 h-5" />
                      Router Template
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <Select
                      value={config.template}
                      onValueChange={handleTemplateChange}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {Object.entries(AI_ROUTER_TEMPLATES).map(([key, template]) => (
                          <SelectItem key={key} value={key}>
                            <div className="flex items-center gap-2">
                              <span>{template.icon}</span>
                              <div>
                                <div className="font-medium">{template.name}</div>
                                <div className="text-xs text-muted-foreground">
                                  {template.description}
                                </div>
                              </div>
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>

                    {config.template === 'custom' && (
                      <div className="space-y-2">
                        <Label>Custom System Prompt</Label>
                        <Textarea
                          value={config.systemPrompt}
                          onChange={(e) => setConfig(prev => ({ ...prev, systemPrompt: e.target.value }))}
                          placeholder="Define how the AI should analyze and route incoming data..."
                          className="min-h-[150px] font-mono text-sm"
                        />
                        {errors.systemPrompt && (
                          <p className="text-sm text-red-600">{errors.systemPrompt}</p>
                        )}
                      </div>
                    )}
                  </CardContent>
                </Card>

                {/* Output Paths */}
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <GitBranch className="w-5 h-5" />
                        Output Paths
                      </div>
                      <Button
                        size="sm"
                        onClick={addOutputPath}
                        disabled={config.outputPaths.length >= 10}
                      >
                        <Plus className="w-4 h-4 mr-1" />
                        Add Path
                      </Button>
                    </CardTitle>
                    <CardDescription>
                      Define the routing paths. The AI will choose which path(s) to trigger.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {errors.outputPaths && (
                      <Alert variant="destructive">
                        <AlertCircle className="h-4 w-4" />
                        <AlertDescription>{errors.outputPaths}</AlertDescription>
                      </Alert>
                    )}

                    {config.outputPaths.map((path, index) => (
                      <div
                        key={path.id}
                        className={cn(
                          "p-4 border rounded-lg transition-all",
                          editingPath === path.id ? "border-blue-500 bg-blue-50/50" : "hover:bg-gray-50"
                        )}
                      >
                        <div className="flex items-start justify-between">
                          <div className="flex-1 space-y-3">
                            {editingPath === path.id ? (
                              <>
                                <div className="grid grid-cols-2 gap-3">
                                  <div>
                                    <Label>Path Name</Label>
                                    <Input
                                      value={path.name}
                                      onChange={(e) => updateOutputPath(path.id, { name: e.target.value })}
                                      placeholder="e.g., Bug Report"
                                    />
                                  </div>
                                  <div>
                                    <Label>Color</Label>
                                    <div className="flex gap-2">
                                      <Input
                                        type="color"
                                        value={path.color}
                                        onChange={(e) => updateOutputPath(path.id, { color: e.target.value })}
                                        className="w-20"
                                      />
                                      <Input
                                        value={path.color}
                                        onChange={(e) => updateOutputPath(path.id, { color: e.target.value })}
                                        placeholder="#3b82f6"
                                      />
                                    </div>
                                  </div>
                                </div>

                                <div>
                                  <Label>Description</Label>
                                  <Input
                                    value={path.description}
                                    onChange={(e) => updateOutputPath(path.id, { description: e.target.value })}
                                    placeholder="When to use this path..."
                                  />
                                </div>

                                <div>
                                  <Label>Chain to Execute (optional)</Label>
                                  {chainOptions.length > 0 ? (
                                    <Select
                                      value={path.chainId || 'none'}
                                      onValueChange={(value) => {
                                        updateOutputPath(path.id, { chainId: value === 'none' ? undefined : value })
                                      }}
                                    >
                                      <SelectTrigger>
                                        <SelectValue placeholder="Select a chain" />
                                      </SelectTrigger>
                                      <SelectContent>
                                        <SelectItem value="none">No chain</SelectItem>
                                        {chainOptions.map((chain) => (
                                          <SelectItem key={chain.id} value={chain.id}>
                                            {chain.name || chain.id}
                                          </SelectItem>
                                        ))}
                                      </SelectContent>
                                    </Select>
                                  ) : (
                                    <Input
                                      value={path.chainId || ''}
                                      onChange={(e) => updateOutputPath(path.id, { chainId: e.target.value || undefined })}
                                      placeholder="Enter chain ID (optional)"
                                    />
                                  )}
                                </div>

                                <div className="grid grid-cols-2 gap-3">
                                  <div>
                                    <Label>Condition Type</Label>
                                    <Select
                                      value={path.condition.type}
                                      onValueChange={(value) => updateOutputPath(path.id, {
                                        condition: { ...path.condition, type: value as any }
                                      })}
                                    >
                                      <SelectTrigger>
                                        <SelectValue />
                                      </SelectTrigger>
                                      <SelectContent>
                                        <SelectItem value="ai_decision">AI Decision</SelectItem>
                                        <SelectItem value="keyword">Keyword Match</SelectItem>
                                        <SelectItem value="regex">Regex Pattern</SelectItem>
                                        <SelectItem value="confidence">Confidence Threshold</SelectItem>
                                        <SelectItem value="fallback">Fallback/Default</SelectItem>
                                      </SelectContent>
                                    </Select>
                                  </div>

                                  {path.condition.type === 'ai_decision' && (
                                    <div>
                                      <Label>Min Confidence</Label>
                                      <Input
                                        type="number"
                                        min="0"
                                        max="1"
                                        step="0.1"
                                        value={path.condition.minConfidence || 0.7}
                                        onChange={(e) => updateOutputPath(path.id, {
                                          condition: { ...path.condition, minConfidence: parseFloat(e.target.value) }
                                        })}
                                      />
                                    </div>
                                  )}

                                  {(path.condition.type === 'keyword' || path.condition.type === 'regex') && (
                                    <div>
                                      <Label>Pattern/Keywords</Label>
                                      <Input
                                        value={path.condition.value || ''}
                                        onChange={(e) => updateOutputPath(path.id, {
                                          condition: { ...path.condition, value: e.target.value }
                                        })}
                                        placeholder={path.condition.type === 'keyword' ? 'bug, error, crash' : '.*error.*'}
                                      />
                                    </div>
                                  )}
                                </div>

                                <div className="flex justify-end gap-2">
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => setEditingPath(null)}
                                  >
                                    Done
                                  </Button>
                                </div>
                              </>
                            ) : (
                              <>
                                    <div className="flex items-center gap-3">
                                      <div
                                        className="w-4 h-4 rounded-full"
                                        style={{ backgroundColor: path.color }}
                                      />
                                      <div className="flex-1">
                                        <div className="font-medium">{path.name}</div>
                                        {path.description && (
                                          <div className="text-sm text-muted-foreground">{path.description}</div>
                                        )}
                                        {path.chainId && (
                                          <div className="text-xs text-purple-700 bg-purple-100 inline-flex px-2 py-1 rounded mt-1">
                                            Chain: {chainLabelMap.get(path.chainId) || path.chainId}
                                          </div>
                                        )}
                                        <div className="flex items-center gap-2 mt-1">
                                          <Badge variant="outline" className="text-xs">
                                            {path.condition.type}
                                          </Badge>
                                          {path.condition.minConfidence && (
                                        <Badge variant="outline" className="text-xs">
                                          {Math.round(path.condition.minConfidence * 100)}% confidence
                                        </Badge>
                                      )}
                                      {path.condition.value && (
                                        <Badge variant="outline" className="text-xs">
                                          {path.condition.value}
                                        </Badge>
                                      )}
                                    </div>
                                  </div>
                                </div>
                              </>
                            )}
                          </div>

                          {editingPath !== path.id && (
                            <div className="flex items-center gap-1">
                              <TooltipProvider>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Button
                                      size="sm"
                                      variant="ghost"
                                      onClick={() => setEditingPath(path.id)}
                                    >
                                      <Edit2 className="w-4 h-4" />
                                    </Button>
                                  </TooltipTrigger>
                                  <TooltipContent>Edit</TooltipContent>
                                </Tooltip>
                              </TooltipProvider>

                              <TooltipProvider>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Button
                                      size="sm"
                                      variant="ghost"
                                      onClick={() => {
                                        duplicateOutputPath(path.id)
                                        setCopiedPathId(path.id)
                                        setTimeout(() => setCopiedPathId(null), 2000)
                                      }}
                                    >
                                      {copiedPathId === path.id ? (
                                        <Check className="w-4 h-4 text-green-600" />
                                      ) : (
                                        <Copy className="w-4 h-4" />
                                      )}
                                    </Button>
                                  </TooltipTrigger>
                                  <TooltipContent>Duplicate</TooltipContent>
                                </Tooltip>
                              </TooltipProvider>

                              <TooltipProvider>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Button
                                      size="sm"
                                      variant="ghost"
                                      onClick={() => deleteOutputPath(path.id)}
                                      disabled={config.outputPaths.length <= 2}
                                    >
                                      <Trash2 className="w-4 h-4 text-red-600" />
                                    </Button>
                                  </TooltipTrigger>
                                  <TooltipContent>Delete</TooltipContent>
                                </Tooltip>
                              </TooltipProvider>
                            </div>
                          )}
                        </div>
                      </div>
                    ))}

                    {/* Decision Mode */}
                    <div className="pt-4 border-t">
                      <Label>Decision Mode</Label>
                      <Select
                        value={config.decisionMode}
                        onValueChange={(value) => setConfig(prev => ({ ...prev, decisionMode: value as any }))}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="single">
                            <div>
                              <div className="font-medium">Single Path</div>
                              <div className="text-xs text-muted-foreground">
                                Route to one output only
                              </div>
                            </div>
                          </SelectItem>
                          <SelectItem value="multi">
                            <div>
                              <div className="font-medium">Multi-Path</div>
                              <div className="text-xs text-muted-foreground">
                                Can trigger multiple outputs
                              </div>
                            </div>
                          </SelectItem>
                          <SelectItem value="weighted">
                            <div>
                              <div className="font-medium">Weighted</div>
                              <div className="text-xs text-muted-foreground">
                                Distribute based on confidence
                              </div>
                            </div>
                          </SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>

              {/* Model & Memory Tab */}
              <TabsContent value="model" className="space-y-6 mt-6">
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Brain className="w-5 h-5" />
                      AI Model
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div>
                      <Label>Model</Label>
                      <Select
                        value={config.model}
                        onValueChange={(value) => setConfig(prev => ({ ...prev, model: value }))}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="gpt-4-turbo">
                            <div className="flex items-center justify-between w-full">
                              <span>GPT-4 Turbo</span>
                              <Badge variant="outline" className="ml-2">
                                ~${MODEL_COSTS['gpt-4-turbo']}/call
                              </Badge>
                            </div>
                          </SelectItem>
                          <SelectItem value="gpt-4o-mini">
                            <div className="flex items-center justify-between w-full">
                              <span>GPT-4 Mini</span>
                              <Badge variant="outline" className="ml-2">
                                ~${MODEL_COSTS['gpt-4o-mini']}/call
                              </Badge>
                            </div>
                          </SelectItem>
                          <SelectItem value="gpt-3.5-turbo">
                            <div className="flex items-center justify-between w-full">
                              <span>GPT-3.5 Turbo</span>
                              <Badge variant="outline" className="ml-2">
                                ~${MODEL_COSTS['gpt-3.5-turbo']}/call
                              </Badge>
                            </div>
                          </SelectItem>
                          <SelectItem value="claude-3-opus">
                            <div className="flex items-center justify-between w-full">
                              <span>Claude 3 Opus</span>
                              <Badge variant="outline" className="ml-2">
                                ~${MODEL_COSTS['claude-3-opus']}/call
                              </Badge>
                            </div>
                          </SelectItem>
                          <SelectItem value="claude-3-sonnet">
                            <div className="flex items-center justify-between w-full">
                              <span>Claude 3 Sonnet</span>
                              <Badge variant="outline" className="ml-2">
                                ~${MODEL_COSTS['claude-3-sonnet']}/call
                              </Badge>
                            </div>
                          </SelectItem>
                          <SelectItem value="claude-3-haiku">
                            <div className="flex items-center justify-between w-full">
                              <span>Claude 3 Haiku</span>
                              <Badge variant="outline" className="ml-2">
                                ~${MODEL_COSTS['claude-3-haiku']}/call
                              </Badge>
                            </div>
                          </SelectItem>
                          <SelectItem value="gemini-pro">
                            <div className="flex items-center justify-between w-full">
                              <span>Gemini Pro</span>
                              <Badge variant="outline" className="ml-2">
                                ~${MODEL_COSTS['gemini-pro']}/call
                              </Badge>
                            </div>
                          </SelectItem>
                          <SelectItem value="mistral-large">
                            <div className="flex items-center justify-between w-full">
                              <span>Mistral Large</span>
                              <Badge variant="outline" className="ml-2">
                                ~${MODEL_COSTS['mistral-large']}/call
                              </Badge>
                            </div>
                          </SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div>
                      <Label>Temperature</Label>
                      <div className="flex items-center gap-4">
                        <Slider
                          value={[config.temperature]}
                          onValueChange={([value]) => setConfig(prev => ({ ...prev, temperature: value }))}
                          max={1}
                          min={0}
                          step={0.1}
                          className="flex-1"
                        />
                        <span className="w-12 text-sm font-mono">{config.temperature}</span>
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">
                        Lower = more consistent, Higher = more creative
                      </p>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Database className="w-5 h-5" />
                      Memory & Context
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div>
                      <Label>Memory Type</Label>
                      <Select
                        value={config.memory}
                        onValueChange={(value) => setConfig(prev => ({ ...prev, memory: value as any }))}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">
                            <div>
                              <div className="font-medium">No Memory</div>
                              <div className="text-xs text-muted-foreground">
                                Stateless routing
                              </div>
                            </div>
                          </SelectItem>
                          <SelectItem value="workflow">
                            <div>
                              <div className="font-medium">Workflow Context</div>
                              <div className="text-xs text-muted-foreground">
                                Remember within this workflow run
                              </div>
                            </div>
                          </SelectItem>
                          <SelectItem value="conversation">
                            <div>
                              <div className="font-medium">Conversation Memory</div>
                              <div className="text-xs text-muted-foreground">
                                Remember across runs
                              </div>
                            </div>
                          </SelectItem>
                          <SelectItem value="vector">
                            <div>
                              <div className="font-medium">Vector Storage</div>
                              <div className="text-xs text-muted-foreground">
                                Semantic memory search
                              </div>
                            </div>
                          </SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    {config.memory === 'vector' && (
                      <div>
                        <Label>Vector Database</Label>
                        <Select
                          value={config.memoryProvider}
                          onValueChange={(value) => setConfig(prev => ({ ...prev, memoryProvider: value }))}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Select vector database" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="pinecone">Pinecone</SelectItem>
                            <SelectItem value="weaviate">Weaviate</SelectItem>
                            <SelectItem value="supabase">Supabase Vector</SelectItem>
                            <SelectItem value="qdrant">Qdrant</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>

              {/* API & Billing Tab */}
              <TabsContent value="api" className="space-y-6 mt-6">
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Key className="w-5 h-5" />
                      API Configuration
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div>
                      <Label>API Source</Label>
                      <Select
                        value={config.apiSource}
                        onValueChange={(value) => setConfig(prev => ({ ...prev, apiSource: value as any }))}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="chainreact">
                            <div className="flex items-center gap-2">
                              <Shield className="w-4 h-4" />
                              <div>
                                <div className="font-medium">Use ChainReact API</div>
                                <div className="text-xs text-muted-foreground">
                                  Metered billing, no API key needed
                                </div>
                              </div>
                            </div>
                          </SelectItem>
                          <SelectItem value="custom">
                            <div className="flex items-center gap-2">
                              <Key className="w-4 h-4" />
                              <div>
                                <div className="font-medium">Use My Own API Key</div>
                                <div className="text-xs text-muted-foreground">
                                  Direct billing from provider
                                </div>
                              </div>
                            </div>
                          </SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    {config.apiSource === 'custom' && (
                      <>
                        <div>
                          <Label>API Provider</Label>
                          <Select
                            value={config.customApiProvider}
                            onValueChange={(value) => setConfig(prev => ({ ...prev, customApiProvider: value }))}
                          >
                            <SelectTrigger>
                              <SelectValue placeholder="Select provider" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="openai">OpenAI</SelectItem>
                              <SelectItem value="anthropic">Anthropic (Claude)</SelectItem>
                              <SelectItem value="google">Google (Gemini)</SelectItem>
                              <SelectItem value="mistral">Mistral AI</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>

                        <div>
                          <Label>API Key</Label>
                          <div className="flex gap-2">
                            <Input
                              type={showApiKey ? "text" : "password"}
                              value={config.customApiKey || ''}
                              onChange={(e) => setConfig(prev => ({ ...prev, customApiKey: e.target.value }))}
                              placeholder="sk-..."
                            />
                            <Button
                              size="icon"
                              variant="outline"
                              onClick={() => setShowApiKey(!showApiKey)}
                            >
                              {showApiKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                            </Button>
                          </div>
                          {errors.customApiKey && (
                            <p className="text-sm text-red-600 mt-1">{errors.customApiKey}</p>
                          )}
                          <p className="text-xs text-muted-foreground mt-1">
                            Your API key will be encrypted and stored securely
                          </p>
                        </div>
                      </>
                    )}

                    <div>
                      <Label>Cost Limit per Execution</Label>
                      <div className="flex items-center gap-2">
                        <DollarSign className="w-4 h-4 text-muted-foreground" />
                        <Input
                          type="number"
                          min="0.01"
                          max="10"
                          step="0.01"
                          value={config.costLimit}
                          onChange={(e) => setConfig(prev => ({ ...prev, costLimit: parseFloat(e.target.value) }))}
                        />
                      </div>
                      {errors.costLimit && (
                        <p className="text-sm text-red-600 mt-1">{errors.costLimit}</p>
                      )}
                      <p className="text-xs text-muted-foreground mt-1">
                        Maximum cost allowed per routing decision
                      </p>
                    </div>

                    {config.apiSource === 'chainreact' && (
                      <Alert>
                        <DollarSign className="h-4 w-4" />
                        <AlertDescription>
                          <div className="space-y-2">
                            <p className="font-medium">Estimated Cost per Execution</p>
                            <div className="flex items-center justify-between">
                              <span>Model: {config.model}</span>
                              <Badge variant="secondary">
                                ~${estimatedCost.toFixed(3)}/call
                              </Badge>
                            </div>
                            <p className="text-xs text-muted-foreground">
                              Actual cost depends on input/output length. You will be billed based on usage.
                            </p>
                          </div>
                        </AlertDescription>
                      </Alert>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>

              {/* Advanced Tab */}
              <TabsContent value="advanced" className="space-y-6 mt-6">
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Settings className="w-5 h-5" />
                      Advanced Settings
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div>
                      <Label>Max Retries</Label>
                      <Input
                        type="number"
                        min="0"
                        max="3"
                        value={config.maxRetries}
                        onChange={(e) => setConfig(prev => ({ ...prev, maxRetries: parseInt(e.target.value) }))}
                      />
                      <p className="text-xs text-muted-foreground mt-1">
                        Number of retry attempts if routing fails
                      </p>
                    </div>

                    <div>
                      <Label>Timeout (seconds)</Label>
                      <Input
                        type="number"
                        min="5"
                        max="60"
                        value={config.timeout}
                        onChange={(e) => setConfig(prev => ({ ...prev, timeout: parseInt(e.target.value) }))}
                      />
                      <p className="text-xs text-muted-foreground mt-1">
                        Maximum time to wait for routing decision
                      </p>
                    </div>

                    <div className="flex items-center justify-between">
                      <div>
                        <Label>Include Reasoning</Label>
                        <p className="text-xs text-muted-foreground">
                          Include AI's explanation in output
                        </p>
                      </div>
                      <Switch
                        checked={config.includeReasoning}
                        onCheckedChange={(checked) => setConfig(prev => ({ ...prev, includeReasoning: checked }))}
                      />
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>
          </ScrollArea>

          {/* Footer */}
          <DialogFooter className="px-6 py-4 border-t border-border">
            <div className="flex items-center justify-between w-full">
              <div className="flex items-center gap-2">
                {config.outputPaths.length > 0 && (
                  <Badge variant="outline">
                    {config.outputPaths.length} paths configured
                  </Badge>
                )}
                {estimatedCost > 0 && (
                  <Badge variant="outline">
                    ~${estimatedCost}/call
                  </Badge>
                )}
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  onClick={testRouting}
                  disabled={!currentNodeId || config.outputPaths.length < 2}
                >
                  <Play className="w-4 h-4 mr-1" />
                  Test Routing
                </Button>
                <Button onClick={handleSave}>
                  <Save className="w-4 h-4 mr-1" />
                  Save Configuration
                </Button>
              </div>
            </div>
          </DialogFooter>
        </div>
      </DialogContentWithoutClose>
    </Dialog>
  )
}
