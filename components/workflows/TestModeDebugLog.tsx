'use client'

import { useState, useEffect, useRef } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Copy, Download, Bug, X } from 'lucide-react'
import { useToast } from '@/hooks/use-toast'

export interface DebugLogEntry {
  timestamp: string
  level: 'info' | 'warning' | 'error' | 'success'
  message: string
  details?: any
}

interface TestModeDebugLogProps {
  isActive: boolean
  onClear: () => void
}

export function TestModeDebugLog({ isActive, onClear }: TestModeDebugLogProps) {
  const [logs, setLogs] = useState<DebugLogEntry[]>([])
  const [isOpen, setIsOpen] = useState(false)
  const { toast } = useToast()
  const logsEndRef = useRef<HTMLDivElement>(null)

  // Expose global function for adding logs and intercept console methods
  useEffect(() => {
    const addDebugLog = (entry: Omit<DebugLogEntry, 'timestamp'>) => {
      const logEntry: DebugLogEntry = {
        ...entry,
        timestamp: new Date().toISOString(),
      }

      // Always defer state updates to avoid render-phase updates
      // This prevents the "Cannot update component while rendering" error
      queueMicrotask(() => {
        setLogs(prev => [...prev, logEntry])
      })
    }

    // Make it globally accessible
    ;(window as any).addTestModeDebugLog = addDebugLog

    // Only intercept console methods when test mode is active
    if (isActive) {
      // Store original console methods
      const originalConsole = {
        error: console.error,
        warn: console.warn,
        log: console.log,
        info: console.info,
      }

      // Safe write wrapper to handle EPIPE errors
      const safeWrite = (fn: Function, args: any[]) => {
        try {
          fn.apply(console, args)
        } catch (error: any) {
          if (error?.code !== 'EPIPE') {
            // Silently ignore other errors too - can't do much if console is broken
          }
        }
      }

      // Intercept console.error - capture ALL errors without filtering
      console.error = (...args) => {
        safeWrite(originalConsole.error, args)

        // Capture ALL errors (no filtering)
        addDebugLog({
          level: 'error',
          message: typeof args[0] === 'string' ? args[0] : 'Console Error',
          details: args.length > 1 ? args.slice(1) : args[0],
        })
      }

      // Intercept console.warn - capture ALL warnings without filtering
      console.warn = (...args) => {
        safeWrite(originalConsole.warn, args)

        // Capture ALL warnings (no filtering)
        addDebugLog({
          level: 'warning',
          message: typeof args[0] === 'string' ? args[0] : 'Console Warning',
          details: args.length > 1 ? args.slice(1) : args[0],
        })
      }

      // Track recent logs to detect repetition
      const recentLogs = new Map<string, { count: number; lastSeen: number; firstMessage: string }>()
      const LOG_DEDUP_WINDOW = 2000 // 2 second window for deduplication

      // Intercept console.log - capture logs but deduplicate repetitive ones
      console.log = (...args) => {
        safeWrite(originalConsole.log, args)

        const message = typeof args[0] === 'string' ? args[0] : 'Console Log'

        // Create a normalized key for deduplication (remove workflow IDs for trigger logs)
        let logKey = message

        // For trigger deactivation logs, normalize to detect repetition
        if (message.includes('Deactivating') || message.includes('Deactivated') || message.includes('No active')) {
          // Remove workflow ID to group similar trigger logs
          logKey = message.replace(/44[a-f0-9-]+/gi, 'WORKFLOW_ID')
        } else {
          logKey = message + JSON.stringify(args.length > 1 ? args.slice(1) : args[0])
        }

        const now = Date.now()
        const existing = recentLogs.get(logKey)

        if (existing && now - existing.lastSeen < LOG_DEDUP_WINDOW) {
          // Update count and last seen time
          existing.count++
          existing.lastSeen = now

          // If this is the second occurrence, update the first message to show repetition
          if (existing.count === 2) {
            // Find and update the original log entry to show it's repeating
            setLogs(prevLogs => {
              const lastIndex = prevLogs.findIndex(log =>
                log.message === existing.firstMessage &&
                log.level === 'info'
              )
              if (lastIndex !== -1) {
                const updatedLogs = [...prevLogs]
                updatedLogs[lastIndex] = {
                  ...updatedLogs[lastIndex],
                  message: `${existing.firstMessage} (repeating...)`
                }
                return updatedLogs
              }
              return prevLogs
            })
          }

          // Skip adding duplicate log
          return
        }

        // Clean up old entries
        if (recentLogs.size > 50) {
          for (const [key, data] of recentLogs.entries()) {
            if (now - data.lastSeen > LOG_DEDUP_WINDOW * 2) {
              recentLogs.delete(key)
            }
          }
        }

        // Track this log
        recentLogs.set(logKey, { count: 1, lastSeen: now, firstMessage: message })

        // Capture the log
        addDebugLog({
          level: 'info',
          message,
          details: args.length > 1 ? args.slice(1) : args[0],
        })
      }

      // Intercept unhandled promise rejections
      const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
        addDebugLog({
          level: 'error',
          message: 'Unhandled Promise Rejection',
          details: {
            reason: event.reason,
            promise: event.promise,
          },
        })
      }

      // Intercept global errors
      const handleGlobalError = (event: ErrorEvent) => {
        addDebugLog({
          level: 'error',
          message: event.message || 'Global Error',
          details: {
            filename: event.filename,
            lineno: event.lineno,
            colno: event.colno,
            error: event.error,
          },
        })
      }

      window.addEventListener('unhandledrejection', handleUnhandledRejection)
      window.addEventListener('error', handleGlobalError)

      // Restore original console methods when component unmounts or test mode ends
      return () => {
        console.error = originalConsole.error
        console.warn = originalConsole.warn
        console.log = originalConsole.log
        window.removeEventListener('unhandledrejection', handleUnhandledRejection)
        window.removeEventListener('error', handleGlobalError)
        delete (window as any).addTestModeDebugLog
      }
    }

    return () => {
      delete (window as any).addTestModeDebugLog
    }
  }, [isActive])

  // Auto-scroll to bottom when new logs are added
  useEffect(() => {
    if (isOpen && logsEndRef.current) {
      logsEndRef.current.scrollIntoView({ behavior: 'smooth' })
    }
  }, [logs, isOpen])

  const copyToClipboard = () => {
    const logText = logs
      .map(log => `[${log.timestamp}] [${log.level.toUpperCase()}] ${log.message}${
        log.details ? `\nDetails: ${ JSON.stringify(log.details, null, 2)}` : ''
      }`)
      .join('\n\n')

    navigator.clipboard.writeText(logText)
    toast({
      title: "Copied to clipboard",
      description: "Debug logs have been copied to your clipboard",
    })
  }

  const downloadLogs = () => {
    const logData = {
      sessionStarted: logs[0]?.timestamp || new Date().toISOString(),
      sessionEnded: new Date().toISOString(),
      totalLogs: logs.length,
      logs: logs,
    }

    const blob = new Blob([JSON.stringify(logData, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `test-mode-debug-${Date.now()}.json`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  const clearLogs = () => {
    setLogs([])
    onClear()
  }

  const getLevelColor = (level: DebugLogEntry['level']) => {
    switch (level) {
      case 'error': return 'text-red-500'
      case 'warning': return 'text-yellow-500'
      case 'success': return 'text-green-500'
      default: return 'text-blue-500'
    }
  }

  const getLevelBgColor = (level: DebugLogEntry['level']) => {
    switch (level) {
      case 'error': return 'bg-red-50 dark:bg-red-950/20'
      case 'warning': return 'bg-yellow-50 dark:bg-yellow-950/20'
      case 'success': return 'bg-green-50 dark:bg-green-950/20'
      default: return 'bg-blue-50 dark:bg-blue-950/20'
    }
  }

  return (
    <>
      {/* Debug button - shows when there are logs or test is active */}
      {(isActive || logs.length > 0) && (
        <Button
          variant="outline"
          size="sm"
          onClick={() => setIsOpen(true)}
          className="fixed bottom-6 left-6 z-50 md:bottom-8 md:left-8"
        >
          <Bug className="h-4 w-4 mr-2" />
          Debug Logs ({logs.length})
          {isActive && (
            <span className="ml-2 h-2 w-2 bg-green-500 rounded-full animate-pulse" />
          )}
        </Button>
      )}

      {/* Debug Log Dialog */}
      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent className="max-w-4xl h-[80vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center justify-between">
              Test Mode Debug Logs
              {isActive && (
                <span className="text-sm font-normal text-green-500 flex items-center">
                  <span className="h-2 w-2 bg-green-500 rounded-full animate-pulse mr-2" />
                  Recording...
                </span>
              )}
            </DialogTitle>
            <DialogDescription>
              All events and data from your test mode execution
            </DialogDescription>
          </DialogHeader>

          <div className="flex gap-2 mb-4">
            <Button
              variant="outline"
              size="sm"
              onClick={copyToClipboard}
              disabled={logs.length === 0}
            >
              <Copy className="h-4 w-4 mr-2" />
              Copy
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={downloadLogs}
              disabled={logs.length === 0}
            >
              <Download className="h-4 w-4 mr-2" />
              Download
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={clearLogs}
              disabled={logs.length === 0}
            >
              <X className="h-4 w-4 mr-2" />
              Clear
            </Button>
          </div>

          <ScrollArea className="flex-1 w-full rounded-md border p-4">
            {logs.length === 0 ? (
              <div className="text-center text-muted-foreground py-8">
                No debug logs yet. Start a test to see logs here.
              </div>
            ) : (
              <div className="space-y-2">
                {logs.map((log, index) => (
                  <div
                    key={index}
                    className={`p-3 rounded-lg font-mono text-xs ${getLevelBgColor(log.level)}`}
                  >
                    <div className="flex items-start gap-2">
                      <span className="text-muted-foreground">
                        [{new Date(log.timestamp).toLocaleTimeString()}]
                      </span>
                      <span className={`font-semibold ${getLevelColor(log.level)}`}>
                        [{log.level.toUpperCase()}]
                      </span>
                      <span className="flex-1 text-foreground">{log.message}</span>
                    </div>
                    {log.details && (
                      <pre className="mt-2 p-2 bg-background/50 rounded text-xs overflow-x-auto">
                        {JSON.stringify(log.details, null, 2)}
                      </pre>
                    )}
                  </div>
                ))}
                <div ref={logsEndRef} />
              </div>
            )}
          </ScrollArea>
        </DialogContent>
      </Dialog>
    </>
  )
}
