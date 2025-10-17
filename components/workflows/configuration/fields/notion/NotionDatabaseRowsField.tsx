import React, { useEffect, useState } from 'react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Checkbox } from '@/components/ui/checkbox'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Loader2, Plus, Trash2, Edit2, Database, Save, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { logger } from '@/lib/utils/logger'
import { Badge } from '@/components/ui/badge'

interface NotionDatabaseRowsFieldProps {
  value: any
  onChange: (value: any) => void
  field: any
  values: Record<string, any>
  loadOptions?: (fieldName: string, dependsOn?: string, dependsOnValue?: any, forceRefresh?: boolean) => Promise<void>
  dynamicOptions?: Record<string, any[]>
  loadingDynamic?: boolean
}

interface RowField {
  name: string
  label: string
  type: string
  value: any
  required?: boolean
  readOnly?: boolean
  options?: Array<{ value: string; label: string; color?: string }>
  propertyType?: string
  propertyId?: string
}

interface DatabaseRow {
  id?: string
  title: string
  fields: RowField[]
  url?: string
  created_time?: string
  last_edited_time?: string
  archived?: boolean
  _action?: 'add' | 'update' | 'delete'
  _expanded?: boolean
}

export function NotionDatabaseRowsField({
  value = [],
  onChange,
  field,
  values,
  loadOptions,
  dynamicOptions,
  loadingDynamic
}: NotionDatabaseRowsFieldProps) {
  const [rows, setRows] = useState<DatabaseRow[]>(value || [])
  const [editingRowIndex, setEditingRowIndex] = useState<number | null>(null) // Track which row is being edited
  const [isInitialized, setIsInitialized] = useState(false)

  // Load rows when database is selected
  useEffect(() => {
    if (field.dependsOn && values[field.dependsOn] && loadOptions) {
      loadOptions(field.name, field.dependsOn, values[field.dependsOn], true) // Force refresh
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [field.dependsOn, field.name, values[field.dependsOn]])

  // Update rows when dynamic options change
  useEffect(() => {
    const loadedRows = dynamicOptions?.[field.name] || []
    logger.debug('NotionDatabaseRowsField - Loaded rows from dynamicOptions:', {
      fieldName: field.name,
      rowCount: loadedRows.length,
      firstRow: loadedRows[0],
      allRows: loadedRows,
      currentValue: value
    })

    if (loadedRows.length > 0) {
      // Always show fresh data from the API
      setRows(loadedRows)
      setIsInitialized(true)
    }
  }, [dynamicOptions?.[field.name]])

  // Sync changes to parent (only after initialization and with debounce)
  useEffect(() => {
    // Don't sync on initial mount
    if (!isInitialized) return

    // Only sync if we have actual rows with data
    if (rows.length > 0) {
      // Use a small timeout to avoid immediate re-renders that could close the modal
      const timeoutId = setTimeout(() => {
        logger.debug('Syncing rows to parent:', rows.length)
        onChange(rows)
      }, 100)
      return () => clearTimeout(timeoutId)
    }
  }, [rows, isInitialized])

  const handleEditRow = (index: number) => {
    setEditingRowIndex(index)
  }

  const handleSaveRow = () => {
    setEditingRowIndex(null)
  }

  const handleCancelEdit = () => {
    setEditingRowIndex(null)
  }

  const handleFieldChange = (rowIndex: number, fieldName: string, newValue: any) => {
    setRows(prev => {
      const updated = [...prev]
      const row = updated[rowIndex]
      const fieldIndex = row.fields.findIndex(f => f.name === fieldName)

      if (fieldIndex >= 0) {
        row.fields[fieldIndex].value = newValue
      }

      // Mark as updated if it has an ID (existing row)
      if (row.id && row._action !== 'add') {
        row._action = 'update'
      }

      return updated
    })
  }

  const handleAddRow = () => {
    // Get the first row as a template for fields
    const templateRow = rows[0]
    if (!templateRow || !templateRow.fields) {
      logger.error('Cannot add row: no template available')
      return
    }

    const newRow: DatabaseRow = {
      title: 'New Row',
      fields: templateRow.fields.map(field => ({
        ...field,
        value: field.type === 'checkbox' ? false : (Array.isArray(field.value) ? [] : '')
      })),
      _action: 'add',
      _expanded: true
    }

    // Add the row
    const newRows = [...rows, newRow]
    setRows(newRows)

    // Put the new row in edit mode
    setEditingRowIndex(rows.length)
  }

  const handleDeleteRow = (index: number) => {
    setRows(prev => {
      const updated = [...prev]
      const row = updated[index]

      if (row.id) {
        // Mark existing row for deletion
        row._action = 'delete'
      } else {
        // Remove new row that hasn't been saved
        updated.splice(index, 1)
      }

      return updated
    })

    // Exit edit mode if we're editing this row
    if (editingRowIndex === index) {
      setEditingRowIndex(null)
    }
  }

  const renderFieldInput = (row: DatabaseRow, field: RowField, rowIndex: number) => {
    const fieldValue = field.value

    if (field.readOnly) {
      // For read-only fields, display the value appropriately
      let displayValue = ''
      if (Array.isArray(fieldValue)) {
        displayValue = fieldValue.map((v: any) => v.name || v.label || v).join(', ')
      } else if (typeof fieldValue === 'object' && fieldValue !== null) {
        displayValue = fieldValue.name || fieldValue.label || JSON.stringify(fieldValue)
      } else {
        displayValue = String(fieldValue || '')
      }

      return (
        <Input
          value={displayValue}
          disabled
          className="bg-muted cursor-not-allowed text-muted-foreground"
        />
      )
    }

    switch (field.type) {
      case 'text':
      case 'url':
      case 'email':
      case 'tel':
        return (
          <Input
            value={fieldValue || ''}
            onChange={(e) => handleFieldChange(rowIndex, field.name, e.target.value)}
            placeholder={`Enter ${field.label}`}
            type={field.type}
          />
        )

      case 'textarea':
        return (
          <Textarea
            value={fieldValue || ''}
            onChange={(e) => handleFieldChange(rowIndex, field.name, e.target.value)}
            placeholder={`Enter ${field.label}`}
            rows={3}
          />
        )

      case 'number':
        return (
          <Input
            type="number"
            value={fieldValue || ''}
            onChange={(e) => handleFieldChange(rowIndex, field.name, e.target.value)}
            placeholder={`Enter ${field.label}`}
          />
        )

      case 'date':
        return (
          <Input
            type="date"
            value={fieldValue || ''}
            onChange={(e) => handleFieldChange(rowIndex, field.name, e.target.value)}
          />
        )

      case 'checkbox':
        return (
          <div className="flex items-center space-x-2">
            <Checkbox
              checked={fieldValue || false}
              onCheckedChange={(checked) => handleFieldChange(rowIndex, field.name, checked)}
            />
            <span className="text-sm">{fieldValue ? 'Checked' : 'Unchecked'}</span>
          </div>
        )

      case 'select':
        return (
          <Select
            value={fieldValue || ''}
            onValueChange={(value) => handleFieldChange(rowIndex, field.name, value)}
          >
            <SelectTrigger>
              <SelectValue placeholder={`Select ${field.label}`} />
            </SelectTrigger>
            <SelectContent>
              {field.options?.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )

      case 'multi-select':
      case 'multi_select':
        const selectedValues = Array.isArray(fieldValue) ? fieldValue : []
        return (
          <div className="space-y-2">
            {field.options?.map((option) => (
              <div key={option.value} className="flex items-center space-x-2">
                <Checkbox
                  checked={selectedValues.includes(option.value)}
                  onCheckedChange={(checked) => {
                    const newValues = checked
                      ? [...selectedValues, option.value]
                      : selectedValues.filter(v => v !== option.value)
                    handleFieldChange(rowIndex, field.name, newValues)
                  }}
                />
                <span className="text-sm">{option.label}</span>
              </div>
            ))}
          </div>
        )

      case 'people':
        const people = Array.isArray(fieldValue) ? fieldValue : []
        const peopleDisplay = people.map((p: any) => p.name || p.email || p.id).join(', ')
        return (
          <Input
            value={peopleDisplay}
            onChange={(e) => {
              // For now, make it read-only since people selector is complex
              // Can be enhanced later
            }}
            placeholder="People field (read-only for now)"
            disabled
            className="bg-muted cursor-not-allowed text-muted-foreground"
          />
        )

      case 'files':
      case 'relation':
        // These are complex types, show as read-only for now
        const arrayDisplay = Array.isArray(fieldValue)
          ? fieldValue.map((v: any) => v.name || v.id || v).join(', ')
          : String(fieldValue || '')
        return (
          <Input
            value={arrayDisplay}
            disabled
            className="bg-muted cursor-not-allowed text-muted-foreground"
            placeholder={`${field.type} field (read-only for now)`}
          />
        )

      default:
        // Handle any unknown types
        let displayValue = fieldValue
        if (Array.isArray(fieldValue)) {
          displayValue = fieldValue.map((v: any) => v.name || v.label || v).join(', ')
        } else if (typeof fieldValue === 'object' && fieldValue !== null) {
          displayValue = fieldValue.name || fieldValue.label || JSON.stringify(fieldValue)
        }

        return (
          <Input
            value={String(displayValue || '')}
            onChange={(e) => handleFieldChange(rowIndex, field.name, e.target.value)}
            placeholder={`Enter ${field.label}`}
          />
        )
    }
  }

  if (loadingDynamic) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
        <span className="ml-2 text-sm text-muted-foreground">Loading database rows...</span>
      </div>
    )
  }

  if (rows.length === 0) {
    const rawData = dynamicOptions?.[field.name]
    return (
      <div className="space-y-4">
        <div className="text-sm text-muted-foreground p-4 border border-dashed rounded-md text-center">
          No rows found in this database
        </div>
        {process.env.NODE_ENV === 'development' && rawData && (
          <details className="text-xs">
            <summary className="cursor-pointer font-mono text-muted-foreground">Debug: Raw API Data</summary>
            <pre className="mt-2 p-2 bg-muted rounded text-[10px] overflow-auto max-h-40">
              {JSON.stringify(rawData, null, 2)}
            </pre>
          </details>
        )}
        <Button onClick={handleAddRow} className="w-full" variant="outline" type="button">
          <Plus className="w-4 h-4 mr-2" />
          Add First Row
        </Button>
      </div>
    )
  }

  const pendingChanges = {
    add: rows.filter(r => r._action === 'add').length,
    update: rows.filter(r => r._action === 'update').length,
    delete: rows.filter(r => r._action === 'delete').length
  }
  const hasChanges = pendingChanges.add > 0 || pendingChanges.update > 0 || pendingChanges.delete > 0

  // Get all unique field names from the first row (template)
  const allFields = rows.length > 0 && rows[0].fields ? rows[0].fields : []

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between p-3 bg-muted/30 rounded-lg border">
        <div className="flex items-center gap-2">
          <Database className="w-4 h-4 text-muted-foreground" />
          <span className="text-sm font-medium">
            {rows.filter(r => r._action !== 'delete').length} Row{rows.filter(r => r._action !== 'delete').length !== 1 ? 's' : ''}
          </span>
          {hasChanges && (
            <Badge variant="secondary" className="text-xs">
              {pendingChanges.add > 0 && `+${pendingChanges.add} `}
              {pendingChanges.update > 0 && `~${pendingChanges.update} `}
              {pendingChanges.delete > 0 && `-${pendingChanges.delete}`}
            </Badge>
          )}
        </div>
        <Button onClick={handleAddRow} size="sm" type="button">
          <Plus className="w-4 h-4 mr-1.5" />
          Add Row
        </Button>
      </div>

      {/* Pending changes info */}
      {hasChanges && (
        <div className="text-xs text-muted-foreground bg-blue-50/50 dark:bg-blue-950/20 p-2 rounded border border-blue-200 dark:border-blue-800">
          <strong>Pending changes:</strong> These changes will be applied when you save and run/test this workflow.
        </div>
      )}

      {/* Table */}
      <div className="border rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[50px] text-xs">Status</TableHead>
                <TableHead className="w-[100px] text-xs">Row Title</TableHead>
                {allFields.map((field) => (
                  <TableHead key={field.name} className="text-xs min-w-[150px]">
                    {field.label}
                    {field.required && <span className="text-destructive ml-1">*</span>}
                  </TableHead>
                ))}
                <TableHead className="w-[100px] text-xs text-center">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row, rowIndex) => {
                // Don't show deleted rows
                if (row._action === 'delete') return null

                const isEditing = editingRowIndex === rowIndex
                const isNew = row._action === 'add'
                const isModified = row._action === 'update'

                return (
                  <TableRow
                    key={rowIndex}
                    className={cn(
                      "transition-all",
                      isNew && "bg-green-50/20 border-l-2 border-l-green-500",
                      isModified && "bg-yellow-50/20 border-l-2 border-l-yellow-500",
                      isEditing && "bg-blue-50/30"
                    )}
                  >
                    {/* Status Column */}
                    <TableCell className="text-xs">
                      {isNew && (
                        <Badge variant="outline" className="text-[10px] h-4 px-1 border-green-500 text-green-600">
                          New
                        </Badge>
                      )}
                      {isModified && !isNew && (
                        <Badge variant="outline" className="text-[10px] h-4 px-1 border-yellow-500 text-yellow-600">
                          Mod
                        </Badge>
                      )}
                    </TableCell>

                    {/* Row Title Column */}
                    <TableCell className="text-xs font-medium">
                      {row.title || 'Untitled'}
                    </TableCell>

                    {/* Field Columns */}
                    {allFields.map((fieldTemplate) => {
                      const field = row.fields.find(f => f.name === fieldTemplate.name)
                      if (!field) {
                        return <TableCell key={fieldTemplate.name} className="text-xs text-muted-foreground">-</TableCell>
                      }

                      // If editing, show input; otherwise show read-only value
                      if (isEditing && !field.readOnly) {
                        return (
                          <TableCell key={field.name} className="p-2">
                            <div className="max-w-[250px]">
                              {renderFieldInput(row, field, rowIndex)}
                            </div>
                          </TableCell>
                        )
                      }

                      // Read-only display
                      let displayValue = ''
                      const fieldValue = field.value

                      if (field.type === 'checkbox') {
                        displayValue = fieldValue ? '✓' : '✗'
                      } else if (Array.isArray(fieldValue)) {
                        displayValue = fieldValue.map((v: any) => v.name || v.label || v).join(', ')
                      } else if (typeof fieldValue === 'object' && fieldValue !== null) {
                        displayValue = fieldValue.name || fieldValue.label || JSON.stringify(fieldValue)
                      } else {
                        displayValue = String(fieldValue || '')
                      }

                      return (
                        <TableCell key={field.name} className="text-xs max-w-[200px] truncate" title={displayValue}>
                          {displayValue || '-'}
                        </TableCell>
                      )
                    })}

                    {/* Actions Column */}
                    <TableCell className="p-2">
                      <div className="flex items-center justify-center gap-1">
                        {isEditing ? (
                          <>
                            <Button
                              size="sm"
                              variant="ghost"
                              type="button"
                              onClick={handleSaveRow}
                              className="h-7 w-7 p-0 text-green-600 hover:text-green-700 hover:bg-green-50"
                              title="Save"
                            >
                              <Save className="w-3.5 h-3.5" />
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              type="button"
                              onClick={handleCancelEdit}
                              className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
                              title="Cancel"
                            >
                              <X className="w-3.5 h-3.5" />
                            </Button>
                          </>
                        ) : (
                          <>
                            <Button
                              size="sm"
                              variant="ghost"
                              type="button"
                              onClick={() => handleEditRow(rowIndex)}
                              className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
                              title="Edit"
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              type="button"
                              onClick={() => {
                                if (confirm('Delete this row?')) {
                                  handleDeleteRow(rowIndex)
                                }
                              }}
                              className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
                              title="Delete"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </Button>
                          </>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  )
}
