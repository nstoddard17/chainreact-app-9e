"use client"

import React, { useState, useEffect } from 'react'
import { Button } from "@/components/ui/button"
import { Copy, Check, ExternalLink, AlertCircle } from "lucide-react"
import { ConfigurationContainer } from '../components/ConfigurationContainer'
import { FieldRenderer } from '../fields/FieldRenderer'
import { cn } from "@/lib/utils"
import { useAuthStore } from "@/stores/authStore"

import { logger } from '@/lib/utils/logger'

interface WebhookConfigurationProps {
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
  loadOptions: (fieldName: string, parentField?: string, parentValue?: any, forceReload?: boolean, silent?: boolean, extraOptions?: Record<string, any>) => Promise<void>
  aiFields?: Record<string, boolean>
  setAiFields?: (fields: Record<string, boolean>) => void
  isConnectedToAIAgent?: boolean
  loadingFields?: Set<string>
}

export function WebhookConfiguration({
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
  aiFields,
  setAiFields,
  isConnectedToAIAgent,
  loadingFields = new Set(),
}: WebhookConfigurationProps) {
  const [copied, setCopied] = useState(false)
  const [webhookUrl, setWebhookUrl] = useState<string>('')
  const [loading, setLoading] = useState(false)
  const user = useAuthStore(state => state.user)

  // Generate webhook URL
  useEffect(() => {
    if (workflowData?.id) {
      const baseUrl = process.env.NEXT_PUBLIC_APP_URL || window.location.origin
      const url = `${baseUrl}/api/workflow-webhooks/${workflowData.id}`
      setWebhookUrl(url)
    }
  }, [workflowData?.id])

  const handleCopyUrl = async () => {
    try {
      await navigator.clipboard.writeText(webhookUrl)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (error) {
      logger.error('Failed to copy webhook URL:', error)
    }
  }

  const handleTestWebhook = async () => {
    if (!webhookUrl) return

    setLoading(true)
    try {
      const response = await fetch(webhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          test: true,
          message: 'Test webhook from ChainReact',
          timestamp: new Date().toISOString()
        })
      })

      if (response.ok) {
        logger.info('Webhook test successful')
      } else {
        logger.error('Webhook test failed:', await response.text())
      }
    } catch (error) {
      logger.error('Webhook test error:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    await onSubmit(values)
  }

  return (
    <ConfigurationContainer>
      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Webhook URL Display */}
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-medium">Webhook URL</h3>
            {workflowData?.is_active && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400">
                <div className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
                Active
              </span>
            )}
          </div>

          <div className="relative">
            <div className="flex items-center gap-2 p-3 rounded-lg bg-muted/50 border border-border">
              <code className="flex-1 text-sm font-mono break-all">
                {webhookUrl || 'Webhook URL will be generated when workflow is saved and activated'}
              </code>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={handleCopyUrl}
                disabled={!webhookUrl}
                className="shrink-0"
              >
                {copied ? (
                  <Check className="h-4 w-4 text-green-500" />
                ) : (
                  <Copy className="h-4 w-4" />
                )}
              </Button>
            </div>
          </div>

          {!workflowData?.is_active && (
            <div className="flex items-start gap-2 p-3 rounded-lg bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800">
              <AlertCircle className="h-4 w-4 text-yellow-600 dark:text-yellow-500 shrink-0 mt-0.5" />
              <p className="text-sm text-yellow-800 dark:text-yellow-200">
                Activate this workflow to enable the webhook URL. The URL will accept POST requests and trigger your workflow.
              </p>
            </div>
          )}
        </div>

        {/* Configuration Fields */}
        <div className="space-y-4">
          <h3 className="text-sm font-medium">Webhook Settings</h3>

          {nodeInfo?.configSchema?.map((field: any) => (
            <FieldRenderer
              key={field.name}
              field={field}
              value={values[field.name]}
              onChange={(val: any) => setValue(field.name, val)}
              error={errors[field.name]}
              dynamicOptions={dynamicOptions}
              loadingDynamic={loadingDynamic}
              loadOptions={loadOptions}
              currentValues={values}
              setValue={setValue}
              aiFields={aiFields}
              setAiFields={setAiFields}
              isConnectedToAIAgent={isConnectedToAIAgent}
              isLoading={loadingFields.has(field.name)}
            />
          ))}
        </div>

        {/* Example Request */}
        <div className="space-y-3">
          <h3 className="text-sm font-medium">Example Request</h3>
          <div className="p-3 rounded-lg bg-muted/50 border border-border">
            <pre className="text-xs font-mono overflow-x-auto">
{`curl -X ${values.method || 'POST'} \\
  -H "Content-Type: application/json" \\
  -d '{"key": "value"}' \\
  ${webhookUrl || 'YOUR_WEBHOOK_URL'}`}
            </pre>
          </div>
        </div>

        {/* Documentation Link */}
        <div className="p-4 rounded-lg bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800">
          <div className="flex items-start gap-3">
            <ExternalLink className="h-5 w-5 text-blue-600 dark:text-blue-400 shrink-0 mt-0.5" />
            <div className="space-y-2">
              <p className="text-sm font-medium text-blue-900 dark:text-blue-100">
                Webhook Documentation
              </p>
              <p className="text-sm text-blue-700 dark:text-blue-300">
                Your webhook will receive HTTP {values.method || 'POST'} requests. The request body, headers, and query parameters will be available as variables in your workflow.
              </p>
              <ul className="text-sm text-blue-700 dark:text-blue-300 list-disc list-inside space-y-1">
                <li><code className="px-1 py-0.5 rounded bg-blue-100 dark:bg-blue-900/40">body</code> - Request body (parsed JSON or raw)</li>
                <li><code className="px-1 py-0.5 rounded bg-blue-100 dark:bg-blue-900/40">headers</code> - HTTP headers</li>
                <li><code className="px-1 py-0.5 rounded bg-blue-100 dark:bg-blue-900/40">query</code> - URL query parameters</li>
                <li><code className="px-1 py-0.5 rounded bg-blue-100 dark:bg-blue-900/40">method</code> - HTTP method used</li>
              </ul>
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex gap-2 justify-end pt-4 border-t">
          {onBack && (
            <Button type="button" variant="outline" onClick={onBack}>
              Back
            </Button>
          )}
          <Button type="button" variant="outline" onClick={onCancel}>
            Cancel
          </Button>
          <Button type="submit" disabled={loading}>
            {isEditMode ? 'Update Webhook' : 'Save Webhook'}
          </Button>
        </div>
      </form>
    </ConfigurationContainer>
  )
}
