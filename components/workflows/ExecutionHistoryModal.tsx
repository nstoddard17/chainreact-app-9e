"use client"

import React, { useState, useEffect } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import { 
  Clock, 
  CheckCircle2, 
  XCircle, 
  AlertCircle,
  Terminal,
  Eye,
  Download,
  Trash2,
  Copy,
  Filter,
  RefreshCw
} from 'lucide-react'
import { getExecutionLogs, clearExecutionLogs, ExecutionLogEntry, formatExecutionLogEntry } from '@/lib/workflows/execution/executionLogger'
import { useToast } from '@/hooks/use-toast'
import { cn } from '@/lib/utils'

interface ExecutionHistoryModalProps {
  open: boolean
  onClose: () => void
  workflowId: string
  workflowName?: string
}

export function ExecutionHistoryModal({ 
  open, 
  onClose, 
  workflowId,
  workflowName = "Workflow"
}: ExecutionHistoryModalProps) {
  const [logs, setLogs] = useState<ExecutionLogEntry[]>([])
  const [selectedLog, setSelectedLog] = useState<ExecutionLogEntry | null>(null)
  const [filter, setFilter] = useState<'all' | 'completed' | 'error'>('all')
  const [view, setView] = useState<'formatted' | 'raw'>('formatted')
  const { toast } = useToast()
  
  // Load logs when modal opens
  useEffect(() => {
    if (open) {
      loadLogs()
    }
  }, [open, workflowId])
  
  const loadLogs = () => {
    const storedLogs = getExecutionLogs(workflowId)
    setLogs(storedLogs.reverse()) // Show newest first
  }
  
  const handleClearLogs = () => {
    clearExecutionLogs(workflowId)
    setLogs([])
    setSelectedLog(null)
    toast({
      title: "Logs cleared",
      description: "Execution history has been cleared"
    })
  }
  
  const handleCopyLog = (log: ExecutionLogEntry) => {
    const formatted = formatExecutionLogEntry(log)
    navigator.clipboard.writeText(formatted)
    toast({
      title: "Copied to clipboard",
      description: "Execution log has been copied"
    })
  }
  
  const handleDownloadLogs = () => {
    const content = logs.map(log => formatExecutionLogEntry(log)).join('\n\n')
    const blob = new Blob([content], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${workflowName.replace(/\s+/g, '-')}-execution-history-${new Date().toISOString()}.txt`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
    
    toast({
      title: "Logs downloaded",
      description: "Execution history has been downloaded"
    })
  }
  
  const filteredLogs = logs.filter(log => {
    if (filter === 'all') return true
    if (filter === 'completed') return log.status === 'completed'
    if (filter === 'error') return log.status === 'error'
    return true
  })
  
  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed':
        return <CheckCircle2 className="h-4 w-4 text-green-500" />
      case 'error':
        return <XCircle className="h-4 w-4 text-red-500" />
      default:
        return <Clock className="h-4 w-4 text-yellow-500" />
    }
  }
  
  const formatTime = (timestamp: string) => {
    return new Date(timestamp).toLocaleString()
  }
  
  const renderLogContent = (log: ExecutionLogEntry) => {
    if (view === 'raw') {
      return (
        <pre className="text-xs font-mono bg-slate-900 text-slate-100 p-4 rounded-lg overflow-x-auto">
          {JSON.stringify(log, null, 2)}
        </pre>
      )
    }
    
    return (
      <div className="space-y-4">
        {/* Header Info */}
        <div className="flex items-start justify-between">
          <div className="space-y-2">
            <h3 className="text-lg font-medium">{log.nodeTitle}</h3>
            <div className="flex items-center gap-4 text-sm text-muted-foreground">
              <span className="flex items-center gap-1">
                <Clock className="h-3 w-3" />
                {formatTime(log.timestamp)}
              </span>
              {log.executionTime && (
                <span className="flex items-center gap-1">
                  ⚡ {log.executionTime}ms
                </span>
              )}
              <Badge variant={log.status === 'completed' ? 'default' : 'destructive'}>
                {log.status}
              </Badge>
            </div>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => handleCopyLog(log)}
          >
            <Copy className="h-4 w-4" />
          </Button>
        </div>
        
        {/* Trigger Data */}
        {log.trigger?.formattedData && (
          <Card>
            <CardContent className="pt-4">
              <h4 className="text-sm font-medium mb-2">Trigger Data</h4>
              <pre className="text-xs whitespace-pre-wrap font-mono bg-muted p-3 rounded">
                {log.trigger.formattedData.join('\n')}
              </pre>
            </CardContent>
          </Card>
        )}
        
        {/* Input Data */}
        {log.input?.formatted && log.input.formatted.length > 0 && (
          <Card>
            <CardContent className="pt-4">
              <h4 className="text-sm font-medium mb-2">Input Configuration</h4>
              <pre className="text-xs whitespace-pre-wrap font-mono bg-muted p-3 rounded">
                {log.input.formatted.join('\n')}
              </pre>
            </CardContent>
          </Card>
        )}
        
        {/* Output Data */}
        {log.output?.formatted && log.output.formatted.length > 0 && (
          <Card>
            <CardContent className="pt-4">
              <h4 className="text-sm font-medium mb-2">Output Results</h4>
              <pre className="text-xs whitespace-pre-wrap font-mono bg-muted p-3 rounded">
                {log.output.formatted.join('\n')}
              </pre>
            </CardContent>
          </Card>
        )}
        
        {/* Error Data */}
        {log.error && (
          <Card className="border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-950">
            <CardContent className="pt-4">
              <h4 className="text-sm font-medium mb-2 text-red-700 dark:text-red-300">Error Details</h4>
              <div className="space-y-2">
                <p className="text-sm text-red-600 dark:text-red-400">{log.error.message}</p>
                {log.error.details && (
                  <pre className="text-xs whitespace-pre-wrap font-mono bg-red-100 dark:bg-red-900 p-3 rounded text-red-700 dark:text-red-300">
                    {log.error.details}
                  </pre>
                )}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    )
  }
  
  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-6xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Terminal className="h-5 w-5" />
            Execution History - {workflowName}
          </DialogTitle>
          <DialogDescription>
            View detailed logs of workflow executions with inputs, outputs, and timing information
          </DialogDescription>
        </DialogHeader>
        
        <div className="flex items-center justify-between gap-4 py-2">
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setFilter('all')}
              className={cn(filter === 'all' && "bg-muted")}
            >
              All ({logs.length})
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setFilter('completed')}
              className={cn(filter === 'completed' && "bg-muted")}
            >
              <CheckCircle2 className="h-3 w-3 mr-1" />
              Completed
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setFilter('error')}
              className={cn(filter === 'error' && "bg-muted")}
            >
              <XCircle className="h-3 w-3 mr-1" />
              Errors
            </Button>
          </div>
          
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={loadLogs}
            >
              <RefreshCw className="h-4 w-4 mr-1" />
              Refresh
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleDownloadLogs}
              disabled={logs.length === 0}
            >
              <Download className="h-4 w-4 mr-1" />
              Download
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleClearLogs}
              disabled={logs.length === 0}
            >
              <Trash2 className="h-4 w-4 mr-1" />
              Clear
            </Button>
          </div>
        </div>
        
        <div className="flex-1 flex gap-4 min-h-0">
          {/* Log List */}
          <div className="w-1/3 border rounded-lg">
            <ScrollArea className="h-full">
              <div className="p-2">
                {filteredLogs.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <Terminal className="h-12 w-12 mx-auto mb-3 opacity-50" />
                    <p>No execution logs yet</p>
                    <p className="text-sm mt-1">Logs will appear here when the workflow runs</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {filteredLogs.map((log, index) => (
                      <Card
                        key={`${log.nodeId}-${log.timestamp}-${index}`}
                        className={cn(
                          "cursor-pointer hover:bg-muted/50 transition-colors",
                          selectedLog === log && "border-primary bg-muted"
                        )}
                        onClick={() => setSelectedLog(log)}
                      >
                        <CardContent className="p-3">
                          <div className="flex items-start justify-between">
                            <div className="flex-1 space-y-1">
                              <div className="flex items-center gap-2">
                                {getStatusIcon(log.status)}
                                <span className="text-sm font-medium truncate">
                                  {log.nodeTitle}
                                </span>
                              </div>
                              <div className="text-xs text-muted-foreground">
                                {new Date(log.timestamp).toLocaleTimeString()}
                                {log.executionTime && (
                                  <span className="ml-2">{log.executionTime}ms</span>
                                )}
                              </div>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                )}
              </div>
            </ScrollArea>
          </div>
          
          {/* Log Details */}
          <div className="flex-1 border rounded-lg">
            {selectedLog ? (
              <div className="h-full flex flex-col">
                <div className="border-b p-3">
                  <Tabs value={view} onValueChange={(v) => setView(v as any)}>
                    <TabsList>
                      <TabsTrigger value="formatted">
                        <Eye className="h-3 w-3 mr-1" />
                        Formatted
                      </TabsTrigger>
                      <TabsTrigger value="raw">
                        <Terminal className="h-3 w-3 mr-1" />
                        Raw JSON
                      </TabsTrigger>
                    </TabsList>
                  </Tabs>
                </div>
                <ScrollArea className="flex-1">
                  <div className="p-4">
                    {renderLogContent(selectedLog)}
                  </div>
                </ScrollArea>
              </div>
            ) : (
              <div className="h-full flex items-center justify-center text-muted-foreground">
                <div className="text-center">
                  <Eye className="h-12 w-12 mx-auto mb-3 opacity-50" />
                  <p>Select a log entry to view details</p>
                </div>
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}