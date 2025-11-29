"use client"

import React, { useState, useEffect, useRef } from 'react'
import Image from 'next/image'
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
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import {
  Sparkles,
  Brain,
  Lightbulb,
  Variable,
  Plus,
  X,
  Search,
  Gauge,
  Key,
  RefreshCw,
  Loader2
} from 'lucide-react'
import { LightningLoader } from '@/components/ui/lightning-loader'
import { useToast } from '@/hooks/use-toast'
import { AIVariableMenu } from './AIVariableMenu'
import { AIVariablePanel } from './AIVariablePanel'

import { logger } from '@/lib/utils/logger'

interface AIAgentModalProps {
  isOpen: boolean
  onClose: () => void
  onSave: (config: any) => void
  initialConfig?: any
  nodes: any[]
  currentNodeId?: string
  workflowId?: string
}

const AI_MODELS = {
  'gpt-4o': {
    name: 'GPT-4o',
    provider: 'OpenAI',
    capabilities: ['Advanced reasoning', 'Long context', 'Creative writing'],
    costPer1k: { input: 0.01, output: 0.03 },
    contextWindow: 128000
  },
  'gpt-4o-mini': {
    name: 'GPT-4o Mini',
    provider: 'OpenAI',
    capabilities: ['Great balance', 'Cost-efficient'],
    costPer1k: { input: 0.00015, output: 0.0006 },
    contextWindow: 128000
  },
  'gpt-3.5-turbo': {
    name: 'GPT-3.5 Turbo',
    provider: 'OpenAI',
    capabilities: ['Fast', 'Budget friendly'],
    costPer1k: { input: 0.0005, output: 0.0015 },
    contextWindow: 16000
  },
  'claude-3-sonnet': {
    name: 'Claude 3 Sonnet',
    provider: 'Anthropic',
    capabilities: ['Balanced', 'Great reasoning'],
    costPer1k: { input: 0.003, output: 0.015 },
    contextWindow: 200000
  },
  'gemini-pro': {
    name: 'Gemini Pro',
    provider: 'Google',
    capabilities: ['Multimodal', 'Fast'],
    costPer1k: { input: 0.00025, output: 0.0005 },
    contextWindow: 32000
  }
}

const DEFAULT_GUARDRAILS = {
  requireApproval: false,
  approvalChannel: '',
  maxRetries: 2,
  notifyOnFailure: true,
  escalationEmail: ''
}

