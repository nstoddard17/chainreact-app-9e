"use client"

import React, { useState, useEffect } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { 
  Play, Loader2, CheckCircle, XCircle, AlertCircle, 
  ArrowRight, Eye, EyeOff, Copy, RefreshCw, Terminal
} from "lucide-react"
import { cn } from "@/lib/utils"
import { useToast } from "@/hooks/use-toast"
import { formatDistanceToNow } from "date-fns"

interface TestPanelProps {
  nodeId: string
  nodeType: string
  nodeTitle: string
  isVisible: boolean
  onClose: () => void
  onTest: () => void
  testStatus: 'idle' | 'listening' | 'running' | 'completed' | 'error'
  inputData?: any
  outputData?: any
  error?: string
  executionTime?: number
  logs?: Array<{
    timestamp: string
    level: 'info' | 'warn' | 'error' | 'debug'
    message: string
  }>
}

export function TestPanel({
  nodeId,
  nodeType,
  nodeTitle,
  isVisible,
  onClose,
  onTest,
  testStatus,
  inputData,
  outputData,
  error,
  executionTime,
  logs = []
}: TestPanelProps) {
  const [activeTab, setActiveTab] = useState("input")
  const [showRawData, setShowRawData] = useState(false)
  const [copiedField, setCopiedField] = useState<string | null>(null)
  const { toast } = useToast()

  useEffect(() => {
    // Auto-switch to output tab when test completes
    if (testStatus === 'completed' && outputData) {
      setActiveTab("output")
    }
  }, [testStatus, outputData])

  const copyToClipboard = async (data: any, fieldName: string) => {
    try {
      await navigator.clipboard.writeText(
        typeof data === 'string' ? data : JSON.stringify(data, null, 2)
      )
      setCopiedField(fieldName)
      setTimeout(() => setCopiedField(null), 2000)
      toast({
        title: "Copied!",
        description: "Data copied to clipboard",
      })
    } catch (err) {
      toast({
        title: "Failed to copy",
        description: "Could not copy to clipboard",
        variant: "destructive"
      })
    }
  }

  const getStatusColor = () => {
    switch (testStatus) {
      case 'listening':
        return 'text-indigo-600 bg-indigo-50'
      case 'running':
        return 'text-yellow-600 bg-yellow-50'
      case 'completed':
        return 'text-green-600 bg-green-50'
      case 'error':
        return 'text-red-600 bg-red-50'
      default:
        return 'text-gray-600 bg-gray-50'
    }
  }

  const getStatusIcon = () => {
    switch (testStatus) {
      case 'listening':
        return <div className="w-2 h-2 bg-indigo-600 rounded-full animate-pulse" />
      case 'running':
        return <Loader2 className="w-4 h-4 animate-spin" />
      case 'completed':
        return <CheckCircle className="w-4 h-4" />
      case 'error':
        return <XCircle className="w-4 h-4" />
      default:
        return <Play className="w-4 h-4" />
    }
  }

  const renderDataField = (key: string, value: any, depth = 0) => {
    if (value === null || value === undefined) {
      return <span className="text-gray-400 italic">null</span>
    }

    if (typeof value === 'object' && !Array.isArray(value)) {
      return (
        <div className="ml-4">
          {Object.entries(value).map(([k, v]) => (
            <div key={k} className="py-1">
              <span className="text-gray-600 text-sm">{k}:</span>
              <div className="ml-2">{renderDataField(k, v, depth + 1)}</div>
            </div>
          ))}
        </div>
      )
    }

    if (Array.isArray(value)) {
      return (
        <div className="ml-4">
          {value.map((item, index) => (
            <div key={index} className="py-1">
              <span className="text-gray-600 text-sm">[{index}]:</span>
              <div className="ml-2">{renderDataField(`${key}[${index}]`, item, depth + 1)}</div>
            </div>
          ))}
        </div>
      )
    }

    return (
      <span className="text-gray-900 font-mono text-sm">
        {typeof value === 'string' ? `"${value}"` : String(value)}
      </span>
    )
  }

  if (!isVisible) return null

  return (
    <Card className="fixed right-4 top-20 w-[600px] max-h-[80vh] shadow-2xl z-50 border-0">
      <CardHeader className="pb-3 border-b">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-lg flex items-center gap-2">
              Test: {nodeTitle}
              <Badge variant="outline" className="text-xs">
                {nodeType}
              </Badge>
            </CardTitle>
            <div className="flex items-center gap-2 mt-2">
              <Badge className={cn("text-xs", getStatusColor())}>
                <span className="flex items-center gap-1">
                  {getStatusIcon()}
                  {testStatus === 'listening' && 'Waiting for trigger...'}
                  {testStatus === 'running' && 'Running...'}
                  {testStatus === 'completed' && 'Completed'}
                  {testStatus === 'error' && 'Error'}
                  {testStatus === 'idle' && 'Ready'}
                </span>
              </Badge>
              {executionTime && (
                <Badge variant="outline" className="text-xs">
                  {executionTime}ms
                </Badge>
              )}
            </div>
          </div>
          <Button
            size="sm"
            variant="ghost"
            onClick={onClose}
            className="h-8 w-8 p-0"
          >
            ✕
          </Button>
        </div>
      </CardHeader>

      <CardContent className="p-0">
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="w-full rounded-none border-b">
            <TabsTrigger value="input" className="flex-1">
              Input
              {inputData && (
                <Badge variant="secondary" className="ml-2 text-xs">
                  {Object.keys(inputData).length} fields
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="output" className="flex-1">
              Output
              {outputData && (
                <Badge variant="secondary" className="ml-2 text-xs">
                  {Object.keys(outputData).length} fields
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="logs" className="flex-1">
              Logs
              {logs.length > 0 && (
                <Badge variant="secondary" className="ml-2 text-xs">
                  {logs.length}
                </Badge>
              )}
            </TabsTrigger>
          </TabsList>

          <ScrollArea className="h-[400px]">
            {/* Input Tab */}
            <TabsContent value="input" className="p-4 m-0">
              {testStatus === 'listening' ? (
                <Alert>
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>
                    Waiting for trigger to fire. {nodeType.includes('webhook') 
                      ? 'Send a request to your webhook URL.' 
                      : nodeType.includes('discord') 
                      ? 'Send a message in your Discord channel.'
                      : nodeType.includes('email')
                      ? 'Send an email to trigger the workflow.'
                      : 'Activate the trigger to continue.'}
                  </AlertDescription>
                </Alert>
              ) : inputData ? (
                <div className="space-y-3">
                  <div className="flex items-center justify-between mb-2">
                    <h4 className="text-sm font-medium">Input Data</h4>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setShowRawData(!showRawData)}
                      >
                        {showRawData ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                        {showRawData ? 'Formatted' : 'Raw'}
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => copyToClipboard(inputData, 'input')}
                      >
                        {copiedField === 'input' ? (
                          <CheckCircle className="w-4 h-4 text-green-600" />
                        ) : (
                          <Copy className="w-4 h-4" />
                        )}
                      </Button>
                    </div>
                  </div>

                  {showRawData ? (
                    <pre className="bg-gray-50 p-3 rounded-md overflow-x-auto text-xs">
                      {JSON.stringify(inputData, null, 2)}
                    </pre>
                  ) : (
                    <div className="space-y-2">
                      {Object.entries(inputData).map(([key, value]) => (
                        <div key={key} className="border rounded-md p-3">
                          <div className="flex items-start justify-between">
                            <div className="flex-1">
                              <div className="font-medium text-sm text-gray-700">{key}</div>
                              <div className="mt-1">
                                {renderDataField(key, value)}
                              </div>
                            </div>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-6 w-6 p-0"
                              onClick={() => copyToClipboard(value, key)}
                            >
                              {copiedField === key ? (
                                <CheckCircle className="w-3 h-3 text-green-600" />
                              ) : (
                                <Copy className="w-3 h-3" />
                              )}
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                <div className="text-center py-8 text-gray-500">
                  <Terminal className="w-12 h-12 mx-auto mb-3 text-gray-300" />
                  <p className="text-sm">No input data yet</p>
                  <p className="text-xs mt-1">Run the test to see input data</p>
                </div>
              )}
            </TabsContent>

            {/* Output Tab */}
            <TabsContent value="output" className="p-4 m-0">
              {error ? (
                <Alert variant="destructive">
                  <XCircle className="h-4 w-4" />
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              ) : outputData ? (
                <div className="space-y-3">
                  <div className="flex items-center justify-between mb-2">
                    <h4 className="text-sm font-medium">Output Data</h4>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setShowRawData(!showRawData)}
                      >
                        {showRawData ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                        {showRawData ? 'Formatted' : 'Raw'}
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => copyToClipboard(outputData, 'output')}
                      >
                        {copiedField === 'output' ? (
                          <CheckCircle className="w-4 h-4 text-green-600" />
                        ) : (
                          <Copy className="w-4 h-4" />
                        )}
                      </Button>
                    </div>
                  </div>

                  {showRawData ? (
                    <pre className="bg-gray-50 p-3 rounded-md overflow-x-auto text-xs">
                      {JSON.stringify(outputData, null, 2)}
                    </pre>
                  ) : (
                    <div className="space-y-2">
                      {Object.entries(outputData).map(([key, value]) => (
                        <div key={key} className="border rounded-md p-3">
                          <div className="flex items-start justify-between">
                            <div className="flex-1">
                              <div className="font-medium text-sm text-gray-700">{key}</div>
                              <div className="mt-1">
                                {renderDataField(key, value)}
                              </div>
                            </div>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-6 w-6 p-0"
                              onClick={() => copyToClipboard(value, key)}
                            >
                              {copiedField === key ? (
                                <CheckCircle className="w-3 h-3 text-green-600" />
                              ) : (
                                <Copy className="w-3 h-3" />
                              )}
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                <div className="text-center py-8 text-gray-500">
                  <Terminal className="w-12 h-12 mx-auto mb-3 text-gray-300" />
                  <p className="text-sm">No output data yet</p>
                  <p className="text-xs mt-1">
                    {testStatus === 'running' ? 'Test is running...' : 'Run the test to see output data'}
                  </p>
                </div>
              )}
            </TabsContent>

            {/* Logs Tab */}
            <TabsContent value="logs" className="p-4 m-0">
              {logs.length > 0 ? (
                <div className="space-y-2">
                  {logs.map((log, index) => (
                    <div
                      key={index}
                      className={cn(
                        "text-xs font-mono p-2 rounded-md",
                        log.level === 'error' && "bg-red-50 text-red-900",
                        log.level === 'warn' && "bg-yellow-50 text-yellow-900",
                        log.level === 'info' && "bg-blue-50 text-blue-900",
                        log.level === 'debug' && "bg-gray-50 text-gray-700"
                      )}
                    >
                      <div className="flex items-start gap-2">
                        <span className="text-gray-500">
                          {new Date(log.timestamp).toLocaleTimeString()}
                        </span>
                        <Badge
                          variant="outline"
                          className={cn(
                            "text-xs px-1 py-0",
                            log.level === 'error' && "border-red-300",
                            log.level === 'warn' && "border-yellow-300"
                          )}
                        >
                          {log.level.toUpperCase()}
                        </Badge>
                        <span className="flex-1">{log.message}</span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8 text-gray-500">
                  <Terminal className="w-12 h-12 mx-auto mb-3 text-gray-300" />
                  <p className="text-sm">No logs yet</p>
                </div>
              )}
            </TabsContent>
          </ScrollArea>
        </Tabs>

        {/* Test Controls */}
        <div className="p-4 border-t bg-gray-50">
          <div className="flex items-center justify-between">
            <div className="text-xs text-gray-600">
              Node ID: <code className="font-mono bg-white px-1 py-0.5 rounded">{nodeId}</code>
            </div>
            <Button
              onClick={onTest}
              disabled={testStatus === 'running' || testStatus === 'listening'}
              size="sm"
            >
              {testStatus === 'running' || testStatus === 'listening' ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  {testStatus === 'listening' ? 'Waiting...' : 'Testing...'}
                </>
              ) : (
                <>
                  <Play className="w-4 h-4 mr-2" />
                  Test Node
                </>
              )}
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}