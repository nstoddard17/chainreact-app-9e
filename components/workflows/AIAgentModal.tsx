"use client"

import React, { useState, useEffect, useRef } from 'react'
import {
  Dialog,
  DialogContent,
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
import { 
  Bot, 
  Sparkles, 
  Brain, 
  Zap, 
  Settings, 
  Code,
  Eye,
  Search,
  DollarSign,
  Info,
  AlertCircle,
  CheckCircle,
  X,
  Plus,
  ChevronRight,
  Variable,
  Lightbulb,
  Target,
  Wand2,
  BookOpen,
  MessageSquare,
  Gauge,
  Key,
  HelpCircle,
  ArrowRight
} from 'lucide-react'
import { LightningLoader } from '@/components/ui/lightning-loader'
import { useToast } from '@/hooks/use-toast'
import { AIVariableMenu } from './AIVariableMenu'
import { useAIVariables } from '@/hooks/useAIVariables'
import { AIFieldControl } from './AIFieldControl'
import { cn } from '@/lib/utils'
import { AIAgentFlowBuilder } from './AIAgentFlowBuilder'
import AIAgentVisualChainBuilder from './AIAgentVisualChainBuilder'
import { ChainActionConfigModal } from './ChainActionConfigModal'

import { logger } from '@/lib/utils/logger'

interface AIAgentModalProps {
  isOpen: boolean
  onClose: () => void
  onSave: (config: any) => void
  onChainsUpdate?: (chains: any) => void
  initialConfig?: any
  nodes: any[]
  currentNodeId?: string
  workflowId?: string
}

// AI Models with their capabilities and pricing
const AI_MODELS = {
  'gpt-4-turbo': { 
    name: 'GPT-4 Turbo', 
    provider: 'OpenAI',
    capabilities: ['Advanced reasoning', 'Complex tasks', 'Long context'],
    costPer1k: { input: 0.01, output: 0.03 },
    contextWindow: 128000
  },
  'gpt-3.5-turbo': { 
    name: 'GPT-3.5 Turbo', 
    provider: 'OpenAI',
    capabilities: ['Fast responses', 'Good for simple tasks', 'Cost-effective'],
    costPer1k: { input: 0.0005, output: 0.0015 },
    contextWindow: 16000
  },
  'claude-3-opus': { 
    name: 'Claude 3 Opus', 
    provider: 'Anthropic',
    capabilities: ['Nuanced understanding', 'Creative tasks', 'Safety-focused'],
    costPer1k: { input: 0.015, output: 0.075 },
    contextWindow: 200000
  },
  'claude-3-sonnet': { 
    name: 'Claude 3 Sonnet', 
    provider: 'Anthropic',
    capabilities: ['Balanced performance', 'Good value', 'Fast'],
    costPer1k: { input: 0.003, output: 0.015 },
    contextWindow: 200000
  },
  'gemini-pro': { 
    name: 'Gemini Pro', 
    provider: 'Google',
    capabilities: ['Multimodal', 'Fast', 'Free tier available'],
    costPer1k: { input: 0.00025, output: 0.0005 },
    contextWindow: 32000
  }
}

export function AIAgentModal({
  isOpen,
  onClose,
  onSave,
  onChainsUpdate,
  initialConfig = {},
  nodes,
  currentNodeId,
  workflowId
}: AIAgentModalProps) {
  const { toast } = useToast()
  const [activeTab, setActiveTab] = useState('chains')
  const [config, setConfig] = useState({
    prompt: '',
    model: 'gpt-3.5-turbo',
    temperature: 0.7,
    maxTokens: 1000,
    tone: 'professional',
    verbosity: 'concise',
    includeEmojis: false,
    memory: 'none',
    apiSource: 'chainreact',
    customApiKey: '',
    customInstructions: '',
    outputFormat: 'text',
    targetActions: [],
    autoDiscoverActions: true,
    fieldBehavior: 'smart',
    ...initialConfig
  })

  const [isDiscovering, setIsDiscovering] = useState(false)
  const [discoveredActions, setDiscoveredActions] = useState<any[]>([])
  const [previewData, setPreviewData] = useState<any>(null)
  const [estimatedCost, setEstimatedCost] = useState(0)
  const [showApiKeyInput, setShowApiKeyInput] = useState(false)
  const [chains, setChains] = useState<any[]>(initialConfig.chains || [])
  const [chainsLayoutData, setChainsLayoutData] = useState<any>(null)
  const [showActionDialog, setShowActionDialog] = useState(false)
  const [aiAgentActionCallback, setAiAgentActionCallback] = useState<((nodeType: string, providerId: string, config?: any) => void) | null>(null)

  const promptRef = useRef<HTMLTextAreaElement>(null)
  const instructionsRef = useRef<HTMLTextAreaElement>(null)

  const { variableGroups, insertVariable, hasAIAgent } = useAIVariables({
    nodes,
    currentNodeId,
    hasAIAgent: true
  })

  useEffect(() => {
    setConfig(prev => ({ ...prev, ...initialConfig }))
  }, [initialConfig])

  // Calculate estimated cost
  useEffect(() => {
    const model = AI_MODELS[config.model as keyof typeof AI_MODELS]
    if (model) {
      const avgTokens = config.maxTokens / 2
      const inputCost = (avgTokens / 1000) * model.costPer1k.input
      const outputCost = (avgTokens / 1000) * model.costPer1k.output
      setEstimatedCost(inputCost + outputCost)
    }
  }, [config.model, config.maxTokens])

  const handleFieldChange = (field: string, value: any) => {
    setConfig(prev => ({ ...prev, [field]: value }))
  }

  const handleDiscoverActions = async () => {
    if (!config.prompt) {
      toast({
        title: "Prompt Required",
        description: "Please enter a prompt to discover relevant actions",
        variant: "destructive"
      })
      return
    }

    setIsDiscovering(true)
    try {
      const response = await fetch('/api/workflows/ai/search-actions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'intent',
          query: config.prompt,
          availableActions: nodes
            .filter(n => n.type !== 'trigger' && n.type !== 'ai_agent')
            .map(n => n.data?.type || n.type)
        })
      })

      const data = await response.json()
      if (data.success && data.matches) {
        setDiscoveredActions(data.matches)
        toast({
          title: "Actions Discovered",
          description: `Found ${data.matches.length} relevant actions based on your prompt`
        })
      }
    } catch (error) {
      logger.error('Action discovery failed:', error)
      toast({
        title: "Discovery Failed",
        description: "Could not discover actions. Please try again.",
        variant: "destructive"
      })
    } finally {
      setIsDiscovering(false)
    }
  }

  const handlePreviewFields = async () => {
    try {
      const response = await fetch('/api/workflows/ai/resolve-fields', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'preview',
          nodeType: 'ai_agent',
          config,
          sampleData: {
            trigger: {
              email: {
                from: 'john@example.com',
                sender_name: 'John Doe',
                subject: 'Test Subject',
                body: 'This is a test email'
              }
            }
          }
        })
      })

      const data = await response.json()
      if (data.success) {
        setPreviewData(data.preview)
        toast({
          title: "Preview Generated",
          description: "See how AI will process your fields"
        })
      }
    } catch (error) {
      logger.error('Preview failed:', error)
    }
  }

  const handleSave = () => {
    if (!config.prompt && config.targetActions.length === 0 && chains.length === 0) {
      toast({
        title: "Configuration Required",
        description: "Please provide a prompt, select target actions, or create chains",
        variant: "destructive"
      })
      return
    }

    // Use the layout data if available, otherwise just the chains array
    const chainsToSave = chainsLayoutData || chains
    
    // Log what we're saving for debugging
    const saveData = { ...config, chains: chainsToSave }
    logger.debug('🔄 [AIAgentModal] Saving configuration:', {
      hasChains: chains?.length > 0,
      chainsCount: chains?.length || 0,
      chainsStructure: chainsToSave,
      hasLayoutData: !!chainsLayoutData
    })
    
    onSave(saveData)
    onClose()
  }

  return (
    <TooltipProvider>
      <Dialog open={isOpen} onOpenChange={onClose}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Bot className="w-5 h-5" />
              AI Agent Configuration
            </DialogTitle>
            <DialogDescription>
              Configure your AI agent to intelligently process workflow data and automate field values
            </DialogDescription>
          </DialogHeader>

          <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1">
            <TabsList className="grid w-full grid-cols-6">
              <TabsTrigger value="prompt" className="flex items-center gap-1">
                <MessageSquare className="w-4 h-4" />
                Prompt
              </TabsTrigger>
              <TabsTrigger value="model" className="flex items-center gap-1">
                <Brain className="w-4 h-4" />
                Model
              </TabsTrigger>
              <TabsTrigger value="behavior" className="flex items-center gap-1">
                <Settings className="w-4 h-4" />
                Behavior
              </TabsTrigger>
              <TabsTrigger value="actions" className="flex items-center gap-1">
                <Target className="w-4 h-4" />
                Actions
              </TabsTrigger>
              <TabsTrigger value="chains" className="flex items-center gap-1">
                <Workflow className="w-4 h-4" />
                Chains
              </TabsTrigger>
              <TabsTrigger value="preview" className="flex items-center gap-1">
                <Eye className="w-4 h-4" />
                Preview
              </TabsTrigger>
            </TabsList>

            <div className="h-[500px] mt-4 overflow-auto">
              {/* Prompt Tab */}
              <TabsContent value="prompt" className="space-y-4">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-sm">Main Prompt</CardTitle>
                    <CardDescription>
                      Define what you want the AI agent to do
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <Label htmlFor="prompt">Prompt</Label>
                        <AIVariableMenu
                          nodes={nodes}
                          currentNodeId={currentNodeId}
                          inputRef={promptRef}
                          buttonClassName="h-7 text-xs"
                        />
                      </div>
                      <Textarea
                        ref={promptRef}
                        id="prompt"
                        placeholder="Analyze the [message] and generate a professional response that addresses [subject]. Include {{AI:next_steps}} and maintain a [tone] tone."
                        value={config.prompt}
                        onChange={(e) => handleFieldChange('prompt', e.target.value)}
                        className="min-h-[150px] font-mono text-sm"
                      />
                      <p className="text-xs text-muted-foreground">
                        Use [variables] for simple replacements and {'{{AI:instruction}'} for AI-generated content
                      </p>
                    </div>

                    <Separator />

                    <div className="space-y-2">
                      <Label htmlFor="customInstructions">Additional Instructions</Label>
                      <Textarea
                        ref={instructionsRef}
                        id="customInstructions"
                        placeholder="Any specific requirements or context..."
                        value={config.customInstructions}
                        onChange={(e) => handleFieldChange('customInstructions', e.target.value)}
                        className="min-h-[100px]"
                      />
                    </div>

                    <Alert>
                      <Lightbulb className="h-4 w-4" />
                      <AlertTitle>Pro Tips</AlertTitle>
                      <AlertDescription className="space-y-1 mt-2">
                        <p>• Use <code className="text-xs bg-muted px-1 py-0.5 rounded">[name]</code> for simple variable replacement</p>
                        <p>• Use <code className="text-xs bg-muted px-1 py-0.5 rounded">{'{{trigger.email.from}}'}</code> for specific data paths</p>
                        <p>• Use <code className="text-xs bg-muted px-1 py-0.5 rounded">{'{{AI:summarize}}'}</code> for AI-generated content</p>
                      </AlertDescription>
                    </Alert>
                  </CardContent>
                </Card>
              </TabsContent>

              {/* Model Tab */}
              <TabsContent value="model" className="space-y-4">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-sm">Model Selection</CardTitle>
                    <CardDescription>
                      Choose the AI model and configure its parameters
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="model">AI Model</Label>
                      <Select
                        value={config.model}
                        onValueChange={(value) => handleFieldChange('model', value)}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {Object.entries(AI_MODELS).map(([key, model]) => (
                            <SelectItem key={key} value={key}>
                              <div className="flex items-center justify-between w-full">
                                <div>
                                  <p className="font-medium">{model.name}</p>
                                  <p className="text-xs text-muted-foreground">
                                    {model.provider} • {model.contextWindow.toLocaleString()} tokens
                                  </p>
                                </div>
                                <Badge variant="secondary" className="ml-2">
                                  ${model.costPer1k.input}/1k
                                </Badge>
                              </div>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    {config.model && (
                      <div className="bg-muted/50 rounded-lg p-3 space-y-2">
                        <p className="text-sm font-medium">Model Capabilities</p>
                        <div className="flex flex-wrap gap-1">
                          {AI_MODELS[config.model as keyof typeof AI_MODELS].capabilities.map(cap => (
                            <Badge key={cap} variant="outline" className="text-xs">
                              {cap}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    )}

                    <Separator />

                    <div className="space-y-4">
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <Label htmlFor="temperature">
                            Temperature: {config.temperature}
                          </Label>
                          <Tooltip>
                            <TooltipTrigger>
                              <HelpCircle className="w-4 h-4 text-muted-foreground" />
                            </TooltipTrigger>
                            <TooltipContent>
                              <p>Controls randomness. Lower = more focused, Higher = more creative</p>
                            </TooltipContent>
                          </Tooltip>
                        </div>
                        <input
                          type="range"
                          id="temperature"
                          min="0"
                          max="2"
                          step="0.1"
                          value={config.temperature}
                          onChange={(e) => handleFieldChange('temperature', parseFloat(e.target.value))}
                          className="w-full"
                        />
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="maxTokens">Max Tokens</Label>
                        <Input
                          id="maxTokens"
                          type="number"
                          min="100"
                          max="4000"
                          value={config.maxTokens}
                          onChange={(e) => handleFieldChange('maxTokens', parseInt(e.target.value))}
                        />
                      </div>
                    </div>

                    <Separator />

                    <div className="space-y-4">
                      <div className="space-y-2">
                        <Label>API Source</Label>
                        <Select
                          value={config.apiSource}
                          onValueChange={(value) => {
                            handleFieldChange('apiSource', value)
                            setShowApiKeyInput(value === 'custom')
                          }}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="chainreact">
                              <div className="flex items-center gap-2">
                                <Zap className="w-4 h-4" />
                                ChainReact API (Metered)
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

                      {showApiKeyInput && (
                        <div className="space-y-2">
                          <Label htmlFor="customApiKey">API Key</Label>
                          <Input
                            id="customApiKey"
                            type="password"
                            placeholder="sk-..."
                            value={config.customApiKey}
                            onChange={(e) => handleFieldChange('customApiKey', e.target.value)}
                          />
                          <p className="text-xs text-muted-foreground">
                            Your API key is encrypted and never exposed. Usage doesn't count against plan limits.
                          </p>
                        </div>
                      )}
                    </div>

                    <Alert>
                      <DollarSign className="h-4 w-4" />
                      <AlertTitle>Estimated Cost</AlertTitle>
                      <AlertDescription>
                        ~${estimatedCost.toFixed(4)} per execution
                        {config.apiSource === 'custom' && (
                          <span className="block mt-1 text-xs">
                            Billed directly to your API key, not your ChainReact plan
                          </span>
                        )}
                      </AlertDescription>
                    </Alert>
                  </CardContent>
                </Card>
              </TabsContent>

              {/* Behavior Tab */}
              <TabsContent value="behavior" className="space-y-4">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-sm">Agent Behavior</CardTitle>
                    <CardDescription>
                      Configure how the AI agent generates content
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="tone">Tone & Style</Label>
                        <Select
                          value={config.tone}
                          onValueChange={(value) => handleFieldChange('tone', value)}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="professional">Professional</SelectItem>
                            <SelectItem value="casual">Casual</SelectItem>
                            <SelectItem value="friendly">Friendly</SelectItem>
                            <SelectItem value="formal">Formal</SelectItem>
                            <SelectItem value="technical">Technical</SelectItem>
                            <SelectItem value="conversational">Conversational</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="verbosity">Content Length</Label>
                        <Select
                          value={config.verbosity}
                          onValueChange={(value) => handleFieldChange('verbosity', value)}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="concise">Concise</SelectItem>
                            <SelectItem value="detailed">Detailed</SelectItem>
                            <SelectItem value="comprehensive">Comprehensive</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>

                    <div className="flex items-center justify-between">
                      <div className="space-y-0.5">
                        <Label>Include Emojis</Label>
                        <p className="text-xs text-muted-foreground">
                          Add emojis for casual platforms
                        </p>
                      </div>
                      <Switch
                        checked={config.includeEmojis}
                        onCheckedChange={(checked) => handleFieldChange('includeEmojis', checked)}
                      />
                    </div>

                    <Separator />

                    <div className="space-y-2">
                      <Label htmlFor="memory">Memory & Context</Label>
                      <Select
                        value={config.memory}
                        onValueChange={(value) => handleFieldChange('memory', value)}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">No Memory</SelectItem>
                          <SelectItem value="workflow">Workflow Context</SelectItem>
                          <SelectItem value="conversation">Conversation Memory</SelectItem>
                          <SelectItem value="vector">Vector Storage (Advanced)</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="outputFormat">Output Format</Label>
                      <Select
                        value={config.outputFormat}
                        onValueChange={(value) => handleFieldChange('outputFormat', value)}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="text">Plain Text</SelectItem>
                          <SelectItem value="json">JSON</SelectItem>
                          <SelectItem value="markdown">Markdown</SelectItem>
                          <SelectItem value="html">HTML</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="fieldBehavior">Field Population Behavior</Label>
                      <Select
                        value={config.fieldBehavior}
                        onValueChange={(value) => handleFieldChange('fieldBehavior', value)}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="smart">
                            <div>
                              <p className="font-medium">Smart (Recommended)</p>
                              <p className="text-xs text-muted-foreground">
                                AI decides which fields to populate
                              </p>
                            </div>
                          </SelectItem>
                          <SelectItem value="all">
                            <div>
                              <p className="font-medium">All Fields</p>
                              <p className="text-xs text-muted-foreground">
                                Attempt to fill every field
                              </p>
                            </div>
                          </SelectItem>
                          <SelectItem value="required">
                            <div>
                              <p className="font-medium">Required Only</p>
                              <p className="text-xs text-muted-foreground">
                                Only fill required fields
                              </p>
                            </div>
                          </SelectItem>
                          <SelectItem value="template">
                            <div>
                              <p className="font-medium">Template Mode</p>
                              <p className="text-xs text-muted-foreground">
                                Only resolve variables in templates
                              </p>
                            </div>
                          </SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>

              {/* Chains Tab - New Visual Builder */}
              <TabsContent value="chains" className="h-[500px] p-0 overflow-hidden">
                <AIAgentVisualChainBuilder
                  chains={chains}
                  onChainsChange={(newChainsData) => {
                    // Extract the chains array from the data object
                    const chainsArray = newChainsData?.chains || newChainsData
                    setChains(chainsArray)
                    // Store the full layout data for saving
                    setChainsLayoutData(newChainsData)
                    // Propagate the full data object to parent for real-time sync
                    if (onChainsUpdate) {
                      onChainsUpdate(newChainsData)
                    }
                  }}
                  onOpenActionDialog={() => {
                    // Open action selection modal
                    setShowActionDialog(true)
                  }}
                  onActionSelect={(callback) => {
                    // Set the callback for when an action is selected
                    setAiAgentActionCallback(() => callback)
                  }}
                />
              </TabsContent>

              {/* Actions Tab */}
              <TabsContent value="actions" className="space-y-4">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-sm">Target Actions</CardTitle>
                    <CardDescription>
                      Select which actions the AI agent should help populate
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="flex items-center justify-between">
                      <div className="space-y-0.5">
                        <Label>Auto-Discover Actions</Label>
                        <p className="text-xs text-muted-foreground">
                          AI will find relevant actions based on your prompt
                        </p>
                      </div>
                      <Switch
                        checked={config.autoDiscoverActions}
                        onCheckedChange={(checked) => handleFieldChange('autoDiscoverActions', checked)}
                      />
                    </div>

                    {config.autoDiscoverActions && (
                      <Button
                        variant="outline"
                        className="w-full"
                        onClick={handleDiscoverActions}
                        disabled={isDiscovering}
                      >
                        {isDiscovering ? (
                          <>
                            <LightningLoader size="sm" className="mr-2" />
                            Discovering...
                          </>
                        ) : (
                          <>
                            <Search className="w-4 h-4 mr-2" />
                            Discover Actions from Prompt
                          </>
                        )}
                      </Button>
                    )}

                    {discoveredActions.length > 0 && (
                      <div className="space-y-2">
                        <Label>Discovered Actions</Label>
                        <div className="space-y-2">
                          {discoveredActions.map((action, idx) => (
                            <div
                              key={idx}
                              className="flex items-center justify-between p-2 border rounded-lg"
                            >
                              <div className="flex items-center gap-2">
                                <Target className="w-4 h-4" />
                                <span className="text-sm font-medium">{action.actionId}</span>
                                <Badge variant="secondary" className="text-xs">
                                  {Math.round(action.confidence * 100)}% match
                                </Badge>
                              </div>
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => {
                                  const newTargets = [...config.targetActions, action.actionId]
                                  handleFieldChange('targetActions', newTargets)
                                }}
                              >
                                <Plus className="w-4 h-4" />
                              </Button>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    <div className="space-y-2">
                      <Label>Selected Target Actions</Label>
                      {config.targetActions.length === 0 ? (
                        <div className="text-center py-8 text-muted-foreground">
                          No actions selected. AI will work with all available actions.
                        </div>
                      ) : (
                        <div className="space-y-2">
                          {config.targetActions.map((actionId: string, idx: number) => (
                            <div
                              key={idx}
                              className="flex items-center justify-between p-2 border rounded-lg"
                            >
                              <span className="text-sm">{actionId}</span>
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => {
                                  const newTargets = config.targetActions.filter((_: any, i: number) => i !== idx)
                                  handleFieldChange('targetActions', newTargets)
                                }}
                              >
                                <X className="w-4 h-4" />
                              </Button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    <Alert>
                      <Info className="h-4 w-4" />
                      <AlertDescription>
                        The AI agent will analyze these actions and intelligently populate their fields based on workflow context.
                      </AlertDescription>
                    </Alert>
                  </CardContent>
                </Card>
              </TabsContent>

              {/* Preview Tab */}
              <TabsContent value="preview" className="space-y-4">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-sm">Field Resolution Preview</CardTitle>
                    <CardDescription>
                      See how AI will process your configuration
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <Button
                      variant="outline"
                      className="w-full"
                      onClick={handlePreviewFields}
                    >
                      <Eye className="w-4 h-4 mr-2" />
                      Generate Preview
                    </Button>

                    {previewData && (
                      <div className="space-y-4">
                        <div className="space-y-2">
                          <Label>Resolved Fields</Label>
                          <div className="bg-muted rounded-lg p-4 space-y-2">
                            {Object.entries(previewData).map(([field, data]: [string, any]) => (
                              <div key={field} className="space-y-1">
                                <div className="flex items-center justify-between">
                                  <span className="text-sm font-medium">{field}</span>
                                  <Badge variant={data.type === 'ai-generated' ? 'default' : 'secondary'}>
                                    {data.type}
                                  </Badge>
                                </div>
                                {data.original !== data.resolved && (
                                  <div className="text-xs space-y-1">
                                    <p className="text-muted-foreground">
                                      Original: <code className="bg-background px-1 py-0.5 rounded">{data.original}</code>
                                    </p>
                                    <p className="text-green-600 dark:text-green-400">
                                      Resolved: <code className="bg-background px-1 py-0.5 rounded">{data.resolved}</code>
                                    </p>
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>

                        <Alert>
                          <CheckCircle className="h-4 w-4 text-green-600" />
                          <AlertTitle>Preview Generated</AlertTitle>
                          <AlertDescription>
                            This shows how fields will be resolved at runtime based on actual workflow data.
                          </AlertDescription>
                        </Alert>
                      </div>
                    )}

                    <div className="space-y-2">
                      <Label>Sample Workflow Data</Label>
                      <div className="bg-muted rounded-lg p-3 font-mono text-xs">
                        <pre>{JSON.stringify({
                          trigger: {
                            email: {
                              from: 'customer@example.com',
                              subject: 'Product inquiry',
                              body: 'I need help with...'
                            }
                          }
                        }, null, 2)}</pre>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>
            </div>
          </Tabs>

          <DialogFooter className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {config.apiSource === 'chainreact' && (
                <Badge variant="outline" className="text-xs">
                  <Gauge className="w-3 h-3 mr-1" />
                  Using plan limits
                </Badge>
              )}
              {config.apiSource === 'custom' && config.customApiKey && (
                <Badge variant="outline" className="text-xs text-green-600">
                  <Key className="w-3 h-3 mr-1" />
                  Custom API (no plan limits)
                </Badge>
              )}
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={onClose}>
                Cancel
              </Button>
              <Button onClick={handleSave}>
                <Sparkles className="w-4 h-4 mr-2" />
                Save Configuration
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      
      {/* Action Selection Modal for AI Agent Chains */}
      {showActionDialog && (
        <ChainActionConfigModal
          isOpen={showActionDialog}
          onClose={() => {
            setShowActionDialog(false)
            setAiAgentActionCallback(null)
          }}
          onSave={(actionType, providerId, config) => {
            if (aiAgentActionCallback) {
              aiAgentActionCallback(actionType, providerId, config)
            }
            setShowActionDialog(false)
            setAiAgentActionCallback(null)
          }}
        />
      )}
    </TooltipProvider>
  )
}