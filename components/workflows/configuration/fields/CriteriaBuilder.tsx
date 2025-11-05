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
import { Plus, Trash2, Variable } from "lucide-react"
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
}

interface CriteriaBuilderProps {
  value?: ConditionalPath[]
  onChange: (paths: ConditionalPath[]) => void
  previousNodeOutputs?: { name: string; label: string; type: string }[]
  allowMultiplePaths?: boolean
  showPathNames?: boolean
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
}: CriteriaBuilderProps) {
  const [paths, setPaths] = useState<ConditionalPath[]>(value)

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
      }
      setPaths([initialPath])
      onChange([initialPath])
    }
  }, [])

  const addPath = () => {
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

  return (
    <div className="space-y-4">
      {paths.map((path, pathIndex) => (
        <div key={path.id} className="space-y-3">
          {/* Path Name - Only show if multiple paths */}
          {allowMultiplePaths && (
            <div className="flex items-center justify-between gap-3">
              {showPathNames ? (
                <Input
                  value={path.name}
                  onChange={(e) => updatePathName(path.id, e.target.value)}
                  className="font-semibold text-base h-9 max-w-xs"
                  placeholder="Path name"
                />
              ) : (
                <h4 className="font-semibold text-base">{path.name}</h4>
              )}
              {paths.length > 1 && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => removePath(path.id)}
                  className="text-muted-foreground hover:text-destructive"
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              )}
            </div>
          )}

          {/* Conditions */}
          <div className="space-y-2">
            {path.conditions.map((condition, conditionIndex) => (
              <div key={condition.id} className="space-y-2">
                {/* AND/OR Separator */}
                {conditionIndex > 0 && (
                  <div className="flex items-center justify-center py-1">
                    <Select
                      value={path.logicOperator}
                      onValueChange={(value: 'and' | 'or') =>
                        updateLogicOperator(path.id, value)
                      }
                    >
                      <SelectTrigger className="w-20 h-7 text-xs font-bold">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="and">AND</SelectItem>
                        <SelectItem value="or">OR</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                )}

                {/* Condition Row - Reads like: "If [status] [equals] [active]" */}
                <div className="flex items-center gap-2">
                  {/* "If" label only on first condition */}
                  {conditionIndex === 0 && (
                    <span className="text-sm font-medium text-muted-foreground shrink-0">If</span>
                  )}
                  {conditionIndex > 0 && (
                    <span className="w-6"></span>
                  )}

                  {/* Field */}
                  <Select
                    value={condition.field}
                    onValueChange={(value) =>
                      updateCondition(path.id, condition.id, { field: value })
                    }
                  >
                    <SelectTrigger className="min-w-[180px]">
                      <SelectValue placeholder="Choose field..." />
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

                  {/* Operator */}
                  <Select
                    value={condition.operator}
                    onValueChange={(value) =>
                      updateCondition(path.id, condition.id, { operator: value })
                    }
                  >
                    <SelectTrigger className="min-w-[160px]">
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

                  {/* Value */}
                  {needsValue(condition.operator) && (
                    <div className="flex-1 relative min-w-[180px]">
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

                  {/* Delete */}
                  {path.conditions.length > 1 && (
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => removeCondition(path.id, condition.id)}
                      className="shrink-0 text-muted-foreground hover:text-destructive"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  )}
                </div>
              </div>
            ))}

            {/* Add Condition */}
            <Button
              variant="ghost"
              size="sm"
              onClick={() => addCondition(path.id)}
              className="w-full mt-2 text-muted-foreground hover:text-foreground border-dashed border"
            >
              <Plus className="w-4 h-4 mr-2" />
              Add condition
            </Button>
          </div>

          {/* Separator between paths */}
          {allowMultiplePaths && pathIndex < paths.length - 1 && (
            <div className="h-px bg-border my-6"></div>
          )}
        </div>
      ))}

      {/* Add Path */}
      {allowMultiplePaths && (
        <Button
          variant="outline"
          onClick={addPath}
          className="w-full border-dashed"
        >
          <Plus className="w-4 h-4 mr-2" />
          Add another path
        </Button>
      )}

      {/* Else Path Note */}
      {allowMultiplePaths && paths.length > 0 && (
        <div className="text-sm p-3 bg-muted/50 rounded-md">
          <span className="font-medium">Else:</span> If none of the above conditions match, the workflow continues on the default path.
        </div>
      )}
    </div>
  )
}
