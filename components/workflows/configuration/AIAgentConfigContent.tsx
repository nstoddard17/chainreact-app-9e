"use client"

import React, { useState, useEffect, useRef, useCallback, useLayoutEffect, useMemo } from 'react'
import Image from 'next/image'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Slider } from '@/components/ui/slider'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import {
  Sparkles,
  Brain,
  Lightbulb,
  Variable,
  Loader2,
  Zap,
  DollarSign,
  Clock,
  ChevronDown,
  ChevronRight,
  Play,
  Wand2,
  FileText,
  Mail,
  MessageSquare,
  Filter,
  Languages,
  BarChart3,
  Target,
  Settings2,
  TestTube,
  Shield,
  Database,
  Copy,
  Check,
  Gauge,
  Key
} from 'lucide-react'
import { LightningLoader } from '@/components/ui/lightning-loader'
import { useToast } from '@/hooks/use-toast'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command'
import { ScrollArea } from '@/components/ui/scroll-area'
import { ALL_NODE_COMPONENTS } from '@/lib/workflows/nodes'
import { extractNodeOutputs, sanitizeAlias } from './autoMapping'
import { StaticIntegrationLogo } from '@/components/ui/static-integration-logo'
import { cn } from '@/lib/utils'
import { logger } from '@/lib/utils/logger'

// Auto-resize textarea helper
const autoResizeTextarea = (textarea: HTMLTextAreaElement | null) => {
  if (!textarea) return
  textarea.style.height = 'auto'
  textarea.style.height = `${Math.max(120, textarea.scrollHeight)}px`
}

// Get all previous nodes in the workflow
function getAllPreviousNodeIds(currentNodeId: string, edges: any[]): string[] {
  const findPreviousNodes = (nodeId: string, visited = new Set<string>()): string[] => {
    if (visited.has(nodeId)) return []
    visited.add(nodeId)
    const incomingEdges = edges.filter((edge: any) => edge.target === nodeId)
    if (incomingEdges.length === 0) return []
    const sourceNodeIds = incomingEdges.map((edge: any) => edge.source)
    const allPreviousNodes: string[] = [...sourceNodeIds]
    sourceNodeIds.forEach(sourceId => {
      const previousNodes = findPreviousNodes(sourceId, visited)
      allPreviousNodes.push(...previousNodes)
    })
    return allPreviousNodes
  }
  return findPreviousNodes(currentNodeId)
}

interface AIAgentConfigContentProps {
  initialData: Record<string, any>
  onSave: (config: Record<string, any>) => void
  onCancel: () => void
  nodes: any[]
  edges?: any[]
  currentNodeId?: string
  workflowId?: string
}

// Enhanced model definitions with visual metadata
const AI_MODELS = {
  'gpt-4o-mini': {
    name: 'GPT-4o Mini',
    provider: 'OpenAI',
    providerIcon: '/integrations/openai.svg',
    capabilities: ['Great balance', 'Cost-efficient', 'Fast'],
    bestFor: 'Most workflows - best price/performance',
    costPer1k: { input: 0.00015, output: 0.0006 },
    speed: 3,
    quality: 2,
    recommended: true
  },
  'gpt-4o': {
    name: 'GPT-4o',
    provider: 'OpenAI',
    providerIcon: '/integrations/openai.svg',
    capabilities: ['Advanced reasoning', 'Long context', 'Creative'],
    bestFor: 'Complex analysis & creative tasks',
    costPer1k: { input: 0.005, output: 0.015 },
    speed: 2,
    quality: 3,
    recommended: false
  },
  'gpt-3.5-turbo': {
    name: 'GPT-3.5 Turbo',
    provider: 'OpenAI',
    providerIcon: '/integrations/openai.svg',
    capabilities: ['Very fast', 'Budget friendly'],
    bestFor: 'Simple tasks & high volume',
    costPer1k: { input: 0.0005, output: 0.0015 },
    speed: 3,
    quality: 1,
    recommended: false
  },
  'claude-3-sonnet': {
    name: 'Claude 3.5 Sonnet',
    provider: 'Anthropic',
    providerIcon: '/integrations/anthropic.svg',
    capabilities: ['Excellent reasoning', 'Long context'],
    bestFor: 'Complex reasoning & analysis',
    costPer1k: { input: 0.003, output: 0.015 },
    speed: 2,
    quality: 3,
    recommended: false
  },
  'claude-3-haiku': {
    name: 'Claude 3 Haiku',
    provider: 'Anthropic',
    providerIcon: '/integrations/anthropic.svg',
    capabilities: ['Fastest Claude', 'Very affordable'],
    bestFor: 'Quick tasks & classifications',
    costPer1k: { input: 0.00025, output: 0.00125 },
    speed: 3,
    quality: 2,
    recommended: false
  },
  'gemini-pro': {
    name: 'Gemini Pro',
    provider: 'Google',
    providerIcon: '/integrations/google.svg',
    capabilities: ['Multimodal', 'Fast', 'Free tier'],
    bestFor: 'Multimodal & Google integration',
    costPer1k: { input: 0.00025, output: 0.0005 },
    speed: 3,
    quality: 2,
    recommended: false
  }
}

