'use client'

import React, { useEffect, useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Loader2, Brain, ChevronDown, ChevronRight, DollarSign, Hash } from 'lucide-react'
import { cn } from '@/lib/utils'

interface AIFieldResolution {
  fieldName: string
  fieldType: string
  originalValue: string
  resolvedValue: string
  availableOptions?: { options: string[] }
  reasoning?: string
  tokensUsed: number
  cost: number
  resolvedAt: string
}

interface NodeResolution {
  nodeId: string
  nodeType: string
  nodeLabel: string
  fields: AIFieldResolution[]
}

interface AIFieldResolutionDisplayProps {
  executionId?: string
  workflowId?: string
  className?: string
}

export function AIFieldResolutionDisplay({ 
  executionId, 
  workflowId,
  className 
}: AIFieldResolutionDisplayProps) {
  const [loading, setLoading] = useState(false)
  const [resolutions, setResolutions] = useState<NodeResolution[]>([])
  const [totalCost, setTotalCost] = useState(0)
  const [totalTokens, setTotalTokens] = useState(0)
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set())
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (executionId) {
      fetchResolutions()
    }
  }, [executionId])

  const fetchResolutions = async () => {
    if (!executionId) return

    setLoading(true)
    setError(null)
    
    try {
      const response = await fetch(`/api/workflows/executions/${executionId}/ai-resolutions`)
      const data = await response.json()
      
      if (data.success) {
        setResolutions(data.resolutions || [])
        setTotalCost(data.totalCost || 0)
        setTotalTokens(data.totalTokens || 0)
        // Expand all nodes by default
        setExpandedNodes(new Set(data.resolutions?.map((r: NodeResolution) => r.nodeId) || []))
      } else {
        setError(data.error || 'Failed to load AI field resolutions')
      }
    } catch (err) {
      console.error('Error fetching AI resolutions:', err)
      setError('Failed to load AI field resolutions')
    } finally {
      setLoading(false)
    }
  }

  const toggleNodeExpansion = (nodeId: string) => {
    setExpandedNodes(prev => {
      const newSet = new Set(prev)
      if (newSet.has(nodeId)) {
        newSet.delete(nodeId)
      } else {
        newSet.add(nodeId)
      }
      return newSet
    })
  }

  const formatValue = (value: string, maxLength = 100) => {
    if (value.length <= maxLength) return value
    return value.substring(0, maxLength) + '...'
  }

  const getFieldTypeColor = (type: string) => {
    switch (type) {
      case 'select':
      case 'dropdown':
        return 'bg-blue-100 text-blue-800'
      case 'text':
        return 'bg-green-100 text-green-800'
      case 'template':
        return 'bg-purple-100 text-purple-800'
      case 'number':
        return 'bg-orange-100 text-orange-800'
      default:
        return 'bg-gray-100 text-gray-800'
    }
  }

  if (!executionId && !workflowId) {
    return (
      <Card className={className}>
        <CardContent className="py-6">
          <p className="text-sm text-muted-foreground text-center">
            No execution or workflow ID provided
          </p>
        </CardContent>
      </Card>
    )
  }

  if (loading) {
    return (
      <Card className={className}>
        <CardContent className="py-6">
          <div className="flex items-center justify-center space-x-2">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span className="text-sm text-muted-foreground">Loading AI field resolutions...</span>
          </div>
        </CardContent>
      </Card>
    )
  }

  if (error) {
    return (
      <Card className={cn("border-red-200", className)}>
        <CardContent className="py-6">
          <p className="text-sm text-red-600 text-center">{error}</p>
        </CardContent>
      </Card>
    )
  }

  if (resolutions.length === 0) {
    return (
      <Card className={className}>
        <CardContent className="py-6">
          <p className="text-sm text-muted-foreground text-center">
            No AI field resolutions found for this execution
          </p>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className={className}>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <Brain className="h-5 w-5 text-purple-600" />
            <CardTitle>AI Field Resolutions</CardTitle>
          </div>
          <div className="flex items-center space-x-4 text-sm">
            <div className="flex items-center space-x-1">
              <Hash className="h-4 w-4 text-muted-foreground" />
              <span>{totalTokens.toLocaleString()} tokens</span>
            </div>
            <div className="flex items-center space-x-1">
              <DollarSign className="h-4 w-4 text-muted-foreground" />
              <span>${totalCost.toFixed(4)}</span>
            </div>
          </div>
        </div>
        <CardDescription>
          AI automatically resolved {resolutions.reduce((sum, node) => sum + node.fields.length, 0)} fields across {resolutions.length} nodes
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ScrollArea className="h-[500px] pr-4">
          <div className="space-y-4">
            {resolutions.map((node) => (
              <div key={node.nodeId} className="border rounded-lg">
                <button
                  onClick={() => toggleNodeExpansion(node.nodeId)}
                  className="w-full px-4 py-3 flex items-center justify-between hover:bg-gray-50 transition-colors"
                >
                  <div className="flex items-center space-x-2">
                    {expandedNodes.has(node.nodeId) ? (
                      <ChevronDown className="h-4 w-4" />
                    ) : (
                      <ChevronRight className="h-4 w-4" />
                    )}
                    <span className="font-medium">{node.nodeLabel}</span>
                    <Badge variant="outline" className="text-xs">
                      {node.fields.length} fields
                    </Badge>
                  </div>
                  <span className="text-xs text-muted-foreground">{node.nodeType}</span>
                </button>
                
                {expandedNodes.has(node.nodeId) && (
                  <div className="border-t px-4 py-3 space-y-3">
                    {node.fields.map((field, index) => (
                      <div key={`${node.nodeId}-${field.fieldName}-${index}`} className="space-y-2">
                        <div className="flex items-start justify-between">
                          <div className="space-y-1">
                            <div className="flex items-center space-x-2">
                              <span className="font-medium text-sm">{field.fieldName}</span>
                              <Badge className={cn("text-xs", getFieldTypeColor(field.fieldType))}>
                                {field.fieldType}
                              </Badge>
                            </div>
                            
                            <div className="text-xs text-muted-foreground">
                              <span className="font-medium">Original:</span> {formatValue(field.originalValue, 50)}
                            </div>
                            
                            <div className="text-sm">
                              <span className="font-medium text-green-600">AI Selected:</span>{' '}
                              <span className="font-mono bg-gray-100 px-1 py-0.5 rounded">
                                {formatValue(field.resolvedValue)}
                              </span>
                            </div>
                            
                            {field.availableOptions && field.availableOptions.options && (
                              <div className="text-xs text-muted-foreground">
                                <span className="font-medium">Available options:</span>{' '}
                                {field.availableOptions.options.join(', ')}
                              </div>
                            )}
                            
                            {field.reasoning && (
                              <div className="text-xs text-muted-foreground italic">
                                <span className="font-medium">Reasoning:</span> {field.reasoning}
                              </div>
                            )}
                          </div>
                          
                          <div className="text-xs text-muted-foreground text-right">
                            <div>{field.tokensUsed} tokens</div>
                            <div>${field.cost.toFixed(4)}</div>
                          </div>
                        </div>
                        
                        {index < node.fields.length - 1 && <div className="border-b" />}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  )
}

export function AIFieldResolutionSummary({ 
  executionId,
  className 
}: { 
  executionId?: string
  className?: string 
}) {
  const [loading, setLoading] = useState(false)
  const [summary, setSummary] = useState<{
    totalResolutions: number
    totalCost: number
    totalTokens: number
  } | null>(null)

  useEffect(() => {
    if (executionId) {
      fetchSummary()
    }
  }, [executionId])

  const fetchSummary = async () => {
    if (!executionId) return

    setLoading(true)
    
    try {
      const response = await fetch(`/api/workflows/executions/${executionId}/ai-resolutions`)
      const data = await response.json()
      
      if (data.success) {
        setSummary({
          totalResolutions: data.totalResolutions || 0,
          totalCost: data.totalCost || 0,
          totalTokens: data.totalTokens || 0
        })
      }
    } catch (err) {
      console.error('Error fetching AI resolution summary:', err)
    } finally {
      setLoading(false)
    }
  }

  if (!executionId || loading || !summary) {
    return null
  }

  if (summary.totalResolutions === 0) {
    return null
  }

  return (
    <div className={cn("flex items-center space-x-4 text-sm", className)}>
      <div className="flex items-center space-x-1">
        <Brain className="h-4 w-4 text-purple-600" />
        <span>{summary.totalResolutions} AI fields</span>
      </div>
      <div className="flex items-center space-x-1">
        <Hash className="h-3 w-3 text-muted-foreground" />
        <span>{summary.totalTokens} tokens</span>
      </div>
      <div className="flex items-center space-x-1">
        <DollarSign className="h-3 w-3 text-muted-foreground" />
        <span>${summary.totalCost.toFixed(4)}</span>
      </div>
    </div>
  )
}