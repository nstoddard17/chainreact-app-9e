"use client"

import React, { useMemo } from 'react'
import { Copy, Info, Code2, Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useToast } from '@/hooks/use-toast'
import { ALL_NODE_COMPONENTS } from '@/lib/workflows/nodes'
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
      title: 'Copied to clipboard',
      description: mergeField,
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
      title: 'All merge fields copied',
      description: `${outputSchema.length} field${outputSchema.length !== 1 ? 's' : ''} copied to clipboard`,
      duration: 2000,
    })
  }

  // Get type badge color
  const getTypeBadgeColor = (type: string) => {
    const colors: Record<string, string> = {
      string: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 border-blue-200 dark:border-blue-800',
      number: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400 border-purple-200 dark:border-purple-800',
      boolean: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 border-green-200 dark:border-green-800',
      array: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400 border-orange-200 dark:border-orange-800',
      object: 'bg-pink-100 text-pink-700 dark:bg-pink-900/30 dark:text-pink-400 border-pink-200 dark:border-pink-800',
    }
    return colors[type] || colors.string
  }

  // Format example value for display
  const formatExample = (example: any): string => {
    if (typeof example === 'string') return example
    if (typeof example === 'number' || typeof example === 'boolean') return String(example)
    if (Array.isArray(example)) {
      const items = example.slice(0, 2).map(formatExample).join(', ')
      return `[${items}${example.length > 2 ? ', ...' : ''}]`
    }
    if (typeof example === 'object' && example !== null) return '{...}'
    return JSON.stringify(example)
  }

  if (outputSchema.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full py-16 px-6 text-center">
        <div className="w-16 h-16 rounded-full bg-muted/50 flex items-center justify-center mb-4">
          <Code2 className="h-8 w-8 text-muted-foreground" />
        </div>
        <h3 className="text-lg font-semibold text-foreground mb-2">No Output Schema Defined</h3>
        <p className="text-sm text-muted-foreground max-w-md leading-relaxed">
          This node doesn't expose structured output data. It may perform an action without returning data that can be referenced in downstream nodes.
        </p>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto">
        <div className="px-6 py-6 space-y-6">
          {/* Header */}
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-1">
              <h2 className="text-lg font-semibold text-foreground">Output Schema</h2>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Reference these fields in downstream nodes using merge field syntax
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={handleCopyAllFields}
              className="flex items-center gap-2 flex-shrink-0"
            >
              <Copy className="h-3.5 w-3.5" />
              Copy All
            </Button>
          </div>

          {/* Output Fields List */}
          <div className="space-y-3">
            {outputSchema.map((field) => {
              const mergeField = `{{${currentNodeId}.${field.name}}}`

              return (
                <div
                  key={field.name}
                  className="group relative rounded-lg border border-border bg-card hover:border-primary/40 transition-all duration-200"
                >
                  <div className="p-4 space-y-3">
                    {/* Field Header */}
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0 space-y-1">
                        <div className="flex items-center gap-2">
                          <h4 className="text-sm font-semibold text-foreground">
                            {field.label}
                          </h4>
                          <Badge
                            variant="outline"
                            className={`text-[10px] h-5 px-1.5 ${getTypeBadgeColor(field.type)}`}
                          >
                            {field.type}
                          </Badge>
                        </div>
                        <p className="text-xs text-muted-foreground leading-relaxed">
                          {field.description}
                        </p>
                      </div>
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
                              onClick={() => handleCopyMergeField(field.name)}
                            >
                              <Copy className="h-3.5 w-3.5" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent side="left">
                            <p className="text-xs">Copy merge field</p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    </div>

                    {/* Merge Field Syntax */}
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
                        Merge Field
                      </label>
                      <div className="flex items-center gap-2 px-3 py-2 bg-muted/50 dark:bg-muted/20 rounded-md border border-border/50">
                        <code className="flex-1 text-xs font-mono text-foreground">
                          {mergeField}
                        </code>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 w-6 p-0 hover:bg-background"
                          onClick={() => handleCopyMergeField(field.name)}
                        >
                          <Copy className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>

                    {/* Example Value */}
                    {field.example !== undefined && (
                      <div className="space-y-1.5">
                        <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-1">
                          <Sparkles className="h-2.5 w-2.5" />
                          Example Output
                        </label>
                        <div className="px-3 py-2 bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800/50 rounded-md">
                          <code className="text-xs font-mono text-emerald-900 dark:text-emerald-200 break-all">
                            {formatExample(field.example)}
                          </code>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>

          {/* Footer Info */}
          <div className="flex items-start gap-2 text-xs text-muted-foreground pt-4 border-t border-border/50">
            <Info className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" />
            <p className="leading-relaxed">
              <span className="font-medium">{outputSchema.length} output field{outputSchema.length !== 1 ? 's' : ''}</span> available from this node. Use merge fields in text inputs, conditions, or transformations in downstream nodes.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