// Prompt templates for quick start
const PROMPT_TEMPLATES = [
  {
    id: 'summarize',
    name: 'Summarize',
    icon: FileText,
    category: 'Transform',
    prompt: 'Summarize the following content in {{style}} format:\n\n{{trigger.content}}',
  },
  {
    id: 'respond-email',
    name: 'Email Reply',
    icon: Mail,
    category: 'Generate',
    prompt: 'Write a professional response to this email:\n\nFrom: {{trigger.email.from}}\nSubject: {{trigger.email.subject}}\nBody: {{trigger.email.body}}\n\nTone: {{tone}}',
  },
  {
    id: 'classify',
    name: 'Classify',
    icon: Filter,
    category: 'Analyze',
    prompt: 'Classify this message into one of these categories: {{categories}}\n\nMessage: {{trigger.message}}\n\nProvide classification and confidence.',
  },
  {
    id: 'extract',
    name: 'Extract',
    icon: Target,
    category: 'Transform',
    prompt: 'Extract the following from this text:\n- {{fields}}\n\nText: {{trigger.content}}\n\nReturn as JSON.',
  },
  {
    id: 'translate',
    name: 'Translate',
    icon: Languages,
    category: 'Transform',
    prompt: 'Translate to {{language}}:\n\n{{trigger.text}}',
  },
  {
    id: 'sentiment',
    name: 'Sentiment',
    icon: BarChart3,
    category: 'Analyze',
    prompt: 'Analyze sentiment of:\n\n{{trigger.content}}\n\nReturn: sentiment, confidence, key phrases.',
  },
]

