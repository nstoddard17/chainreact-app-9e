import React from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Button } from '@/components/ui/button'
import { DiscordMessagesDisplay } from './DiscordMessagesDisplay'
import { CheckCircle, XCircle, AlertCircle, Clock, Play, Copy, Filter } from 'lucide-react'
import { toast } from '@/hooks/use-toast'

interface WorkflowResult {
  nodeId: string
  nodeType: string
  success: boolean
  output?: any
  message?: string
  error?: string
  executionTime?: string
}

interface WorkflowResultsDisplayProps {
  results: WorkflowResult[]
  executionTime?: string
  className?: string
}

export function WorkflowResultsDisplay({ 
  results, 
  executionTime, 
  className = "" 
}: WorkflowResultsDisplayProps) {
  if (!results || results.length === 0) {
    return (
      <Card className={className}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Clock className="h-5 w-5" />
            Execution Results
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">No execution results available</p>
        </CardContent>
      </Card>
    )
  }

  // Filter out trigger status messages and only show actual action results
  const actionResults = results.filter(result => {
    // Skip trigger status messages (like Gmail trigger listening status)
    if (result.nodeType?.includes('_trigger_') && result.message?.includes('listening')) {
      return false
    }
    
    // Skip trigger setup messages
    if (result.message?.includes('trigger is set up') || result.message?.includes('triggered: true')) {
      return false
    }
    
    // Skip empty or status-only results
    if (!result.output || Object.keys(result.output).length === 0) {
      return false
    }
    
    return true
  })

  // If no action results after filtering, show a message
  if (actionResults.length === 0) {
    return (
      <Card className={className}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Play className="h-5 w-5" />
            Execution Results
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-2 text-muted-foreground">
            <Filter className="h-4 w-4" />
            <span>Workflow executed successfully. No action results to display.</span>
          </div>
          <p className="text-xs text-muted-foreground mt-2">
            This usually means the workflow only contains triggers or the actions didn't produce output.
          </p>
        </CardContent>
      </Card>
    )
  }

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text)
    toast({
      title: "Copied to clipboard",
      description: "The result has been copied to your clipboard.",
    })
  }

  const getStatusIcon = (success: boolean) => {
    if (success) {
      return <CheckCircle className="h-4 w-4 text-green-500" />
    }
    return <XCircle className="h-4 w-4 text-red-500" />
  }

  const getStatusBadge = (success: boolean) => {
    if (success) {
      return <Badge variant="default" className="bg-green-100 text-green-800">Success</Badge>
    }
    return <Badge variant="destructive">Failed</Badge>
  }

  const renderNodeResult = (result: WorkflowResult) => {
    // Special handling for Discord fetch messages
    if (result.nodeType === 'discord_action_fetch_messages' && result.success && result.output?.messages) {
      return (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {getStatusIcon(result.success)}
              <span className="font-medium">Discord Messages Fetched</span>
              {getStatusBadge(result.success)}
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => copyToClipboard(JSON.stringify(result.output, null, 2))}
            >
              <Copy className="h-4 w-4 mr-2" />
              Copy JSON
            </Button>
          </div>
          
          {result.message && (
            <p className="text-sm text-muted-foreground">{result.message}</p>
          )}
          
          <DiscordMessagesDisplay 
            messages={result.output.messages}
            channelId={result.output.channel_id}
            limit={result.output.limit}
          />
        </div>
      )
    }

    // Generic result display
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {getStatusIcon(result.success)}
            <span className="font-medium">{result.nodeType}</span>
            {getStatusBadge(result.success)}
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => copyToClipboard(JSON.stringify(result, null, 2))}
          >
            <Copy className="h-4 w-4 mr-2" />
            Copy JSON
          </Button>
        </div>
        
        {result.message && (
          <p className="text-sm text-muted-foreground">{result.message}</p>
        )}
        
        {result.error && (
          <div className="p-3 bg-red-50 border border-red-200 rounded-md">
            <div className="flex items-center gap-2 mb-2">
              <AlertCircle className="h-4 w-4 text-red-500" />
              <span className="font-medium text-red-800">Error</span>
            </div>
            <p className="text-sm text-red-700">{result.error}</p>
          </div>
        )}
        
        {result.output && Object.keys(result.output).length > 0 && (
          <div className="space-y-2">
            <h4 className="text-sm font-medium">Output:</h4>
            <ScrollArea className="h-32 w-full border rounded-md p-3 bg-muted/50">
              <pre className="text-xs whitespace-pre-wrap">
                {JSON.stringify(result.output, null, 2)}
              </pre>
            </ScrollArea>
          </div>
        )}
      </div>
    )
  }

  const successfulResults = actionResults.filter(r => r.success)
  const failedResults = actionResults.filter(r => !r.success)

  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Play className="h-5 w-5" />
          Action Results
          <Badge variant="outline" className="ml-2">
            {actionResults.length} action{actionResults.length !== 1 ? 's' : ''}
          </Badge>
          {executionTime && (
            <Badge variant="secondary" className="ml-2">
              {executionTime}
            </Badge>
          )}
        </CardTitle>
        <div className="flex gap-2 text-sm text-muted-foreground">
          <span className="flex items-center gap-1">
            <CheckCircle className="h-4 w-4 text-green-500" />
            {successfulResults.length} successful
          </span>
          {failedResults.length > 0 && (
            <span className="flex items-center gap-1">
              <XCircle className="h-4 w-4 text-red-500" />
              {failedResults.length} failed
            </span>
          )}
        </div>
      </CardHeader>
      <CardContent>
        <ScrollArea className="h-[600px] w-full">
          <div className="space-y-6">
            {actionResults.map((result, index) => (
              <div key={`${result.nodeId}-${index}`} className="border rounded-lg p-4">
                {renderNodeResult(result)}
              </div>
            ))}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  )
} 