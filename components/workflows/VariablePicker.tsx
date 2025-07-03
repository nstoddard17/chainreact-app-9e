import React, { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Badge } from '@/components/ui/badge'
import { Search, ChevronRight, Database, Eye, Copy } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { useWorkflowTestStore } from '@/stores/workflowTestStore'

interface VariablePickerProps {
  workflowData?: { nodes: any[], edges: any[] }
  currentNodeId?: string
  onVariableSelect: (variable: string) => void
  fieldType?: string
  trigger?: React.ReactNode
}

interface NodeVariable {
  path: string
  label: string
  type: string
  description?: string
  example?: any
  category: 'config' | 'output' | 'schema'
}

export default function VariablePicker({
  workflowData,
  currentNodeId,
  onVariableSelect,
  fieldType,
  trigger
}: VariablePickerProps) {
  const [open, setOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null)
  const { getNodeInputOutput } = useWorkflowTestStore()

  // Get all nodes that come before the current node in the workflow
  const getPreviousNodes = () => {
    if (!workflowData?.nodes || !currentNodeId) return []
    
    // For now, consider all nodes except the current one as "previous"
    // In a more sophisticated implementation, we'd trace the actual execution path
    return workflowData.nodes.filter(node => node.id !== currentNodeId)
  }

  // Extract variables from a node
  const getNodeVariables = (node: any): NodeVariable[] => {
    const variables: NodeVariable[] = []
    
    // 1. Get variables from node's static configuration
    if (node.data?.config) {
      Object.entries(node.data.config).forEach(([key, value]) => {
        if (value && typeof value === 'string' && value.trim() !== '') {
          variables.push({
            path: `{{config.${key}}}`,
            label: key,
            type: 'string',
            description: `Configuration value: ${key}`,
            example: value,
            category: 'config'
          })
        }
      })
    }

    // 2. Get variables from node's test output (if available)
    const testData = getNodeInputOutput(node.id)
    if (testData?.output) {
      extractVariablesFromObject(testData.output, 'data', variables)
    }

    // 3. Get variables from node's output schema (if available)
    const nodeType = getNodeTypeInfo(node)
    if (nodeType && 'outputSchema' in nodeType && nodeType.outputSchema) {
      nodeType.outputSchema.forEach((field: any) => {
        variables.push({
          path: `{{data.${field.name}}}`,
          label: field.label || field.name,
          type: field.type,
          description: field.description,
          example: field.example,
          category: 'schema'
        })
      })
    }

    return variables
  }

  // Recursively extract variables from an object
  const extractVariablesFromObject = (obj: any, prefix: string, variables: NodeVariable[], depth = 0) => {
    if (depth > 3) return // Prevent infinite recursion
    
    Object.entries(obj).forEach(([key, value]) => {
      const path = `{{${prefix}.${key}}}`
      
      if (value === null || value === undefined) {
        variables.push({
          path,
          label: key,
          type: 'null',
          example: value,
          category: 'output'
        })
      } else if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
        variables.push({
          path,
          label: key,
          type: typeof value,
          example: value,
          category: 'output'
        })
      } else if (Array.isArray(value)) {
        variables.push({
          path,
          label: key,
          type: 'array',
          example: `[${value.length} items]`,
          category: 'output'
        })
        
        // Add array access patterns
        if (value.length > 0) {
          variables.push({
            path: `{{${prefix}.${key}[0]}}`,
            label: `${key}[0] (first item)`,
            type: typeof value[0],
            example: value[0],
            category: 'output'
          })
        }
      } else if (typeof value === 'object') {
        variables.push({
          path,
          label: key,
          type: 'object',
          example: '{...}',
          category: 'output'
        })
        
        // Recursively add nested properties
        extractVariablesFromObject(value, `${prefix}.${key}`, variables, depth + 1)
      }
    })
  }

  // Get node type information from available nodes
  const getNodeTypeInfo = (node: any) => {
    // This would normally come from your node definitions
    // For now, return null - we'll enhance this later
    return null
  }

  const previousNodes = getPreviousNodes()
  const selectedNode = selectedNodeId ? previousNodes.find(n => n.id === selectedNodeId) : null
  const selectedNodeVariables = selectedNode ? getNodeVariables(selectedNode) : []

  // Filter variables based on search query
  const filteredVariables = selectedNodeVariables.filter(variable =>
    variable.label.toLowerCase().includes(searchQuery.toLowerCase()) ||
    variable.path.toLowerCase().includes(searchQuery.toLowerCase()) ||
    variable.type.toLowerCase().includes(searchQuery.toLowerCase())
  )

  // Filter variables by field type compatibility (basic matching)
  const getCompatibleVariables = () => {
    if (!fieldType) return filteredVariables
    
    return filteredVariables.filter(variable => {
      if (fieldType === 'email' && variable.label.toLowerCase().includes('email')) return true
      if (fieldType === 'email' && variable.label.toLowerCase().includes('from')) return true
      if (fieldType === 'email' && variable.label.toLowerCase().includes('to')) return true
      if (fieldType === 'text' || fieldType === 'string') return variable.type === 'string'
      if (fieldType === 'number') return variable.type === 'number'
      return true // Show all by default
    })
  }

  const handleVariableSelect = (variable: NodeVariable) => {
    // Use the actual value if available, otherwise fall back to the template path
    const valueToInsert = variable.example && typeof variable.example === 'string' && variable.example.trim() !== ''
      ? variable.example
      : variable.path
    
    onVariableSelect(valueToInsert)
    setOpen(false)
    setSearchQuery('')
    setSelectedNodeId(null)
  }

  const getNodeDisplayName = (node: any) => {
    const nodeType = node.data?.isTrigger ? 'Trigger' : 'Action'
    const provider = node.data?.providerId || 'Unknown'
    const title = node.data?.title || node.data?.type || node.type || 'Unknown'
    
    // Capitalize provider names for better display
    const displayProvider = provider.charAt(0).toUpperCase() + provider.slice(1).replace('-', ' ')
    
    return `${nodeType}: ${displayProvider}: ${title}`
  }

  const getNodeIcon = (node: any) => {
    if (node.data?.isTrigger) return '🚀'
    if (node.data?.providerId === 'gmail') return '📧'
    if (node.data?.providerId === 'slack') return '💬'
    if (node.data?.providerId === 'google-sheets') return '📊'
    return '⚙️'
  }

  const getCategoryColor = (category: string) => {
    switch (category) {
      case 'config': return 'bg-blue-100 text-blue-800'
      case 'output': return 'bg-green-100 text-green-800'  
      case 'schema': return 'bg-purple-100 text-purple-800'
      default: return 'bg-gray-100 text-gray-800'
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger || (
          <Button variant="outline" size="sm" className="gap-2">
            <Database className="w-4 h-4" />
            Browse Variables
          </Button>
        )}
      </DialogTrigger>
      
      <DialogContent className="max-w-4xl h-[600px] p-0 flex flex-col">
        <DialogHeader className="px-6 py-3 border-b flex-shrink-0">
          <DialogTitle className="text-lg">Select Variable from Previous Nodes</DialogTitle>
        </DialogHeader>
        
        <div className="flex flex-1 h-0 min-h-0">
          {/* Left Panel - Node List */}
          <div className="w-1/3 border-r flex flex-col min-h-0">
            <div className="p-4 border-b flex-shrink-0">
              <h3 className="font-medium text-sm text-muted-foreground mb-2">Previous Nodes</h3>
            </div>
            <ScrollArea className="flex-1 min-h-0">
              <div className="p-4 space-y-2">
                {previousNodes.length === 0 ? (
                  <div className="text-center text-muted-foreground text-sm py-8">
                    No previous nodes found.<br />
                    Add nodes before this one to see available variables.
                  </div>
                ) : (
                  previousNodes
                    .map((node) => {
                      const variables = getNodeVariables(node)
                      return { node, variables }
                    })
                    .filter(({ variables }) => variables.length > 0) // Only show nodes with variables
                    .map(({ node, variables }) => (
                      <div
                        key={node.id}
                        className={cn(
                          "p-3 rounded-lg border cursor-pointer transition-colors",
                          selectedNodeId === node.id 
                            ? "border-primary bg-primary/5" 
                            : "border-border hover:bg-muted/50"
                        )}
                        onClick={() => setSelectedNodeId(node.id)}
                      >
                        <div className="flex items-center gap-2">
                          <span className="text-lg">{getNodeIcon(node)}</span>
                          <div className="flex-1 min-w-0">
                            <div className="text-sm font-medium truncate">
                              {getNodeDisplayName(node)}
                            </div>
                            <div className="text-xs text-muted-foreground">
                              {variables.length} variables available
                            </div>
                          </div>
                          <ChevronRight className="w-4 h-4 text-muted-foreground" />
                        </div>
                      </div>
                    ))
                )}
              </div>
            </ScrollArea>
          </div>

          {/* Right Panel - Variables List */}
          <div className="flex-1 flex flex-col">
            {selectedNode ? (
              <>
                <div className="p-4 border-b space-y-3">
                  <div className="flex items-center gap-2">
                    <span className="text-lg">{getNodeIcon(selectedNode)}</span>
                    <h3 className="font-medium">{getNodeDisplayName(selectedNode)}</h3>
                  </div>
                  
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input
                      placeholder="Search variables..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="pl-10"
                    />
                  </div>
                </div>

                <ScrollArea className="flex-1">
                  <div className="p-4 space-y-2">
                    {getCompatibleVariables().length === 0 ? (
                      <div className="text-center text-muted-foreground text-sm py-8">
                        {searchQuery ? 'No variables match your search.' : 'No variables available from this node.'}
                      </div>
                    ) : (
                      getCompatibleVariables().map((variable, index) => (
                        <div
                          key={index}
                          className="p-3 border rounded-lg hover:bg-muted/50 cursor-pointer transition-colors"
                          onClick={() => handleVariableSelect(variable)}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-1">
                                <span className="text-sm font-medium">
                                  {variable.label}:
                                </span>
                                <Badge variant="secondary" className={cn("text-xs", getCategoryColor(variable.category))}>
                                  {variable.type}
                                </Badge>
                              </div>
                              
                              {variable.example !== undefined && (
                                <div className="text-sm text-foreground font-mono">
                                  {typeof variable.example === 'object' 
                                    ? JSON.stringify(variable.example) 
                                    : String(variable.example)}
                                </div>
                              )}
                              
                              {variable.description && (
                                <div className="text-xs text-muted-foreground mt-1">
                                  {variable.description}
                                </div>
                              )}
                            </div>
                            
                            <Button variant="ghost" size="sm" className="flex-shrink-0">
                              <Copy className="w-4 h-4" />
                            </Button>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </ScrollArea>
              </>
            ) : (
              <div className="flex-1 flex items-center justify-center text-muted-foreground">
                <div className="text-center">
                  <Database className="w-12 h-12 mx-auto mb-4 opacity-50" />
                  <p>Select a node to browse its variables</p>
                </div>
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
} 