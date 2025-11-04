"use client"

import React, { useState, useEffect, useMemo } from 'react'
import { Play, PauseCircle, SkipForward, FileText, Trash2, GitBranch } from 'lucide-react'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Checkbox } from '@/components/ui/checkbox'
import { ALL_NODE_COMPONENTS } from '@/lib/workflows/nodes'

interface Condition {
  id: string
  sourceNodeId: string
  targetField: string
  operator: string
  value?: string
  negate: boolean
}

interface AdvancedTabProps {
  currentNodeId?: string
  workflowData?: { nodes: any[]; edges: any[] }
  initialPolicy?: {
    timeoutMs?: number
    retries?: number
    retryDelayMs?: number
  }
  initialMetadata?: {
    notes?: string
    errorHandling?: 'stop' | 'continue' | 'fallback'
    conditions?: Condition[]
  }
  onChange?: (data: { policy: any; metadata: any }) => void
}

const OPERATORS = [
  { value: 'is_not_empty', label: 'is not empty' },
  { value: 'equal', label: 'equal' },
  { value: 'not_equal', label: 'not equal' },
  { value: 'contains', label: 'contains' },
  { value: 'not_contains', label: 'does not contain' },
  { value: 'starts_with', label: 'starts with' },
  { value: 'ends_with', label: 'ends with' },
  { value: 'greater_than', label: 'greater than' },
  { value: 'less_than', label: 'less than' },
]

/**
 * Advanced Tab - Execution behavior and advanced settings
 *
 * Clean, focused UI inspired by modern workflow tools
 * - Run Behavior: How this node executes
 * - Conditional Execution: Run only when conditions are met
 * - Execution Policies: Timeout, retries (always visible, simplified)
 * - Documentation: Internal notes
 */
