"use client"

import React, { useCallback, useEffect, useMemo, useState } from "react"
import { ConfigurationContainer } from "../components/ConfigurationContainer"
import { FieldRenderer } from "../fields/FieldRenderer"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Button } from "@/components/ui/button"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { useToast } from "@/hooks/use-toast"
import { Loader2, Sparkles, Wand2, FileText, PenSquare, ListChecks, Target, Languages, Mic, Search, ChevronDown } from "lucide-react"

import { logger } from '@/lib/utils/logger'

interface AIMessageConfigurationProps {
  nodeInfo: any
  values: Record<string, any>
  setValue: (field: string, value: any) => void
  errors: Record<string, string>
  onSubmit: (values: Record<string, any>) => Promise<void>
  onCancel: () => void
  onBack?: () => void
  isEditMode?: boolean
  workflowData?: any
  currentNodeId?: string
  dynamicOptions: Record<string, any[]>
  loadingDynamic: boolean
  loadOptions: (fieldName: string, parentField?: string, parentValue?: any, forceReload?: boolean) => Promise<void>
  aiFields?: Record<string, boolean>
  setAiFields?: (fields: Record<string, boolean>) => void
  isConnectedToAIAgent?: boolean
}

type QuickActionKey =
  | "custom"
  | "summarize"
  | "write"
  | "classify"
  | "extract"
  | "translate"
  | "analyze"
  | "transcribe"
  | "search"

interface QuickActionTemplate {
  key: QuickActionKey
  label: string
  description: string
  icon: React.ReactNode
  systemPrompt?: string
  userPrompt?: string
  outputFields?: string
  temperature?: number
}

const QUICK_ACTION_TEMPLATES: QuickActionTemplate[] = [
  {
    key: "custom",
    label: "Custom prompt",
    description: "Build a prompt from scratch",
    icon: <PenSquare className="h-4 w-4" />
  },
  {
    key: "summarize",
    label: "Summarize",
    description: "Create concise recaps or highlight lists",
    icon: <ListChecks className="h-4 w-4" />,
    systemPrompt: "You are a helpful assistant that produces clear, concise summaries focusing on key takeaways and next steps.",
    userPrompt: "Summarize the following content in a few bullet points. Highlight actionable insights and critical information:\n\n{{trigger.email.body}}",
    outputFields: "summary | Bullet point summary of the content\nnext_steps | Suggested next steps based on the content",
    temperature: 0.3
  },
  {
    key: "write",
    label: "Write",
    description: "Draft personalized responses or copy",
    icon: <FileText className="h-4 w-4" />,
    systemPrompt: "You are a professional copywriter. Craft helpful, empathetic responses that match the user's tone and provide clear value.",
    userPrompt: "Write a helpful response to this message. Acknowledge the sender's main request and propose a next step:\n\n{{trigger.email.body}}",
    outputFields: "subject | Subject line suggestion (if needed)\nbody | Email body text",
    temperature: 0.7
  },
  {
    key: "classify",
    label: "Classify",
    description: "Assign categories or priorities",
    icon: <Target className="h-4 w-4" />,
    systemPrompt: "You are an expert operations analyst. Classify incoming messages accurately and label their priority.",
    userPrompt: "Classify the following content. Provide a category and urgency rating:\n\n{{trigger.email.body}}",
    outputFields: "category | Category label\npriority | Urgency level\nreason | Short explanation for the classification",
    temperature: 0.2
  },
  {
    key: "extract",
    label: "Extract",
    description: "Pull structured data from text",
    icon: <Wand2 className="h-4 w-4" />,
    systemPrompt: "You are a data extraction assistant. Pull out structured details and return JSON-friendly fields.",
    userPrompt: "Extract key fields from the following content. Return what you find and leave other fields blank:\n\n{{trigger.email.body}}",
    outputFields: "contact_name | Name of the sender (if present)\ncompany | Company or organization (if present)\nintent | Summary of what the sender wants",
    temperature: 0.2
  },
  {
    key: "translate",
    label: "Translate",
    description: "Convert content between languages",
    icon: <Languages className="h-4 w-4" />,
    systemPrompt: "You are a precise translator. Preserve meaning and tone while translating between languages.",
    userPrompt: "Translate the following text into English. If there are proper nouns, keep them intact:\n\n{{trigger.email.body}}",
    outputFields: "translated_text | Translated version of the content",
    temperature: 0.1
  },
  {
    key: "analyze",
    label: "Analyze",
    description: "Identify sentiment or themes",
    icon: <Target className="h-4 w-4" />,
    systemPrompt: "You analyze messages and surface the key sentiment, themes, and risks.",
    userPrompt: "Analyze the following content. Provide sentiment, key themes, and any risk factors:\n\n{{trigger.email.body}}",
    outputFields: "sentiment | Positive, neutral, or negative\nthemes | Key themes detected\nrisks | Potential risks or follow-up items",
    temperature: 0.3
  },
  {
    key: "transcribe",
    label: "Transcribe",
    description: "Summarize audio or meeting notes",
    icon: <Mic className="h-4 w-4" />,
    systemPrompt: "You turn raw transcripts into structured notes and action items.",
    userPrompt: "Summarize this transcript into meeting notes with action items:\n\n{{trigger.transcript}}",
    outputFields: "notes | Key meeting notes\naction_items | Action items extracted",
    temperature: 0.4
  },
  {
    key: "search",
    label: "Search",
    description: "Write search queries or research prompts",
    icon: <Search className="h-4 w-4" />,
    systemPrompt: "You craft precise search queries and research prompts based on the request.",
    userPrompt: "Generate a concise search query that would help investigate the following request:\n\n{{trigger.email.body}}",
    outputFields: "query | Search query to run\nrationale | Why this query will be useful",
    temperature: 0.2
  }
]

