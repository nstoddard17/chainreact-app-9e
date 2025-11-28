"use client"

import React, { useState, useEffect, useRef, useCallback, useLayoutEffect, useMemo } from 'react'
import Image from 'next/image'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Slider } from '@/components/ui/slider'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import {
  Sparkles,
  Brain,
  Loader2,
  Zap,
  ChevronDown,
  ChevronRight,
  Wand2,
  FileText,
  Mail,
  Filter,
  Languages,
  BarChart3,
  Target,
  Settings2,
  Gauge,
  Key,
  Wrench,
  SlidersHorizontal,
  TestTube2
} from 'lucide-react'
import { useToast } from '@/hooks/use-toast'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command'
import { ScrollArea } from '@/components/ui/scroll-area'
import { ALL_NODE_COMPONENTS } from '@/lib/workflows/nodes'
import { extractNodeOutputs } from './autoMapping'
import { StaticIntegrationLogo } from '@/components/ui/static-integration-logo'
import { cn } from '@/lib/utils'
import { logger } from '@/lib/utils/logger'
import { ResultsTab } from './tabs/ResultsTab'

// Auto-resize textarea helper - calculates height based on content
const autoResizeTextarea = (textarea: HTMLTextAreaElement | null) => {
  if (!textarea) return
  textarea.style.height = 'auto'
  textarea.style.height = `${Math.max(120, textarea.scrollHeight)}px`
}

// Calculate initial height based on placeholder text (roughly 16px per line + padding)
const calculatePlaceholderHeight = (placeholderText: string): number => {
  const lines = placeholderText.split('\n').length
  const lineHeight = 20 // Approximate line height in pixels
  const padding = 24 // Top and bottom padding
  return Math.max(120, lines * lineHeight + padding)
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
  // Testing props - passed from ConfigurationModal
  onRunTest?: () => void
  isTestingNode?: boolean
  nodeInfo?: any
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
  }
}

// Prompt templates for quick start
const PROMPT_TEMPLATES = [
  {
    id: 'summarize',
    name: 'Summarize',
    icon: FileText,
    category: 'Transform',
    prompt: 'Summarize the following content concisely:\n\n{{input}}\n\nProvide a clear, structured summary.',
  },
  {
    id: 'respond-email',
    name: 'Email Reply',
    icon: Mail,
    category: 'Generate',
    prompt: 'Write a professional email response based on this context:\n\n{{input}}\n\nKeep the tone professional and helpful.',
  },
  {
    id: 'classify',
    name: 'Classify',
    icon: Filter,
    category: 'Analyze',
    prompt: 'Classify the following into appropriate categories:\n\n{{input}}\n\nProvide the classification with confidence level.',
  },
  {
    id: 'extract',
    name: 'Extract',
    icon: Target,
    category: 'Transform',
    prompt: 'Extract key information from this text:\n\n{{input}}\n\nReturn the extracted data as structured JSON.',
  },
  {
    id: 'translate',
    name: 'Translate',
    icon: Languages,
    category: 'Transform',
    prompt: 'Translate the following text:\n\n{{input}}\n\nMaintain the original meaning and tone.',
  },
  {
    id: 'sentiment',
    name: 'Sentiment',
    icon: BarChart3,
    category: 'Analyze',
    prompt: 'Analyze the sentiment of:\n\n{{input}}\n\nReturn: sentiment (positive/negative/neutral), confidence, and key phrases.',
  },
]