export function AIAgentConfigContent({
  initialData,
  onSave,
  onCancel,
  nodes,
  edges = [],
  currentNodeId,
  workflowId
}: AIAgentConfigContentProps) {
  const { toast } = useToast()
  const [activeTab, setActiveTab] = useState('prompt')
  const [config, setConfig] = useState({
    prompt: '',
    model: 'gpt-4o-mini',
    temperature: 0.7,
    maxTokens: 1500,
    apiSource: 'chainreact',
    customApiKey: '',
    customInstructions: '',
    outputFormat: '',
    includeEmojis: false,
    timeout: 30,
    outputMapping: {
      saveResponse: true,
      responseField: 'output',
      extractJson: false,
    },
    guardrails: {
      requireApproval: false,
      approvalChannel: '',
      maxRetries: 2,
      notifyOnFailure: true,
      escalationEmail: '',
      costLimit: 1,
    },
    ...initialData
  })

  const [isImproving, setIsImproving] = useState(false)
  const [isTesting, setIsTesting] = useState(false)
  const [testResult, setTestResult] = useState<any>(null)
  const [testInput, setTestInput] = useState('{\n  "message": "I need help with my order #12345"\n}')
  const [estimatedCost, setEstimatedCost] = useState(0)
  const [selectedTemplate, setSelectedTemplate] = useState<string | null>(null)
  const [copiedTemplate, setCopiedTemplate] = useState<string | null>(null)
  const [advancedOpen, setAdvancedOpen] = useState(false)
  const [variablesOpen, setVariablesOpen] = useState(false)
  const promptRef = useRef<HTMLTextAreaElement>(null)

  // Compute upstream nodes for variable picker
  const upstreamNodes = useMemo(() => {
    if (!currentNodeId) return []
    const nodeById = new Map(nodes.map(n => [n.id, n]))
    const sourceIds = getAllPreviousNodeIds(currentNodeId, edges)

    return sourceIds
      .map(id => nodeById.get(id))
      .filter(Boolean)
      .map(node => {
        const nodeComponent = ALL_NODE_COMPONENTS.find(c => c.type === node.data?.type)
        const baseOutputs = extractNodeOutputs(node as any)
        const outputs = (baseOutputs && baseOutputs.length > 0) ? baseOutputs : (nodeComponent?.outputSchema || [])
        const title = node.data?.title || node.data?.label || nodeComponent?.title || 'Unnamed'
        return {
          id: node.id,
          title,
          type: node.data?.type,
          outputs,
          providerId: node.data?.providerId || nodeComponent?.providerId,
        }
      })
  }, [nodes, edges, currentNodeId])

  // Auto-resize prompt textarea when content changes
  useLayoutEffect(() => {
    autoResizeTextarea(promptRef.current)
  }, [config.prompt])

  useEffect(() => {
    const model = AI_MODELS[config.model as keyof typeof AI_MODELS]
    if (model) {
      const avgTokens = config.maxTokens / 2
      const inputCost = (avgTokens / 1000) * model.costPer1k.input
      const outputCost = (avgTokens / 1000) * model.costPer1k.output
      setEstimatedCost(inputCost + outputCost)
    }
  }, [config.model, config.maxTokens])

  const handleFieldChange = useCallback((field: string, value: any) => {
    setConfig(prev => ({ ...prev, [field]: value }))
  }, [])

  const handleGuardrailChange = useCallback((field: string, value: any) => {
    setConfig(prev => ({
      ...prev,
      guardrails: { ...prev.guardrails, [field]: value }
    }))
  }, [])

  const handleOutputMappingChange = useCallback((field: string, value: any) => {
    setConfig(prev => ({
      ...prev,
      outputMapping: { ...prev.outputMapping, [field]: value }
    }))
  }, [])

  const handleImprovePrompt = async () => {
    if (!config.prompt.trim()) {
      toast({ title: "Prompt Required", description: "Enter a prompt to improve", variant: "destructive" })
      return
    }
    setIsImproving(true)
    try {
      const response = await fetch('/api/workflows/ai/improve-prompt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: config.prompt, context: { model: config.model } })
      })
      const data = await response.json()
      if (data.success && data.improvedPrompt) {
        handleFieldChange('prompt', data.improvedPrompt)
        toast({ title: "Prompt Improved", description: "Your prompt has been enhanced" })
      }
    } catch (error) {
      logger.error('Prompt improvement failed:', error)
      toast({ title: "Failed", description: "Could not improve prompt", variant: "destructive" })
    } finally {
      setIsImproving(false)
    }
  }

  const handleUseTemplate = (template: typeof PROMPT_TEMPLATES[0]) => {
    if (template.prompt) handleFieldChange('prompt', template.prompt)
    setSelectedTemplate(template.id)
    toast({ title: "Template Applied", description: `"${template.name}" loaded` })
  }

  const handleTestPrompt = async () => {
    if (!config.prompt.trim()) {
      toast({ title: "Prompt Required", description: "Enter a prompt to test", variant: "destructive" })
      return
    }
    setIsTesting(true)
    setTestResult(null)
    try {
      let parsedInput = {}
      try { parsedInput = JSON.parse(testInput) } catch { parsedInput = { message: testInput } }

      const response = await fetch('/api/workflows/ai/test-prompt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: config.prompt,
          systemInstructions: config.customInstructions,
          model: config.model,
          temperature: config.temperature,
          maxTokens: config.maxTokens,
          input: parsedInput
        })
      })
      const data = await response.json()
      if (data.success) {
        setTestResult({ output: data.output, tokensUsed: data.tokensUsed, cost: data.cost, latency: data.latency })
      } else {
        throw new Error(data.error || 'Test failed')
      }
    } catch (error: any) {
      setTestResult({ error: error.message || 'Test failed' })
    } finally {
      setIsTesting(false)
    }
  }

  const handleSave = () => {
    if (!config.prompt) {
      toast({ title: "Prompt Required", description: "Please provide a prompt", variant: "destructive" })
      return
    }
    onSave(config)
  }

  const getTemperatureLabel = (temp: number) => {
    if (temp <= 0.3) return { label: 'Precise', emoji: '🎯' }
    if (temp <= 0.6) return { label: 'Balanced', emoji: '⚖️' }
    if (temp <= 0.8) return { label: 'Creative', emoji: '🎨' }
    return { label: 'Wild', emoji: '🌈' }
  }

  const tempInfo = getTemperatureLabel(config.temperature)

  return (
    <div className="flex flex-col h-full">
      {/* Cost Badge */}
      <div className="px-4 py-2 border-b flex items-center justify-between bg-muted/30">
        <span className="text-xs text-muted-foreground">Estimated cost per run</span>
        <Badge variant="secondary" className="text-xs">${estimatedCost.toFixed(4)}</Badge>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col overflow-hidden">
        <TabsList className="px-2 pt-2 bg-transparent w-full flex justify-start gap-1 rounded-none h-auto border-b">
          <TabsTrigger value="prompt" className="text-xs px-3 py-1.5 data-[state=active]:bg-primary/10">
            <Wand2 className="w-3 h-3 mr-1" />Prompt
          </TabsTrigger>
          <TabsTrigger value="model" className="text-xs px-3 py-1.5 data-[state=active]:bg-primary/10">
            <Brain className="w-3 h-3 mr-1" />Model
          </TabsTrigger>
          <TabsTrigger value="output" className="text-xs px-3 py-1.5 data-[state=active]:bg-primary/10">
            <Database className="w-3 h-3 mr-1" />Output
          </TabsTrigger>
          <TabsTrigger value="advanced" className="text-xs px-3 py-1.5 data-[state=active]:bg-primary/10">
            <Settings2 className="w-3 h-3 mr-1" />More
          </TabsTrigger>
          <TabsTrigger value="test" className="text-xs px-3 py-1.5 data-[state=active]:bg-primary/10">
            <TestTube className="w-3 h-3 mr-1" />Test
          </TabsTrigger>
        </TabsList>

        <div className="flex-1 overflow-y-auto">
          {/* PROMPT TAB */}
          <TabsContent value="prompt" className="mt-0 p-4 space-y-4">
            {/* Templates */}
            <div className="space-y-2">
              <Label className="text-xs font-medium">Quick Templates</Label>
              <div className="grid grid-cols-3 gap-1.5">
                {PROMPT_TEMPLATES.map((t) => {
                  const Icon = t.icon
                  const isSelected = selectedTemplate === t.id
                  return (
                    <button
                      key={t.id}
                      onClick={() => handleUseTemplate(t)}
                      className={cn(
                        "flex items-center gap-1.5 p-2 rounded-md border text-xs transition-all hover:border-primary/50",
                        isSelected && "border-primary bg-primary/5"
                      )}
                    >
                      <Icon className="w-3 h-3 flex-shrink-0" />
                      <span className="truncate">{t.name}</span>
                    </button>
                  )
                })}
              </div>
            </div>

            <Separator />

            {/* Prompt */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-medium">Your Prompt</Label>
                <div className="flex gap-1">
                  <Popover open={variablesOpen} onOpenChange={setVariablesOpen}>
                    <PopoverTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-muted-foreground hover:text-foreground"
                        title="Insert variables from trigger or previous steps"
                      >
                        <span className="text-xs font-mono font-semibold">{`{}`}</span>
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-80 p-0" align="end" side="bottom" sideOffset={4}>
                      <Command className="rounded-lg border-none">
                        <CommandInput placeholder="Search variables..." className="text-xs" />
                        <CommandEmpty className="py-4 text-center text-xs text-muted-foreground">No variables found</CommandEmpty>
                        <ScrollArea className="h-[280px]">
                          <CommandList>
                            {upstreamNodes.length === 0 ? (
                              <div className="p-4 text-center text-xs text-muted-foreground">
                                <p>No upstream nodes available</p>
                                <p className="mt-1">Add nodes before this one to see their outputs</p>
                              </div>
                            ) : (
                              upstreamNodes.map((node) => (
                                <CommandGroup
                                  key={node.id}
                                  heading={
                                    <div className="flex items-center gap-2 px-2 py-1">
                                      {node.providerId && (
                                        <StaticIntegrationLogo
                                          providerId={node.providerId}
                                          providerName={node.title}
                                        />
                                      )}
                                      <span className="font-medium text-xs">{node.title}</span>
                                      <Badge variant="secondary" className="ml-auto text-[10px]">
                                        {node.outputs.length}
                                      </Badge>
                                    </div>
                                  }
                                >
                                  {node.outputs.map((output: any) => (
                                    <CommandItem
                                      key={`${node.id}-${output.name}`}
                                      value={`${node.title} ${output.label || output.name}`}
                                      onSelect={() => {
                                        const variableRef = `{{${node.id}.${output.name}}}`
                                        const textarea = promptRef.current
                                        if (textarea) {
                                          const start = textarea.selectionStart
                                          const end = textarea.selectionEnd
                                          const text = config.prompt
                                          const newText = text.substring(0, start) + variableRef + text.substring(end)
                                          handleFieldChange('prompt', newText)
                                          setTimeout(() => {
                                            textarea.focus()
                                            textarea.setSelectionRange(start + variableRef.length, start + variableRef.length)
                                          }, 0)
                                        } else {
                                          handleFieldChange('prompt', config.prompt + variableRef)
                                        }
                                        setVariablesOpen(false)
                                      }}
                                      className="flex flex-col items-start px-3 py-1.5"
                                    >
                                      <div className="flex items-center gap-2 w-full">
                                        <span className="text-xs font-medium">{output.label || output.name}</span>
                                        {output.type && (
                                          <Badge variant="outline" className="text-[9px] font-mono px-1 py-0">
                                            {output.type}
                                          </Badge>
                                        )}
                                      </div>
                                      <code className="text-[10px] text-muted-foreground font-mono">
                                        {`{{${node.id}.${output.name}}}`}
                                      </code>
                                    </CommandItem>
                                  ))}
                                </CommandGroup>
                              ))
                            )}
                          </CommandList>
                        </ScrollArea>
                        <div className="border-t px-3 py-1.5 text-[10px] text-muted-foreground bg-muted/30">
                          {upstreamNodes.reduce((acc, n) => acc + n.outputs.length, 0)} variables from {upstreamNodes.length} nodes
                        </div>
                      </Command>
                    </PopoverContent>
                  </Popover>
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-muted-foreground hover:text-foreground"
                          onClick={handleImprovePrompt}
                          disabled={isImproving}
                        >
                          {isImproving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent side="top">
                        <p className="text-xs">Improve prompt with AI - converts your text into a structured prompt</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </div>
              </div>
              <Textarea
                ref={promptRef}
                placeholder={`Describe what the AI should do...

Example: Analyze {{trigger.message}} and:
1. Identify the main concern
2. Draft a helpful response`}
                value={config.prompt}
                onChange={(e) => {
                  handleFieldChange('prompt', e.target.value)
                  autoResizeTextarea(e.target)
                }}
                className="min-h-[120px] font-mono text-xs resize-none overflow-hidden"
                style={{ height: 'auto' }}
              />
            </div>

            {/* Additional Instructions */}
            <Collapsible open={advancedOpen} onOpenChange={setAdvancedOpen}>
              <CollapsibleTrigger asChild>
                <Button variant="ghost" size="sm" className="h-7 text-xs text-muted-foreground p-0">
                  {advancedOpen ? <ChevronDown className="w-3 h-3 mr-1" /> : <ChevronRight className="w-3 h-3 mr-1" />}
                  Additional Instructions
                </Button>
              </CollapsibleTrigger>
              <CollapsibleContent className="pt-2">
                <Textarea
                  placeholder={`Add context, rules, or persona...

Example:
- Always maintain a professional tone
- Our refund policy is 30 days
- Escalate billing complaints to a human`}
                  value={config.customInstructions}
                  onChange={(e) => handleFieldChange('customInstructions', e.target.value)}
                  className="min-h-[80px] text-xs"
                />
              </CollapsibleContent>
            </Collapsible>
          </TabsContent>

          {/* MODEL TAB */}
          <TabsContent value="model" className="mt-0 p-4 space-y-4">
            <div className="space-y-2">
              <Label className="text-xs font-medium">Select Model</Label>
              <div className="space-y-2">
                {Object.entries(AI_MODELS).map(([key, model]) => {
                  const isSelected = config.model === key
                  return (
                    <button
                      key={key}
                      onClick={() => handleFieldChange('model', key)}
                      className={cn(
                        "w-full p-3 rounded-lg border text-left transition-all relative",
                        isSelected ? "border-primary bg-primary/5 ring-1 ring-primary/20" : "hover:border-primary/30"
                      )}
                    >
                      {model.recommended && (
                        <Badge className="absolute -top-2 -right-2 text-[9px] bg-green-500 px-1.5">Best</Badge>
                      )}
                      <div className="flex items-center justify-between mb-1">
                        <div className="flex items-center gap-2">
                          <Image src={model.providerIcon} alt={model.provider} width={16} height={16} className="rounded" />
                          <span className="font-medium text-sm">{model.name}</span>
                        </div>
                        <Badge variant="outline" className="text-[9px]">${model.costPer1k.input}/1k</Badge>
                      </div>
                      <p className="text-[10px] text-muted-foreground mb-2">{model.bestFor}</p>
                      <div className="flex items-center gap-3 text-[9px]">
                        <div className="flex items-center gap-1">
                          <Zap className="w-2.5 h-2.5" />
                          {[1, 2, 3].map((i) => (
                            <div key={i} className={cn("w-1 h-1 rounded-full", i <= model.speed ? "bg-green-500" : "bg-muted")} />
                          ))}
                        </div>
                        <div className="flex items-center gap-1">
                          <Brain className="w-2.5 h-2.5" />
                          {[1, 2, 3].map((i) => (
                            <div key={i} className={cn("w-1 h-1 rounded-full", i <= model.quality ? "bg-blue-500" : "bg-muted")} />
                          ))}
                        </div>
                      </div>
                    </button>
                  )
                })}
              </div>
            </div>

            <Separator />

            {/* Temperature */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-medium">Creativity</Label>
                <Badge variant="secondary" className="text-[10px]">{tempInfo.emoji} {tempInfo.label}</Badge>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] text-muted-foreground">🎯</span>
                <Slider
                  value={[config.temperature]}
                  onValueChange={([v]) => handleFieldChange('temperature', v)}
                  min={0} max={1} step={0.1}
                  className="flex-1"
                />
                <span className="text-[10px] text-muted-foreground">🎨</span>
              </div>
            </div>

            <Separator />

            {/* API Source */}
            <div className="space-y-2">
              <Label className="text-xs font-medium">API Source</Label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => handleFieldChange('apiSource', 'chainreact')}
                  className={cn("p-2 rounded-lg border text-left", config.apiSource === 'chainreact' && "border-primary bg-primary/5")}
                >
                  <div className="flex items-center gap-1 mb-1">
                    <Gauge className="w-3 h-3" />
                    <span className="text-xs font-medium">ChainReact</span>
                  </div>
                  <p className="text-[9px] text-muted-foreground">No setup needed</p>
                </button>
                <button
                  onClick={() => handleFieldChange('apiSource', 'custom')}
                  className={cn("p-2 rounded-lg border text-left", config.apiSource === 'custom' && "border-primary bg-primary/5")}
                >
                  <div className="flex items-center gap-1 mb-1">
                    <Key className="w-3 h-3" />
                    <span className="text-xs font-medium">Custom Key</span>
                  </div>
                  <p className="text-[9px] text-muted-foreground">Use your own</p>
                </button>
              </div>
              {config.apiSource === 'custom' && (
                <Input type="password" placeholder="sk-..." value={config.customApiKey} onChange={(e) => handleFieldChange('customApiKey', e.target.value)} className="text-xs mt-2" />
              )}
            </div>
          </TabsContent>

          {/* OUTPUT TAB */}
          <TabsContent value="output" className="mt-0 p-4 space-y-4">
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <Label className="text-xs font-medium">Save Response</Label>
                  <p className="text-[10px] text-muted-foreground">Store for later steps</p>
                </div>
                <Switch checked={config.outputMapping.saveResponse} onCheckedChange={(c) => handleOutputMappingChange('saveResponse', c)} />
              </div>
              {config.outputMapping.saveResponse && (
                <div className="space-y-1">
                  <Label className="text-[10px]">Output Field Name</Label>
                  <Input value={config.outputMapping.responseField} onChange={(e) => handleOutputMappingChange('responseField', e.target.value)} className="text-xs h-8" />
                  <p className="text-[9px] text-muted-foreground">Access: <code className="bg-muted px-1 rounded">{'{{ai_agent.' + config.outputMapping.responseField + '}}'}</code></p>
                </div>
              )}
            </div>

            <Separator />

            <div className="flex items-center justify-between">
              <div>
                <Label className="text-xs font-medium">Extract JSON</Label>
                <p className="text-[10px] text-muted-foreground">Parse structured data</p>
              </div>
              <Switch checked={config.outputMapping.extractJson} onCheckedChange={(c) => handleOutputMappingChange('extractJson', c)} />
            </div>

            <Separator />

            <div className="space-y-2">
              <Label className="text-xs font-medium">Output Format Hint</Label>
              <Textarea
                value={config.outputFormat}
                onChange={(e) => handleFieldChange('outputFormat', e.target.value)}
                placeholder="e.g., subject, body, urgency"
                className="min-h-[60px] text-xs"
              />
            </div>

          </TabsContent>

          {/* ADVANCED TAB */}
          <TabsContent value="advanced" className="mt-0 p-4 space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-[10px]">Max Tokens</Label>
                <Input type="number" min={100} max={4000} value={config.maxTokens} onChange={(e) => handleFieldChange('maxTokens', Number(e.target.value))} className="text-xs h-8" />
              </div>
              <div className="space-y-1">
                <Label className="text-[10px]">Timeout (sec)</Label>
                <Input type="number" min={5} max={120} value={config.timeout} onChange={(e) => handleFieldChange('timeout', Number(e.target.value))} className="text-xs h-8" />
              </div>
            </div>

            <div className="flex items-center justify-between">
              <div>
                <Label className="text-xs">Include Emojis</Label>
                <p className="text-[9px] text-muted-foreground">For Slack, SMS, etc.</p>
              </div>
              <Switch checked={config.includeEmojis} onCheckedChange={(c) => handleFieldChange('includeEmojis', c)} />
            </div>

            <Separator />

            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Shield className="w-3 h-3" />
                <Label className="text-xs font-medium">Guardrails</Label>
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <Label className="text-[10px]">Require Approval</Label>
                  <p className="text-[9px] text-muted-foreground">Pause for review</p>
                </div>
                <Switch checked={config.guardrails.requireApproval} onCheckedChange={(c) => handleGuardrailChange('requireApproval', c)} />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-[10px]">Max Retries</Label>
                  <Input type="number" min={0} max={5} value={config.guardrails.maxRetries} onChange={(e) => handleGuardrailChange('maxRetries', Number(e.target.value))} className="text-xs h-8" />
                </div>
                <div className="space-y-1">
                  <Label className="text-[10px]">Cost Limit ($)</Label>
                  <Input type="number" min={0.01} max={10} step={0.01} value={config.guardrails.costLimit} onChange={(e) => handleGuardrailChange('costLimit', Number(e.target.value))} className="text-xs h-8" />
                </div>
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <Label className="text-[10px]">Notify on Failure</Label>
                </div>
                <Switch checked={config.guardrails.notifyOnFailure} onCheckedChange={(c) => handleGuardrailChange('notifyOnFailure', c)} />
              </div>
            </div>
          </TabsContent>

          {/* TEST TAB */}
          <TabsContent value="test" className="mt-0 p-4 space-y-4">
            <div className="space-y-2">
              <Label className="text-xs font-medium">Test Input (JSON)</Label>
              <Textarea
                value={testInput}
                onChange={(e) => setTestInput(e.target.value)}
                className="min-h-[100px] font-mono text-xs"
              />
              <Button onClick={handleTestPrompt} disabled={isTesting || !config.prompt.trim()} className="w-full">
                {isTesting ? <><Loader2 className="w-3 h-3 mr-1 animate-spin" />Testing...</> : <><Play className="w-3 h-3 mr-1" />Run Test</>}
              </Button>
            </div>

            {testResult && (
              <div className="space-y-2">
                <Label className="text-xs font-medium">Results</Label>
                {testResult.error ? (
                  <Alert variant="destructive"><AlertDescription className="text-xs">{testResult.error}</AlertDescription></Alert>
                ) : (
                  <>
                    <div className="grid grid-cols-3 gap-2 text-center">
                      <div className="bg-muted rounded p-2">
                        <p className="text-[9px] text-muted-foreground">Latency</p>
                        <p className="text-xs font-semibold">{testResult.latency}ms</p>
                      </div>
                      <div className="bg-muted rounded p-2">
                        <p className="text-[9px] text-muted-foreground">Tokens</p>
                        <p className="text-xs font-semibold">{testResult.tokensUsed}</p>
                      </div>
                      <div className="bg-muted rounded p-2">
                        <p className="text-[9px] text-muted-foreground">Cost</p>
                        <p className="text-xs font-semibold">${testResult.cost?.toFixed(5)}</p>
                      </div>
                    </div>
                    <div className="border rounded p-2 max-h-[200px] overflow-y-auto">
                      <pre className="text-[10px] font-mono whitespace-pre-wrap">{typeof testResult.output === 'string' ? testResult.output : JSON.stringify(testResult.output, null, 2)}</pre>
                    </div>
                  </>
                )}
              </div>
            )}
          </TabsContent>
        </div>
      </Tabs>

      {/* Footer */}
      <div className="p-4 border-t flex justify-between items-center bg-white dark:bg-slate-950">
        <div className="flex items-center gap-2">
          {config.apiSource === 'chainreact' && <Badge variant="outline" className="text-[9px]"><Gauge className="w-2.5 h-2.5 mr-1" />Plan limits</Badge>}
          {config.apiSource === 'custom' && config.customApiKey && <Badge variant="outline" className="text-[9px] text-green-600"><Key className="w-2.5 h-2.5 mr-1" />Custom</Badge>}
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={onCancel}>Cancel</Button>
          <Button size="sm" onClick={handleSave}>Save</Button>
        </div>
      </div>
    </div>
  )
}