const QUICK_ACTION_MAP = QUICK_ACTION_TEMPLATES.reduce<Record<QuickActionKey, QuickActionTemplate>>((acc, action) => {
  acc[action.key] = action
  return acc
}, {} as Record<QuickActionKey, QuickActionTemplate>)

const ADVANCED_FIELDS = new Set(["systemPrompt", "contextNodeIds", "temperature", "includeRawOutput", "memoryNotes"])

export function AIMessageConfiguration({
  nodeInfo,
  values,
  setValue,
  errors,
  onSubmit,
  onCancel,
  onBack,
  isEditMode,
  workflowData,
  currentNodeId,
  dynamicOptions,
  loadingDynamic,
  loadOptions,
}: AIMessageConfigurationProps) {
  const { toast } = useToast()
  const [activeTab, setActiveTab] = useState("basic")
  const [isImprovingPrompt, setIsImprovingPrompt] = useState(false)
  const [pendingQuickAction, setPendingQuickAction] = useState<QuickActionKey | null>(null)
  const [showSwitchConfirm, setShowSwitchConfirm] = useState(false)
  const [loadingFields, setLoadingFields] = useState<Set<string>>(new Set())

  const detectQuickAction = useCallback((): QuickActionKey => {
    const trimmedUserPrompt = (values.userPrompt || "").trim()
    const trimmedSystemPrompt = (values.systemPrompt || "").trim()
    const trimmedOutputFields = (values.outputFields || "").trim()

    const match = QUICK_ACTION_TEMPLATES.find(action => {
      if (action.key === "custom") return false
      return (
        (action.userPrompt || "").trim() === trimmedUserPrompt &&
        (action.systemPrompt || "").trim() === trimmedSystemPrompt &&
        (action.outputFields || "").trim() === trimmedOutputFields
      )
    })

    return match?.key ?? "custom"
  }, [values.outputFields, values.systemPrompt, values.userPrompt])

  const [quickAction, setQuickAction] = useState<QuickActionKey>(detectQuickAction)

  useEffect(() => {
    setQuickAction(detectQuickAction())
  }, [detectQuickAction])

  const handleDynamicLoad = useCallback(async (
    fieldName: string,
    dependsOn?: string,
    dependsOnValue?: any,
    forceReload?: boolean
  ) => {
    const field = nodeInfo?.configSchema?.find((f: any) => f.name === fieldName)
    if (!field) return

    try {
      if (dependsOn && dependsOnValue !== undefined) {
        await loadOptions(fieldName, dependsOn, dependsOnValue, forceReload)
      } else if (field.dependsOn && values[field.dependsOn]) {
        await loadOptions(fieldName, field.dependsOn, values[field.dependsOn], forceReload)
      } else if (!field.dependsOn) {
        await loadOptions(fieldName, undefined, undefined, forceReload)
      }
    } catch (error) {
       
      logger.error('[AIMessageConfiguration] Failed to load dynamic options', error)
    }
  }, [loadOptions, nodeInfo?.configSchema, values])

  const renderField = useCallback((fieldName: string) => {
    const field = nodeInfo?.configSchema?.find((f: any) => f.name === fieldName)
    if (!field) return null

    return (
      <FieldRenderer
        key={field.name}
        field={field}
        value={values[field.name]}
        onChange={(val) => setValue(field.name, val)}
        error={errors[field.name]}
        workflowData={workflowData}
        currentNodeId={currentNodeId}
        dynamicOptions={dynamicOptions}
        loadingDynamic={loadingDynamic}
        onDynamicLoad={handleDynamicLoad}
        nodeInfo={nodeInfo}
        parentValues={values}
      />
    )
  }, [currentNodeId, dynamicOptions, errors, handleDynamicLoad, loadingDynamic, nodeInfo, setValue, values, workflowData])

  const applyQuickAction = useCallback((actionKey: QuickActionKey) => {
    if (actionKey === "custom") {
      setQuickAction("custom")
      return
    }

    const template = QUICK_ACTION_MAP[actionKey]

    if (typeof template.systemPrompt === 'string') {
      setValue('systemPrompt', template.systemPrompt)
    }
    if (typeof template.userPrompt === 'string') {
      setValue('userPrompt', template.userPrompt)
    }
    if (typeof template.outputFields === 'string') {
      setValue('outputFields', template.outputFields)
    }
    if (typeof template.temperature === 'number') {
      setValue('temperature', template.temperature)
    }

    setQuickAction(actionKey)
  }, [setValue])

  const handleQuickActionSelect = useCallback((actionKey: QuickActionKey) => {
    if (quickAction === actionKey) return

    if (actionKey === "custom") {
      setQuickAction("custom")
      return
    }

    const hasExistingContent = Boolean((values.userPrompt || "").trim()) || Boolean((values.systemPrompt || "").trim()) || Boolean((values.outputFields || "").trim())

    if (hasExistingContent && quickAction === "custom") {
      setPendingQuickAction(actionKey)
      setShowSwitchConfirm(true)
      return
    }

    applyQuickAction(actionKey)
  }, [applyQuickAction, quickAction, values.outputFields, values.systemPrompt, values.userPrompt])

  const handleImprovePrompt = useCallback(async () => {
    const currentPrompt = (values.userPrompt || "").trim()
    if (!currentPrompt) {
      toast({
        title: "Prompt required",
        description: "Add some instructions before asking the model to improve them.",
        variant: "destructive"
      })
      return
    }

    try {
      setIsImprovingPrompt(true)
      const response = await fetch("/api/integrations/ai/improve-prompt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: currentPrompt,
          systemPrompt: values.systemPrompt,
          quickAction,
          model: values.model || "gpt-4o-mini"
        })
      })

      const data = await response.json()
      if (!response.ok) {
        throw new Error(data.error || "Failed to improve prompt")
      }

      if (data.improvedPrompt) {
        setValue('userPrompt', data.improvedPrompt)
        toast({ title: "Prompt improved", description: "We reworded your prompt for clarity and precision." })
      } else {
        toast({ title: "No changes made", description: "The model kept the original wording." })
      }
    } catch (error: any) {
       
      logger.error('[AIMessageConfiguration] Improve prompt failed', error)
      toast({
        title: "Unable to improve prompt",
        description: error.message || 'The AI service was unavailable.',
        variant: "destructive"
      })
    } finally {
      setIsImprovingPrompt(false)
    }
  }, [quickAction, setValue, toast, values.model, values.systemPrompt, values.userPrompt])

  const handleSubmit = useCallback(async (event: React.FormEvent) => {
    event.preventDefault()
    await onSubmit(values)
  }, [onSubmit, values])

  const isFormValid = useMemo(() => {
    const requiredBasic = ["model", "userPrompt"]
    return requiredBasic.every(fieldName => {
      const val = values[fieldName]
      return val !== undefined && val !== null && String(val).trim().length > 0
    })
  }, [values])

  const renderUserPromptField = useMemo(() => {
    return (
      <div className="space-y-2">
        {renderField('userPrompt')}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-xs text-slate-500">
            Need inspiration? Try a quick action or let the model refine your wording.
          </span>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleImprovePrompt}
            disabled={isImprovingPrompt}
          >
            {isImprovingPrompt ? (
              <>
                <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                Improving...
              </>
            ) : (
              <>
                <Sparkles className="mr-1 h-4 w-4" />
                Improve prompt
              </>
            )}
          </Button>
        </div>
      </div>
    )
  }, [handleImprovePrompt, isImprovingPrompt, renderField])

  const basicTopFields = useMemo(() => ['model', 'apiSource'], [])
  const basicBottomFields = useMemo(() => ['outputFields'], [])

  // Only show customApiKey when apiSource is 'custom'
  const showCustomApiKey = useMemo(() => values.apiSource === 'custom', [values.apiSource])
  const advancedFields = useMemo(() => Array.from(ADVANCED_FIELDS), [])

  const handleConfirmQuickAction = useCallback(() => {
    if (pendingQuickAction) {
      applyQuickAction(pendingQuickAction)
    }
    setPendingQuickAction(null)
    setShowSwitchConfirm(false)
  }, [applyQuickAction, pendingQuickAction])

  const handleCancelQuickAction = useCallback(() => {
    setPendingQuickAction(null)
    setShowSwitchConfirm(false)
  }, [])

  return (
    <ConfigurationContainer
      onSubmit={handleSubmit}
      onCancel={onCancel}
      onBack={onBack}
      isEditMode={isEditMode}
      isFormValid={isFormValid}
    >
      <div className="space-y-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-slate-700">Build mode</p>
            <p className="text-xs text-slate-500">Start from a quick action or craft your own prompt.</p>
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="gap-2">
                {QUICK_ACTION_MAP[quickAction]?.icon}
                {QUICK_ACTION_MAP[quickAction]?.label || 'Custom prompt'}
                <ChevronDown className="h-4 w-4 opacity-60" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-64">
              <DropdownMenuLabel>Generate a prompt</DropdownMenuLabel>
              <DropdownMenuItem onClick={() => handleQuickActionSelect('custom')}>
                <div className="flex items-center gap-2">
                  {QUICK_ACTION_MAP.custom.icon}
                  <div>
                    <p className="text-sm font-medium">{QUICK_ACTION_MAP.custom.label}</p>
                    <p className="text-xs text-slate-500">Start from scratch</p>
                  </div>
                </div>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuLabel>Quick actions</DropdownMenuLabel>
              {QUICK_ACTION_TEMPLATES.filter(action => action.key !== 'custom').map(action => (
                <DropdownMenuItem key={action.key} onClick={() => handleQuickActionSelect(action.key)}>
                  <div className="flex items-center gap-2">
                    {action.icon}
                    <div>
                      <p className="text-sm font-medium">{action.label}</p>
                      <p className="text-xs text-slate-500">{action.description}</p>
                    </div>
                  </div>
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="flex flex-col">
          <TabsList className="w-full bg-slate-100/60 p-1 rounded-lg grid grid-cols-2">
            <TabsTrigger value="basic">Basic</TabsTrigger>
            <TabsTrigger value="advanced">Advanced</TabsTrigger>
          </TabsList>
          <TabsContent value="basic" className="space-y-4 mt-4" forceMount>
            {basicTopFields.map(fieldName => renderField(fieldName))}
            {showCustomApiKey && renderField('customApiKey')}
            {renderUserPromptField}
            {basicBottomFields.map(fieldName => renderField(fieldName))}
          </TabsContent>
          <TabsContent value="advanced" className="space-y-4 mt-4" forceMount>
            {advancedFields.map(fieldName => renderField(fieldName))}
          </TabsContent>
        </Tabs>
      </div>

      <AlertDialog open={showSwitchConfirm} onOpenChange={setShowSwitchConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Replace your custom prompt?</AlertDialogTitle>
            <AlertDialogDescription>
              Switching build modes will overwrite the current system prompt, user prompt, and structured outputs
              with a predefined template. You can always switch back to custom mode later.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={handleCancelQuickAction}>Keep current prompt</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmQuickAction}>Replace prompt</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </ConfigurationContainer>
  )
}
