"use client"

import React, { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { 
  Bot, Sparkles, X, Info, Wand2, Variable, 
  Brain, Zap, HelpCircle, Check, Edit2
} from "lucide-react"
import { cn } from "@/lib/utils"
import { AI_FIELD_MARKER, AI_VARIABLE_PATTERN } from "@/lib/workflows/aiFieldAutomation"

interface AIFieldControlProps {
  fieldName: string
  fieldLabel?: string
  fieldType: 'text' | 'textarea' | 'select' | 'number' | 'email' | 'url' | 'json'
  value: any
  onChange: (value: any) => void
  placeholder?: string
  options?: Array<{ value: string; label: string }>
  disabled?: boolean
  required?: boolean
  maxLength?: number
  className?: string
  showVariableHelper?: boolean
}

export function AIFieldControl({
  fieldName,
  fieldLabel,
  fieldType,
  value,
  onChange,
  placeholder,
  options,
  disabled,
  required,
  maxLength,
  className,
  showVariableHelper = true
}: AIFieldControlProps) {
  const [isAIMode, setIsAIMode] = useState(false)
  const [showVariableInfo, setShowVariableInfo] = useState(false)
  const [localValue, setLocalValue] = useState(value)
  const [previewMode, setPreviewMode] = useState(false)

  useEffect(() => {
    // Check if the field is already in AI mode
    if (typeof value === 'string' && value.startsWith('{{AI_FIELD')) {
      setIsAIMode(true)
    } else {
      setLocalValue(value)
    }
  }, [value])

  const toggleAIMode = () => {
    if (isAIMode) {
      // Switching back to manual mode
      setIsAIMode(false)
      onChange(localValue || '')
    } else {
      // Switching to AI mode
      setIsAIMode(true)
      // Store current value before switching
      if (value && typeof value === 'string') {
        setLocalValue(value)
      }
      // Set the AI marker
      onChange(`{{AI_FIELD:${fieldName}}}`)
    }
  }

  const handleManualChange = (newValue: any) => {
    setLocalValue(newValue)
    onChange(newValue)
  }

  const insertVariable = (varName: string) => {
    const variable = `[${varName}]`
    if (fieldType === 'textarea') {
      const currentValue = localValue || ''
      setLocalValue(currentValue + variable)
      onChange(currentValue + variable)
    } else if (fieldType === 'text') {
      const currentValue = localValue || ''
      setLocalValue(currentValue + variable)
      onChange(currentValue + variable)
    }
  }

  const insertAIInstruction = (instruction: string) => {
    const marker = `{{AI:${instruction}}}`
    if (fieldType === 'textarea' || fieldType === 'text') {
      const currentValue = localValue || ''
      setLocalValue(currentValue + marker)
      onChange(currentValue + marker)
    }
  }

  // Common AI variables
  const commonVariables = [
    { name: 'name', description: 'Person\'s name from context' },
    { name: 'email', description: 'Email address' },
    { name: 'subject', description: 'Subject or topic' },
    { name: 'date', description: 'Relevant date' },
    { name: 'company', description: 'Company name' },
    { name: 'product', description: 'Product mentioned' },
    { name: 'issue', description: 'Issue or problem described' },
    { name: 'action', description: 'Requested action' }
  ]

  const aiInstructions = [
    { instruction: 'summarize', description: 'Summarize the context' },
    { instruction: 'extract_key_points', description: 'Extract key points' },
    { instruction: 'formal_greeting', description: 'Generate formal greeting' },
    { instruction: 'casual_greeting', description: 'Generate casual greeting' },
    { instruction: 'closing', description: 'Generate appropriate closing' },
    { instruction: 'next_steps', description: 'Suggest next steps' }
  ]

  if (isAIMode) {
    return (
      <div className={cn("space-y-2", className)}>
        {fieldLabel && (
          <Label className="flex items-center gap-2">
            {fieldLabel}
            {required && <span className="text-red-500">*</span>}
            <Badge variant="secondary" className="text-xs">
              <Bot className="w-3 h-3 mr-1" />
              AI Mode
            </Badge>
          </Label>
        )}
        
        <div className="relative">
          <div className={cn(
            "flex items-center justify-between p-3 rounded-md border",
            "bg-gradient-to-r from-purple-50 to-blue-50",
            "border-purple-200"
          )}>
            <div className="flex items-center gap-3">
              <div className="p-2 bg-white rounded-lg shadow-sm">
                <Brain className="w-5 h-5 text-purple-600" />
              </div>
              <div>
                <p className="text-sm font-medium text-gray-900">
                  Defined automatically by the model
                </p>
                <p className="text-xs text-gray-600">
                  This field will be populated based on context
                </p>
              </div>
            </div>
            
            <div className="flex items-center gap-2">
              {previewMode && (
                <Badge variant="outline" className="text-xs">
                  Preview
                </Badge>
              )}
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setPreviewMode(!previewMode)}
                      className="h-8 w-8 p-0"
                    >
                      <Edit2 className="w-4 h-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Configure AI behavior</TooltipContent>
                </Tooltip>
              </TooltipProvider>
              
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={toggleAIMode}
                      className="h-8 w-8 p-0 hover:bg-red-50"
                      disabled={disabled}
                    >
                      <X className="w-4 h-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Switch to manual input</TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
          </div>

          {previewMode && (
            <div className="mt-2 p-3 bg-white border rounded-md">
              <p className="text-xs text-gray-600 mb-2">
                AI will analyze the workflow context and generate appropriate content for this field.
              </p>
              <div className="flex flex-wrap gap-2">
                <Badge variant="outline" className="text-xs">
                  Field: {fieldName}
                </Badge>
                <Badge variant="outline" className="text-xs">
                  Type: {fieldType}
                </Badge>
                {maxLength && (
                  <Badge variant="outline" className="text-xs">
                    Max: {maxLength} chars
                  </Badge>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className={cn("space-y-2", className)}>
      {fieldLabel && (
        <div className="flex items-center justify-between">
          <Label className="flex items-center gap-2">
            {fieldLabel}
            {required && <span className="text-red-500">*</span>}
          </Label>
          
          <div className="flex items-center gap-1">
            {showVariableHelper && (fieldType === 'text' || fieldType === 'textarea') && (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setShowVariableInfo(!showVariableInfo)}
                      className="h-7 px-2"
                    >
                      <Variable className="w-4 h-4 mr-1" />
                      Variables
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Use AI variables in text</TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}
            
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={toggleAIMode}
                    disabled={disabled}
                    className="h-7 px-2 hover:bg-purple-50 hover:border-purple-300"
                  >
                    <Bot className="w-4 h-4 mr-1" />
                    AI
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Let AI decide this field</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
        </div>
      )}

      {showVariableInfo && (
        <Alert className="mb-2">
          <Info className="h-4 w-4" />
          <AlertDescription>
            <div className="space-y-2">
              <p className="font-medium">AI Variables</p>
              <p className="text-xs">
                Use [variable] for simple replacements or {'{{AI:instruction}}'} for AI generation.
              </p>
              
              <div className="mt-2">
                <p className="text-xs font-medium mb-1">Quick Insert:</p>
                <div className="flex flex-wrap gap-1">
                  {commonVariables.slice(0, 4).map(v => (
                    <Button
                      key={v.name}
                      size="sm"
                      variant="outline"
                      onClick={() => insertVariable(v.name)}
                      className="h-6 text-xs px-2"
                    >
                      [{v.name}]
                    </Button>
                  ))}
                </div>
              </div>
              
              <details className="mt-2">
                <summary className="text-xs font-medium cursor-pointer">
                  Show all variables & instructions
                </summary>
                
                <div className="mt-2 space-y-2">
                  <div>
                    <p className="text-xs font-medium mb-1">Variables:</p>
                    <div className="grid grid-cols-2 gap-1 text-xs">
                      {commonVariables.map(v => (
                        <div key={v.name} className="flex items-center gap-1">
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => insertVariable(v.name)}
                            className="h-5 px-1 text-xs"
                          >
                            <Check className="w-3 h-3" />
                          </Button>
                          <code>[{v.name}]</code>
                          <span className="text-gray-500">- {v.description}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                  
                  <div>
                    <p className="text-xs font-medium mb-1">AI Instructions:</p>
                    <div className="space-y-1 text-xs">
                      {aiInstructions.map(inst => (
                        <div key={inst.instruction} className="flex items-center gap-1">
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => insertAIInstruction(inst.instruction)}
                            className="h-5 px-1 text-xs"
                          >
                            <Check className="w-3 h-3" />
                          </Button>
                          <code>{`{{AI:${inst.instruction}}}`}</code>
                          <span className="text-gray-500">- {inst.description}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </details>
            </div>
          </AlertDescription>
        </Alert>
      )}

      {fieldType === 'textarea' ? (
        <Textarea
          value={localValue || ''}
          onChange={(e) => handleManualChange(e.target.value)}
          placeholder={placeholder || "Enter text or use [variables] and {{AI:instructions}}"}
          disabled={disabled}
          maxLength={maxLength}
          className={cn(
            localValue && AI_VARIABLE_PATTERN.test(localValue) && "border-purple-200 bg-purple-50/30"
          )}
        />
      ) : fieldType === 'text' || fieldType === 'email' || fieldType === 'url' ? (
        <Input
          type={fieldType}
          value={localValue || ''}
          onChange={(e) => handleManualChange(e.target.value)}
          placeholder={placeholder || "Enter value or use [variables]"}
          disabled={disabled}
          maxLength={maxLength}
          className={cn(
            localValue && AI_VARIABLE_PATTERN.test(localValue) && "border-purple-200 bg-purple-50/30"
          )}
        />
      ) : fieldType === 'number' ? (
        <Input
          type="number"
          value={localValue || ''}
          onChange={(e) => handleManualChange(e.target.value)}
          placeholder={placeholder}
          disabled={disabled}
        />
      ) : fieldType === 'select' && options ? (
        <select
          value={localValue || ''}
          onChange={(e) => handleManualChange(e.target.value)}
          disabled={disabled}
          className="w-full px-3 py-2 border rounded-md"
        >
          <option value="">Select an option</option>
          {options.map(opt => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      ) : (
        <Input
          value={localValue || ''}
          onChange={(e) => handleManualChange(e.target.value)}
          placeholder={placeholder}
          disabled={disabled}
        />
      )}

      {localValue && typeof localValue === 'string' && AI_VARIABLE_PATTERN.test(localValue) && (
        <p className="text-xs text-purple-600 flex items-center gap-1">
          <Sparkles className="w-3 h-3" />
          Contains AI variables that will be resolved at runtime
        </p>
      )}
    </div>
  )
}