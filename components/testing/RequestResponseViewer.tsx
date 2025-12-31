'use client'

import React from 'react'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { CheckCircle2, XCircle, Clock } from 'lucide-react'

interface RequestDetails {
  method: string
  endpoint: string
  config: any
  integrationId?: string
}

interface ResponseDetails {
  statusCode: number
  data?: any
  error?: string
  executionTime: number
  timestamp: string
}

interface RequestResponseViewerProps {
  requestDetails: RequestDetails | null
  responseDetails: ResponseDetails | null
  success: boolean
}

export function RequestResponseViewer({
  requestDetails,
  responseDetails,
  success
}: RequestResponseViewerProps) {
  if (!requestDetails && !responseDetails) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground">
        <p>Execute a test to see request and response details</p>
      </div>
    )
  }

  const getStatusColor = (statusCode: number) => {
    if (statusCode >= 200 && statusCode < 300) return 'text-green-600 dark:text-green-400'
    if (statusCode >= 400 && statusCode < 500) return 'text-orange-600 dark:text-orange-400'
    return 'text-red-600 dark:text-red-400'
  }

  return (
    <div className="grid grid-cols-2 gap-4 h-full">
      {/* Request Panel */}
      <Card className="p-4 flex flex-col overflow-hidden">
        <div className="mb-3">
          <h3 className="text-lg font-semibold mb-2">Request</h3>
          {requestDetails && (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="bg-orange-100 text-orange-800 dark:bg-orange-500/20 dark:text-orange-300">
                  {requestDetails.method}
                </Badge>
                <code className="text-xs text-muted-foreground">{requestDetails.endpoint}</code>
              </div>
            </div>
          )}
        </div>

        <div className="flex-1 overflow-auto">
          {requestDetails && (
            <div className="space-y-4">
              {requestDetails.integrationId && (
                <div>
                  <h4 className="text-sm font-medium mb-1 text-muted-foreground">Integration ID</h4>
                  <code className="text-xs bg-muted p-2 rounded block overflow-x-auto">
                    {requestDetails.integrationId}
                  </code>
                </div>
              )}

              <div>
                <h4 className="text-sm font-medium mb-1 text-muted-foreground">Configuration</h4>
                <pre className="text-xs bg-muted p-3 rounded overflow-x-auto">
                  {JSON.stringify(requestDetails.config, null, 2)}
                </pre>
              </div>
            </div>
          )}
        </div>
      </Card>

      {/* Response Panel */}
      <Card className="p-4 flex flex-col overflow-hidden">
        <div className="mb-3">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-lg font-semibold">Response</h3>
            {responseDetails && (
              <div className="flex items-center gap-2">
                {success ? (
                  <CheckCircle2 className="w-5 h-5 text-green-600 dark:text-green-400" />
                ) : (
                  <XCircle className="w-5 h-5 text-red-600 dark:text-red-400" />
                )}
              </div>
            )}
          </div>
          {responseDetails && (
            <div className="flex items-center gap-3 text-sm">
              <Badge
                variant="outline"
                className={getStatusColor(responseDetails.statusCode)}
              >
                {responseDetails.statusCode}
              </Badge>
              <div className="flex items-center gap-1 text-muted-foreground">
                <Clock className="w-3 h-3" />
                <span className="text-xs">{responseDetails.executionTime}ms</span>
              </div>
              <span className="text-xs text-muted-foreground">
                {new Date(responseDetails.timestamp).toLocaleTimeString()}
              </span>
            </div>
          )}
        </div>

        <div className="flex-1 overflow-auto">
          {responseDetails && (
            <div className="space-y-4">
              {responseDetails.error ? (
                <div>
                  <h4 className="text-sm font-medium mb-1 text-red-600 dark:text-red-400">Error</h4>
                  <pre className="text-xs bg-red-50 dark:bg-red-950/20 text-red-800 dark:text-red-300 p-3 rounded overflow-x-auto border border-red-200 dark:border-red-800">
                    {responseDetails.error}
                  </pre>
                </div>
              ) : null}

              {responseDetails.data && (
                <div>
                  <h4 className="text-sm font-medium mb-1 text-muted-foreground">Response Data</h4>
                  <pre className="text-xs bg-muted p-3 rounded overflow-x-auto max-h-[500px]">
                    {JSON.stringify(responseDetails.data, null, 2)}
                  </pre>
                </div>
              )}

              {!responseDetails.data && !responseDetails.error && (
                <div className="text-sm text-muted-foreground">
                  No response data
                </div>
              )}
            </div>
          )}
        </div>
      </Card>
    </div>
  )
}
