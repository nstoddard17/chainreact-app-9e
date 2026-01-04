'use client'

import { useState, useRef, useCallback, useEffect } from 'react'

/**
 * Debug log entry for trigger testing
 */
export interface DebugLogEntry {
  timestamp: string
  level: 'info' | 'warn' | 'error' | 'debug'
  category: 'API' | 'SSE' | 'Config' | 'Lifecycle' | 'Webhook'
  message: string
  details?: Record<string, any>
}

/**
 * Status of the trigger test
 */
export type TriggerTestStatus = 'idle' | 'starting' | 'listening' | 'received' | 'timeout' | 'error' | 'stopped'

/**
 * Options for the useTriggerTest hook
 */
export interface UseTriggerTestOptions {
  onTriggerReceived?: (data: any) => void
  onTimeout?: () => void
  onError?: (message: string, details?: any) => void
  onStatusChange?: (status: TriggerTestStatus) => void
  onLog?: (entry: DebugLogEntry) => void
  timeoutMs?: number
}

/**
 * Parameters for starting a trigger test
 */
export interface StartTestParams {
  nodeId: string
  nodes: any[]
  connections?: any[]
  workflowId?: string  // Optional - will be generated if not provided
}

/**
 * Return type for the useTriggerTest hook
 */
export interface UseTriggerTestReturn {
  startTest: (params: StartTestParams) => Promise<void>
  stopTest: () => Promise<void>
  testSessionId: string | null
  workflowId: string | null
  status: TriggerTestStatus
  webhookUrl: string | null
  isLoading: boolean
  error: string | null
  triggerData: any | null
  expiresAt: string | null
  debugLogs: DebugLogEntry[]
  addLog: (level: DebugLogEntry['level'], category: DebugLogEntry['category'], message: string, details?: Record<string, any>) => void
  clearLogs: () => void
  formatLogsForCopy: () => string
}

/**
 * Hook for managing trigger test lifecycle and SSE streaming
 *
 * This hook handles:
 * - Starting trigger tests via POST to /api/workflows/test-trigger
 * - Connecting to SSE stream for real-time events
 * - Managing countdown timer
 * - Stopping tests via DELETE to /api/workflows/test-trigger
 * - Comprehensive debug logging for troubleshooting
 */
