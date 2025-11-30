"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Badge } from "@/components/ui/badge"
import {
  Copy,
  CheckCircle2,
  ExternalLink,
  AlertCircle,
  Loader2,
  RefreshCw
} from "lucide-react"
import { toast } from "sonner"
import { logger } from "@/lib/utils/logger"

interface NotionWebhookSetupModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  webhookUrl: string
  recommendedEvents: string[]
  targetResource?: string
  targetType?: 'database' | 'data_source'
  workflowId: string
  nodeId: string
  onComplete?: () => void
}

export function NotionWebhookSetupModal({
  open,
  onOpenChange,
  webhookUrl,
  recommendedEvents,
  targetResource,
  targetType = 'database',
  workflowId,
  nodeId,
  onComplete
}: NotionWebhookSetupModalProps) {
  const [copied, setCopied] = useState(false)
  const [checkingStatus, setCheckingStatus] = useState(false)
  const [webhookStatus, setWebhookStatus] = useState<'pending' | 'verified' | 'error'>('pending')

  // Reset status when modal opens
  useEffect(() => {
    if (open) {
      setWebhookStatus('pending')
    }
  }, [open])

  const copyWebhookUrl = async () => {
    try {
      await navigator.clipboard.writeText(webhookUrl)
      setCopied(true)
      toast.success('Webhook URL copied to clipboard')

      setTimeout(() => setCopied(false), 2000)
    } catch (error) {
      logger.error('[Notion Webhook Setup] Failed to copy URL:', error)
      toast.error('Failed to copy URL')
    }
  }

  const openNotionSettings = () => {
    window.open('https://www.notion.so/my-integrations', '_blank')
  }

  const checkWebhookStatus = async () => {
    setCheckingStatus(true)

    try {
      const response = await fetch(`/api/triggers/notion/status?workflowId=${workflowId}&nodeId=${nodeId}`)

      if (!response.ok) {
        throw new Error('Failed to check webhook status')
      }

      const data = await response.json()

      if (data.webhookVerified) {
        setWebhookStatus('verified')
        toast.success('Webhook verified successfully!')

        // Call onComplete after a brief delay
        setTimeout(() => {
          onComplete?.()
          onOpenChange(false)
        }, 1500)
      } else {
        setWebhookStatus('pending')
        toast.info('Webhook not yet verified. Please complete the setup in Notion.')
      }
    } catch (error) {
      logger.error('[Notion Webhook Setup] Failed to check status:', error)
      setWebhookStatus('error')
      toast.error('Failed to check webhook status')
    } finally {
      setCheckingStatus(false)
    }
  }

  const getStatusBadge = () => {
    switch (webhookStatus) {
      case 'verified':
        return (
          <Badge variant="outline" className="bg-green-100 text-green-800 border-green-300 dark:bg-green-500/20 dark:text-green-300 dark:border-green-500/40">
            <CheckCircle2 className="w-3 h-3 mr-1" />
            Verified
          </Badge>
        )
      case 'error':
        return (
          <Badge variant="outline" className="bg-red-100 text-red-800 border-red-300 dark:bg-red-500/20 dark:text-red-300 dark:border-red-500/40">
            <AlertCircle className="w-3 h-3 mr-1" />
            Error
          </Badge>
        )
      default:
        return (
          <Badge variant="outline" className="bg-yellow-100 text-yellow-800 border-yellow-300 dark:bg-yellow-500/20 dark:text-yellow-300 dark:border-yellow-500/40">
            <AlertCircle className="w-3 h-3 mr-1" />
            Pending Setup
          </Badge>
        )
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <DialogTitle>Set up Notion Webhook</DialogTitle>
            {getStatusBadge()}
          </div>
          <DialogDescription>
            Follow these steps to enable real-time notifications from Notion
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          {/* Step 1: Copy Webhook URL */}
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <div className="flex items-center justify-center w-6 h-6 rounded-full bg-blue-100 text-blue-800 dark:bg-blue-500/20 dark:text-blue-300 text-sm font-semibold">
                1
              </div>
              <h3 className="font-semibold">Copy your webhook URL</h3>
            </div>

            <div className="ml-8 space-y-2">
              <div className="flex gap-2">
                <input
                  type="text"
                  readOnly
                  value={webhookUrl}
                  className="flex-1 px-3 py-2 text-sm bg-gray-50 dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-md font-mono"
                />
                <Button
                  variant="outline"
                  size="sm"
                  onClick={copyWebhookUrl}
                  className="shrink-0"
                >
                  {copied ? (
                    <>
                      <CheckCircle2 className="w-4 h-4 mr-2 text-green-600" />
                      Copied
                    </>
                  ) : (
                    <>
                      <Copy className="w-4 h-4 mr-2" />
                      Copy
                    </>
                  )}
                </Button>
              </div>
            </div>
          </div>

          {/* Step 2: Open Notion Settings */}
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <div className="flex items-center justify-center w-6 h-6 rounded-full bg-blue-100 text-blue-800 dark:bg-blue-500/20 dark:text-blue-300 text-sm font-semibold">
                2
              </div>
              <h3 className="font-semibold">Configure in Notion</h3>
            </div>

            <div className="ml-8 space-y-3">
              <Button
                variant="outline"
                onClick={openNotionSettings}
                className="w-full justify-start"
              >
                <ExternalLink className="w-4 h-4 mr-2" />
                Open Notion Integration Settings
              </Button>

              <div className="text-sm text-gray-600 dark:text-gray-400 space-y-1">
                <p>In the Notion integration settings:</p>
                <ol className="list-decimal list-inside space-y-1 ml-2">
                  <li>Select your ChainReact integration</li>
                  <li>Go to the "Webhooks" tab</li>
                  <li>Click "+ Create a subscription"</li>
                  <li>Paste the webhook URL above</li>
                  <li>Select these events: <strong>{recommendedEvents.join(', ')}</strong></li>
                  {targetResource && (
                    <li>
                      Subscribe to {targetType}: <code className="px-1 py-0.5 bg-gray-100 dark:bg-gray-800 rounded text-xs">
                        {targetResource}
                      </code>
                    </li>
                  )}
                  <li>Click "Create subscription"</li>
                </ol>
              </div>
            </div>
          </div>

          {/* Step 3: Verify */}
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <div className="flex items-center justify-center w-6 h-6 rounded-full bg-blue-100 text-blue-800 dark:bg-blue-500/20 dark:text-blue-300 text-sm font-semibold">
                3
              </div>
              <h3 className="font-semibold">Verify connection</h3>
            </div>

            <div className="ml-8 space-y-2">
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Notion will automatically send a verification request. Click below to check if your webhook is active.
              </p>

              <Button
                variant="outline"
                onClick={checkWebhookStatus}
                disabled={checkingStatus || webhookStatus === 'verified'}
                className="w-full"
              >
                {checkingStatus ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Checking...
                  </>
                ) : webhookStatus === 'verified' ? (
                  <>
                    <CheckCircle2 className="w-4 h-4 mr-2 text-green-600" />
                    Verified
                  </>
                ) : (
                  <>
                    <RefreshCw className="w-4 h-4 mr-2" />
                    Test Connection
                  </>
                )}
              </Button>
            </div>
          </div>

          {/* Info Box */}
          <div className="p-4 bg-blue-50 dark:bg-blue-500/10 border border-blue-200 dark:border-blue-500/30 rounded-md">
            <div className="flex gap-3">
              <AlertCircle className="w-5 h-5 text-blue-600 dark:text-blue-400 shrink-0 mt-0.5" />
              <div className="text-sm text-blue-900 dark:text-blue-200">
                <p className="font-semibold mb-1">Important</p>
                <p>
                  This is a one-time setup. Once configured, you won't need to do this again unless you delete
                  the webhook subscription in Notion.
                </p>
              </div>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
          >
            {webhookStatus === 'verified' ? 'Done' : 'I\'ll do this later'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
