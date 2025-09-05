"use client"

import React from 'react'
import { X, Shield, Send, Mail, MessageSquare, FileText, Server, Database, Code, AlertCircle } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { cn } from '@/lib/utils'

interface InterceptedAction {
  nodeId: string
  nodeName?: string
  type: string
  timestamp: string
  config: Record<string, any>
  wouldHaveSent?: Record<string, any>
  sandbox: boolean
}

interface SandboxPreviewPanelProps {
  isOpen: boolean
  onClose: () => void
  interceptedActions: InterceptedAction[]
  workflowName?: string
  onClearActions?: () => void
}

export function SandboxPreviewPanel({ 
  isOpen, 
  onClose, 
  interceptedActions = [],
  workflowName,
  onClearActions
}: SandboxPreviewPanelProps) {
  if (!isOpen) return null

  const getActionIcon = (type: string) => {
    if (type.includes('gmail')) return <Mail className="h-4 w-4" />
    if (type.includes('slack') || type.includes('discord')) return <MessageSquare className="h-4 w-4" />
    if (type.includes('notion') || type.includes('drive')) return <FileText className="h-4 w-4" />
    if (type.includes('database') || type.includes('airtable')) return <Database className="h-4 w-4" />
    if (type.includes('webhook') || type.includes('api')) return <Server className="h-4 w-4" />
    return <Code className="h-4 w-4" />
  }

  const formatActionType = (type: string) => {
    return type
      .split('_')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ')
  }

  const renderPreviewContent = (action: InterceptedAction) => {
    const preview = action.wouldHaveSent || action.config

    if (!preview || Object.keys(preview).length === 0) {
      return (
        <p className="text-sm text-muted-foreground">No preview data available</p>
      )
    }

    return (
      <div className="space-y-2">
        {Object.entries(preview).map(([key, value]) => {
          if (value === null || value === undefined) return null
          
          const displayValue = typeof value === 'object' 
            ? JSON.stringify(value, null, 2) 
            : String(value)

          const shouldTruncate = displayValue.length > 100

          return (
            <div key={key} className="grid grid-cols-3 gap-2 text-sm">
              <span className="font-medium text-muted-foreground capitalize">
                {key.replace(/_/g, ' ')}:
              </span>
              <span className="col-span-2 break-words">
                {shouldTruncate ? (
                  <details className="cursor-pointer">
                    <summary className="text-foreground hover:underline">
                      {displayValue.substring(0, 100)}...
                    </summary>
                    <pre className="mt-2 p-2 bg-muted rounded text-xs overflow-x-auto">
                      {displayValue}
                    </pre>
                  </details>
                ) : (
                  <span className="text-foreground">{displayValue}</span>
                )}
              </span>
            </div>
          )
        })}
      </div>
    )
  }

  return (
    <div className={cn(
      "fixed right-0 top-0 h-full w-[400px] bg-background border-l shadow-lg z-50 transition-transform duration-300",
      isOpen ? "translate-x-0" : "translate-x-full"
    )}>
      <Card className="h-full rounded-none border-0">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
          <div className="space-y-1">
            <CardTitle className="text-lg flex items-center gap-2">
              <Shield className="h-5 w-5 text-blue-500" />
              Sandbox Preview
            </CardTitle>
            <CardDescription className="text-xs">
              {workflowName ? `Testing: ${workflowName}` : 'Intercepted actions from sandbox mode'}
            </CardDescription>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={onClose}
            className="h-8 w-8"
          >
            <X className="h-4 w-4" />
          </Button>
        </CardHeader>

        <CardContent className="p-0">
          <div className="px-6 pb-3">
            <div className="flex items-center gap-2 p-2 bg-blue-50 dark:bg-blue-950/30 rounded-lg">
              <AlertCircle className="h-4 w-4 text-blue-500" />
              <p className="text-xs text-blue-700 dark:text-blue-300">
                These actions were intercepted and not executed. This is a preview of what would have happened.
              </p>
            </div>
          </div>

          <Separator />

          <ScrollArea className="h-[calc(100vh-200px)]">
            <div className="p-6 space-y-4">
              {interceptedActions.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Shield className="h-12 w-12 mx-auto mb-3 opacity-20" />
                  <p className="text-sm">No actions intercepted yet</p>
                  <p className="text-xs mt-1">Run your workflow in sandbox mode to see previews</p>
                </div>
              ) : (
                interceptedActions.map((action, index) => (
                  <Card key={`${action.nodeId}-${index}`} className="border-dashed">
                    <CardHeader className="pb-3">
                      <div className="flex items-start justify-between">
                        <div className="flex items-center gap-2">
                          {getActionIcon(action.type)}
                          <div>
                            <h4 className="text-sm font-medium">
                              {formatActionType(action.type)}
                            </h4>
                            {action.nodeName && (
                              <p className="text-xs text-muted-foreground mt-0.5">
                                Node: {action.nodeName}
                              </p>
                            )}
                          </div>
                        </div>
                        <Badge variant="secondary" className="text-xs">
                          <Send className="h-3 w-3 mr-1" />
                          Intercepted
                        </Badge>
                      </div>
                    </CardHeader>
                    <CardContent className="pt-0">
                      {renderPreviewContent(action)}
                      <div className="mt-3 pt-3 border-t">
                        <p className="text-xs text-muted-foreground">
                          {new Date(action.timestamp).toLocaleTimeString()}
                        </p>
                      </div>
                    </CardContent>
                  </Card>
                ))
              )}
            </div>
          </ScrollArea>

          {interceptedActions.length > 0 && (
            <>
              <Separator />
              <div className="p-4 bg-muted/50">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">
                    Total intercepted: {interceptedActions.length}
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={onClearActions}
                    className="h-7 text-xs"
                  >
                    Clear All
                  </Button>
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  )
}