export function AdvancedTab({
  currentNodeId,
  workflowData,
  initialPolicy,
  initialMetadata,
  onChange
}: AdvancedTabProps) {
  // Run behavior (maps to error handling)
  const [runBehavior, setRunBehavior] = useState<'normal' | 'skip' | 'pause'>(
    initialMetadata?.errorHandling === 'continue' ? 'skip' :
    initialMetadata?.errorHandling === 'fallback' ? 'pause' : 'normal'
  )

  // Conditional execution
  const [conditionsEnabled, setConditionsEnabled] = useState(
    initialMetadata?.conditions && initialMetadata.conditions.length > 0
  )
  const [conditions, setConditions] = useState<Condition[]>(
    initialMetadata?.conditions || []
  )

  // Execution policies (always visible now)
  const [timeoutSeconds, setTimeoutSeconds] = useState<number>(
    (initialPolicy?.timeoutMs || 60000) / 1000
  )
  const [retries, setRetries] = useState<number>(initialPolicy?.retries || 0)
  const [retryDelayMs, setRetryDelayMs] = useState<number>(
    initialPolicy?.retryDelayMs || 1000
  )

  // Notes
  const [notes, setNotes] = useState<string>(initialMetadata?.notes || '')

  // Get upstream nodes
  const upstreamNodes = useMemo(() => {
    if (!workflowData || !currentNodeId) return []

    const nodeById = new Map(workflowData.nodes.map(n => [n.id, n]))
    const edges = workflowData.edges || []

    // Find nodes that connect TO the current node
    const sourceIds = edges
      .filter(e => e.target === currentNodeId)
      .map(e => e.source)

    return sourceIds
      .map(id => nodeById.get(id))
      .filter(Boolean)
      .map(node => ({
        id: node.id,
        title: node.data?.title || node.data?.label || node.data?.type || 'Unnamed',
        type: node.data?.type,
      }))
  }, [workflowData, currentNodeId])

  // Get output fields for a node
  const getNodeOutputFields = (nodeType: string) => {
    const nodeComponent = ALL_NODE_COMPONENTS.find(c => c.type === nodeType)
    return nodeComponent?.outputSchema || []
  }

  // Add new condition
  const addCondition = () => {
    const newCondition: Condition = {
      id: Math.random().toString(36).substr(2, 9),
      sourceNodeId: upstreamNodes[0]?.id || '',
      targetField: '',
      operator: 'is_not_empty',
      value: '',
      negate: false,
    }
    setConditions([...conditions, newCondition])
  }

  // Update condition
  const updateCondition = (id: string, updates: Partial<Condition>) => {
    setConditions(conditions.map(c =>
      c.id === id ? { ...c, ...updates } : c
    ))
  }

  // Delete condition
  const deleteCondition = (id: string) => {
    setConditions(conditions.filter(c => c.id !== id))
  }

  // Map run behavior back to error handling
  const errorHandling = runBehavior === 'skip' ? 'continue' : runBehavior === 'pause' ? 'fallback' : 'stop'

  // Notify parent of changes
  useEffect(() => {
    if (!onChange) return

    onChange({
      policy: {
        timeoutMs: timeoutSeconds * 1000,
        retries,
        retryDelayMs,
      },
      metadata: {
        errorHandling,
        notes,
        conditions: conditionsEnabled ? conditions : [],
      },
    })
  }, [timeoutSeconds, retries, retryDelayMs, errorHandling, notes, conditions, conditionsEnabled, onChange])

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto">
        <div className="px-6 py-6 space-y-6">
          {/* Run Behavior Section */}
          <div className="space-y-3">
            <div>
              <h3 className="text-sm font-semibold text-foreground">Run Behavior</h3>
              <p className="text-xs text-muted-foreground mt-1">
                Control how this node executes during flow runs
              </p>
            </div>

            <div className="space-y-2">
              {/* Normal Execution */}
              <button
                onClick={() => setRunBehavior('normal')}
                className={`w-full flex items-start gap-3 p-3 rounded-lg border transition-all text-left ${
                  runBehavior === 'normal'
                    ? 'border-primary bg-primary/5'
                    : 'border-border bg-card hover:border-border/80'
                }`}
              >
                <div className="w-8 h-8 rounded-lg bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center flex-shrink-0">
                  <Play className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                </div>
                <div className="flex-1 space-y-0.5">
                  <div className="text-sm font-medium">Normal Execution</div>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    Execute this node normally and continue to connected nodes
                  </p>
                </div>
                {runBehavior === 'normal' && (
                  <div className="w-2 h-2 rounded-full bg-primary flex-shrink-0 mt-1.5" />
                )}
              </button>

              {/* Skip & Continue */}
              <button
                onClick={() => setRunBehavior('skip')}
                className={`w-full flex items-start gap-3 p-3 rounded-lg border transition-all text-left ${
                  runBehavior === 'skip'
                    ? 'border-primary bg-primary/5'
                    : 'border-border bg-card hover:border-border/80'
                }`}
              >
                <div className="w-8 h-8 rounded-lg bg-orange-100 dark:bg-orange-900/30 flex items-center justify-center flex-shrink-0">
                  <SkipForward className="h-4 w-4 text-orange-600 dark:text-orange-400" />
                </div>
                <div className="flex-1 space-y-0.5">
                  <div className="text-sm font-medium">Skip & Continue</div>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    Skip execution but return empty values, allowing connected nodes to run
                  </p>
                </div>
                {runBehavior === 'skip' && (
                  <div className="w-2 h-2 rounded-full bg-primary flex-shrink-0 mt-1.5" />
                )}
              </button>

              {/* Stop & Pause */}
              <button
                onClick={() => setRunBehavior('pause')}
                className={`w-full flex items-start gap-3 p-3 rounded-lg border transition-all text-left ${
                  runBehavior === 'pause'
                    ? 'border-primary bg-primary/5'
                    : 'border-border bg-card hover:border-border/80'
                }`}
              >
                <div className="w-8 h-8 rounded-lg bg-red-100 dark:bg-red-900/30 flex items-center justify-center flex-shrink-0">
                  <PauseCircle className="h-4 w-4 text-red-600 dark:text-red-400" />
                </div>
                <div className="flex-1 space-y-0.5">
                  <div className="text-sm font-medium">Stop & Pause</div>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    Pause execution at this node, preventing connected nodes from running
                  </p>
                </div>
                {runBehavior === 'pause' && (
                  <div className="w-2 h-2 rounded-full bg-primary flex-shrink-0 mt-1.5" />
                )}
              </button>
            </div>
          </div>

          {/* Conditional Execution Section */}
          <div className="space-y-3">
            <div>
              <h3 className="text-sm font-semibold text-foreground">Conditional Execution</h3>
              <p className="text-xs text-muted-foreground mt-1">
                Run this node only when specific conditions are met
              </p>
            </div>

            {/* Enable Conditions Toggle */}
            <button
              onClick={() => setConditionsEnabled(!conditionsEnabled)}
              className={`w-full flex items-start gap-3 p-3 rounded-lg border transition-all text-left ${
                conditionsEnabled
                  ? 'border-primary bg-primary/5'
                  : 'border-border bg-card hover:border-border/80'
              }`}
            >
              <div className="w-8 h-8 rounded-lg bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center flex-shrink-0">
                <GitBranch className="h-4 w-4 text-blue-600 dark:text-blue-400" />
              </div>
              <div className="flex-1 space-y-0.5">
                <div className="text-sm font-medium">Enable Conditions</div>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Define when this node should execute based on data or flow state
                </p>
              </div>
              {conditionsEnabled && (
                <div className="w-2 h-2 rounded-full bg-primary flex-shrink-0 mt-1.5" />
              )}
            </button>

            {/* Conditions List */}
            {conditionsEnabled && (
              <div className="space-y-3 pl-3">
                {conditions.length === 0 ? (
                  <div className="p-4 border border-dashed border-border rounded-lg text-center">
                    <p className="text-xs text-muted-foreground mb-3">
                      No conditions defined. Add a condition to control when this node runs.
                    </p>
                    <Button
                      onClick={addCondition}
                      size="sm"
                      variant="outline"
                      disabled={upstreamNodes.length === 0}
                      className="h-8"
                    >
                      Add Condition
                    </Button>
                    {upstreamNodes.length === 0 && (
                      <p className="text-xs text-muted-foreground mt-2">
                        Connect upstream nodes to enable conditions
                      </p>
                    )}
                  </div>
                ) : (
                  <>
                    {conditions.map((condition, index) => {
                      const selectedNode = upstreamNodes.find(n => n.id === condition.sourceNodeId)
                      const outputFields = selectedNode ? getNodeOutputFields(selectedNode.type) : []

                      return (
                        <div key={condition.id} className="p-3 border border-border rounded-lg bg-card space-y-3">
                          {/* Connected Node */}
                          <div className="space-y-1.5">
                            <Label className="text-xs text-muted-foreground">Connected Node</Label>
                            <Select
                              value={condition.sourceNodeId}
                              onValueChange={(value) => updateCondition(condition.id, {
                                sourceNodeId: value,
                                targetField: '' // Reset field when node changes
                              })}
                            >
                              <SelectTrigger className="h-8 text-sm">
                                <SelectValue placeholder="Select node..." />
                              </SelectTrigger>
                              <SelectContent>
                                {upstreamNodes.map((node) => (
                                  <SelectItem key={node.id} value={node.id}>
                                    {node.title}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>

                          {/* Condition target field */}
                          <div className="space-y-1.5">
                            <Label className="text-xs text-muted-foreground">Condition target field</Label>
                            <Select
                              value={condition.targetField}
                              onValueChange={(value) => updateCondition(condition.id, { targetField: value })}
                              disabled={!condition.sourceNodeId}
                            >
                              <SelectTrigger className="h-8 text-sm">
                                <SelectValue placeholder="Select field..." />
                              </SelectTrigger>
                              <SelectContent>
                                {outputFields.map((field) => (
                                  <SelectItem key={field.name} value={field.name}>
                                    {field.label}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>

                          {/* Operator */}
                          <div className="space-y-1.5">
                            <Label className="text-xs text-muted-foreground">Operator - Set condition</Label>
                            <Select
                              value={condition.operator}
                              onValueChange={(value) => updateCondition(condition.id, { operator: value })}
                            >
                              <SelectTrigger className="h-8 text-sm">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {OPERATORS.map((op) => (
                                  <SelectItem key={op.value} value={op.value}>
                                    {op.label}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>

                          {/* Value (if operator needs it) */}
                          {!['is_not_empty'].includes(condition.operator) && (
                            <div className="space-y-1.5">
                              <Label className="text-xs text-muted-foreground">Value</Label>
                              <Input
                                value={condition.value || ''}
                                onChange={(e) => updateCondition(condition.id, { value: e.target.value })}
                                placeholder="Enter comparison value..."
                                className="h-8 text-sm"
                              />
                            </div>
                          )}

                          {/* Negate & Delete */}
                          <div className="flex items-center justify-between pt-2 border-t border-border/50">
                            <div className="flex items-center gap-2">
                              <Checkbox
                                id={`negate-${condition.id}`}
                                checked={condition.negate}
                                onCheckedChange={(checked) => updateCondition(condition.id, { negate: !!checked })}
                              />
                              <Label htmlFor={`negate-${condition.id}`} className="text-xs cursor-pointer">
                                Negate - return True only if the condition is not met
                              </Label>
                            </div>
                            <Button
                              onClick={() => deleteCondition(condition.id)}
                              size="sm"
                              variant="ghost"
                              className="h-7 px-2 text-destructive hover:text-destructive hover:bg-destructive/10"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </div>
                      )
                    })}

                    {/* Add Another Condition */}
                    <Button
                      onClick={addCondition}
                      size="sm"
                      variant="outline"
                      className="w-full h-8"
                    >
                      Add Condition
                    </Button>
                  </>
                )}
              </div>
            )}
          </div>

          {/* Execution Policies - Always visible, no dropdown */}
          <div className="space-y-4">
            <div>
              <h3 className="text-sm font-semibold text-foreground">Execution Policies</h3>
              <p className="text-xs text-muted-foreground mt-1">
                Configure timeout and retry behavior for this node
              </p>
            </div>

            <div className="grid grid-cols-2 gap-4">
              {/* Timeout */}
              <div className="space-y-2">
                <Label htmlFor="timeout" className="text-xs font-medium">Timeout</Label>
                <div className="flex items-center gap-2">
                  <Input
                    id="timeout"
                    type="number"
                    min="1"
                    max="600"
                    value={timeoutSeconds}
                    onChange={(e) => setTimeoutSeconds(Number(e.target.value))}
                    className="h-8 text-sm"
                  />
                  <span className="text-xs text-muted-foreground whitespace-nowrap">seconds</span>
                </div>
              </div>

              {/* Retries */}
              <div className="space-y-2">
                <Label htmlFor="retries" className="text-xs font-medium">Retry Attempts</Label>
                <div className="flex items-center gap-2">
                  <Input
                    id="retries"
                    type="number"
                    min="0"
                    max="10"
                    value={retries}
                    onChange={(e) => setRetries(Number(e.target.value))}
                    className="h-8 text-sm"
                  />
                  <span className="text-xs text-muted-foreground whitespace-nowrap">attempts</span>
                </div>
              </div>
            </div>

            {/* Retry Delay - Full width when shown */}
            {retries > 0 && (
              <div className="space-y-2">
                <Label htmlFor="retry-delay" className="text-xs font-medium">Retry Delay</Label>
                <div className="flex items-center gap-2">
                  <Input
                    id="retry-delay"
                    type="number"
                    min="0"
                    max="300000"
                    step="100"
                    value={retryDelayMs}
                    onChange={(e) => setRetryDelayMs(Number(e.target.value))}
                    className="h-8 text-sm max-w-[200px]"
                  />
                  <span className="text-xs text-muted-foreground">milliseconds</span>
                </div>
                <p className="text-xs text-muted-foreground">
                  Wait time between retry attempts
                </p>
              </div>
            )}
          </div>

          {/* Documentation Section */}
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <FileText className="h-4 w-4 text-muted-foreground" />
              <h3 className="text-sm font-semibold text-foreground">Documentation</h3>
            </div>
            <Textarea
              id="notes"
              placeholder="Add internal notes about this node's purpose, configuration decisions, or usage guidelines..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={4}
              className="resize-none text-sm"
            />
            <p className="text-xs text-muted-foreground">
              These notes are saved with the workflow and visible to your team
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
