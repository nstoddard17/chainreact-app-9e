"use client"

import React, { useState, useCallback, useRef, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import {
  Radio,
  Square,
  CheckCircle2,
  XCircle,
  Copy,
  ChevronDown,
  Loader2,
  Zap,
  Clock,
  ExternalLink
} from 'lucide-react'
import { useToast } from '@/hooks/use-toast'
import { cn } from '@/lib/utils'

interface LiveWebhookListenerProps {
  workflowId: string
  nodeId: string
  triggerType: string
  providerId: string
  onEventReceived?: (data: any) => void
}

type ListenerStatus = 'idle' | 'activating' | 'listening' | 'received' | 'timeout' | 'error'

/**
 * LiveWebhookListener - Listen for real webhook events in the builder
 *
 * This component allows users to:
 * 1. Temporarily activate their trigger webhook
 * 2. See the webhook URL they need to trigger
 * 3. Wait for a real event (up to 60 seconds)
 * 4. View the captured event data
 */
export function LiveWebhookListener({
  workflowId,
  nodeId,
  triggerType,
  providerId,
  onEventReceived
}: LiveWebhookListenerProps) {
  const [status, setStatus] = useState<ListenerStatus>('idle')
  const [webhookUrl, setWebhookUrl] = useState<string | null>(null)
  const [eventData, setEventData] = useState<any>(null)
  const [error, setError] = useState<string | null>(null)
  const [elapsedTime, setElapsedTime] = useState(0)
  const [isDataExpanded, setIsDataExpanded] = useState(true)
  const [testSessionId, setTestSessionId] = useState<string | null>(null)

  const abortControllerRef = useRef<AbortController | null>(null)
  const timerRef = useRef<NodeJS.Timeout | null>(null)
  const { toast } = useToast()

  const MAX_WAIT_TIME = 60 // seconds

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort()
      }
      if (timerRef.current) {
        clearInterval(timerRef.current)
      }
      if (testSessionId) {
        fetch('/api/workflows/test-trigger', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            workflowId,
            testSessionId,
          }),
        }).catch(() => undefined)
      }
    }
  }, [testSessionId, workflowId])

  const startListening = useCallback(async () => {
    setStatus('activating')
    setError(null)
    setEventData(null)
    setWebhookUrl(null)
    setElapsedTime(0)

    // Create abort controller for cancellation
    abortControllerRef.current = new AbortController()

    try {
      // Start elapsed time timer
      timerRef.current = setInterval(() => {
        setElapsedTime(prev => {
          if (prev >= MAX_WAIT_TIME) {
            if (timerRef.current) clearInterval(timerRef.current)
            return prev
          }
          return prev + 1
        })
      }, 1000)

      setStatus('listening')

      const response = await fetch('/api/workflows/test-trigger', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workflowId,
          nodeId
        }),
        signal: abortControllerRef.current.signal
      })

      const result = await response.json()

      if (!response.ok) {
        throw new Error(result.error || 'Failed to activate trigger')
      }

      if (!result.testSessionId) {
        throw new Error('Missing test session ID')
      }

      setTestSessionId(result.testSessionId)

      if (result.webhookUrl) {
        setWebhookUrl(result.webhookUrl)
      }

      const streamUrl = `/api/workflows/test-trigger/stream?sessionId=${encodeURIComponent(result.testSessionId)}&workflowId=${encodeURIComponent(workflowId)}&timeoutMs=${MAX_WAIT_TIME * 1000}`
      const streamResponse = await fetch(streamUrl, { signal: abortControllerRef.current.signal })

      if (!streamResponse.ok) {
        throw new Error('Failed to open trigger stream')
      }

      const reader = streamResponse.body?.getReader()
      const decoder = new TextDecoder()

      if (!reader) {
        throw new Error('No trigger stream available')
      }

      let buffer = ''
      let triggerReceived = false

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          try {
            const event = JSON.parse(line.slice(6))
            console.log('[TEST] Trigger stream event:', event)

            if (event.type === 'trigger_received') {
              setStatus('received')
              setEventData(event.data)
              onEventReceived?.(event.data)
              fetch('/api/workflows/test-trigger', {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  workflowId,
                  testSessionId: result.testSessionId,
                }),
              }).catch(() => undefined)
              setTestSessionId(null)
              triggerReceived = true
              break
            }

            if (event.type === 'timeout') {
              break
            }

            if (event.type === 'error') {
              throw new Error(event.message || 'Trigger stream error')
            }
          } catch (parseError) {
            console.log('[TEST] Trigger stream parse error:', parseError, 'Line:', line)
          }
        }

        if (triggerReceived) {
          break
        }
      }

      if (triggerReceived) {
        toast({
          title: "Event Received!",
          description: "Successfully captured webhook event data",
        })
      } else {
        setStatus('timeout')
        toast({
          title: "No Event Received",
          description: `Timed out after ${MAX_WAIT_TIME} seconds. The webhook has been deactivated.`,
          variant: "destructive"
        })
        await fetch('/api/workflows/test-trigger', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            workflowId,
            testSessionId: result.testSessionId,
          }),
        })
        setTestSessionId(null)
      }

    } catch (err: any) {
      if (err.name === 'AbortError') {
        setStatus('idle')
        toast({
          title: "Listening Stopped",
          description: "Webhook listener was stopped",
        })
      } else {
        setStatus('error')
        setError(err.message)
        toast({
          title: "Error",
          description: err.message,
          variant: "destructive"
        })
      }
    } finally {
      if (timerRef.current) {
        clearInterval(timerRef.current)
        timerRef.current = null
      }
    }
  }, [workflowId, nodeId, onEventReceived, toast])

  const stopListening = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
    }
    if (timerRef.current) {
      clearInterval(timerRef.current)
      timerRef.current = null
    }
    setStatus('idle')
    if (testSessionId) {
      fetch('/api/workflows/test-trigger', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workflowId,
          testSessionId,
        }),
      }).catch((error) => {
        console.error('[TEST] Failed to cleanup test trigger:', error)
      })
      setTestSessionId(null)
    }
  }, [testSessionId, workflowId])

  const copyToClipboard = useCallback((text: string) => {
    navigator.clipboard.writeText(text)
    toast({
      title: "Copied!",
      description: "Webhook URL copied to clipboard",
    })
  }, [toast])

  const getStatusBadge = () => {
    switch (status) {
      case 'idle':
        return <Badge variant="secondary">Ready</Badge>
      case 'activating':
        return <Badge variant="secondary" className="bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200">Activating...</Badge>
      case 'listening':
        return <Badge variant="secondary" className="bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200 animate-pulse">Listening...</Badge>
      case 'received':
        return <Badge variant="secondary" className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200">Event Received</Badge>
      case 'timeout':
        return <Badge variant="secondary" className="bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200">Timed Out</Badge>
      case 'error':
        return <Badge variant="destructive">Error</Badge>
    }
  }

  const getProviderInstructions = () => {
    switch (providerId) {
      case 'gmail':
        return "Send an email to your connected Gmail account to trigger the webhook."
      case 'slack':
        return "Send a message in Slack or trigger the configured event."
      case 'discord':
        return "Trigger the configured Discord event (message, reaction, etc.)."
      case 'stripe':
        return "Create a test event in Stripe Dashboard → Developers → Webhooks → Send test webhook."
      case 'shopify':
        return "Create an order or trigger the configured event in your Shopify store."
      case 'github':
        return "Push a commit, create an issue, or trigger the configured GitHub event."
      case 'webhook':
        return "Send an HTTP POST request to the webhook URL shown below."
      default:
        return `Trigger the configured ${triggerType.replace(/_/g, ' ')} event in your ${providerId} account.`
    }
  }

  return (
    <Card className="border-dashed">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Radio className="w-4 h-4 text-amber-500" />
            <CardTitle className="text-base">Live Webhook Listener</CardTitle>
          </div>
          {getStatusBadge()}
        </div>
        <CardDescription>
          Test your trigger by listening for real events
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Instructions */}
        <div className="text-sm text-muted-foreground bg-muted/50 rounded-md p-3">
          <p>{getProviderInstructions()}</p>
        </div>

        {/* Webhook URL (when available) */}
        {webhookUrl && (
          <div className="space-y-2">
            <label className="text-sm font-medium">Webhook URL</label>
            <div className="flex items-center gap-2">
              <code className="flex-1 text-xs bg-muted p-2 rounded-md overflow-x-auto whitespace-nowrap">
                {webhookUrl}
              </code>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => copyToClipboard(webhookUrl)}
                className="shrink-0"
              >
                <Copy className="w-4 h-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => window.open(webhookUrl, '_blank')}
                className="shrink-0"
              >
                <ExternalLink className="w-4 h-4" />
              </Button>
            </div>
          </div>
        )}

        {/* Timer (when listening) */}
        {(status === 'listening' || status === 'activating') && (
          <div className="flex items-center justify-center gap-2 py-4">
            <Loader2 className="w-5 h-5 animate-spin text-amber-500" />
            <span className="text-sm text-muted-foreground">
              Waiting for event... ({MAX_WAIT_TIME - elapsedTime}s remaining)
            </span>
          </div>
        )}

        {/* Error Message */}
        {status === 'error' && error && (
          <div className="flex items-start gap-2 p-3 bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 rounded-md">
            <XCircle className="w-4 h-4 text-red-500 mt-0.5 shrink-0" />
            <p className="text-sm text-red-700 dark:text-red-300">{error}</p>
          </div>
        )}

        {/* Received Event Data */}
        {status === 'received' && eventData && (
          <Collapsible open={isDataExpanded} onOpenChange={setIsDataExpanded}>
            <CollapsibleTrigger asChild>
              <Button variant="ghost" className="w-full justify-between p-2 h-auto">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-green-500" />
                  <span className="text-sm font-medium">Event Data Captured</span>
                </div>
                <ChevronDown className={cn(
                  "w-4 h-4 transition-transform",
                  isDataExpanded && "rotate-180"
                )} />
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <ScrollArea className="h-48 mt-2">
                <pre className="text-xs bg-muted p-3 rounded-md overflow-x-auto">
                  {JSON.stringify(eventData, null, 2)}
                </pre>
              </ScrollArea>
            </CollapsibleContent>
          </Collapsible>
        )}

        {/* Action Buttons */}
        <div className="flex gap-2">
          {status === 'idle' || status === 'timeout' || status === 'error' || status === 'received' ? (
            <Button
              onClick={startListening}
              className="flex-1"
              variant={status === 'received' ? 'outline' : 'default'}
            >
              <Radio className="w-4 h-4 mr-2" />
              {status === 'received' ? 'Listen Again' : 'Start Listening'}
            </Button>
          ) : (
            <Button
              onClick={stopListening}
              variant="destructive"
              className="flex-1"
            >
              <Square className="w-4 h-4 mr-2" />
              Stop Listening
            </Button>
          )}
        </div>

        {/* Elapsed time info */}
        {status === 'received' && (
          <div className="flex items-center justify-center gap-1 text-xs text-muted-foreground">
            <Clock className="w-3 h-3" />
            <span>Received after {elapsedTime} seconds</span>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
