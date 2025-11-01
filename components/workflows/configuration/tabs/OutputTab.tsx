"use client"

import React, { useMemo } from 'react'
import { Copy, CheckCircle2, Info } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useToast } from '@/hooks/use-toast'
import { ALL_NODE_COMPONENTS } from '@/lib/workflows/nodes'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'

interface OutputTabProps {
  nodeInfo: any
  currentNodeId?: string
}

/**
 * Output Tab - Shows available merge fields from node's outputSchema
 *
 * This tab displays:
 * - All output fields the node produces
 * - Merge field syntax for each field ({{nodeId.fieldName}})
 * - Data type and description
 * - Example values
 * - Copy-to-clipboard functionality
 */
export function OutputTab({ nodeInfo, currentNodeId }: OutputTabProps) {
  const { toast } = useToast()

  // Get the node component definition with outputSchema
  const nodeComponent = useMemo(() => {
    return ALL_NODE_COMPONENTS.find(c => c.type === nodeInfo?.type)
  }, [nodeInfo?.type])

  // Get output schema
  const outputSchema = useMemo(() => {
    return nodeComponent?.outputSchema || []
  }, [nodeComponent])

  // Handle copy merge field to clipboard
  const handleCopyMergeField = (fieldName: string) => {
    const mergeField = `{{${currentNodeId}.${fieldName}}}`
    navigator.clipboard.writeText(mergeField)
    toast({
      title: 'Copied!',
      description: `Merge field ${mergeField} copied to clipboard`,
      duration: 2000,
    })
  }

  // Handle copy all fields
  const handleCopyAllFields = () => {
    const allFields = outputSchema
      .map(field => `{{${currentNodeId}.${field.name}}}`)
      .join('\n')

    navigator.clipboard.writeText(allFields)
    toast({
      title: 'Copied!',
      description: `${outputSchema.length} merge fields copied to clipboard`,
      duration: 2000,
    })
  }

  // Get type badge color
  const getTypeBadgeVariant = (type: string): "default" | "secondary" | "outline" => {
    switch (type) {
      case 'string':
        return 'default'
      case 'number':
        return 'secondary'
      case 'boolean':
        return 'outline'
      case 'array':
      case 'object':
        return 'secondary'
      default:
        return 'default'
    }
  }

  // Format example value for display
  const formatExample = (example: any): string => {
    if (typeof example === 'string') return `"${example}"`
    if (typeof example === 'number' || typeof example === 'boolean') return String(example)
    if (Array.isArray(example)) {
      const items = example.slice(0, 2).map(formatExample).join(', ')
      return `[${items}${example.length > 2 ? '...' : ''}]`
    }
    if (typeof example === 'object' && example !== null) return '{...}'
    return JSON.stringify(example)
  }

  if (outputSchema.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full py-12 px-6 text-center">
        <Info className="h-12 w-12 text-muted-foreground mb-4" />
        <h3 className="text-lg font-semibold text-foreground mb-2">No Output Fields</h3>
        <p className="text-sm text-muted-foreground max-w-md">
          This node doesn't produce any output data that can be used in downstream nodes.
        </p>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-6 py-4 border-b border-border bg-muted/30">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-foreground">Available Merge Fields</h2>
            <p className="text-sm text-muted-foreground mt-1">
              Use these fields in downstream nodes to access data from this step
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={handleCopyAllFields}
            className="flex items-center gap-2"
          >
            <Copy className="h-4 w-4" />
            Copy All
          </Button>
        </div>
      </div>

      {/* Output Fields List */}
      <div className="flex-1 overflow-y-auto p-6 space-y-4">
        {outputSchema.map((field) => {
          const mergeField = `{{${currentNodeId}.${field.name}}}`

          return (
            <Card key={field.name} className="border-2 hover:border-primary/50 transition-colors">
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <CardTitle className="text-base">{field.label}</CardTitle>
                      <Badge variant={getTypeBadgeVariant(field.type)}>
                        {field.type}
                      </Badge>
                    </div>
                    <CardDescription className="text-sm">
                      {field.description}
                    </CardDescription>
                  </div>
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 flex-shrink-0"
                          onClick={() => handleCopyMergeField(field.name)}
                        >
                          <Copy className="h-4 w-4" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>Copy merge field</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                {/* Merge Field Syntax */}
                <div>
                  <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                    Merge Field Syntax
                  </label>
                  <div className="mt-1 flex items-center gap-2 px-3 py-2 bg-muted rounded-md font-mono text-sm">
                    <code className="flex-1">{mergeField}</code>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 px-2"
                      onClick={() => handleCopyMergeField(field.name)}
                    >
                      <Copy className="h-3 w-3" />
                    </Button>
                  </div>
                </div>

                {/* Example Value */}
                {field.example !== undefined && (
                  <div>
                    <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                      Example Value
                    </label>
                    <div className="mt-1 px-3 py-2 bg-emerald-50 border border-emerald-200 rounded-md">
                      <div className="flex items-start gap-2">
                        <CheckCircle2 className="h-4 w-4 text-emerald-600 mt-0.5 flex-shrink-0" />
                        <code className="text-sm text-emerald-800 break-all">
                          {formatExample(field.example)}
                        </code>
                      </div>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          )
        })}
      </div>

      {/* Footer */}
      <div className="px-6 py-4 border-t border-border bg-muted/30">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Info className="h-4 w-4" />
          <span>
            {outputSchema.length} field{outputSchema.length !== 1 ? 's' : ''} available for use in downstream nodes
          </span>
        </div>
      </div>
    </div>
  )
}
