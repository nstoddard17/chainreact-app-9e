'use client'

import React, { useEffect, useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { AIFieldResolutionDisplay } from './AIFieldResolutionDisplay'
import { Clock, AlertCircle, CheckCircle, XCircle, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'

interface ExecutionDetailsModalProps {
  executionId: string | null
  workflowId: string
  open: boolean
  onClose: () => void
}

interface ExecutionDetails {
  id: string
  workflow_id: string
  status: 'pending' | 'running' | 'success' | 'error' | 'cancelled'
  started_at: string
  completed_at?: string
  execution_time_ms?: number
  input_data?: any
  output_data?: any
  error_message?: string
  metadata?: any
}

export function ExecutionDetailsModal({
  executionId,
  workflowId,
  open,
  onClose
}: ExecutionDetailsModalProps) {
  const [execution, setExecution] = useState<ExecutionDetails | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (open && executionId) {
      fetchExecutionDetails()
    }
  }, [open, executionId])

  const fetchExecutionDetails = async () => {
    if (!executionId) return

    setLoading(true)
    try {
      const response = await fetch(`/api/workflows/${workflowId}/executions/${executionId}`)
      const data = await response.json()
      setExecution(data)
    } catch (error) {
      console.error('Failed to fetch execution details:', error)
    } finally {
      setLoading(false)
    }
  }

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'success':
        return <CheckCircle className="h-5 w-5 text-green-600" />
      case 'error':
        return <XCircle className="h-5 w-5 text-red-600" />
      case 'running':
        return <Loader2 className="h-5 w-5 text-blue-600 animate-spin" />
      case 'pending':
        return <Clock className="h-5 w-5 text-yellow-600" />
      default:
        return <AlertCircle className="h-5 w-5 text-gray-600" />
    }
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'success':
        return 'bg-green-100 text-green-700'
      case 'error':
        return 'bg-red-100 text-red-700'
      case 'running':
        return 'bg-blue-100 text-blue-700'
      case 'pending':
        return 'bg-yellow-100 text-yellow-700'
      default:
        return 'bg-gray-100 text-gray-700'
    }
  }

  const formatDuration = (ms?: number) => {
    if (!ms) return 'N/A'
    if (ms < 1000) return `${ms}ms`
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`
    return `${Math.floor(ms / 60000)}m ${Math.floor((ms % 60000) / 1000)}s`
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[80vh] overflow-hidden">
        <DialogHeader>
          <DialogTitle className="flex items-center space-x-2">
            <span>Execution Details</span>
            {execution && (
              <Badge className={cn('ml-2', getStatusColor(execution.status))}>
                {execution.status}
              </Badge>
            )}
          </DialogTitle>
          <DialogDescription>
            View detailed information about this workflow execution
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : execution ? (
          <Tabs defaultValue="overview" className="w-full">
            <TabsList className="grid w-full grid-cols-4">
              <TabsTrigger value="overview">Overview</TabsTrigger>
              <TabsTrigger value="ai-fields">AI Fields</TabsTrigger>
              <TabsTrigger value="input">Input Data</TabsTrigger>
              <TabsTrigger value="output">Output Data</TabsTrigger>
            </TabsList>

            <TabsContent value="overview" className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Execution Summary</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">Status</span>
                    <div className="flex items-center space-x-2">
                      {getStatusIcon(execution.status)}
                      <span className="text-sm">{execution.status}</span>
                    </div>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">Started At</span>
                    <span className="text-sm text-muted-foreground">
                      {new Date(execution.started_at).toLocaleString()}
                    </span>
                  </div>
                  {execution.completed_at && (
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium">Completed At</span>
                      <span className="text-sm text-muted-foreground">
                        {new Date(execution.completed_at).toLocaleString()}
                      </span>
                    </div>
                  )}
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">Duration</span>
                    <span className="text-sm text-muted-foreground">
                      {formatDuration(execution.execution_time_ms)}
                    </span>
                  </div>
                  {execution.error_message && (
                    <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg">
                      <p className="text-sm text-red-700 font-medium">Error Message:</p>
                      <p className="text-sm text-red-600 mt-1">{execution.error_message}</p>
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="ai-fields" className="space-y-4">
              <AIFieldResolutionDisplay 
                executionId={executionId} 
                className="border-0 shadow-none"
              />
            </TabsContent>

            <TabsContent value="input" className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Input Data</CardTitle>
                  <CardDescription>
                    The data that triggered this workflow execution
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <ScrollArea className="h-[400px]">
                    <pre className="text-xs font-mono bg-gray-50 p-4 rounded-lg overflow-x-auto">
                      {JSON.stringify(execution.input_data || {}, null, 2)}
                    </pre>
                  </ScrollArea>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="output" className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Output Data</CardTitle>
                  <CardDescription>
                    The results from each action in the workflow
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <ScrollArea className="h-[400px]">
                    <pre className="text-xs font-mono bg-gray-50 p-4 rounded-lg overflow-x-auto">
                      {JSON.stringify(execution.output_data || {}, null, 2)}
                    </pre>
                  </ScrollArea>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        ) : (
          <div className="text-center py-8 text-muted-foreground">
            No execution data available
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}