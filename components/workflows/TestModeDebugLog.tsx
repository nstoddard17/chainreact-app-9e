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

  // Expose global function for adding logs
  useEffect(() => {
    const addDebugLog = (entry: Omit<DebugLogEntry, 'timestamp'>) => {
      const logEntry: DebugLogEntry = {
        ...entry,
        timestamp: new Date().toISOString(),
      }
      setLogs(prev => [...prev, logEntry])
      console.log(`[TestMode Debug] ${entry.level.toUpperCase()}: ${entry.message}`, entry.details)
    }

    // Make it globally accessible
    ;(window as any).addTestModeDebugLog = addDebugLog

    return () => {
      delete (window as any).addTestModeDebugLog
    }
  }, [])

  // Auto-scroll to bottom when new logs are added
  useEffect(() => {
    if (isOpen && logsEndRef.current) {
      logsEndRef.current.scrollIntoView({ behavior: 'smooth' })
    }
  }, [logs, isOpen])

  const copyToClipboard = () => {
    const logText = logs
      .map(log => `[${log.timestamp}] [${log.level.toUpperCase()}] ${log.message}${
        log.details ? '\nDetails: ' + JSON.stringify(log.details, null, 2) : ''
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
          className="fixed bottom-4 right-4 z-50"
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