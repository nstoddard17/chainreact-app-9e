"use client"

import React, { useState, useEffect, useRef, useCallback } from 'react'
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
import { Switch } from '@/components/ui/switch'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { Slider } from '@/components/ui/slider'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
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
  Loader2,
  Zap,
  DollarSign,
  Clock,
  CheckCircle2,
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
  Check
} from 'lucide-react'
import { LightningLoader } from '@/components/ui/lightning-loader'
import { useToast } from '@/hooks/use-toast'
import { AIVariableMenu } from './AIVariableMenu'
import { AIVariablePanel } from './AIVariablePanel'
import { cn } from '@/lib/utils'

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

// Enhanced model definitions with visual metadata
const AI_MODELS = {
  'gpt-4o-mini': {
    name: 'GPT-4o Mini',
    provider: 'OpenAI',
    providerIcon: '/integrations/openai.svg',
    capabilities: ['Great balance', 'Cost-efficient', 'Fast'],
    bestFor: 'Most workflows - best price/performance',
    costPer1k: { input: 0.00015, output: 0.0006 },
    contextWindow: 128000,
    speed: 3, // 1-3 scale
    quality: 2,
    recommended: true
  },
  'gpt-4o': {
    name: 'GPT-4o',
    provider: 'OpenAI',
    providerIcon: '/integrations/openai.svg',
    capabilities: ['Advanced reasoning', 'Long context', 'Creative writing'],
    bestFor: 'Complex analysis & creative tasks',
    costPer1k: { input: 0.005, output: 0.015 },
    contextWindow: 128000,
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
    contextWindow: 16000,
    speed: 3,
    quality: 1,
    recommended: false
  },
  'claude-3-sonnet': {
    name: 'Claude 3.5 Sonnet',
    provider: 'Anthropic',
    providerIcon: '/integrations/anthropic.svg',
    capabilities: ['Excellent reasoning', 'Long context', 'Nuanced'],
    bestFor: 'Complex reasoning & analysis',
    costPer1k: { input: 0.003, output: 0.015 },
    contextWindow: 200000,
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
    contextWindow: 200000,
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
    contextWindow: 32000,
    speed: 3,
    quality: 2,
    recommended: false
  }
}

