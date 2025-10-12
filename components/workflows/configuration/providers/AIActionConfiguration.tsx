"use client"

import React, { useMemo, useEffect, useCallback, useState } from "react"
import { FieldRenderer } from "../fields/FieldRenderer"
import { ConfigurationContainer } from "../components/ConfigurationContainer"
import { Button } from "@/components/ui/button"
import { Loader2, Sparkles } from "lucide-react"
import { useToast } from "@/hooks/use-toast"

interface AIActionConfigurationProps {
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
  dynamicOptions?: Record<string, any[]>
  loadingDynamic?: boolean
}

export function AIActionConfiguration({
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
  loadingDynamic
}: AIActionConfigurationProps) {
  const { toast } = useToast()
  const nodeType: string = nodeInfo?.type || ""
  const configFields = useMemo(() => nodeInfo?.configSchema || [], [nodeInfo?.configSchema])

  // Apply default values from schema the first time the form mounts
  useEffect(() => {
    configFields.forEach((field: any) => {
      if (field?.defaultValue !== undefined && values[field.name] === undefined) {
        setValue(field.name, field.defaultValue)
      }
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodeInfo?.id])

  // Normalise array based fields for editing
  useEffect(() => {
    if (nodeType === "ai_action_classify" && Array.isArray(values.categories)) {
      setValue("categories", values.categories.join("\n"))
    }
    if (nodeType === "ai_action_sentiment" && Array.isArray(values.labels)) {
      setValue("labels", values.labels.join("\n"))
    }
  }, [nodeType, setValue, values.categories, values.labels])

  const [isImprovingPrompt, setIsImprovingPrompt] = useState(false)

  const handleImprovePrompt = useCallback(async () => {
    const currentPrompt = values.prompt?.toString()?.trim()
    if (!currentPrompt) {
      toast({
        title: "Add a prompt first",
        description: "Write a quick instruction before asking for improvements.",
        variant: "destructive"
      })
      return
    }

    try {
      setIsImprovingPrompt(true)
      const response = await fetch("/api/integrations/ai/improve-prompt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: currentPrompt })
      })

      if (!response.ok) {
        const data = await response.json().catch(() => ({}))
        throw new Error(data.error || "Failed to improve prompt")
      }

      const data = await response.json()
      if (data?.improvedPrompt) {
        setValue("prompt", data.improvedPrompt)
        toast({
          title: "Prompt polished",
          description: "We refined the instruction for a sharper response."
        })
      }
    } catch (error: any) {
      console.error("[AIActionConfiguration] Improve prompt failed", error)
      toast({
        title: "Unable to improve prompt",
        description: error?.message || "Try again in a moment.",
        variant: "destructive"
      })
    } finally {
      setIsImprovingPrompt(false)
    }
  }, [toast, setValue, values.prompt])

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()

    const payload: Record<string, any> = { ...values }

    // Normalise numeric fields
    const numericFields = ["maxLength", "temperature", "maxTokens"]
    numericFields.forEach((field) => {
      if (payload[field] !== undefined && payload[field] !== null && typeof payload[field] === "string") {
        const parsed = Number(payload[field])
        if (!Number.isNaN(parsed)) payload[field] = parsed
      }
    })

    if (nodeType === "ai_action_classify" && typeof payload.categories === "string") {
      payload.categories = payload.categories
        .split(/\r?\n|,/)
        .map((entry: string) => entry.trim())
        .filter(Boolean)
    }

    if (nodeType === "ai_action_sentiment" && typeof payload.labels === "string") {
      payload.labels = payload.labels
        .split(/\r?\n|,/)
        .map((entry: string) => entry.trim())
        .filter(Boolean)
    }

    await onSubmit(payload)
  }

  const isFormValid = useMemo(() => {
    const required = configFields.filter((field: any) => field.required).map((field: any) => field.name)
    return required.every((name) => {
      const val = values[name]
      return val !== undefined && val !== null && String(val).trim().length > 0
    })
  }, [configFields, values])

  const renderField = (field: any) => (
    <FieldRenderer
      key={field.name}
      field={field}
      value={values[field.name]}
      onChange={(val: any) => setValue(field.name, val)}
      error={errors[field.name]}
      workflowData={workflowData}
      currentNodeId={currentNodeId}
      dynamicOptions={dynamicOptions}
      loadingDynamic={loadingDynamic}
      nodeInfo={nodeInfo}
      parentValues={values}
    />
  )

  return (
    <ConfigurationContainer
      onSubmit={handleSubmit}
      onCancel={onCancel}
      onBack={onBack}
      isEditMode={isEditMode}
      submitLabel={isEditMode ? "Update AI Action" : "Save AI Action"}
      isFormValid={isFormValid}
    >
      <div className="space-y-6">
        <div className="rounded-xl border border-border bg-card/60 p-5 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold text-slate-800">Model &amp; Behaviour</h2>
              <p className="text-xs text-muted-foreground">
                Choose the model and tailor the instructions that guide this step.
              </p>
            </div>
          </div>

          <div className="mt-4 space-y-4">
            {configFields.map((field: any) => {
              if (field.name === "prompt") {
                return (
                  <div key={field.name} className="space-y-2">
                    {renderField(field)}
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-xs text-muted-foreground">
                        Provide a clear instruction. You can reference variables directly in the prompt using the panel on the right.
                      </span>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={handleImprovePrompt}
                        disabled={isImprovingPrompt}
                        className="gap-1"
                      >
                        {isImprovingPrompt ? (
                          <>
                            <Loader2 className="h-4 w-4 animate-spin" />
                            Polishing…
                          </>
                        ) : (
                          <>
                            <Sparkles className="h-4 w-4" />
                            Improve prompt
                          </>
                        )}
                      </Button>
                    </div>
                  </div>
                )
              }

              return renderField(field)
            })}
          </div>
        </div>
      </div>
    </ConfigurationContainer>
  )
}
