"use client"

import React, { useState, useEffect } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
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
  RefreshCw,
  ChevronRight,
  ChevronDown,
  PlayCircle,
  TestTube,
  Activity,
  Zap,
  FileText,
  Code2,
  Mail,
  MessageSquare,
  Bot,
  Calendar,
  Database,
  Globe,
  Bell,
  Settings,
  Image as ImageIcon
} from 'lucide-react'
import { useToast } from '@/hooks/use-toast'
import { cn } from '@/lib/utils'
import { format } from 'date-fns'
import { integrationIcons } from '@/lib/integrations/integration-icons'
import Image from 'next/image'

import { logger } from '@/lib/utils/logger'

interface ExecutionHistoryEntry {
  id: string
  workflow_id: string
  user_id: string
  execution_id: string
  status: 'running' | 'completed' | 'failed' | 'cancelled'
  test_mode: boolean
  started_at: string
  completed_at?: string
  error_message?: string
  trigger_data?: any
  final_output?: any
}

interface ExecutionStep {
  id: string
  execution_history_id: string
  node_id: string
  node_type: string
  node_name?: string
  step_number: number
  status: 'pending' | 'running' | 'completed' | 'failed' | 'skipped'
  started_at?: string
  completed_at?: string
  duration_ms?: number
  input_data?: any
  output_data?: any
  error_message?: string
  error_details?: any
  test_mode_preview?: any
}

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
  const [history, setHistory] = useState<ExecutionHistoryEntry[]>([])
  const [selectedExecution, setSelectedExecution] = useState<ExecutionHistoryEntry | null>(null)
  const [executionSteps, setExecutionSteps] = useState<ExecutionStep[]>([])
  const [expandedSteps, setExpandedSteps] = useState<Set<string>>(new Set())
  const [filter, setFilter] = useState<'all' | 'completed' | 'failed' | 'test'>('all')
  const [view, setView] = useState<'list' | 'details'>('list')
  const [loading, setLoading] = useState(false)
  const [stepsLoading, setStepsLoading] = useState(false)
  const { toast } = useToast()

  // Load history when modal opens
  useEffect(() => {
    if (open) {
      loadHistory()
    }
  }, [open, workflowId])

  const loadHistory = async () => {
    setLoading(true)
    try {
      const response = await fetch(`/api/workflows/${workflowId}/history`)
      if (!response.ok) throw new Error('Failed to load history')

      const data = await response.json()
      setHistory(data.history || [])
    } catch (error) {
      logger.error('Error loading history:', error)
      toast({
        title: "Error",
        description: "Failed to load execution history",
        variant: "destructive"
      })
    } finally {
      setLoading(false)
    }
  }

  const loadExecutionSteps = async (executionId: string) => {
    setStepsLoading(true)
    try {
      const response = await fetch(`/api/workflows/history/${executionId}/steps`)
      if (!response.ok) throw new Error('Failed to load execution steps')

      const data = await response.json()
      setExecutionSteps(data.steps || [])
    } catch (error) {
      logger.error('Error loading execution steps:', error)
      toast({
        title: "Error",
        description: "Failed to load execution steps",
        variant: "destructive"
      })
    } finally {
      setStepsLoading(false)
    }
  }

  const handleSelectExecution = async (execution: ExecutionHistoryEntry) => {
    setSelectedExecution(execution)
    setView('details')
    await loadExecutionSteps(execution.id)
  }

  const handleClearHistory = async () => {
    try {
      const response = await fetch(`/api/workflows/${workflowId}/history`, {
        method: 'DELETE'
      })

      if (!response.ok) throw new Error('Failed to clear history')

      setHistory([])
      setSelectedExecution(null)
      setExecutionSteps([])
      toast({
        title: "History cleared",
        description: "Execution history has been cleared"
      })
    } catch (error) {
      logger.error('Error clearing history:', error)
      toast({
        title: "Error",
        description: "Failed to clear execution history",
        variant: "destructive"
      })
    }
  }

  const handleCopyExecution = (execution: ExecutionHistoryEntry) => {
    const content = JSON.stringify(execution, null, 2)
    navigator.clipboard.writeText(content)
    toast({
      title: "Copied to clipboard",
      description: "Execution data has been copied"
    })
  }

  const handleDownloadHistory = () => {
    const content = JSON.stringify(history, null, 2)
    const blob = new Blob([content], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${workflowName.replace(/\s+/g, '-')}-execution-history-${new Date().toISOString()}.json`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)

    toast({
      title: "History downloaded",
      description: "Execution history has been downloaded"
    })
  }

  const toggleStepExpanded = (stepId: string) => {
    const newExpanded = new Set(expandedSteps)
    if (newExpanded.has(stepId)) {
      newExpanded.delete(stepId)
    } else {
      newExpanded.add(stepId)
    }
    setExpandedSteps(newExpanded)
  }

  const filteredHistory = history.filter(execution => {
    if (filter === 'all') return true
    if (filter === 'completed') return execution.status === 'completed'
    if (filter === 'failed') return execution.status === 'failed'
    if (filter === 'test') return execution.test_mode
    return true
  })

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed':
        return <CheckCircle2 className="h-4 w-4 text-green-500" />
      case 'failed':
        return <XCircle className="h-4 w-4 text-red-500" />
      case 'running':
        return <RefreshCw className="h-4 w-4 text-blue-500 animate-spin" />
      case 'cancelled':
        return <AlertCircle className="h-4 w-4 text-yellow-500" />
      case 'skipped':
        return <AlertCircle className="h-4 w-4 text-gray-400" />
      default:
        return <Clock className="h-4 w-4 text-gray-400" />
    }
  }

  const getStatusBadge = (status: string, testMode?: boolean) => {
    return (
      <div className="flex items-center gap-2">
        <Badge
          variant={
            status === 'completed' ? 'default' :
            status === 'failed' ? 'destructive' :
            status === 'running' ? 'secondary' :
            'outline'
          }
        >
          {status}
        </Badge>
        {testMode && (
          <Badge variant="outline" className="text-blue-600 border-blue-600">
            <TestTube className="h-3 w-3 mr-1" />
            Test
          </Badge>
        )}
      </div>
    )
  }

  const formatDuration = (ms?: number) => {
    if (!ms) return '-'
    if (ms < 1000) return `${ms}ms`
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`
    return `${Math.floor(ms / 60000)}m ${Math.floor((ms % 60000) / 1000)}s`
  }

  // Get integration icon based on node type
  const getIntegrationIcon = (nodeType: string) => {
    // Extract provider from node type (e.g., 'gmail_action_send' -> 'gmail')
    const provider = nodeType.split('_')[0]

    // Check if we have an SVG icon for this provider
    if (integrationIcons[provider]) {
      return (
        <div className="relative w-5 h-5">
          <Image
            src={integrationIcons[provider]}
            alt={provider}
            width={20}
            height={20}
            className="object-contain"
          />
        </div>
      )
    }

    // Fallback to Lucide icons based on type
    if (nodeType.includes('gmail')) return <Mail className="h-5 w-5 text-red-500" />
    if (nodeType.includes('discord')) return <MessageSquare className="h-5 w-5 text-indigo-500" />
    if (nodeType.includes('slack')) return <MessageSquare className="h-5 w-5 text-purple-500" />
    if (nodeType.includes('ai') || nodeType.includes('agent')) return <Bot className="h-5 w-5 text-green-500" />
    if (nodeType.includes('calendar')) return <Calendar className="h-5 w-5 text-blue-500" />
    if (nodeType.includes('notion')) return <FileText className="h-5 w-5 text-gray-700" />
    if (nodeType.includes('database')) return <Database className="h-5 w-5 text-orange-500" />
    if (nodeType.includes('webhook')) return <Globe className="h-5 w-5 text-cyan-500" />
    if (nodeType.includes('trigger')) return <Bell className="h-5 w-5 text-yellow-500" />
    if (nodeType.includes('action')) return <Zap className="h-5 w-5 text-green-500" />
    if (nodeType.includes('logic')) return <Settings className="h-5 w-5 text-gray-500" />
    return <Settings className="h-5 w-5 text-gray-400" />
  }

  // Format node name for display
  const formatNodeName = (nodeName?: string, nodeType?: string) => {
    if (nodeName) return nodeName

    // Convert node_type to readable format
    if (!nodeType) return 'Unknown Step'

    // Split by underscore and capitalize
    const parts = nodeType.split('_')
    const provider = parts[0]
    const action = parts.slice(1).join(' ')

    // Capitalize first letter of each word
    const capitalize = (str: string) => str.charAt(0).toUpperCase() + str.slice(1)

    return `${capitalize(provider)} - ${action.split(' ').map(capitalize).join(' ')}`
  }

  return (
    <Dialog open={open} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-7xl h-[80vh] max-h-[80vh] p-0 my-auto">
        <DialogHeader className="px-6 py-4 border-b">
          <div className="flex items-center justify-between">
            <div>
              <DialogTitle className="text-xl font-semibold">
                Execution History
              </DialogTitle>
              <DialogDescription>
                {workflowName} • {history.length} executions
              </DialogDescription>
            </div>
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => loadHistory()}
                disabled={loading}
              >
                <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={handleDownloadHistory}
                disabled={history.length === 0}
              >
                <Download className="h-4 w-4" />
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={handleClearHistory}
                disabled={history.length === 0}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </DialogHeader>

        <div className="flex-1 overflow-hidden" style={{ height: 'calc(100% - 80px)' }}>
          <Tabs value={view} onValueChange={(v) => setView(v as 'list' | 'details')} className="h-full flex flex-col">
            <div className="px-6 py-2 border-b">
              <div className="flex items-center justify-between">
                <TabsList>
                  <TabsTrigger value="list">
                    <Activity className="h-4 w-4 mr-2" />
                    Executions
                  </TabsTrigger>
                  <TabsTrigger value="details" disabled={!selectedExecution}>
                    <Zap className="h-4 w-4 mr-2" />
                    Details
                  </TabsTrigger>
                </TabsList>

                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    variant={filter === 'all' ? 'default' : 'outline'}
                    onClick={() => setFilter('all')}
                  >
                    All
                  </Button>
                  <Button
                    size="sm"
                    variant={filter === 'completed' ? 'default' : 'outline'}
                    onClick={() => setFilter('completed')}
                  >
                    Completed
                  </Button>
                  <Button
                    size="sm"
                    variant={filter === 'failed' ? 'default' : 'outline'}
                    onClick={() => setFilter('failed')}
                  >
                    Failed
                  </Button>
                  <Button
                    size="sm"
                    variant={filter === 'test' ? 'default' : 'outline'}
                    onClick={() => setFilter('test')}
                  >
                    Test
                  </Button>
                </div>
              </div>
            </div>

            <TabsContent value="list" className="flex-1 m-0 overflow-hidden">
              <ScrollArea className="h-full px-6 py-4">
                {loading ? (
                  <div className="flex items-center justify-center py-8">
                    <RefreshCw className="h-6 w-6 animate-spin text-gray-400" />
                  </div>
                ) : filteredHistory.length === 0 ? (
                  <div className="text-center py-8 text-gray-500">
                    No execution history found
                  </div>
                ) : (
                  <div className="space-y-3">
                    {filteredHistory.map((execution) => (
                      <Card
                        key={execution.id}
                        className="cursor-pointer hover:shadow-md transition-shadow"
                        onClick={() => handleSelectExecution(execution)}
                      >
                        <CardContent className="p-4">
                          <div className="flex items-start justify-between">
                            <div className="flex-1">
                              <div className="flex items-center gap-3 mb-2">
                                {getStatusIcon(execution.status)}
                                <span className="font-mono text-sm text-gray-600">
                                  {execution.execution_id}
                                </span>
                                {getStatusBadge(execution.status, execution.test_mode)}
                              </div>

                              <div className="grid grid-cols-2 gap-4 text-sm">
                                <div>
                                  <span className="text-gray-500">Started:</span>{' '}
                                  {format(new Date(execution.started_at), 'MMM d, yyyy HH:mm:ss')}
                                </div>
                                {execution.completed_at && (
                                  <div>
                                    <span className="text-gray-500">Duration:</span>{' '}
                                    {formatDuration(
                                      new Date(execution.completed_at).getTime() -
                                      new Date(execution.started_at).getTime()
                                    )}
                                  </div>
                                )}
                              </div>

                              {execution.error_message && (
                                <div className="mt-2 p-2 bg-red-50 rounded text-sm text-red-600">
                                  {execution.error_message}
                                </div>
                              )}
                            </div>

                            <div className="flex items-center gap-2 ml-4">
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={(e) => {
                                  e.stopPropagation()
                                  handleCopyExecution(execution)
                                }}
                              >
                                <Copy className="h-4 w-4" />
                              </Button>
                              <ChevronRight className="h-4 w-4 text-gray-400" />
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                )}
              </ScrollArea>
            </TabsContent>

            <TabsContent value="details" className="flex-1 m-0 overflow-hidden">
              <ScrollArea className="h-full px-6 py-4">
                {selectedExecution && (
                  <div className="space-y-4">
                    <Card>
                      <CardHeader>
                        <CardTitle className="text-lg">Execution Summary</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="grid grid-cols-2 gap-4 text-sm">
                          <div>
                            <span className="text-gray-500">Execution ID:</span>{' '}
                            <span className="font-mono">{selectedExecution.execution_id}</span>
                          </div>
                          <div>
                            <span className="text-gray-500">Status:</span>{' '}
                            {getStatusBadge(selectedExecution.status, selectedExecution.test_mode)}
                          </div>
                          <div>
                            <span className="text-gray-500">Started:</span>{' '}
                            {format(new Date(selectedExecution.started_at), 'MMM d, yyyy HH:mm:ss')}
                          </div>
                          {selectedExecution.completed_at && (
                            <div>
                              <span className="text-gray-500">Completed:</span>{' '}
                              {format(new Date(selectedExecution.completed_at), 'MMM d, yyyy HH:mm:ss')}
                            </div>
                          )}
                        </div>
                      </CardContent>
                    </Card>

                    <Card>
                      <CardHeader>
                        <CardTitle className="text-lg">Execution Steps</CardTitle>
                      </CardHeader>
                      <CardContent>
                        {stepsLoading ? (
                          <div className="flex items-center justify-center py-8">
                            <RefreshCw className="h-6 w-6 animate-spin text-gray-400" />
                          </div>
                        ) : executionSteps.length === 0 ? (
                          <div className="text-center py-8 text-gray-500">
                            No execution steps recorded
                          </div>
                        ) : (
                          <div className="space-y-2">
                            {executionSteps.map((step) => (
                              <div
                                key={step.id}
                                className="border rounded-lg overflow-hidden"
                              >
                                <div
                                  className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800 cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                                  onClick={() => toggleStepExpanded(step.id)}
                                >
                                  <div className="flex items-center gap-3">
                                    <span className="text-sm font-mono text-gray-600 dark:text-gray-400">
                                      #{step.step_number}
                                    </span>
                                    {getIntegrationIcon(step.node_type)}
                                    {getStatusIcon(step.status)}
                                    <div>
                                      <div className="font-medium text-gray-900 dark:text-gray-100">
                                        {formatNodeName(step.node_name, step.node_type)}
                                      </div>
                                      <div className="text-xs text-gray-600 dark:text-gray-400">
                                        {formatDuration(step.duration_ms)}
                                      </div>
                                    </div>
                                  </div>

                                  <div className="flex items-center gap-2">
                                    {step.test_mode_preview && (
                                      <Badge variant="outline" className="text-blue-600 border-blue-600">
                                        <TestTube className="h-3 w-3 mr-1" />
                                        Preview
                                      </Badge>
                                    )}
                                    {expandedSteps.has(step.id) ? (
                                      <ChevronDown className="h-4 w-4 text-gray-600 dark:text-gray-400" />
                                    ) : (
                                      <ChevronRight className="h-4 w-4 text-gray-600 dark:text-gray-400" />
                                    )}
                                  </div>
                                </div>

                                {expandedSteps.has(step.id) && (
                                  <div className="p-4 border-t bg-white dark:bg-gray-900">
                                    <Tabs defaultValue="output" className="w-full">
                                      <TabsList className="grid w-full grid-cols-4">
                                        <TabsTrigger value="input">Input</TabsTrigger>
                                        <TabsTrigger value="output">Output</TabsTrigger>
                                        {step.test_mode_preview && (
                                          <TabsTrigger value="preview">Preview</TabsTrigger>
                                        )}
                                        {step.error_message && (
                                          <TabsTrigger value="error">Error</TabsTrigger>
                                        )}
                                      </TabsList>

                                      <TabsContent value="input" className="mt-4">
                                        <pre className="text-xs bg-gray-50 dark:bg-gray-800 text-gray-800 dark:text-gray-200 p-4 rounded-lg overflow-auto max-h-80 border border-gray-200 dark:border-gray-700">
                                          {JSON.stringify(step.input_data, null, 2)}
                                        </pre>
                                      </TabsContent>

                                      <TabsContent value="output" className="mt-4">
                                        <pre className="text-xs bg-gray-50 dark:bg-gray-800 text-gray-800 dark:text-gray-200 p-4 rounded-lg overflow-auto max-h-80 border border-gray-200 dark:border-gray-700">
                                          {JSON.stringify(step.output_data, null, 2)}
                                        </pre>
                                      </TabsContent>

                                      {step.test_mode_preview && (
                                        <TabsContent value="preview" className="mt-4">
                                          <div className="text-sm text-blue-600 dark:text-blue-400 mb-2">
                                            What would have been sent:
                                          </div>
                                          <pre className="text-xs bg-blue-50 dark:bg-blue-900/20 text-blue-900 dark:text-blue-100 p-4 rounded-lg overflow-auto max-h-80 border border-blue-200 dark:border-blue-800">
                                            {JSON.stringify(step.test_mode_preview, null, 2)}
                                          </pre>
                                        </TabsContent>
                                      )}

                                      {step.error_message && (
                                        <TabsContent value="error" className="mt-4">
                                          <div className="text-sm text-red-600 dark:text-red-400 mb-2">
                                            {step.error_message}
                                          </div>
                                          {step.error_details && (
                                            <pre className="text-xs bg-red-50 dark:bg-red-900/20 text-red-900 dark:text-red-100 p-4 rounded-lg overflow-auto max-h-80 border border-red-200 dark:border-red-800">
                                              {JSON.stringify(step.error_details, null, 2)}
                                            </pre>
                                          )}
                                        </TabsContent>
                                      )}
                                    </Tabs>
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  </div>
                )}
              </ScrollArea>
            </TabsContent>
          </Tabs>
        </div>
      </DialogContent>
    </Dialog>
  )
}