// Prompt templates for quick start
const PROMPT_TEMPLATES = [
  {
    id: 'summarize',
    name: 'Summarize Content',
    icon: FileText,
    category: 'Transform',
    prompt: 'Summarize the following content in {{style}} format:\n\n{{trigger.content}}',
    description: 'Create concise summaries of text, emails, or documents',
    variables: ['style: "3 bullet points" | "one paragraph" | "key takeaways"']
  },
  {
    id: 'respond-email',
    name: 'Email Response',
    icon: Mail,
    category: 'Generate',
    prompt: 'Write a professional response to this email:\n\nFrom: {{trigger.email.from}}\nSubject: {{trigger.email.subject}}\nBody: {{trigger.email.body}}\n\nTone: {{tone}}\nKey points to address: {{points}}',
    description: 'Generate professional email replies',
    variables: ['tone: professional | friendly | formal', 'points: main topics to cover']
  },
  {
    id: 'classify',
    name: 'Classify & Route',
    icon: Filter,
    category: 'Analyze',
    prompt: 'Analyze this message and classify it into one of these categories: {{categories}}\n\nMessage: {{trigger.message}}\n\nProvide your classification and confidence level.',
    description: 'Categorize content for routing decisions',
    variables: ['categories: comma-separated list']
  },
  {
    id: 'extract',
    name: 'Extract Information',
    icon: Target,
    category: 'Transform',
    prompt: 'Extract the following information from this text:\n- {{fields}}\n\nText: {{trigger.content}}\n\nReturn as structured JSON.',
    description: 'Pull specific data from unstructured text',
    variables: ['fields: what to extract (name, email, date, etc.)']
  },
  {
    id: 'translate',
    name: 'Translate Text',
    icon: Languages,
    category: 'Transform',
    prompt: 'Translate the following text to {{language}}:\n\n{{trigger.text}}\n\nMaintain the original tone and formatting.',
    description: 'Translate content to any language',
    variables: ['language: target language']
  },
  {
    id: 'sentiment',
    name: 'Sentiment Analysis',
    icon: BarChart3,
    category: 'Analyze',
    prompt: 'Analyze the sentiment of this text:\n\n{{trigger.content}}\n\nProvide:\n1. Overall sentiment (positive/negative/neutral)\n2. Confidence score (0-100%)\n3. Key phrases that influenced the analysis',
    description: 'Determine emotional tone of content',
    variables: []
  },
  {
    id: 'chat-response',
    name: 'Chat Response',
    icon: MessageSquare,
    category: 'Generate',
    prompt: 'You are a helpful {{role}}. Respond to this message:\n\n{{trigger.message}}\n\nContext: {{context}}\n\nKeep responses {{length}} and {{tone}}.',
    description: 'Generate conversational responses',
    variables: ['role: assistant type', 'length: concise | detailed', 'tone: friendly | professional']
  },
  {
    id: 'custom',
    name: 'Custom Prompt',
    icon: Wand2,
    category: 'Custom',
    prompt: '',
    description: 'Start from scratch with your own prompt',
    variables: []
  }
]

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
  const [activeTab, setActiveTab] = useState('prompt')
  const [config, setConfig] = useState({
    prompt: '',
    model: 'gpt-4o-mini',
    temperature: 0.7,
    maxTokens: 1500,
    tone: 'professional',
    verbosity: 'concise',
    includeEmojis: false,
    memory: 'none',
    apiSource: 'chainreact',
    customApiKey: '',
    customInstructions: '',
    outputFormat: '',
    targetActions: [] as string[],
    autoDiscoverActions: true,
    fieldBehavior: 'smart',
    guardrails: initialConfig.guardrails || DEFAULT_GUARDRAILS,
    outputMapping: {
      saveResponse: true,
      responseField: 'output',
      extractJson: false,
      splitFields: false
    },
    ...initialConfig
  })

  const [isImproving, setIsImproving] = useState(false)
  const [isTesting, setIsTesting] = useState(false)
  const [testResult, setTestResult] = useState<any>(null)
  const [testInput, setTestInput] = useState('{\n  "message": "I need help with my order #12345",\n  "priority": "medium"\n}')
  const [estimatedCost, setEstimatedCost] = useState(0)
  const [showVariableExplorer, setShowVariableExplorer] = useState(false)
  const [selectedTemplate, setSelectedTemplate] = useState<string | null>(null)
  const [copiedTemplate, setCopiedTemplate] = useState<string | null>(null)
  const [advancedOpen, setAdvancedOpen] = useState(false)
  const promptRef = useRef<HTMLTextAreaElement>(null)
  const instructionsRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    setConfig(prev => ({
      ...prev,
      ...initialConfig,
      guardrails: initialConfig.guardrails || DEFAULT_GUARDRAILS,
      outputMapping: initialConfig.outputMapping || {
        saveResponse: true,
        responseField: 'output',
        extractJson: false,
        splitFields: false
      }
    }))
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

  const handleFieldChange = useCallback((field: string, value: any) => {
    setConfig(prev => ({ ...prev, [field]: value }))
  }, [])

  const handleGuardrailChange = useCallback((field: string, value: any) => {
    setConfig(prev => ({
      ...prev,
      guardrails: {
        ...(prev.guardrails || DEFAULT_GUARDRAILS),
        [field]: value
      }
    }))
  }, [])

  const handleOutputMappingChange = useCallback((field: string, value: any) => {
    setConfig(prev => ({
      ...prev,
      outputMapping: {
        ...prev.outputMapping,
        [field]: value
      }
    }))
  }, [])

  // Improve prompt with AI
  const handleImprovePrompt = async () => {
    if (!config.prompt.trim()) {
      toast({
        title: "Prompt Required",
        description: "Please enter a prompt to improve",
        variant: "destructive"
      })
      return
    }

    setIsImproving(true)
    try {
      const response = await fetch('/api/workflows/ai/improve-prompt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: config.prompt,
          context: {
            tone: config.tone,
            verbosity: config.verbosity,
            model: config.model
          }
        })
      })

      const data = await response.json()
      if (data.success && data.improvedPrompt) {
        handleFieldChange('prompt', data.improvedPrompt)
        toast({
          title: "Prompt Improved",
          description: "Your prompt has been enhanced for better results"
        })
      } else {
        throw new Error(data.error || 'Failed to improve prompt')
      }
    } catch (error: any) {
      logger.error('Prompt improvement failed:', error)
      toast({
        title: "Improvement Failed",
        description: error.message || "Could not improve prompt. Please try again.",
        variant: "destructive"
      })
    } finally {
      setIsImproving(false)
    }
  }

  // Use template
  const handleUseTemplate = (template: typeof PROMPT_TEMPLATES[0]) => {
    if (template.prompt) {
      handleFieldChange('prompt', template.prompt)
    }
    setSelectedTemplate(template.id)
    toast({
      title: "Template Applied",
      description: `"${template.name}" template loaded. Customize the variables in brackets.`
    })
  }

  // Copy template
  const handleCopyTemplate = (template: typeof PROMPT_TEMPLATES[0]) => {
    navigator.clipboard.writeText(template.prompt)
    setCopiedTemplate(template.id)
    setTimeout(() => setCopiedTemplate(null), 2000)
  }

  // Test prompt
  const handleTestPrompt = async () => {
    if (!config.prompt.trim()) {
      toast({
        title: "Prompt Required",
        description: "Please enter a prompt to test",
        variant: "destructive"
      })
      return
    }

    setIsTesting(true)
    setTestResult(null)

    try {
      let parsedInput = {}
      try {
        parsedInput = JSON.parse(testInput)
      } catch {
        parsedInput = { message: testInput }
      }

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
        setTestResult({
          output: data.output,
          tokensUsed: data.tokensUsed,
          cost: data.cost,
          latency: data.latency
        })
      } else {
        throw new Error(data.error || 'Test failed')
      }
    } catch (error: any) {
      logger.error('Test failed:', error)
      setTestResult({
        error: error.message || 'Test failed. Please try again.'
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

    onSave(config)
    onClose()
  }

  // Get temperature label
  const getTemperatureLabel = (temp: number) => {
    if (temp <= 0.3) return { label: 'Precise', description: 'Consistent, deterministic outputs', emoji: '🎯' }
    if (temp <= 0.6) return { label: 'Balanced', description: 'Good mix of consistency and creativity', emoji: '⚖️' }
    if (temp <= 0.8) return { label: 'Creative', description: 'More varied and creative responses', emoji: '🎨' }
    return { label: 'Experimental', description: 'Highly creative, may be unpredictable', emoji: '🌈' }
  }

  const tempInfo = getTemperatureLabel(config.temperature)

  return (
    <TooltipProvider>
      <Dialog open={isOpen} onOpenChange={onClose}>
        <DialogContent className="max-w-5xl max-h-[90vh] overflow-hidden flex flex-col">
          <DialogHeader className="flex-shrink-0">
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
              <Badge variant="secondary" className="ml-2 text-xs">
                Est. ${estimatedCost.toFixed(4)}/run
              </Badge>
            </DialogTitle>
            <DialogDescription>
              Configure your AI agent with prompts, model selection, and output handling.
            </DialogDescription>
          </DialogHeader>

          <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 overflow-hidden flex flex-col">
            <TabsList className="grid w-full grid-cols-5 flex-shrink-0">
              <TabsTrigger value="prompt" className="flex items-center gap-2">
                <Wand2 className="w-4 h-4" />
                <span className="hidden sm:inline">Prompt</span>
              </TabsTrigger>
              <TabsTrigger value="model" className="flex items-center gap-2">
                <Brain className="w-4 h-4" />
                <span className="hidden sm:inline">Model</span>
              </TabsTrigger>
              <TabsTrigger value="output" className="flex items-center gap-2">
                <Database className="w-4 h-4" />
                <span className="hidden sm:inline">Output</span>
              </TabsTrigger>
              <TabsTrigger value="advanced" className="flex items-center gap-2">
                <Settings2 className="w-4 h-4" />
                <span className="hidden sm:inline">Advanced</span>
              </TabsTrigger>
              <TabsTrigger value="test" className="flex items-center gap-2">
                <TestTube className="w-4 h-4" />
                <span className="hidden sm:inline">Test</span>
              </TabsTrigger>
            </TabsList>

            <div className="flex-1 overflow-y-auto mt-4">
              {/* PROMPT TAB */}
              <TabsContent value="prompt" className="mt-0 space-y-6">
                {/* Template Gallery */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <Label className="text-sm font-medium">Quick Start Templates</Label>
                    <span className="text-xs text-muted-foreground">Click to use, or start from scratch</span>
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                    {PROMPT_TEMPLATES.map((template) => {
                      const Icon = template.icon
                      const isSelected = selectedTemplate === template.id
                      return (
                        <Card
                          key={template.id}
                          className={cn(
                            "cursor-pointer transition-all hover:border-primary/50 group relative",
                            isSelected && "border-primary bg-primary/5"
                          )}
                          onClick={() => handleUseTemplate(template)}
                        >
                          <CardContent className="p-3">
                            <div className="flex items-start justify-between">
                              <div className="flex items-center gap-2">
                                <div className={cn(
                                  "p-1.5 rounded-md",
                                  isSelected ? "bg-primary/20" : "bg-muted"
                                )}>
                                  <Icon className="w-3.5 h-3.5" />
                                </div>
                                <div>
                                  <p className="text-xs font-medium">{template.name}</p>
                                  <p className="text-[10px] text-muted-foreground">{template.category}</p>
                                </div>
                              </div>
                              {template.prompt && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-6 w-6 p-0 opacity-0 group-hover:opacity-100"
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    handleCopyTemplate(template)
                                  }}
                                >
                                  {copiedTemplate === template.id ? (
                                    <Check className="w-3 h-3 text-green-500" />
                                  ) : (
                                    <Copy className="w-3 h-3" />
                                  )}
                                </Button>
                              )}
                            </div>
                          </CardContent>
                        </Card>
                      )
                    })}
                  </div>
                </div>

                <Separator />

                {/* Main Prompt Editor with Live Preview */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  {/* Prompt Editor */}
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <Label htmlFor="prompt" className="text-sm font-medium">Your Prompt</Label>
                      <div className="flex items-center gap-2">
                        <AIVariableMenu
                          nodes={nodes}
                          currentNodeId={currentNodeId}
                          inputRef={promptRef}
                          buttonClassName="h-7 text-xs"
                        />
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 text-xs gap-1.5"
                          onClick={handleImprovePrompt}
                          disabled={isImproving || !config.prompt.trim()}
                        >
                          {isImproving ? (
                            <Loader2 className="w-3 h-3 animate-spin" />
                          ) : (
                            <Sparkles className="w-3 h-3" />
                          )}
                          Improve
                        </Button>
                      </div>
                    </div>
                    <Textarea
                      ref={promptRef}
                      id="prompt"
                      placeholder="Describe what the AI should do...

Example: Analyze this customer message and:
1. Identify their main concern
2. Determine urgency (low/medium/high)
3. Draft a helpful response

Use {{trigger.message}} to reference incoming data."
                      value={config.prompt}
                      onChange={(e) => handleFieldChange('prompt', e.target.value)}
                      className="min-h-[280px] font-mono text-sm resize-none"
                    />
                    <p className="text-xs text-muted-foreground">
                      Use <code className="bg-muted px-1 py-0.5 rounded">{'{{variable}}'}</code> for data references
                    </p>
                  </div>

                  {/* Live Preview Panel */}
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <Label className="text-sm font-medium">Preview & Test</Label>
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 text-xs gap-1.5"
                        onClick={handleTestPrompt}
                        disabled={isTesting || !config.prompt.trim()}
                      >
                        {isTesting ? (
                          <Loader2 className="w-3 h-3 animate-spin" />
                        ) : (
                          <Play className="w-3 h-3" />
                        )}
                        Run Test
                      </Button>
                    </div>

                    <div className="border rounded-lg overflow-hidden">
                      <div className="bg-muted/50 px-3 py-2 border-b flex items-center justify-between">
                        <span className="text-xs font-medium">Test Input</span>
                        <Badge variant="outline" className="text-[10px]">JSON</Badge>
                      </div>
                      <Textarea
                        value={testInput}
                        onChange={(e) => setTestInput(e.target.value)}
                        className="border-0 rounded-none min-h-[80px] font-mono text-xs resize-none focus-visible:ring-0"
                        placeholder='{"message": "test data"}'
                      />
                    </div>

                    <div className="border rounded-lg overflow-hidden">
                      <div className="bg-muted/50 px-3 py-2 border-b flex items-center justify-between">
                        <span className="text-xs font-medium">AI Response</span>
                        {testResult && !testResult.error && (
                          <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
                            <span className="flex items-center gap-1">
                              <Clock className="w-3 h-3" />
                              {testResult.latency}ms
                            </span>
                            <span className="flex items-center gap-1">
                              <DollarSign className="w-3 h-3" />
                              ${testResult.cost?.toFixed(5)}
                            </span>
                          </div>
                        )}
                      </div>
                      <div className="p-3 min-h-[140px] max-h-[200px] overflow-y-auto">
                        {isTesting ? (
                          <div className="flex items-center justify-center h-full">
                            <LightningLoader size="sm" />
                          </div>
                        ) : testResult ? (
                          testResult.error ? (
                            <p className="text-sm text-red-500">{testResult.error}</p>
                          ) : (
                            <pre className="text-xs font-mono whitespace-pre-wrap">{
                              typeof testResult.output === 'string'
                                ? testResult.output
                                : JSON.stringify(testResult.output, null, 2)
                            }</pre>
                          )
                        ) : (
                          <p className="text-xs text-muted-foreground text-center py-8">
                            Click "Run Test" to see AI response
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Additional Instructions */}
                <Collapsible open={advancedOpen} onOpenChange={setAdvancedOpen}>
                  <CollapsibleTrigger asChild>
                    <Button variant="ghost" size="sm" className="gap-2 text-muted-foreground">
                      {advancedOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                      Additional Instructions
                    </Button>
                  </CollapsibleTrigger>
                  <CollapsibleContent className="pt-3">
                    <Textarea
                      ref={instructionsRef}
                      placeholder="Add context, rules, or persona instructions...

Example:
- Always maintain a professional tone
- Our refund policy is 30 days
- Escalate complaints about billing to a human"
                      value={config.customInstructions}
                      onChange={(e) => handleFieldChange('customInstructions', e.target.value)}
                      className="min-h-[100px]"
                    />
                  </CollapsibleContent>
                </Collapsible>
              </TabsContent>

              {/* MODEL TAB */}
              <TabsContent value="model" className="mt-0 space-y-6">
                {/* Model Selection Cards */}
                <div className="space-y-3">
                  <Label className="text-sm font-medium">Select AI Model</Label>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {Object.entries(AI_MODELS).map(([key, model]) => {
                      const isSelected = config.model === key
                      return (
                        <Card
                          key={key}
                          className={cn(
                            "cursor-pointer transition-all hover:border-primary/50 relative",
                            isSelected && "border-primary bg-primary/5 ring-1 ring-primary/20"
                          )}
                          onClick={() => handleFieldChange('model', key)}
                        >
                          {model.recommended && (
                            <Badge className="absolute -top-2 -right-2 text-[10px] bg-green-500">
                              Recommended
                            </Badge>
                          )}
                          <CardContent className="p-4">
                            <div className="flex items-start justify-between mb-3">
                              <div className="flex items-center gap-2">
                                <Image
                                  src={model.providerIcon}
                                  alt={model.provider}
                                  width={20}
                                  height={20}
                                  className="rounded"
                                />
                                <div>
                                  <p className="font-medium text-sm">{model.name}</p>
                                  <p className="text-[10px] text-muted-foreground">{model.provider}</p>
                                </div>
                              </div>
                              <Badge variant="secondary" className="text-[10px]">
                                ${model.costPer1k.input}/1k
                              </Badge>
                            </div>

                            <p className="text-xs text-muted-foreground mb-3">{model.bestFor}</p>

                            <div className="flex items-center gap-4 text-[10px]">
                              <div className="flex items-center gap-1">
                                <Zap className="w-3 h-3" />
                                <span>Speed</span>
                                <div className="flex">
                                  {[1, 2, 3].map((i) => (
                                    <div
                                      key={i}
                                      className={cn(
                                        "w-1.5 h-1.5 rounded-full ml-0.5",
                                        i <= model.speed ? "bg-green-500" : "bg-muted"
                                      )}
                                    />
                                  ))}
                                </div>
                              </div>
                              <div className="flex items-center gap-1">
                                <Brain className="w-3 h-3" />
                                <span>Quality</span>
                                <div className="flex">
                                  {[1, 2, 3].map((i) => (
                                    <div
                                      key={i}
                                      className={cn(
                                        "w-1.5 h-1.5 rounded-full ml-0.5",
                                        i <= model.quality ? "bg-blue-500" : "bg-muted"
                                      )}
                                    />
                                  ))}
                                </div>
                              </div>
                            </div>

                            <div className="flex flex-wrap gap-1 mt-3">
                              {model.capabilities.map((cap) => (
                                <Badge key={cap} variant="outline" className="text-[9px] px-1.5 py-0">
                                  {cap}
                                </Badge>
                              ))}
                            </div>
                          </CardContent>
                        </Card>
                      )
                    })}
                  </div>
                </div>

                <Separator />

                {/* Temperature Slider */}
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <Label className="text-sm font-medium">Creativity (Temperature)</Label>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {tempInfo.description}
                      </p>
                    </div>
                    <Badge variant="secondary" className="gap-1">
                      {tempInfo.emoji} {tempInfo.label}
                    </Badge>
                  </div>
                  <div className="space-y-2">
                    <div className="flex items-center gap-4">
                      <span className="text-xs text-muted-foreground w-16">🎯 Precise</span>
                      <Slider
                        value={[config.temperature]}
                        onValueChange={([value]) => handleFieldChange('temperature', value)}
                        min={0}
                        max={1}
                        step={0.1}
                        className="flex-1"
                      />
                      <span className="text-xs text-muted-foreground w-20 text-right">Creative 🎨</span>
                    </div>
                    <div className="flex justify-between text-[10px] text-muted-foreground px-20">
                      <span>0</span>
                      <span>0.5</span>
                      <span>1.0</span>
                    </div>
                  </div>
                </div>

                <Separator />

                {/* API Source */}
                <div className="space-y-4">
                  <Label className="text-sm font-medium">API Source</Label>
                  <div className="grid grid-cols-2 gap-3">
                    <Card
                      className={cn(
                        "cursor-pointer transition-all",
                        config.apiSource === 'chainreact' && "border-primary bg-primary/5"
                      )}
                      onClick={() => handleFieldChange('apiSource', 'chainreact')}
                    >
                      <CardContent className="p-4">
                        <div className="flex items-center gap-2 mb-2">
                          <Gauge className="w-4 h-4" />
                          <span className="font-medium text-sm">ChainReact Managed</span>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          No setup required. Uses your plan credits.
                        </p>
                      </CardContent>
                    </Card>
                    <Card
                      className={cn(
                        "cursor-pointer transition-all",
                        config.apiSource === 'custom' && "border-primary bg-primary/5"
                      )}
                      onClick={() => handleFieldChange('apiSource', 'custom')}
                    >
                      <CardContent className="p-4">
                        <div className="flex items-center gap-2 mb-2">
                          <Key className="w-4 h-4" />
                          <span className="font-medium text-sm">Custom API Key</span>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          Use your own OpenAI/Anthropic key.
                        </p>
                      </CardContent>
                    </Card>
                  </div>

                  {config.apiSource === 'custom' && (
                    <div className="space-y-3 pt-2">
                      <Input
                        type="password"
                        placeholder="sk-..."
                        value={config.customApiKey}
                        onChange={(e) => handleFieldChange('customApiKey', e.target.value)}
                      />
                      <p className="text-xs text-muted-foreground">
                        Your API key is encrypted and stored securely.
                      </p>
                    </div>
                  )}
                </div>
              </TabsContent>

              {/* OUTPUT TAB */}
              <TabsContent value="output" className="mt-0 space-y-6">
                {/* Output Mapping */}
                <Card>
                  <CardHeader>
                    <CardTitle className="text-sm">Output Mapping</CardTitle>
                    <CardDescription>Configure how AI responses are saved and structured</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <Label className="text-sm">Save AI Response</Label>
                        <p className="text-xs text-muted-foreground">Store the response for use in later steps</p>
                      </div>
                      <Switch
                        checked={config.outputMapping.saveResponse}
                        onCheckedChange={(checked) => handleOutputMappingChange('saveResponse', checked)}
                      />
                    </div>

                    {config.outputMapping.saveResponse && (
                      <div className="space-y-2">
                        <Label className="text-sm">Output Field Name</Label>
                        <Input
                          value={config.outputMapping.responseField}
                          onChange={(e) => handleOutputMappingChange('responseField', e.target.value)}
                          placeholder="output"
                        />
                        <p className="text-xs text-muted-foreground">
                          Access via <code className="bg-muted px-1 py-0.5 rounded">{'{{ai_agent.' + config.outputMapping.responseField + '}}'}</code>
                        </p>
                      </div>
                    )}

                    <Separator />

                    <div className="flex items-center justify-between">
                      <div>
                        <Label className="text-sm">Extract Structured Data (JSON)</Label>
                        <p className="text-xs text-muted-foreground">Parse AI response as JSON when possible</p>
                      </div>
                      <Switch
                        checked={config.outputMapping.extractJson}
                        onCheckedChange={(checked) => handleOutputMappingChange('extractJson', checked)}
                      />
                    </div>

                    {config.outputMapping.extractJson && (
                      <Alert>
                        <Lightbulb className="w-4 h-4" />
                        <AlertDescription className="text-xs">
                          Add instructions like "Return as JSON with fields: name, email, priority" to your prompt for best results.
                        </AlertDescription>
                      </Alert>
                    )}
                  </CardContent>
                </Card>

                {/* Output Format Hint */}
                <Card>
                  <CardHeader>
                    <CardTitle className="text-sm">Output Format (Optional)</CardTitle>
                    <CardDescription>Guide the AI on how to structure its response</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <Textarea
                      value={config.outputFormat}
                      onChange={(e) => handleFieldChange('outputFormat', e.target.value)}
                      placeholder="Describe the output structure you want:

Examples:
• subject, body, urgency (for email drafts)
• category, confidence, reasoning (for classification)
• name: string, email: string, phone?: string (for extraction)"
                      className="min-h-[120px] font-mono text-sm"
                    />
                  </CardContent>
                </Card>

                {/* Data & Variables */}
                <Card>
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <div>
                        <CardTitle className="text-sm">Available Variables</CardTitle>
                        <CardDescription>Data from previous workflow steps</CardDescription>
                      </div>
                      <Button variant="outline" size="sm" onClick={() => setShowVariableExplorer(v => !v)}>
                        <Variable className="w-4 h-4 mr-2" />
                        {showVariableExplorer ? 'Hide' : 'Show'} Explorer
                      </Button>
                    </div>
                  </CardHeader>
                  {showVariableExplorer && (
                    <CardContent>
                      <div className="border rounded-lg max-h-[300px] overflow-y-auto">
                        <AIVariablePanel nodes={nodes} currentNodeId={currentNodeId} />
                      </div>
                    </CardContent>
                  )}
                </Card>
              </TabsContent>

              {/* ADVANCED TAB */}
              <TabsContent value="advanced" className="mt-0 space-y-6">
                {/* Behavior Settings */}
                <Card>
                  <CardHeader>
                    <CardTitle className="text-sm">Response Settings</CardTitle>
                    <CardDescription>Fine-tune AI behavior and output</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label className="text-sm">Max Response Length</Label>
                        <Input
                          type="number"
                          min={100}
                          max={4000}
                          step={100}
                          value={config.maxTokens}
                          onChange={(e) => handleFieldChange('maxTokens', Number(e.target.value))}
                        />
                        <p className="text-xs text-muted-foreground">~{Math.round(config.maxTokens * 4)} characters</p>
                      </div>
                      <div className="space-y-2">
                        <Label className="text-sm">Timeout (seconds)</Label>
                        <Input
                          type="number"
                          min={5}
                          max={120}
                          value={config.timeout || 30}
                          onChange={(e) => handleFieldChange('timeout', Number(e.target.value))}
                        />
                      </div>
                    </div>

                    <Separator />

                    <div className="flex items-center justify-between">
                      <div>
                        <Label className="text-sm">Include Emojis</Label>
                        <p className="text-xs text-muted-foreground">Great for Slack, SMS, casual channels</p>
                      </div>
                      <Switch
                        checked={config.includeEmojis}
                        onCheckedChange={(checked) => handleFieldChange('includeEmojis', checked)}
                      />
                    </div>
                  </CardContent>
                </Card>

                {/* Guardrails */}
                <Card>
                  <CardHeader>
                    <div className="flex items-center gap-2">
                      <Shield className="w-4 h-4" />
                      <div>
                        <CardTitle className="text-sm">Guardrails & Safety</CardTitle>
                        <CardDescription>Control execution and error handling</CardDescription>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <Label className="text-sm">Require Human Approval</Label>
                        <p className="text-xs text-muted-foreground">Pause for review before executing downstream actions</p>
                      </div>
                      <Switch
                        checked={config.guardrails?.requireApproval || false}
                        onCheckedChange={(checked) => handleGuardrailChange('requireApproval', checked)}
                      />
                    </div>

                    {config.guardrails?.requireApproval && (
                      <Input
                        placeholder="Approval channel (e.g., #approvals, @manager)"
                        value={config.guardrails?.approvalChannel || ''}
                        onChange={(e) => handleGuardrailChange('approvalChannel', e.target.value)}
                      />
                    )}

                    <Separator />

                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label className="text-sm">Max Retries</Label>
                        <Input
                          type="number"
                          min={0}
                          max={5}
                          value={config.guardrails?.maxRetries ?? 2}
                          onChange={(e) => handleGuardrailChange('maxRetries', Number(e.target.value))}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label className="text-sm">Cost Limit ($)</Label>
                        <Input
                          type="number"
                          min={0.01}
                          max={10}
                          step={0.01}
                          value={config.costLimit || 1}
                          onChange={(e) => handleFieldChange('costLimit', Number(e.target.value))}
                        />
                      </div>
                    </div>

                    <Separator />

                    <div className="flex items-center justify-between">
                      <div>
                        <Label className="text-sm">Notify on Failure</Label>
                        <p className="text-xs text-muted-foreground">Send alerts when AI calls fail</p>
                      </div>
                      <Switch
                        checked={config.guardrails?.notifyOnFailure ?? true}
                        onCheckedChange={(checked) => handleGuardrailChange('notifyOnFailure', checked)}
                      />
                    </div>

                    {config.guardrails?.notifyOnFailure && (
                      <Input
                        type="email"
                        placeholder="Escalation email (optional)"
                        value={config.guardrails?.escalationEmail || ''}
                        onChange={(e) => handleGuardrailChange('escalationEmail', e.target.value)}
                      />
                    )}
                  </CardContent>
                </Card>
              </TabsContent>

              {/* TEST TAB */}
              <TabsContent value="test" className="mt-0 space-y-6">
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  {/* Test Input */}
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-sm">Test Input</CardTitle>
                      <CardDescription>Provide sample data to test your configuration</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <Textarea
                        value={testInput}
                        onChange={(e) => setTestInput(e.target.value)}
                        className="min-h-[200px] font-mono text-sm"
                        placeholder='{"message": "test", "user": "John"}'
                      />
                      <Button
                        onClick={handleTestPrompt}
                        disabled={isTesting || !config.prompt.trim()}
                        className="w-full"
                      >
                        {isTesting ? (
                          <>
                            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                            Running Test...
                          </>
                        ) : (
                          <>
                            <Play className="w-4 h-4 mr-2" />
                            Run Full Test
                          </>
                        )}
                      </Button>
                    </CardContent>
                  </Card>

                  {/* Test Results */}
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-sm">Test Results</CardTitle>
                      <CardDescription>AI response and execution metrics</CardDescription>
                    </CardHeader>
                    <CardContent>
                      {testResult ? (
                        <div className="space-y-4">
                          {testResult.error ? (
                            <Alert variant="destructive">
                              <AlertDescription>{testResult.error}</AlertDescription>
                            </Alert>
                          ) : (
                            <>
                              <div className="grid grid-cols-3 gap-2 text-center">
                                <div className="bg-muted rounded-lg p-2">
                                  <p className="text-[10px] text-muted-foreground">Latency</p>
                                  <p className="font-semibold text-sm">{testResult.latency}ms</p>
                                </div>
                                <div className="bg-muted rounded-lg p-2">
                                  <p className="text-[10px] text-muted-foreground">Tokens</p>
                                  <p className="font-semibold text-sm">{testResult.tokensUsed}</p>
                                </div>
                                <div className="bg-muted rounded-lg p-2">
                                  <p className="text-[10px] text-muted-foreground">Cost</p>
                                  <p className="font-semibold text-sm">${testResult.cost?.toFixed(5)}</p>
                                </div>
                              </div>
                              <div className="border rounded-lg p-3 max-h-[300px] overflow-y-auto">
                                <pre className="text-xs font-mono whitespace-pre-wrap">{
                                  typeof testResult.output === 'string'
                                    ? testResult.output
                                    : JSON.stringify(testResult.output, null, 2)
                                }</pre>
                              </div>
                            </>
                          )}
                        </div>
                      ) : (
                        <div className="flex flex-col items-center justify-center h-[200px] text-muted-foreground">
                          <TestTube className="w-8 h-8 mb-2 opacity-50" />
                          <p className="text-sm">No test results yet</p>
                          <p className="text-xs">Run a test to see AI output</p>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </div>

                {/* Configuration Summary */}
                <Card>
                  <CardHeader>
                    <CardTitle className="text-sm">Current Configuration</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                      <div>
                        <p className="text-xs text-muted-foreground">Model</p>
                        <p className="font-medium">{AI_MODELS[config.model as keyof typeof AI_MODELS]?.name || config.model}</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Temperature</p>
                        <p className="font-medium">{config.temperature} ({tempInfo.label})</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Max Tokens</p>
                        <p className="font-medium">{config.maxTokens}</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Est. Cost</p>
                        <p className="font-medium">${estimatedCost.toFixed(4)}/run</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>
            </div>
          </Tabs>

          <DialogFooter className="flex-shrink-0 flex items-center justify-between border-t pt-4">
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
                <CheckCircle2 className="w-4 h-4 mr-2" />
                Save Configuration
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </TooltipProvider>
  )
}