export function useTriggerTest(options: UseTriggerTestOptions = {}): UseTriggerTestReturn {
  const {
    onTriggerReceived,
    onTimeout,
    onError,
    onStatusChange,
    onLog,
    timeoutMs = 60000
  } = options

  // State
  const [testSessionId, setTestSessionId] = useState<string | null>(null)
  const [workflowId, setWorkflowId] = useState<string | null>(null)
  const [status, setStatus] = useState<TriggerTestStatus>('idle')
  const [webhookUrl, setWebhookUrl] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [triggerData, setTriggerData] = useState<any | null>(null)
  const [expiresAt, setExpiresAt] = useState<string | null>(null)
  const [debugLogs, setDebugLogs] = useState<DebugLogEntry[]>([])

  // Refs for cleanup
  const abortControllerRef = useRef<AbortController | null>(null)
  const isMountedRef = useRef(true)

  // Track mount state
  useEffect(() => {
    isMountedRef.current = true
    return () => {
      isMountedRef.current = false
    }
  }, [])

  // Update status with callback
  const updateStatus = useCallback((newStatus: TriggerTestStatus) => {
    if (!isMountedRef.current) return
    setStatus(newStatus)
    onStatusChange?.(newStatus)
  }, [onStatusChange])

  // Add debug log entry
  const addLog = useCallback((
    level: DebugLogEntry['level'],
    category: DebugLogEntry['category'],
    message: string,
    details?: Record<string, any>
  ) => {
    const entry: DebugLogEntry = {
      timestamp: new Date().toISOString(),
      level,
      category,
      message,
      details
    }

    if (isMountedRef.current) {
      setDebugLogs(prev => [...prev, entry])
    }

    onLog?.(entry)

    // Also log to console for debugging
    const consoleMethod = level === 'error' ? 'error' : level === 'warn' ? 'warn' : 'log'
    console[consoleMethod](`[TriggerTest] [${category}] ${message}`, details || '')
  }, [onLog])

  // Clear logs
  const clearLogs = useCallback(() => {
    setDebugLogs([])
  }, [])

  // Format logs for copy-to-clipboard
  const formatLogsForCopy = useCallback(() => {
    const header = [
      '=== CHAINREACT TRIGGER TEST DEBUG LOG ===',
      `Test Session ID: ${testSessionId || 'N/A'}`,
      `Workflow ID: ${workflowId || 'N/A'}`,
      `Status: ${status}`,
      `Webhook URL: ${webhookUrl || 'N/A'}`,
      `Generated: ${new Date().toISOString()}`,
      '',
      '--- Event Log ---'
    ].join('\n')

    const logEntries = debugLogs.map(entry => {
      const time = entry.timestamp.split('T')[1]?.split('.')[0] || entry.timestamp
      const detailLines = entry.details
        ? Object.entries(entry.details)
            .map(([key, value]) => `  └─ ${key}: ${typeof value === 'object' ? JSON.stringify(value) : value}`)
            .join('\n')
        : ''

      return `${time} [${entry.level.toUpperCase()}] [${entry.category}] ${entry.message}${detailLines ? '\n' + detailLines : ''}`
    }).join('\n\n')

    return `${header}\n${logEntries}\n\n--- End of Log ---`
  }, [testSessionId, workflowId, status, webhookUrl, debugLogs])

  // Stop test and cleanup
  const stopTest = useCallback(async () => {
    addLog('info', 'API', 'Stopping trigger test', { testSessionId, workflowId })

    // Abort any ongoing SSE connection
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
      abortControllerRef.current = null
    }

    // Call DELETE API to cleanup webhooks
    if (testSessionId && workflowId) {
      try {
        const response = await fetch('/api/workflows/test-trigger', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ workflowId, testSessionId })
        })

        if (response.ok) {
          addLog('info', 'API', 'Test stopped successfully')
        } else {
          const errorData = await response.json().catch(() => ({}))
          addLog('warn', 'API', 'Failed to stop test cleanly', {
            status: response.status,
            error: errorData.error
          })
        }
      } catch (err: any) {
        addLog('error', 'API', 'Error stopping test', {
          error: err.message,
          stack: err.stack
        })
      }
    }

    if (isMountedRef.current) {
      updateStatus('stopped')
      setIsLoading(false)
    }
  }, [testSessionId, workflowId, addLog, updateStatus])

  // Start test
  const startTest = useCallback(async (params: StartTestParams) => {
    const { nodeId, nodes, connections = [], workflowId: providedWorkflowId } = params

    // Reset state
    setError(null)
    setTriggerData(null)
    setWebhookUrl(null)
    setExpiresAt(null)
    setTestSessionId(null)
    setWorkflowId(null)
    setIsLoading(true)
    updateStatus('starting')
    clearLogs()

    addLog('info', 'API', 'Starting trigger test', {
      nodeId,
      nodeCount: nodes.length,
      providedWorkflowId: providedWorkflowId || 'will be generated'
    })

    // Create new abort controller
    abortControllerRef.current = new AbortController()

    try {
      // Step 1: Call POST to start test
      addLog('debug', 'API', 'Calling POST /api/workflows/test-trigger')

      const response = await fetch('/api/workflows/test-trigger', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workflowId: providedWorkflowId,
          nodeId,
          nodes,
          connections
        }),
        signal: abortControllerRef.current.signal
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || `API error: ${response.status}`)
      }

      if (!data.success || !data.testSessionId) {
        throw new Error('Invalid API response: missing testSessionId')
      }

      addLog('info', 'API', 'Test session created', {
        testSessionId: data.testSessionId,
        workflowId: data.workflowId,
        expiresAt: data.expiresAt,
        webhookUrl: data.webhookUrl || 'N/A',
        sessionStored: data.sessionStored
      })

      // Update state with session info
      setTestSessionId(data.testSessionId)
      setWorkflowId(data.workflowId)
      setWebhookUrl(data.webhookUrl || null)
      setExpiresAt(data.expiresAt)
      updateStatus('listening')
      setIsLoading(false)

      // Step 2: Connect to SSE stream
      const streamUrl = `/api/workflows/test-trigger/stream?sessionId=${encodeURIComponent(data.testSessionId)}&workflowId=${encodeURIComponent(data.workflowId)}&timeoutMs=${timeoutMs}`

      addLog('info', 'SSE', 'Connecting to stream', { url: streamUrl })

      const streamResponse = await fetch(streamUrl, {
        signal: abortControllerRef.current.signal
      })

      if (!streamResponse.ok) {
        throw new Error(`Failed to open trigger stream: ${streamResponse.status}`)
      }

      addLog('info', 'SSE', 'Connection established')

      const reader = streamResponse.body?.getReader()
      const decoder = new TextDecoder()

      if (!reader) {
        throw new Error('No stream reader available')
      }

      let buffer = ''

      // Read SSE events
      while (true) {
        if (abortControllerRef.current?.signal.aborted) {
          addLog('info', 'SSE', 'Connection aborted by user')
          reader.cancel()
          break
        }

        const { done, value } = await reader.read()
        if (done) {
          addLog('info', 'SSE', 'Connection closed by server')
          break
        }

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue

          try {
            const event = JSON.parse(line.slice(6))

            addLog('debug', 'SSE', `Event received: ${event.type}`, {
              sessionId: event.sessionId,
              timestamp: event.timestamp,
              ...(event.data ? { dataKeys: Object.keys(event.data) } : {})
            })

            switch (event.type) {
              case 'ready':
                addLog('info', 'SSE', 'Stream ready, listening for trigger events', {
                  status: event.status,
                  expiresAt: event.expiresAt
                })
                break

              case 'ping':
                // Just acknowledge pings at debug level
                addLog('debug', 'SSE', 'Ping received')
                break

              case 'trigger_received':
                addLog('info', 'SSE', 'Trigger event received!', {
                  dataPreview: JSON.stringify(event.data).slice(0, 200)
                })

                if (isMountedRef.current) {
                  setTriggerData(event.data)
                  updateStatus('received')
                }
                onTriggerReceived?.(event.data)

                // Clean up after receiving
                reader.cancel()
                return

              case 'timeout':
                addLog('warn', 'SSE', 'Timeout - no trigger event received within time limit')

                if (isMountedRef.current) {
                  updateStatus('timeout')
                  setError('No trigger event received within timeout period')
                }
                onTimeout?.()

                reader.cancel()
                return

              case 'error':
                const errorMsg = event.message || 'Unknown SSE error'
                addLog('error', 'SSE', `Stream error: ${errorMsg}`, {
                  errorDetails: event
                })
                throw new Error(errorMsg)

              case 'ended':
                addLog('info', 'SSE', 'Stream ended', { status: event.status })
                reader.cancel()
                return

              default:
                addLog('debug', 'SSE', `Unknown event type: ${event.type}`, event)
            }
          } catch (parseError: any) {
            // Only log parse errors if it's not just an empty line
            if (line.trim() !== 'data: ') {
              addLog('warn', 'SSE', 'Failed to parse SSE event', {
                line: line.slice(0, 100),
                error: parseError.message
              })
            }
          }
        }
      }

    } catch (err: any) {
      // Handle abort separately
      if (err.name === 'AbortError') {
        addLog('info', 'API', 'Test aborted by user')
        if (isMountedRef.current) {
          updateStatus('stopped')
        }
        return
      }

      addLog('error', 'API', 'Test failed', {
        error: err.message,
        stack: err.stack
      })

      if (isMountedRef.current) {
        setError(err.message)
        updateStatus('error')
        setIsLoading(false)
      }
      onError?.(err.message, { stack: err.stack })
    }
  }, [timeoutMs, onTriggerReceived, onTimeout, onError, addLog, clearLogs, updateStatus])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort()
      }
    }
  }, [])

  return {
    startTest,
    stopTest,
    testSessionId,
    workflowId,
    status,
    webhookUrl,
    isLoading,
    error,
    triggerData,
    expiresAt,
    debugLogs,
    addLog,
    clearLogs,
    formatLogsForCopy
  }
}
