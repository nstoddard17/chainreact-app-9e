"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Plus, Trash2, Variable, Palette } from "lucide-react"
import { cn } from "@/lib/utils"

export interface Condition {
  id: string
  field: string
  operator: string
  value: string
  isVariable?: boolean
}

export interface ConditionalPath {
  id: string
  name: string
  conditions: Condition[]
  logicOperator: 'and' | 'or'
  color?: string
}

interface CriteriaBuilderProps {
  value?: ConditionalPath[]
  onChange: (paths: ConditionalPath[]) => void
  previousNodeOutputs?: { name: string; label: string; type: string }[]
  allowMultiplePaths?: boolean
  showPathNames?: boolean
  maxPaths?: number
}

const TEXT_OPERATORS = [
  { value: 'equals', label: 'equals' },
  { value: 'not_equals', label: 'does not equal' },
  { value: 'contains', label: 'contains' },
  { value: 'not_contains', label: 'does not contain' },
  { value: 'starts_with', label: 'starts with' },
  { value: 'ends_with', label: 'ends with' },
  { value: 'is_empty', label: 'is empty' },
  { value: 'is_not_empty', label: 'is not empty' },
]

const NUMBER_OPERATORS = [
  { value: 'equals', label: 'equals' },
  { value: 'not_equals', label: 'does not equal' },
  { value: 'greater_than', label: 'greater than' },
  { value: 'less_than', label: 'less than' },
  { value: 'greater_equal', label: 'greater than or equal' },
  { value: 'less_equal', label: 'less than or equal' },
]

const BOOLEAN_OPERATORS = [
  { value: 'is_true', label: 'is true' },
  { value: 'is_false', label: 'is false' },
]

