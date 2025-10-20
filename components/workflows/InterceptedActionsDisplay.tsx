"use client"

import React, { useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion"
import {
  Mail, MessageSquare, FileText, Database, Send,
  Shield, Eye, Copy, ChevronDown, ExternalLink
} from "lucide-react"
import { cn } from "@/lib/utils"
import { useToast } from "@/hooks/use-toast"

interface InterceptedAction {
  nodeId: string
  nodeName: string
  type: string
  timestamp: string
  destination: string
  config: any
  wouldHaveSent: any
}

interface InterceptedActionsDisplayProps {
  actions: InterceptedAction[]
  className?: string
}

export function InterceptedActionsDisplay({
  actions,
  className
}: InterceptedActionsDisplayProps) {
  const [expandedItems, setExpandedItems] = useState<string[]>([])
  const { toast } = useToast()

  const copyToClipboard = async (data: any, label: string) => {
    try {
      await navigator.clipboard.writeText(JSON.stringify(data, null, 2))
      toast({
        title: "Copied!",
        description: `${label} copied to clipboard`,
      })
    } catch (err) {
      toast({
        title: "Failed to copy",
        variant: "destructive"
      })
    }
  }

  const getActionIcon = (type: string) => {
    if (type.includes('email') || type.includes('gmail')) {
      return <Mail className="w-4 h-4" />
    }
    if (type.includes('slack') || type.includes('discord') || type.includes('message')) {
      return <MessageSquare className="w-4 h-4" />
    }
    if (type.includes('sheets') || type.includes('airtable') || type.includes('notion')) {
      return <Database className="w-4 h-4" />
    }
    if (type.includes('webhook')) {
      return <Send className="w-4 h-4" />
    }
    return <FileText className="w-4 h-4" />
  }

  const getActionColor = (type: string) => {
    if (type.includes('email') || type.includes('gmail')) {
      return 'text-blue-600 bg-blue-50 dark:bg-blue-950/20'
    }
    if (type.includes('slack')) {
      return 'text-purple-600 bg-purple-50 dark:bg-purple-950/20'
    }
    if (type.includes('discord')) {
      return 'text-indigo-600 bg-indigo-50 dark:bg-indigo-950/20'
    }
    if (type.includes('sheets') || type.includes('airtable')) {
      return 'text-green-600 bg-green-50 dark:bg-green-950/20'
    }
    return 'text-gray-600 bg-gray-50 dark:bg-gray-950/20'
  }

  const formatActionType = (type: string) => {
    return type
      .replace(/_/g, ' ')
      .replace(/([a-z])([A-Z])/g, '$1 $2')
      .split(' ')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join(' ')
  }

  if (!actions || actions.length === 0) {
    return null
  }

  return (
    <Card className={cn("border-yellow-200 dark:border-yellow-900", className)}>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Shield className="w-4 h-4 text-yellow-600" />
            Intercepted Actions
            <Badge variant="secondary" className="ml-2">
              {actions.length}
            </Badge>
          </CardTitle>
          <Badge variant="outline" className="text-yellow-600 border-yellow-600">
            Test Mode - Not Sent
          </Badge>
        </div>
      </CardHeader>
      <CardContent>
        <div className="mb-4 p-3 bg-yellow-50 dark:bg-yellow-950/20 rounded-lg text-sm">
          <div className="flex items-start gap-2">
            <Eye className="w-4 h-4 text-yellow-600 mt-0.5 flex-shrink-0" />
            <p className="text-yellow-900 dark:text-yellow-100">
              These actions were intercepted and not actually sent. Review what would have been sent in production mode.
            </p>
          </div>
        </div>

        <ScrollArea className="h-[400px] pr-4">
          <Accordion type="multiple" className="space-y-2">
            {actions.map((action, index) => (
              <AccordionItem
                key={`${action.nodeId}-${index}`}
                value={`action-${index}`}
                className="border rounded-lg"
              >
                <AccordionTrigger className="px-4 py-3 hover:no-underline hover:bg-gray-50 dark:hover:bg-gray-900 rounded-t-lg">
                  <div className="flex items-center justify-between w-full mr-2">
                    <div className="flex items-center gap-3">
                      <div className={cn("p-2 rounded", getActionColor(action.type))}>
                        {getActionIcon(action.type)}
                      </div>
                      <div className="text-left">
                        <div className="font-medium text-sm">
                          {action.nodeName}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {formatActionType(action.type)}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="text-xs">
                        {action.destination}
                      </Badge>
                    </div>
                  </div>
                </AccordionTrigger>
                <AccordionContent className="px-4 pb-4">
                  <div className="space-y-4 pt-2">
                    {/* Destination */}
                    <div>
                      <label className="text-xs font-medium text-muted-foreground mb-1 block">
                        Would Send To
                      </label>
                      <div className="flex items-center justify-between p-2 bg-gray-50 dark:bg-gray-900 rounded text-sm">
                        <span className="font-mono">{action.destination}</span>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-6 px-2"
                          onClick={() => copyToClipboard(action.destination, 'Destination')}
                        >
                          <Copy className="w-3 h-3" />
                        </Button>
                      </div>
                    </div>

                    {/* Configuration */}
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <label className="text-xs font-medium text-muted-foreground">
                          Configuration
                        </label>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-6 px-2 text-xs"
                          onClick={() => copyToClipboard(action.config, 'Configuration')}
                        >
                          <Copy className="w-3 h-3 mr-1" />
                          Copy
                        </Button>
                      </div>
                      <ScrollArea className="h-[120px] w-full rounded border p-2 bg-gray-50 dark:bg-gray-900">
                        <pre className="text-xs font-mono">
                          {JSON.stringify(action.config, null, 2)}
                        </pre>
                      </ScrollArea>
                    </div>

                    {/* Would Have Sent Data */}
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <label className="text-xs font-medium text-muted-foreground">
                          Data That Would Be Sent
                        </label>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-6 px-2 text-xs"
                          onClick={() => copyToClipboard(action.wouldHaveSent, 'Payload')}
                        >
                          <Copy className="w-3 h-3 mr-1" />
                          Copy
                        </Button>
                      </div>
                      <ScrollArea className="h-[200px] w-full rounded border p-2 bg-gray-50 dark:bg-gray-900">
                        <pre className="text-xs font-mono">
                          {JSON.stringify(action.wouldHaveSent, null, 2)}
                        </pre>
                      </ScrollArea>
                    </div>

                    {/* Timestamp */}
                    <div className="text-xs text-muted-foreground">
                      Intercepted at: {new Date(action.timestamp).toLocaleString()}
                    </div>
                  </div>
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </ScrollArea>

        {/* Summary Footer */}
        <div className="mt-4 p-3 bg-gray-50 dark:bg-gray-900 rounded text-xs text-muted-foreground">
          <div className="flex items-center justify-between">
            <span>Total intercepted: {actions.length} action(s)</span>
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-xs"
              onClick={() => copyToClipboard(actions, 'All Intercepted Actions')}
            >
              <Copy className="w-3 h-3 mr-1" />
              Copy All
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
