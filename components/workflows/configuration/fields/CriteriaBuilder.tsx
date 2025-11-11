"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { Plus, Trash2, TestTube2 } from "lucide-react"
import { GroupedFieldSelector } from './GroupedFieldSelector'
import { VariableAutocomplete } from './VariableAutocomplete'
import { FieldValidation, PathCompletionBadge } from './InlineValidation'
import { ConditionTester } from './ConditionTester'
import { LogicFlowPreview } from './LogicFlowPreview'
import { GenericSelectField } from './shared/GenericSelectField'

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
  const [showTester, setShowTester] = useState(false)
  const [fieldErrors, setFieldErrors] = useState<Record<string, Record<string, string>>>({})

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

  const getExampleForType = (type: string): string => {
    switch (type.toLowerCase()) {
      case 'string':
      case 'text':
        return 'Example text'
      case 'number':
        return '42'
      case 'boolean':
        return 'true'
      case 'email':
        return 'user@example.com'
      case 'date':
        return '2025-01-01'
      default:
        return 'value'
    }
  }

  const getPathCompletion = (path: ConditionalPath) => {
    const totalConditions = path.conditions.length
    const validConditions = path.conditions.filter(c => {
      if (!c.field || !c.operator) return false
      if (needsValue(c.operator) && !c.value) return false
      return true
    }).length
    return { totalConditions, validConditions }
  }

  const disableAddPath = paths.length >= maxPaths

  return (
    <div className="space-y-6">
      {/* Header Info */}
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <p className="text-sm font-medium text-foreground">Filter Conditions</p>
          <p className="text-xs text-muted-foreground">Only continue if the following rules match</p>
        </div>
        <Badge variant="outline" className="text-xs">
          {paths.length} {paths.length === 1 ? 'path' : 'paths'}
        </Badge>
      </div>

      {/* Paths */}
      {paths.map((path, pathIndex) => {
        const { totalConditions, validConditions } = getPathCompletion(path)

        return (
          <div key={path.id} className="space-y-3">
            {/* Path Header */}
            <div className="flex items-center justify-between gap-3 pb-2">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => cyclePathColor(path.id)}
                  className="flex h-6 w-6 items-center justify-center rounded-md hover:bg-muted transition-colors"
                  title="Change path color"
                >
                  <span
                    className="h-3 w-3 rounded-full"
                    style={{ backgroundColor: path.color || PATH_COLORS[pathIndex % PATH_COLORS.length] }}
                  />
                </button>
                {showPathNames ? (
                  <Input
                    value={path.name}
                    onChange={(e) => updatePathName(path.id, e.target.value)}
                    className="h-8 max-w-[200px] border-0 bg-transparent px-0 text-sm font-medium shadow-none focus-visible:ring-0 focus-visible:ring-offset-0"
                    placeholder={`Path ${String.fromCharCode(65 + pathIndex)}`}
                  />
                ) : (
                  <span className="text-sm font-medium">
                    {path.name}
                  </span>
                )}
                <PathCompletionBadge
                  pathName={path.name}
                  totalConditions={totalConditions}
                  validConditions={validConditions}
                />
              </div>
              {paths.length > 1 && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => removePath(path.id)}
                  className="h-8 text-muted-foreground hover:text-destructive"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              )}
            </div>

            {/* Conditions */}
            <div className="space-y-2">
              {path.conditions.map((condition, conditionIndex) => (
                <div key={condition.id} className="space-y-2">
                  {/* AND/OR Connector */}
                  {conditionIndex > 0 && (
                    <div className="flex items-center justify-center -my-1">
                      <Select
                        value={path.logicOperator}
                        onValueChange={(value: 'and' | 'or') =>
                          updateLogicOperator(path.id, value)
                        }
                      >
                        <SelectTrigger className="h-7 w-20 border-0 bg-muted/50 text-xs font-medium uppercase">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="and">AND</SelectItem>
                          <SelectItem value="or">OR</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  )}

                  {/* Condition Row */}
                  <div className="flex items-start gap-2 rounded-lg border bg-card p-3">
                    <div className="flex flex-1 flex-wrap items-start gap-2">
                      {/* Field */}
                      <div className="min-w-[200px] flex-1">
                        <GroupedFieldSelector
                          value={condition.field}
                          onChange={(value) => {
                            updateCondition(path.id, condition.id, { field: value })
                            setFieldErrors(prev => {
                              const newErrors = { ...prev }
                              if (newErrors[path.id]?.[condition.id]) {
                                delete newErrors[path.id][condition.id]
                              }
                              return newErrors
                            })
                          }}
                          fields={previousNodeOutputs}
                          placeholder="Choose field..."
                        />
                        <FieldValidation error={fieldErrors[path.id]?.[condition.id]} />
                      </div>

                      {/* Operator */}
                      <div className="min-w-[160px]">
                        <GenericSelectField
                          field={{
                            name: `operator_${condition.id}`,
                            label: 'Operator',
                            type: 'select',
                            required: true,
                          }}
                          value={condition.operator}
                          onChange={(value) =>
                            updateCondition(path.id, condition.id, { operator: value })
                          }
                          options={getOperatorsForField(condition.field)}
                        />
                      </div>

                      {/* Value */}
                      {needsValue(condition.operator) && (
                        <div className="min-w-[200px] flex-1">
                          <VariableAutocomplete
                            value={condition.value}
                            onChange={(value) =>
                              updateCondition(path.id, condition.id, { value })
                            }
                            variables={previousNodeOutputs.map(field => ({
                              name: field.name,
                              label: field.label,
                              type: field.type,
                              example: getExampleForType(field.type)
                            }))}
                            placeholder="Enter value..."
                            isVariable={condition.isVariable}
                            onToggleVariable={(isVar) =>
                              updateCondition(path.id, condition.id, { isVariable: isVar })
                            }
                          />
                        </div>
                      )}
                    </div>

                    {/* Remove Button */}
                    {path.conditions.length > 1 && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => removeCondition(path.id, condition.id)}
                        className="h-9 w-9 p-0 text-muted-foreground hover:text-destructive"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {/* Add Condition Button */}
            <Button
              variant="ghost"
              size="sm"
              onClick={() => addCondition(path.id)}
              className="h-8 text-xs text-muted-foreground hover:text-foreground"
            >
              <Plus className="mr-1.5 h-3.5 w-3.5" />
              Add condition
            </Button>
          </div>
        )
      })}

      {/* Add Path Button */}
      {allowMultiplePaths && (
        <Button
          variant="outline"
          size="sm"
          onClick={addPath}
          disabled={disableAddPath}
          className="w-full border-dashed"
        >
          <Plus className="mr-2 h-4 w-4" />
          {disableAddPath ? 'Maximum paths reached' : 'Add another path'}
        </Button>
      )}

      {/* Fallback Info */}
      {allowMultiplePaths && paths.length > 0 && (
        <div className="rounded-lg border border-dashed bg-muted/30 p-3 text-xs text-muted-foreground">
          <span className="font-medium text-foreground">Else:</span>{" "}
          When no paths match, the workflow continues via the Else handle. Leave unconnected to stop, or add steps for fallback behavior.
        </div>
      )}

      {/* Test Button */}
      {paths.length > 0 && paths.some(p => p.conditions.length > 0) && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => setShowTester(!showTester)}
          className="w-full"
        >
          <TestTube2 className="mr-2 h-4 w-4" />
          {showTester ? 'Hide' : 'Test'} Conditions
        </Button>
      )}

      {/* Condition Tester */}
      {showTester && (
        <ConditionTester
          paths={paths}
          onClose={() => setShowTester(false)}
        />
      )}

      {/* Logic Flow Preview */}
      {paths.length > 0 && paths.some(p => p.conditions.length > 0 && p.conditions.some(c => c.field)) && (
        <LogicFlowPreview paths={paths} />
      )}
    </div>
  )
}