export function AIAgentModal({
  isOpen,
  onClose,
  onSave,
  initialConfig = {},
  nodes,
  currentNodeId,
  workflowId
}: AIAgentModalProps) {
  const { toast } = useToast()
  const [config, setConfig] = useState({
    prompt: '',
    model: 'gpt-4o-mini',
    temperature: 0.7,
    maxTokens: 1200,
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
    guardrails: initialConfig.guardrails || DEFAULT_GUARDRAILS,
    ...initialConfig
  })
  const [knowledgeSources, setKnowledgeSources] = useState(
    initialConfig.knowledgeSources || [
      { id: 'kb-1', name: 'Support Playbook', type: 'Notion Doc', status: 'Synced', lastSynced: '2h ago' },
      { id: 'kb-2', name: 'Pricing FAQ', type: 'Google Doc', status: 'Needs refresh', lastSynced: '1d ago' }
    ]
  )
  const [isDiscovering, setIsDiscovering] = useState(false)
  const [discoveredActions, setDiscoveredActions] = useState<any[]>([])
  const [previewData, setPreviewData] = useState<any>(null)
  const [estimatedCost, setEstimatedCost] = useState(0)
  const [showVariableExplorer, setShowVariableExplorer] = useState(false)
  const [isTesting, setIsTesting] = useState(false)
  const promptRef = useRef<HTMLTextAreaElement>(null)
  const instructionsRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    setConfig(prev => ({
      ...prev,
      ...initialConfig,
      guardrails: initialConfig.guardrails || DEFAULT_GUARDRAILS
    }))
    if (initialConfig.knowledgeSources) {
      setKnowledgeSources(initialConfig.knowledgeSources)
    }
  }, [initialConfig])

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

  const handleGuardrailChange = (field: string, value: any) => {
    setConfig(prev => ({
      ...prev,
      guardrails: {
        ...(prev.guardrails || DEFAULT_GUARDRAILS),
        [field]: value
      }
    }))
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
    setIsTesting(true)
    try {
      const response = await fetch('/api/workflows/ai/resolve-fields', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: config.prompt,
          model: config.model,
          maxTokens: config.maxTokens,
          temperature: config.temperature,
          tone: config.tone,
          targetActions: config.targetActions
        })
      })

      const data = await response.json()
      if (data.success) {
        setPreviewData(data.preview)
      } else {
        throw new Error('Preview failed')
      }
    } catch (error) {
      logger.error('Preview failed:', error)
      toast({
        title: "Preview Failed",
        description: "Could not generate preview. Please try again.",
        variant: "destructive"
      })
    } finally {
      setIsTesting(false)
    }
  }

  const handleSave = () => {
    if (!config.prompt && config.targetActions.length === 0) {
      toast({
        title: "Configuration Required",
        description: "Please provide a prompt or select target actions",
        variant: "destructive"
      })
      return
    }

    const saveData = { ...config, knowledgeSources }
    onSave(saveData)
    onClose()
  }

  const addKnowledgeSource = () => {
    const newSource = {
      id: `kb-${knowledgeSources.length + 1}`,
      name: `Knowledge Source ${knowledgeSources.length + 1}`,
      type: 'Upload',
      status: 'Processing',
      lastSynced: 'Just now'
    }
    setKnowledgeSources(prev => [...prev, newSource])
  }

  return (
    <TooltipProvider>
      <Dialog open={isOpen} onOpenChange={onClose}>
        <DialogContent className="max-w-5xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-3">
              <Image
                src="/integrations/ai.svg"
                alt="AI Agent"
                width={24}
                height={24}
                className="h-6 w-6 rounded-md border border-slate-800/40 bg-slate-950 p-0.5 dark:border-white/5"
                priority
              />
              AI Agent Configuration
            </DialogTitle>
            <DialogDescription>
              Build a complete agent configuration—prompt, data access, knowledge, actions, guardrails, and testing—without leaving the Setup tab.
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col lg:flex-row gap-6">
            <ScrollArea className="flex-1 lg:max-h-[70vh] pr-2">
              <div className="space-y-6">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-sm">Overview & Prompt</CardTitle>
                    <CardDescription>Describe what the agent should do and provide any additional context.</CardDescription>
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
                        placeholder="Analyze the [message] and generate a professional response..."
                        value={config.prompt}
                        onChange={(e) => handleFieldChange('prompt', e.target.value)}
                        className="min-h-[150px] font-mono text-sm"
                      />
                      <p className="text-xs text-muted-foreground">
                        Use [variables] for simple replacements and {'{{AI:instruction}}'} for AI-generated operations.
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
                      <AlertTitle>Prompt Tips</AlertTitle>
                      <AlertDescription className="space-y-1 mt-2 text-xs">
                        <p>• Use <code className="bg-muted px-1 py-0.5 rounded">[name]</code> for simple replacements.</p>
                        <p>• Reference upstream data like <code className="bg-muted px-1 py-0.5 rounded">{'{{trigger.email.from}}'}</code>.</p>
                        <p>• Use <code className="bg-muted px-1 py-0.5 rounded">{'{{AI:summarize}}'}</code> for AI-generated actions.</p>
                      </AlertDescription>
                    </Alert>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="text-sm">Model & Behavior</CardTitle>
                    <CardDescription>Choose a model and fine-tune tone, memory, and output preferences.</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-6">
                    <div className="space-y-2">
                      <Label>AI Model</Label>
                      <Select value={config.model} onValueChange={(value) => handleFieldChange('model', value)}>
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
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label>Tone & Style</Label>
                        <Select value={config.tone} onValueChange={(value) => handleFieldChange('tone', value)}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
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
                        <Label>Content Length</Label>
                        <Select value={config.verbosity} onValueChange={(value) => handleFieldChange('verbosity', value)}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="concise">Concise</SelectItem>
                            <SelectItem value="detailed">Detailed</SelectItem>
                            <SelectItem value="comprehensive">Comprehensive</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label>Creativity (Temperature)</Label>
                      <Input
                        type="number"
                        min={0}
                        max={1}
                        step={0.1}
                        value={config.temperature}
                        onChange={(e) => handleFieldChange('temperature', Number(e.target.value))}
                      />
                    </div>
                    <div className="flex items-center justify-between">
                      <div>
                        <Label>Include Emojis</Label>
                        <p className="text-xs text-muted-foreground">Great for casual channels like Slack or SMS.</p>
                      </div>
                      <Switch
                        checked={config.includeEmojis}
                        onCheckedChange={(checked) => handleFieldChange('includeEmojis', checked)}
                      />
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label>Memory & Context</Label>
                        <Select value={config.memory} onValueChange={(value) => handleFieldChange('memory', value)}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none">No Memory</SelectItem>
                            <SelectItem value="workflow">Workflow Context</SelectItem>
                            <SelectItem value="conversation">Conversation Memory</SelectItem>
                            <SelectItem value="vector">Vector Storage (Advanced)</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label>Output Format</Label>
                        <Select value={config.outputFormat} onValueChange={(value) => handleFieldChange('outputFormat', value)}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="text">Plain Text</SelectItem>
                            <SelectItem value="json">JSON</SelectItem>
                            <SelectItem value="markdown">Markdown</SelectItem>
                            <SelectItem value="html">HTML</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="text-sm">Data & Variables</CardTitle>
                    <CardDescription>Choose which workflow inputs the agent can see.</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium">Workflow Inputs</p>
                        <p className="text-xs text-muted-foreground">12 upstream fields detected</p>
                      </div>
                      <Button variant="outline" size="sm" onClick={() => setShowVariableExplorer(v => !v)}>
                        <Variable className="w-4 h-4 mr-2" />
                        {showVariableExplorer ? 'Hide Explorer' : 'View Explorer'}
                      </Button>
                    </div>
                    {showVariableExplorer && (
                      <div className="border rounded-lg">
                        <AIVariablePanel nodes={nodes} currentNodeId={currentNodeId} />
                      </div>
                    )}
                    <Separator />
                    <div>
                      <Label className="text-sm">Sample Workflow Payload</Label>
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

                <Card>
                  <CardHeader>
                    <CardTitle className="text-sm">Knowledge & Memory</CardTitle>
                    <CardDescription>Attach documents, FAQs, or datasets the agent can reference.</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="space-y-3">
                      {knowledgeSources.map(source => (
                        <div key={source.id} className="flex items-center justify-between border rounded-lg p-3">
                          <div>
                            <p className="font-medium text-sm">{source.name}</p>
                            <p className="text-xs text-muted-foreground">{source.type} • Last synced {source.lastSynced}</p>
                          </div>
                          <Badge variant={source.status === 'Synced' ? 'secondary' : 'outline'} className="text-xs">
                            {source.status}
                          </Badge>
                        </div>
                      ))}
                    </div>
                    <Button variant="outline" size="sm" onClick={addKnowledgeSource}>
                      <Plus className="w-3 h-3 mr-2" />
                      Add Knowledge Source
                    </Button>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="text-sm">Actions & Tooling</CardTitle>
                    <CardDescription>Select which downstream actions the agent can populate.</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <Label>Auto-Discover Actions</Label>
                        <p className="text-xs text-muted-foreground">
                          AI will look at your prompt and suggest helpful actions.
                        </p>
                      </div>
                      <Switch
                        checked={config.autoDiscoverActions}
                        onCheckedChange={(checked) => handleFieldChange('autoDiscoverActions', checked)}
                      />
                    </div>

                    {config.autoDiscoverActions && (
                      <div className="space-y-3">
                        <Button variant="outline" size="sm" onClick={handleDiscoverActions} disabled={isDiscovering}>
                          {isDiscovering ? (
                            <>
                              <Loader2 className="w-3 h-3 mr-2 animate-spin" />
                              Discovering...
                            </>
                          ) : (
                            <>
                              <Sparkles className="w-3 h-3 mr-2" />
                              Discover Suggested Actions
                            </>
                          )}
                        </Button>
                        {discoveredActions.length > 0 && (
                          <div className="space-y-2">
                            <p className="text-xs text-muted-foreground">Suggested actions:</p>
                            <div className="flex flex-wrap gap-2">
                              {discoveredActions.map(action => (
                                <Badge
                                  key={action.id}
                                  variant="outline"
                                  className="text-xs cursor-pointer"
                                  onClick={() => handleFieldChange('targetActions', [...config.targetActions, action.id])}
                                >
                                  {action.label}
                                </Badge>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                    <Separator />

                    <div className="space-y-3">
                      <Label>Selected Actions ({config.targetActions.length})</Label>
                      {config.targetActions.length === 0 ? (
                        <div className="text-xs text-muted-foreground border rounded-lg p-3">
                          No actions selected. AI will only return a response.
                        </div>
                      ) : (
                        <div className="flex flex-wrap gap-2">
                          {config.targetActions.map((actionId: string) => (
                            <Badge key={actionId} variant="secondary" className="text-xs flex items-center gap-1">
                              {actionId}
                              <button
                                className="ml-1 hover:text-red-500"
                                onClick={() => {
                                  const filtered = config.targetActions.filter((id: string) => id !== actionId)
                                  handleFieldChange('targetActions', filtered)
                                }}
                              >
                                <X className="w-3 h-3" />
                              </button>
                            </Badge>
                          ))}
                        </div>
                      )}

                      <div className="flex items-center gap-2">
                        <Search className="w-4 h-4 text-muted-foreground" />
                        <Input placeholder="Search actions..." />
                        <Button variant="outline" size="sm">
                          <Plus className="w-3 h-3 mr-1" />
                          Add Action
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="text-sm">Guardrails & Security</CardTitle>
                    <CardDescription>Define approval, retries, and escalation policies.</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <Label>Require Approval</Label>
                        <p className="text-xs text-muted-foreground">Pause for manual review before executing actions.</p>
                      </div>
                      <Switch
                        checked={config.guardrails?.requireApproval || false}
                        onCheckedChange={(checked) => handleGuardrailChange('requireApproval', checked)}
                      />
                    </div>
                    {config.guardrails?.requireApproval && (
                      <Input
                        placeholder="Approval channel or group"
                        value={config.guardrails?.approvalChannel || ''}
                        onChange={(e) => handleGuardrailChange('approvalChannel', e.target.value)}
                      />
                    )}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label>Max Retries</Label>
                        <Input
                          type="number"
                          min={0}
                          max={5}
                          value={config.guardrails?.maxRetries ?? 2}
                          onChange={(e) => handleGuardrailChange('maxRetries', Number(e.target.value))}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Escalation Email</Label>
                        <Input
                          placeholder="ops@company.com"
                          value={config.guardrails?.escalationEmail || ''}
                          onChange={(e) => handleGuardrailChange('escalationEmail', e.target.value)}
                        />
                      </div>
                    </div>
                    <div className="flex items-center justify-between">
                      <div>
                        <Label>Notify on Failure</Label>
                        <p className="text-xs text-muted-foreground">Send alerts when runs fail or confidence is low.</p>
                      </div>
                      <Switch
                        checked={config.guardrails?.notifyOnFailure ?? true}
                        onCheckedChange={(checked) => handleGuardrailChange('notifyOnFailure', checked)}
                      />
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="text-sm">Testing & Preview</CardTitle>
                    <CardDescription>Run sandbox tests and inspect generated fields.</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="space-y-2">
                      <Label>Test Input</Label>
                      <Textarea
                        rows={4}
                        defaultValue={JSON.stringify({
                          message: 'Need help updating billing info',
                          priority: 'medium'
                        }, null, 2)}
                      />
                    </div>
                    <div className="flex items-center justify-between">
                      <div>
                        <Label>Field Preview</Label>
                        <p className="text-xs text-muted-foreground">See how downstream fields will be populated.</p>
                      </div>
                      <Button variant="outline" size="sm" onClick={handlePreviewFields} disabled={isTesting}>
                        {isTesting ? (
                          <>
                            <LightningLoader size="sm" className="mr-2" />
                            Testing...
                          </>
                        ) : (
                          <>
                            <RefreshCw className="w-3 h-3 mr-1" />
                            Run Preview
                          </>
                        )}
                      </Button>
                    </div>
                    <div className="bg-muted rounded-lg p-3 font-mono text-xs">
                      {previewData ? (
                        <pre>{JSON.stringify(previewData, null, 2)}</pre>
                      ) : (
                        <p className="text-muted-foreground text-xs">Preview results will appear here.</p>
                      )}
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="text-sm">Analytics Snapshot</CardTitle>
                    <CardDescription>Recent performance metrics for this agent.</CardDescription>
                  </CardHeader>
                  <CardContent className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <p className="text-xs text-muted-foreground">Runs (24h)</p>
                      <p className="text-lg font-semibold">142</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Success Rate</p>
                      <p className="text-lg font-semibold text-green-600">98%</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Avg Latency</p>
                      <p className="text-lg font-semibold">1.8s</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Cost / Run</p>
                      <p className="text-lg font-semibold">${estimatedCost.toFixed(4)}</p>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </ScrollArea>

            <div className="lg:w-72 space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm">Configuration Summary</CardTitle>
                  <CardDescription>Quick snapshot of key settings.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4 text-sm">
                  <div>
                    <p className="text-xs text-muted-foreground">Model</p>
                    <p className="font-medium">{AI_MODELS[config.model as keyof typeof AI_MODELS]?.name || config.model}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Estimated Cost / Run</p>
                    <p className="font-medium">${estimatedCost.toFixed(4)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Target Actions</p>
                    <p className="font-medium">{config.targetActions.length || 'None selected'}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Knowledge Sources</p>
                    <p className="font-medium">{knowledgeSources.length}</p>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-sm">Run Health</CardTitle>
                  <CardDescription>Yesterday vs today</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3 text-sm">
                  <div className="flex items-center justify-between">
                    <span>Success Rate</span>
                    <span className="text-green-600 font-medium">+2.1%</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>Latency</span>
                    <span className="font-medium">-0.3s</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>Cost</span>
                    <span className="font-medium text-red-500">+$0.12</span>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>

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
                  Custom API
                </Badge>
              )}
            </div>
            <div className="flex gap-3">
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
    </TooltipProvider>
  )
}
