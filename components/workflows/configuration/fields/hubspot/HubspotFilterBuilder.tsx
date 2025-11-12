"use client"

import React, { useMemo } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Card } from "@/components/ui/card"
import { Trash2, Plus, RefreshCw } from "lucide-react"
import { GenericSelectField } from "../shared/GenericSelectField"

interface HubspotFilterValue {
  id: string
  property?: string
  operator?: string
  value?: string
  valueTo?: string
}

interface HubspotFilterBuilderProps {
  field: any
  value: HubspotFilterValue[]
  onChange: (value: HubspotFilterValue[]) => void
  propertyOptions: any[]
  error?: string
  nodeInfo?: any
  parentValues?: Record<string, any>
  workflowData?: any
  currentNodeId?: string
  onRefreshOptions?: () => void
}

const OPERATOR_OPTIONS = [
  { value: 'EQ', label: 'Equals' },
  { value: 'NEQ', label: 'Does not equal' },
  { value: 'GT', label: 'Greater than' },
  { value: 'GTE', label: 'Greater than or equal' },
  { value: 'LT', label: 'Less than' },
  { value: 'LTE', label: 'Less than or equal' },
  { value: 'BETWEEN', label: 'Between' },
  { value: 'IN', label: 'Matches any value' },
  { value: 'HAS_PROPERTY', label: 'Has a value' },
  { value: 'NOT_HAS_PROPERTY', label: 'Does not have a value' },
  { value: 'IS_EMPTY', label: 'Is empty' },
  { value: 'IS_NOT_EMPTY', label: 'Is not empty' },
]

const VALUELESS_OPERATORS = new Set(['HAS_PROPERTY', 'NOT_HAS_PROPERTY', 'IS_EMPTY', 'IS_NOT_EMPTY'])
const SECOND_VALUE_OPERATORS = new Set(['BETWEEN'])

function createFilter(): HubspotFilterValue {
  return {
    id: crypto.randomUUID(),
    property: '',
    operator: 'EQ',
    value: ''
  }
}

export function HubspotFilterBuilder({
  field,
  value = [],
  onChange,
  propertyOptions = [],
  error,
  nodeInfo,
  parentValues,
  workflowData,
  currentNodeId,
  onRefreshOptions
}: HubspotFilterBuilderProps) {
  const filters = Array.isArray(value) ? value : []

  const handleUpdate = (id: string, patch: Partial<HubspotFilterValue>) => {
    const next = filters.map(filter =>
      filter.id === id ? { ...filter, ...patch } : filter
    )
    onChange(next)
  }

  const handleRemove = (id: string) => {
    onChange(filters.filter(filter => filter.id !== id))
  }

  const handleAdd = () => {
    onChange([...filters, createFilter()])
  }

  const selectedPropertyMeta = useMemo(() => {
    const map: Record<string, any> = {}
    propertyOptions.forEach((option: any) => {
      const key = option.value || option.name
      if (key) {
        map[key] = option
      }
    })
    return map
  }, [propertyOptions])

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Add one or more property rules. All rules are combined with AND in HubSpot search queries.
        </p>
        {onRefreshOptions && (
          <Button variant="ghost" size="sm" onClick={onRefreshOptions} className="flex items-center gap-2">
            <RefreshCw className="h-4 w-4" /> Refresh properties
          </Button>
        )}
      </div>

      {filters.length === 0 && (
        <Card className="p-4 border-dashed text-sm text-muted-foreground">
          No filters added. Click "Add filter" to start narrowing results.
        </Card>
      )}

      <div className="space-y-3">
        {filters.map((filter) => {
          const propertyMeta = filter.property ? selectedPropertyMeta[filter.property] : undefined
          const requiresSecondValue = SECOND_VALUE_OPERATORS.has(filter.operator || '')
          const hasValue = !VALUELESS_OPERATORS.has(filter.operator || '')

          return (
            <Card key={filter.id} className="p-4 space-y-3">
              <div className="grid gap-3 md:grid-cols-[1.5fr_1fr_auto]">
                <div>
                  <label className="text-xs font-medium text-muted-foreground">Property</label>
                  <GenericSelectField
                    field={{
                      ...field,
                      type: 'select',
                      name: `${field.name}-${filter.id}-property`,
                      label: 'Property',
                      placeholder: 'Select property'
                    }}
                    value={filter.property || ''}
                    onChange={(val) => handleUpdate(filter.id, { property: val })}
                    options={propertyOptions}
                    nodeInfo={nodeInfo}
                    parentValues={parentValues}
                    workflowData={workflowData}
                    currentNodeId={currentNodeId}
                  />
                </div>

                <div>
                  <label className="text-xs font-medium text-muted-foreground">Operator</label>
                  <Select
                    value={filter.operator || 'EQ'}
                    onValueChange={(value) => handleUpdate(filter.id, { operator: value })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select operator" />
                    </SelectTrigger>
                    <SelectContent>
                      {OPERATOR_OPTIONS.map(option => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="flex items-start justify-end">
                  <Button variant="ghost" size="icon" onClick={() => handleRemove(filter.id)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              {hasValue && (
                <div className="grid gap-3 md:grid-cols-2">
                  <div>
                    <label className="text-xs font-medium text-muted-foreground">Value</label>
                    <Input
                      value={filter.value || ''}
                      placeholder={propertyMeta?.label ? `${propertyMeta.label} value or {{variable}}` : 'Enter value or {{variable}}'}
                      onChange={(e) => handleUpdate(filter.id, { value: e.target.value })}
                    />
                    {filter.operator === 'IN' && (
                      <p className="text-[11px] text-muted-foreground mt-1">Separate multiple values with commas.</p>
                    )}
                  </div>
                  {requiresSecondValue && (
                    <div>
                      <label className="text-xs font-medium text-muted-foreground">Upper Value</label>
                      <Input
                        value={filter.valueTo || ''}
                        placeholder="Upper bound"
                        onChange={(e) => handleUpdate(filter.id, { valueTo: e.target.value })}
                      />
                    </div>
                  )}
                </div>
              )}
            </Card>
          )
        })}
      </div>

      <div className="flex items-center gap-2">
        <Button type="button" variant="outline" size="sm" onClick={handleAdd} className="flex items-center gap-2">
          <Plus className="h-4 w-4" /> Add filter
        </Button>
        {error && <p className="text-xs text-red-500">{error}</p>}
      </div>
    </div>
  )
}