export function AIAgentConfigContent({
  initialData,
  onSave,
  onCancel,
  nodes,
  edges = [],
  currentNodeId,
  workflowId,
  onRunTest,
  isTestingNode = false,
  nodeInfo
}: AIAgentConfigContentProps) {
  const { toast } = useToast()
  const [activeTab, setActiveTab] = useState('setup')
  const [config, setConfig] = useState({
    prompt: '',
    model: 'gpt-4o-mini',
    temperature: 0.7,
    maxTokens: 1500,
    apiSource: 'chainreact',
    customApiKey: '',
    customInstructions: '',
    outputFormat: '',
    timeout: 30,
    ...initialData
  })

  const [isImproving, setIsImproving] = useState(false)
  const [estimatedCost, setEstimatedCost] = useState(0)
  const [selectedTemplate, setSelectedTemplate] = useState<string | null>(null)
  const [instructionsOpen, setInstructionsOpen] = useState(false)
  const [variablesOpen, setVariablesOpen] = useState(false)
  const promptRef = useRef<HTMLTextAreaElement>(null)
  const instructionsRef = useRef<HTMLTextAreaElement>(null)
  const outputFormatRef = useRef<HTMLTextAreaElement>(null)

  // Compute upstream nodes for variable picker
  const upstreamNodes = useMemo(() => {
    if (!currentNodeId) return []
    const nodeById = new Map(nodes.map(n => [n.id, n]))
    const sourceIds = getAllPreviousNodeIds(currentNodeId, edges)

    // Deduplicate source IDs to prevent duplicate nodes
    const uniqueSourceIds = [...new Set(sourceIds)]

    return uniqueSourceIds
      .map(id => nodeById.get(id))
      .filter(Boolean)
      .map(node => {
        const nodeComponent = ALL_NODE_COMPONENTS.find(c => c.type === node.data?.type)
        const baseOutputs = extractNodeOutputs(node as any)
        const outputs = (baseOutputs && baseOutputs.length > 0) ? baseOutputs : (nodeComponent?.outputSchema || [])
        const title = node.data?.title || node.data?.label || nodeComponent?.title || 'Unnamed'
        const isTrigger = node.data?.isTrigger || nodeComponent?.isTrigger || false
        return {
          id: node.id,
          title,
          type: node.data?.type,
          outputs,
          providerId: node.data?.providerId || nodeComponent?.providerId,
          isTrigger,
        }
      })
  }, [nodes, edges, currentNodeId])

  // Auto-resize textareas when content changes
  useLayoutEffect(() => {
    autoResizeTextarea(promptRef.current)
  }, [config.prompt])

  useLayoutEffect(() => {
    autoResizeTextarea(instructionsRef.current)
  }, [config.customInstructions])

  useLayoutEffect(() => {
    autoResizeTextarea(outputFormatRef.current)
  }, [config.outputFormat])

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

  const handleImprovePrompt = async () => {
    if (!config.prompt.trim()) {
      toast({ title: "Prompt Required", description: "Enter a prompt to improve", variant: "destructive" })
      return
    }
    setIsImproving(true)
    try {
      // Build list of available variables from upstream nodes
      // Use friendly node type for variable references (engine resolves by type)
      const availableVariables = upstreamNodes.flatMap(node => {
        const referencePrefix = node.isTrigger ? 'trigger' : (node.type || node.id)
        return node.outputs.map((output: any) => ({
          reference: `{{${referencePrefix}.${output.name}}}`,
          nodeTitle: node.title,
          fieldName: output.label || output.name,
          fieldType: output.type || 'string',
          description: output.description
        }))
      })

      const response = await fetch('/api/workflows/ai/improve-prompt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: config.prompt,
          context: { model: config.model },
          availableVariables
        })
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

  // Build nodeInfo for ResultsTab if not provided
  const effectiveNodeInfo = nodeInfo || {
    type: 'ai_agent',
    title: 'AI Agent',
    providerId: 'ai',
    outputSchema: [
      { name: 'output', label: 'AI Response', type: 'string' },
      { name: 'tokensUsed', label: 'Tokens Used', type: 'number' },
      { name: 'cost', label: 'Cost', type: 'number' },
    ]
  }

  return (
    <div className="flex flex-col h-full">
      {/* Cost Badge */}
      <div className="px-4 py-2 border-b flex items-center justify-between bg-muted/30">
        <span className="text-xs text-muted-foreground">Estimated cost per run</span>
        <Badge variant="secondary" className="text-xs">${estimatedCost.toFixed(4)}</Badge>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col min-h-0">
        {/* Tab Navigation - Matching standard ConfigurationModal style */}
        <TabsList className="px-4 pt-3 border-b border-border bg-transparent w-full flex justify-start gap-0 rounded-none h-auto flex-shrink-0">
          <TabsTrigger
            value="setup"
            className="flex items-center gap-2 rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:text-foreground data-[state=active]:font-semibold data-[state=active]:shadow-none bg-transparent hover:bg-muted/50 transition-colors px-5 py-3 text-sm font-medium text-muted-foreground"
          >
            <Wrench className="h-4 w-4" />
            Setup
          </TabsTrigger>
          <TabsTrigger
            value="advanced"
            className="flex items-center gap-2 rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:text-foreground data-[state=active]:font-semibold data-[state=active]:shadow-none bg-transparent hover:bg-muted/50 transition-colors px-5 py-3 text-sm font-medium text-muted-foreground"
          >
            <SlidersHorizontal className="h-4 w-4" />
            Advanced
          </TabsTrigger>
          <TabsTrigger
            value="results"
            className="flex items-center gap-2 rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:text-foreground data-[state=active]:font-semibold data-[state=active]:shadow-none bg-transparent hover:bg-muted/50 transition-colors px-5 py-3 text-sm font-medium text-muted-foreground"
          >
            <TestTube2 className="h-4 w-4" />
            Results
          </TabsTrigger>
        </TabsList>

        <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden">
          {/* SETUP TAB - Prompt, Model, Templates */}
          <TabsContent value="setup" className="mt-0 p-4 pb-24 space-y-4">
            {/* Quick Templates */}
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
                                  {node.outputs.map((output: any, outputIndex: number) => {
                                    // Use friendly node type for variable references
                                    const referencePrefix = node.isTrigger ? 'trigger' : (node.type || node.id)
                                    const variableRef = `{{${referencePrefix}.${output.name}}}`
                                    return (
                                      <CommandItem
                                        key={`${node.id}-${output.name}-${outputIndex}`}
                                        value={`${node.title} ${output.label || output.name}`}
                                        onSelect={() => {
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
                                          {variableRef}
                                        </code>
                                      </CommandItem>
                                    )
                                  })}
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
                        <p className="text-xs">Improve prompt with AI</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </div>
              </div>
              <Textarea
                ref={promptRef}
                placeholder={`Describe what the AI should do...

Example: Analyze the incoming message and:
1. Identify the main topic
2. Draft a helpful response`}
                value={config.prompt}
                onChange={(e) => {
                  handleFieldChange('prompt', e.target.value)
                  autoResizeTextarea(e.target)
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    setTimeout(() => autoResizeTextarea(e.currentTarget), 0)
                  }
                }}
                className="font-mono text-xs resize-none overflow-hidden"
                style={{
                  height: config.prompt ? 'auto' : `${calculatePlaceholderHeight(`Describe what the AI should do...

Example: Analyze the incoming message and:
1. Identify the main topic
2. Draft a helpful response`)}px`,
                  minHeight: '120px'
                }}
              />
            </div>

            {/* Additional Instructions */}
            <Collapsible open={instructionsOpen} onOpenChange={setInstructionsOpen}>
              <CollapsibleTrigger asChild>
                <Button variant="ghost" size="sm" className="h-7 text-xs text-muted-foreground p-0">
                  {instructionsOpen ? <ChevronDown className="w-3 h-3 mr-1" /> : <ChevronRight className="w-3 h-3 mr-1" />}
                  Additional Instructions
                </Button>
              </CollapsibleTrigger>
              <CollapsibleContent className="pt-2">
                <Textarea
                  ref={instructionsRef}
                  placeholder={`Add context, rules, or persona...

Example:
- Always maintain a professional tone
- Keep responses concise
- Escalate urgent issues`}
                  value={config.customInstructions}
                  onChange={(e) => {
                    handleFieldChange('customInstructions', e.target.value)
                    autoResizeTextarea(e.target)
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      setTimeout(() => autoResizeTextarea(e.currentTarget), 0)
                    }
                  }}
                  className="text-xs resize-none overflow-hidden"
                  style={{
                    height: config.customInstructions ? 'auto' : `${calculatePlaceholderHeight(`Add context, rules, or persona...

Example:
- Always maintain a professional tone
- Keep responses concise
- Escalate urgent issues`)}px`,
                    minHeight: '80px'
                  }}
                />
              </CollapsibleContent>
            </Collapsible>

            <Separator />

            {/* Model Selection */}
            <div className="space-y-2">
              <Label className="text-xs font-medium">Model</Label>
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
          </TabsContent>

          {/* ADVANCED TAB - API, Output, Guardrails */}
          <TabsContent value="advanced" className="mt-0 p-4 pb-4 space-y-4">
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

            <Separator />

            {/* Token & Timeout Settings */}
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

            <Separator />

            {/* Output Format Hint */}
            <div className="space-y-2">
              <Label className="text-xs font-medium">Output Format Hint (Optional)</Label>
              <p className="text-[10px] text-muted-foreground mb-2">
                Tell the AI what structured data you want to extract. The AI will automatically parse these fields into <code className="bg-muted px-1 rounded text-[9px]">structured_output</code>
              </p>
              <Textarea
                ref={outputFormatRef}
                value={config.outputFormat}
                onChange={(e) => {
                  handleFieldChange('outputFormat', e.target.value)
                  autoResizeTextarea(e.target)
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    setTimeout(() => autoResizeTextarea(e.currentTarget), 0)
                  }
                }}
                placeholder={`Examples:
• customer_name, email, order_number, issue_type
• sentiment, urgency, category
• approved: boolean, feedback: string`}
                className="text-xs resize-none overflow-hidden font-mono"
                style={{
                  height: config.outputFormat ? 'auto' : '80px',
                  minHeight: '80px'
                }}
              />
            </div>
          </TabsContent>

          {/* RESULTS TAB - Using shared ResultsTab component */}
          <TabsContent value="results" className="flex-1 min-h-0 overflow-hidden mt-0 p-0">
            <ResultsTab
              nodeInfo={effectiveNodeInfo}
              currentNodeId={currentNodeId}
              testData={initialData?.__testData}
              testResult={initialData?.__testResult}
              onRunTest={onRunTest}
              isTestingNode={isTestingNode}
              workflowId={workflowId}
            />
          </TabsContent>
        </div>
      </Tabs>

      {/* Footer - Matching standard ConfigurationContainer style */}
      <div className="border-t border-border px-6 py-4 flex-shrink-0 bg-white dark:bg-slate-950">
        <div className="flex justify-between items-center">
          <div className="flex items-center gap-2">
            {config.apiSource === 'chainreact' && <Badge variant="outline" className="text-[9px]"><Gauge className="w-2.5 h-2.5 mr-1" />Plan limits</Badge>}
            {config.apiSource === 'custom' && config.customApiKey && <Badge variant="outline" className="text-[9px] text-green-600"><Key className="w-2.5 h-2.5 mr-1" />Custom</Badge>}
          </div>
          <Button onClick={handleSave}>Save Configuration</Button>
        </div>
      </div>
    </div>
  )
}