export function CriteriaBuilder({
  value = [],
  onChange,
  previousNodeOutputs = [],
  allowMultiplePaths = true,
  showPathNames = true,
  maxPaths = 5,
}: CriteriaBuilderProps) {
  const [paths, setPaths] = useState<ConditionalPath[]>(value)

  const PATH_COLORS = [
    "#2563EB",
    "#EA580C",
    "#059669",
    "#9333EA",
    "#BE123C",
    "#14B8A6",
  ]

  useEffect(() => {
    if (value.length > 0) {
      setPaths(value)
    }
  }, [value])

  useEffect(() => {
    if (value.length === 0 && paths.length === 0) {
      // Initialize with one path if empty
      const initialPath: ConditionalPath = {
        id: crypto.randomUUID(),
        name: 'Path A',
        conditions: [
          {
            id: crypto.randomUUID(),
            field: '',
            operator: 'equals',
            value: '',
          },
        ],
        logicOperator: 'and',
        color: PATH_COLORS[0],
      }
      setPaths([initialPath])
      onChange([initialPath])
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const addPath = () => {
    if (paths.length >= maxPaths) return
    const pathLetter = String.fromCharCode(65 + paths.length) // A, B, C, etc.
    const newPath: ConditionalPath = {
      id: crypto.randomUUID(),
      name: `Path ${pathLetter}`,
      conditions: [
        {
          id: crypto.randomUUID(),
          field: '',
          operator: 'equals',
          value: '',
            },
          ],
      logicOperator: 'and',
      color: PATH_COLORS[paths.length % PATH_COLORS.length],
    }
    const updatedPaths = [...paths, newPath]
    setPaths(updatedPaths)
    onChange(updatedPaths)
  }

  const removePath = (pathId: string) => {
    const updatedPaths = paths.filter(p => p.id !== pathId)
    setPaths(updatedPaths)
    onChange(updatedPaths)
  }

  const cyclePathColor = (pathId: string) => {
    const updatedPaths = paths.map(p => {
      if (p.id === pathId) {
        const currentIndex = p.color ? PATH_COLORS.indexOf(p.color) : -1
        const nextColor = PATH_COLORS[(currentIndex + 1) % PATH_COLORS.length]
        return { ...p, color: nextColor }
      }
      return p
    })
    setPaths(updatedPaths)
    onChange(updatedPaths)
  }

  const updatePathName = (pathId: string, name: string) => {
    const updatedPaths = paths.map(p =>
      p.id === pathId ? { ...p, name } : p
    )
    setPaths(updatedPaths)
    onChange(updatedPaths)
  }

  const updateLogicOperator = (pathId: string, operator: 'and' | 'or') => {
    const updatedPaths = paths.map(p =>
      p.id === pathId ? { ...p, logicOperator: operator } : p
    )
    setPaths(updatedPaths)
    onChange(updatedPaths)
  }

  const addCondition = (pathId: string) => {
    const updatedPaths = paths.map(p => {
      if (p.id === pathId) {
        return {
          ...p,
          conditions: [
            ...p.conditions,
            {
              id: crypto.randomUUID(),
              field: '',
              operator: 'equals',
              value: '',
            },
          ],
        }
      }
      return p
    })
    setPaths(updatedPaths)
    onChange(updatedPaths)
  }

  const removeCondition = (pathId: string, conditionId: string) => {
    const updatedPaths = paths.map(p => {
      if (p.id === pathId) {
        return {
          ...p,
          conditions: p.conditions.filter(c => c.id !== conditionId),
        }
      }
      return p
    })
    setPaths(updatedPaths)
    onChange(updatedPaths)
  }

  const updateCondition = (
    pathId: string,
    conditionId: string,
    updates: Partial<Condition>
  ) => {
    const updatedPaths = paths.map(p => {
      if (p.id === pathId) {
        return {
          ...p,
          conditions: p.conditions.map(c =>
            c.id === conditionId ? { ...c, ...updates } : c
          ),
        }
      }
      return p
    })
    setPaths(updatedPaths)
    onChange(updatedPaths)
  }

  const getOperatorsForField = (fieldName: string) => {
    const field = previousNodeOutputs.find(f => f.name === fieldName)
    if (!field) return TEXT_OPERATORS

    switch (field.type) {
      case 'number':
        return NUMBER_OPERATORS
      case 'boolean':
        return BOOLEAN_OPERATORS
      default:
        return TEXT_OPERATORS
    }
  }

  const needsValue = (operator: string) => {
    return !['is_empty', 'is_not_empty', 'is_true', 'is_false'].includes(operator)
  }

  const disableAddPath = paths.length >= maxPaths

  return (
    <div className="space-y-5">
      <div className="rounded-lg border bg-muted/40 p-4 text-sm text-muted-foreground">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-medium text-foreground">Path handles</p>
            <p>Each named path becomes its own connection handle on the canvas. Workflows fall back to the Else handle when no conditions match.</p>
          </div>
          <Badge variant="outline" className="bg-background text-xs">
            {paths.length} / {maxPaths} paths
          </Badge>
        </div>
      </div>

      {paths.map((path, pathIndex) => (
        <Card key={path.id} className="border-border/80 shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <div className="flex items-center gap-3">
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => cyclePathColor(path.id)}
                className="h-7 w-7 rounded-full border border-border/80 bg-background/80 hover:bg-background"
                title="Change path color"
              >
                <span
                  className="h-3.5 w-3.5 rounded-full border border-white shadow-sm"
                  style={{ backgroundColor: path.color || PATH_COLORS[pathIndex % PATH_COLORS.length] }}
                />
              </Button>
              {showPathNames ? (
                <Input
                  value={path.name}
                  onChange={(e) => updatePathName(path.id, e.target.value)}
                  className="h-9 max-w-xs border-none px-0 text-base font-semibold shadow-none focus-visible:ring-0"
                  placeholder={`Path ${String.fromCharCode(65 + pathIndex)}`}
                />
              ) : (
                <CardTitle className="text-base font-semibold">
                  {path.name}
                </CardTitle>
              )}
              <Badge variant="secondary" className="ml-1 text-xs font-medium">
                Handle: {path.name || `Path ${String.fromCharCode(65 + pathIndex)}`}
              </Badge>
            </div>
            {paths.length > 1 && (
              <Button
                variant="ghost"
                size="icon"
                onClick={() => removePath(path.id)}
                className="text-muted-foreground hover:text-destructive"
              >
                <Trash2 className="w-4 h-4" />
              </Button>
            )}
          </CardHeader>

          <CardContent className="space-y-4">
            <div className="flex items-center justify-between gap-2 rounded-md border border-dashed border-border/70 bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
              <div className="flex items-center gap-2">
                <Palette className="h-3.5 w-3.5 text-muted-foreground" />
                <span>Select conditions that should trigger this branch. The first matching branch runs; the Else branch handles the remainder.</span>
              </div>
              <Badge variant="outline" className="bg-background text-xs">
                {path.logicOperator.toUpperCase()} logic
              </Badge>
            </div>

            <div className="space-y-3">
              {path.conditions.map((condition, conditionIndex) => (
                <div key={condition.id} className="space-y-2 rounded-md border border-border/80 bg-background/60 p-3 shadow-xs">
                  {conditionIndex > 0 && (
                    <div className="flex items-center justify-center">
                      <Select
                        value={path.logicOperator}
                        onValueChange={(value: 'and' | 'or') =>
                          updateLogicOperator(path.id, value)
                        }
                      >
                        <SelectTrigger className="h-8 w-24 text-xs font-semibold uppercase tracking-wide">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="and">AND</SelectItem>
                          <SelectItem value="or">OR</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  )}

                  <div className="flex flex-wrap items-center gap-3">
                    {conditionIndex === 0 ? (
                      <Label className="text-sm font-medium text-muted-foreground">If</Label>
                    ) : (
                      <span className="w-6" />
                    )}

                    <Select
                      value={condition.field}
                      onValueChange={(value) =>
                        updateCondition(path.id, condition.id, { field: value })
                      }
                    >
                      <SelectTrigger className="min-w-[200px]">
                        <SelectValue placeholder="Select field" />
                      </SelectTrigger>
                      <SelectContent>
                        {previousNodeOutputs.length > 0 ? (
                          previousNodeOutputs.map((output) => (
                            <SelectItem key={output.name} value={output.name}>
                              {output.label}
                            </SelectItem>
                          ))
                        ) : (
                          <SelectItem value="custom">Enter custom field</SelectItem>
                        )}
                      </SelectContent>
                    </Select>

                    <Select
                      value={condition.operator}
                      onValueChange={(value) =>
                        updateCondition(path.id, condition.id, { operator: value })
                      }
                    >
                      <SelectTrigger className="min-w-[180px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {getOperatorsForField(condition.field).map((op) => (
                          <SelectItem key={op.value} value={op.value}>
                            {op.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>

                    {needsValue(condition.operator) && (
                      <div className="relative min-w-[200px] flex-1">
                        <Input
                          value={condition.value}
                          onChange={(e) =>
                            updateCondition(path.id, condition.id, {
                              value: e.target.value,
                            })
                          }
                          placeholder="Enter value..."
                          className={cn(
                            "pr-9",
                            condition.isVariable && "bg-blue-50 dark:bg-blue-950 border-blue-300 dark:border-blue-700"
                          )}
                        />
                        <Button
                          variant="ghost"
                          size="sm"
                          className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7 p-0"
                          onClick={() =>
                            updateCondition(path.id, condition.id, {
                              isVariable: !condition.isVariable,
                            })
                          }
                          title="Use variable from previous step"
                        >
                          <Variable className={cn(
                            "w-4 h-4",
                            condition.isVariable && "text-blue-600 dark:text-blue-400"
                          )} />
                        </Button>
                      </div>
                    )}

                    {path.conditions.length > 1 && (
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => removeCondition(path.id, condition.id)}
                        className="text-muted-foreground hover:text-destructive"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>

          <div className="border-t border-border/80 bg-muted/30 px-4 py-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => addCondition(path.id)}
                className="text-muted-foreground hover:text-foreground"
              >
                <Plus className="mr-2 h-4 w-4" />
                Add condition
              </Button>

              <div className="flex items-center gap-6 text-xs text-muted-foreground">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-foreground">Match logic</span>
                  <Badge variant="outline" className="bg-background/70">
                    {path.logicOperator === 'and'
                      ? 'All conditions must match'
                      : 'Any condition may match'}
                  </Badge>
                </div>
                <div className="flex items-center gap-2">
                  <span className="font-medium text-foreground">Canvas handle</span>
                  <Badge variant="secondary" className="bg-background text-xs font-medium">
                    {path.name || `Path ${String.fromCharCode(65 + pathIndex)}`}
                  </Badge>
                </div>
              </div>
            </div>
          </div>
        </Card>
      ))}

      {/* Add Path */}
      {allowMultiplePaths && (
        <Button
          variant="outline"
          onClick={addPath}
          disabled={disableAddPath}
          className="w-full border-dashed"
        >
          <Plus className="w-4 h-4 mr-2" />
          {disableAddPath ? 'Maximum paths reached' : 'Add another path'}
        </Button>
      )}

      {/* Else Path Note */}
      {allowMultiplePaths && paths.length > 0 && (
        <div className="rounded-lg border border-dashed border-border/80 bg-muted/40 p-4 text-sm">
          <span className="font-semibold text-foreground">Else fallback:</span>{" "}
          When none of the configured paths match, the workflow continues on the <span className="font-medium">Else</span> handle. Leave it unconnected to quietly stop unmatched runs or wire additional steps for catch-all behavior.
        </div>
      )}
    </div>
  )
}
