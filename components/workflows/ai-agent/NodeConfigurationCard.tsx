'use client'

import React, { useState, useEffect, useMemo } from 'react'
import { ChevronRight, Loader2, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Combobox, type ComboboxOption } from '@/components/ui/combobox'
import type {
  NodeConfigDefinition,
  ConfigQuestion,
  ConfigQuestionOption,
} from '@/lib/workflows/ai-agent/nodeConfigQuestions'
import { getDefaultConfig } from '@/lib/workflows/ai-agent/nodeConfigQuestions'
import { useWorkflowPreferencesStore } from '@/stores/workflowPreferencesStore'

interface NodeConfigurationCardProps {
  nodeType: string
  definition: NodeConfigDefinition
  onComplete: (config: Record<string, string | boolean>) => void
  onSkip?: () => void // Optional - kept for backwards compatibility but not used
  loadDynamicOptions?: (optionType: string) => Promise<ConfigQuestionOption[]>
}

export function NodeConfigurationCard({
  nodeType,
  definition,
  onComplete,
  onSkip: _onSkip, // Unused - defaults are pre-selected now
  loadDynamicOptions,
}: NodeConfigurationCardProps) {
  const { getNodeConfigDefault } = useWorkflowPreferencesStore()

  // Get saved defaults and merge with definition defaults
  const savedDefaults = getNodeConfigDefault(nodeType) || {}
  const definitionDefaults = getDefaultConfig(nodeType)

  const [config, setConfig] = useState<Record<string, string | boolean>>({
    ...definitionDefaults,
    ...savedDefaults,
  })
  const [loadingOptions, setLoadingOptions] = useState<Record<string, boolean>>({})
  const [dynamicOptionsCache, setDynamicOptionsCache] = useState<Record<string, ConfigQuestionOption[]>>({})
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0)
  const [refreshingOptions, setRefreshingOptions] = useState<Record<string, boolean>>({})

  // Get current question and any follow-up question
  const currentQuestion = definition.questions[currentQuestionIndex]
  const currentValue = config[currentQuestion?.id]
  const followUpQuestion = currentQuestion?.followUp?.[currentValue as string]

  // Check if we need to load dynamic options
  useEffect(() => {
    if (!currentQuestion) return

    const loadOptions = async (question: ConfigQuestion) => {
      if (question.dynamicOptions && !dynamicOptionsCache[question.dynamicOptions] && loadDynamicOptions) {
        setLoadingOptions(prev => ({ ...prev, [question.id]: true }))
        try {
          const options = await loadDynamicOptions(question.dynamicOptions)
          setDynamicOptionsCache(prev => ({ ...prev, [question.dynamicOptions!]: options }))
        } catch (error) {
          console.error('Failed to load dynamic options:', error)
        } finally {
          setLoadingOptions(prev => ({ ...prev, [question.id]: false }))
        }
      }
    }

    loadOptions(currentQuestion)
    if (followUpQuestion) {
      loadOptions(followUpQuestion)
    }
  }, [currentQuestion, followUpQuestion, loadDynamicOptions, dynamicOptionsCache])

  const handleValueChange = (questionId: string, value: string | boolean) => {
    setConfig(prev => ({ ...prev, [questionId]: value }))
  }

  const handleNext = () => {
    if (currentQuestionIndex < definition.questions.length - 1) {
      setCurrentQuestionIndex(prev => prev + 1)
    } else {
      onComplete(config)
    }
  }

  // Refresh handler for dynamic options
  const handleRefreshOptions = async (question: ConfigQuestion) => {
    if (!question.dynamicOptions || !loadDynamicOptions) return

    setRefreshingOptions(prev => ({ ...prev, [question.id]: true }))
    try {
      const options = await loadDynamicOptions(question.dynamicOptions)
      setDynamicOptionsCache(prev => ({ ...prev, [question.dynamicOptions!]: options }))
    } catch (error) {
      console.error('Failed to refresh dynamic options:', error)
    } finally {
      setRefreshingOptions(prev => ({ ...prev, [question.id]: false }))
    }
  }

  const isLastQuestion = currentQuestionIndex >= definition.questions.length - 1 && !followUpQuestion
  const hasUnansweredFollowUp = followUpQuestion && !config[followUpQuestion.id]

  // Determine if we can proceed
  const canProceed = useMemo(() => {
    if (!currentQuestion) return false

    // Check if required question has value
    if (currentQuestion.required && !config[currentQuestion.id]) {
      return false
    }

    // Check if follow-up is required and has value
    if (followUpQuestion?.required && !config[followUpQuestion.id]) {
      return false
    }

    return true
  }, [currentQuestion, followUpQuestion, config])

  const renderQuestion = (question: ConfigQuestion, isFollowUp = false) => {
    const isLoading = loadingOptions[question.id]
    const options = question.dynamicOptions
      ? dynamicOptionsCache[question.dynamicOptions] || []
      : question.options || []

    return (
      <div key={question.id} className={`space-y-3 ${isFollowUp ? 'pl-4 border-l-2 border-muted ml-2 mt-3' : ''}`}>
        <Label className="text-sm font-medium">{question.question}</Label>

        {isLoading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading options...
          </div>
        ) : question.type === 'radio' && options.length > 0 ? (
          <RadioGroup
            value={config[question.id] as string || ''}
            onValueChange={(value) => handleValueChange(question.id, value)}
            className="space-y-2"
          >
            {options.map(option => {
              // Check if user has a saved default for this option
              const userSavedDefault = savedDefaults[question.id]
              const isUserDefault = userSavedDefault === option.value
              const isSystemDefault = option.isDefault && !userSavedDefault

              return (
                <div key={option.value} className="flex items-center space-x-2">
                  <RadioGroupItem value={option.value} id={`${question.id}-${option.value}`} />
                  <Label
                    htmlFor={`${question.id}-${option.value}`}
                    className="text-sm font-normal cursor-pointer"
                  >
                    {option.label}
                    {isUserDefault && (
                      <span className="ml-2 text-xs text-primary font-medium">(your default)</span>
                    )}
                    {isSystemDefault && (
                      <span className="ml-2 text-xs text-muted-foreground">(recommended)</span>
                    )}
                  </Label>
                </div>
              )
            })}
          </RadioGroup>
        ) : question.type === 'dropdown' ? (
          <div className="flex items-center gap-2">
            <Combobox
              options={options.map(opt => ({ value: opt.value, label: opt.label })) as ComboboxOption[]}
              value={config[question.id] as string || ''}
              onChange={(value) => handleValueChange(question.id, value)}
              placeholder={question.placeholder || 'Select an option...'}
              emptyPlaceholder="No options available"
              loading={isLoading}
            />
            {question.dynamicOptions && loadDynamicOptions && (
              <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={() => handleRefreshOptions(question)}
                disabled={refreshingOptions[question.id] || isLoading}
                className="flex-shrink-0"
                title="Refresh options"
              >
                <RefreshCw className={`h-4 w-4 ${refreshingOptions[question.id] ? 'animate-spin' : ''}`} />
              </Button>
            )}
          </div>
        ) : question.type === 'text' ? (
          <Input
            value={config[question.id] as string || ''}
            onChange={(e) => handleValueChange(question.id, e.target.value)}
            placeholder={question.placeholder}
            className="w-full"
          />
        ) : question.type === 'textarea' ? (
          <Textarea
            value={config[question.id] as string || ''}
            onChange={(e) => handleValueChange(question.id, e.target.value)}
            placeholder={question.placeholder}
            className="w-full min-h-[80px]"
          />
        ) : null}
      </div>
    )
  }

  if (!currentQuestion) {
    return null
  }

  return (
    <div className="py-3 w-full">
      <div className="rounded-lg border bg-card p-4 space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <h4 className="text-sm font-semibold text-foreground">
            Configure {definition.displayName}
          </h4>
          <span className="text-xs text-muted-foreground">
            Question {currentQuestionIndex + 1} of {definition.questions.length}
          </span>
        </div>

        {/* Current question */}
        {renderQuestion(currentQuestion)}

        {/* Follow-up question if applicable */}
        {followUpQuestion && renderQuestion(followUpQuestion, true)}

        {/* Actions */}
        <div className="flex items-center justify-end pt-2">
          <Button
            size="sm"
            onClick={handleNext}
            disabled={!canProceed || hasUnansweredFollowUp}
            className="gap-1.5"
          >
            {isLastQuestion ? 'Complete' : 'Continue'}
            <ChevronRight className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
    </div>
  )
}
