"use client"

import React, { useState, useCallback, useMemo } from 'react';
import { Button } from "@/components/ui/button";
import { Plus, Trash2, ChevronDown, ChevronRight } from "lucide-react";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion"
import { FieldRenderer } from '../FieldRenderer';
import { cn } from "@/lib/utils";
import { LoadingFieldState } from '../shared/LoadingFieldState';

interface MultipleRecordsFieldProps {
  value: any;
  onChange: (value: any) => void;
  field: any;
  nodeInfo: any;
  workflowData?: any;
  currentNodeId?: string;
  dynamicOptions: Record<string, any[]>;
  loadingFields?: Set<string>;
  loadOptions: (fieldName: string, parentField?: string, parentValue?: any, forceReload?: boolean) => Promise<void>;
  parentValues: Record<string, any>;
  aiFields?: Record<string, boolean>;
  setAiFields?: (fields: Record<string, boolean>) => void;
  airtableTableSchema?: any;
}

export function MultipleRecordsField({
  value,
  onChange,
  field,
  nodeInfo,
  workflowData,
  currentNodeId,
  dynamicOptions,
  loadingFields,
  loadOptions,
  parentValues,
  aiFields = {},
  setAiFields = () => {},
  airtableTableSchema,
}: MultipleRecordsFieldProps) {
  // Parse value - should be an array of record objects
  const records = Array.isArray(value) ? value : (value ? [value] : [{}]);

  const [openItems, setOpenItems] = useState<string[]>(['record-0']);
  const maxRecords = field.metadata?.maxRecords || 10;

  // Get editable fields from Airtable table schema - memoize to prevent unnecessary recalculations
  const editableFields = useMemo(() => {
    if (!airtableTableSchema?.fields) return [];

    const fields = airtableTableSchema.fields.filter((f: any) => {
      // Filter out computed/read-only fields
      const readOnlyTypes = ['formula', 'rollup', 'createdTime', 'lastModifiedTime', 'createdBy', 'lastModifiedBy', 'autoNumber'];
      return !readOnlyTypes.includes(f.type);
    });

    return fields;
  }, [airtableTableSchema, parentValues?.tableName]);

  // Add a new record
  const handleAddRecord = useCallback(() => {
    if (records.length >= maxRecords) {
      return;
    }

    const newRecord = {};
    const newRecords = [...records, newRecord];
    onChange(newRecords);

    // Open the newly added record and scroll to show it at the top
    setTimeout(() => {
      setOpenItems([`record-${newRecords.length - 1}`]);

      // Wait for the accordion to expand, then scroll the new record into view
      requestAnimationFrame(() => {
        const newRecordElement = document.querySelector(`[value="record-${newRecords.length - 1}"]`);

        if (newRecordElement) {
          // Scroll so the new record's header is at the top of the viewport
          newRecordElement.scrollIntoView({
            behavior: 'smooth',
            block: 'start',
            inline: 'nearest'
          });
        }
      });
    }, 0);
  }, [records, maxRecords, onChange]);

  // Remove a record
  const handleRemoveRecord = useCallback((index: number) => {
    const newRecords = records.filter((_: any, i: number) => i !== index);
    onChange(newRecords.length > 0 ? newRecords : [{}]);

    // Update open items after removal
    setOpenItems(prev => prev.filter(item => item !== `record-${index}`));
  }, [records, onChange]);

  // Update a field in a specific record
  const handleFieldChange = useCallback((recordIndex: number, fieldName: string, fieldValue: any) => {
    const newRecords = [...records];
    newRecords[recordIndex] = {
      ...newRecords[recordIndex],
      [fieldName]: fieldValue
    };
    onChange(newRecords);
  }, [records, onChange]);

  // Get record summary for the accordion trigger
  const getRecordSummary = useCallback((record: any, index: number) => {
    const filledFields = Object.keys(record).filter(key => {
      const value = record[key];
      return value !== null && value !== undefined && value !== '';
    });

    if (filledFields.length === 0) {
      return "Empty record";
    }

    // Show first non-empty value as preview
    const firstField = filledFields[0];
    const firstValue = String(record[firstField]).slice(0, 30);

    return `${filledFields.length} field${filledFields.length !== 1 ? 's' : ''} filled${firstValue ? `: ${firstValue}...` : ''}`;
  }, []);

  // Check if we have schema and fields - use conditional rendering instead of early return
  const hasSchemaAndFields = !!(airtableTableSchema && editableFields.length > 0);
  const hasTableSelected = !!parentValues?.tableName;
  const isLoading = hasTableSelected && !airtableTableSchema;

  return (
    <div className="space-y-4">
      {isLoading ? (
        <div className="p-4 border border-dashed rounded-md flex justify-center">
          <LoadingFieldState message="Loading table schema..." />
        </div>
      ) : !hasSchemaAndFields ? (
        <div className="p-4 border border-dashed rounded-md text-center text-sm text-muted-foreground">
          {hasTableSelected ? 'No editable fields found in this table' : 'Select a table first to see available fields'}
        </div>
      ) : (
        <>
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {records.length} of {maxRecords} records
        </p>
      </div>

      <Accordion
        type="multiple"
        value={openItems}
        onValueChange={setOpenItems}
        className="space-y-2"
      >
        {records.map((record: any, index: number) => (
          <AccordionItem
            key={`record-${index}`}
            value={`record-${index}`}
            className="border rounded-lg overflow-hidden"
          >
            <AccordionTrigger className="px-4 py-3 hover:bg-muted/50">
              <div className="flex items-center justify-between w-full">
                <div className="flex items-center gap-3">
                  <span className="font-medium">Record {index + 1}</span>
                  <span className="text-sm text-muted-foreground">
                    {getRecordSummary(record, index)}
                  </span>
                </div>
                {records.length > 1 && (
                  <div
                    role="button"
                    tabIndex={0}
                    onClick={(e) => {
                      e.stopPropagation();
                      handleRemoveRecord(index);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        e.stopPropagation();
                        handleRemoveRecord(index);
                      }
                    }}
                    className="inline-flex items-center justify-center h-8 w-8 rounded-md hover:bg-destructive hover:text-destructive-foreground transition-colors cursor-pointer"
                  >
                    <Trash2 className="h-4 w-4" />
                  </div>
                )}
              </div>
            </AccordionTrigger>
            <AccordionContent className="px-4 pb-4 pt-2">
              <div className="space-y-4">
                {editableFields.map((airtableField: any) => {
                  // Convert Airtable field to config field format
                  const fieldType = getFieldType(airtableField.type);
                  const fieldName = `airtable_field_${airtableField.name}`;

                  // Determine if field should load dynamic options
                  const needsDynamicOptions = [
                    'multipleRecordLinks',
                    'multipleCollaborators',
                    'singleCollaborator',
                    'singleSelect',
                    'multipleSelects'
                  ].includes(airtableField.type);

                  const configField = {
                    name: fieldName,
                    label: airtableField.name,
                    type: fieldType,
                    required: false,
                    description: airtableField.description,
                    dynamic: needsDynamicOptions,
                    airtableFieldType: airtableField.type,
                    airtableFieldId: airtableField.id,
                    // DON'T set static options if we're loading them dynamically
                    // This was causing field.options to take precedence over dynamicOptions in FieldRenderer
                    options: needsDynamicOptions ? undefined : airtableField.options?.choices?.map((choice: any) => ({
                      value: choice.name,
                      label: choice.name
                    })),
                    // Allow creating new values for select fields (even when dynamic)
                    creatable: ['singleSelect', 'multipleSelects'].includes(airtableField.type)
                  };

                  // Debug logging to see what options are available
                  console.log(`[MultipleRecordsField] Field: ${fieldName}`, {
                    fieldType: airtableField.type,
                    needsDynamicOptions,
                    hasOptionsInDynamicOptions: !!dynamicOptions[fieldName],
                    optionsCount: dynamicOptions[fieldName]?.length || 0,
                    allDynamicOptionsKeys: Object.keys(dynamicOptions)
                  });

                  return (
                    <FieldRenderer
                      key={`${index}-${airtableField.id}`}
                      field={configField}
                      value={record[airtableField.name]}
                      onChange={(newValue) => handleFieldChange(index, airtableField.name, newValue)}
                      error={undefined}
                      onDynamicLoad={loadOptions}
                      dynamicOptions={dynamicOptions}
                      parentValues={parentValues}
                      nodeInfo={nodeInfo}
                      workflowData={workflowData}
                      currentNodeId={currentNodeId}
                      aiFields={aiFields}
                      setAiFields={setAiFields}
                      loadingFields={loadingFields}
                    />
                  );
                })}
              </div>
            </AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>

      {records.length < maxRecords && (
        <Button
          type="button"
          variant="outline"
          onClick={handleAddRecord}
          className="w-full"
        >
          <Plus className="h-4 w-4 mr-2" />
          {field.metadata?.addButtonText || "Add Another Record"}
        </Button>
      )}

      {records.length >= maxRecords && (
        <p className="text-sm text-muted-foreground text-center">
          Maximum of {maxRecords} records reached
        </p>
      )}
        </>
      )}
    </div>
  );
}

// Helper function to map Airtable field types to config field types
function getFieldType(airtableType: string): string {
  const typeMap: Record<string, string> = {
    'singleLineText': 'text',
    'multilineText': 'textarea',
    'email': 'email',
    'url': 'text',
    'number': 'number',
    'currency': 'number',
    'percent': 'number',
    'singleSelect': 'select',
    'multipleSelects': 'multi_select', // FIXED: Use underscore to route through GenericSelectField
    'date': 'date',
    'dateTime': 'datetime',
    'checkbox': 'boolean',
    'phoneNumber': 'text',
    'rating': 'number',
    'duration': 'number',
    'multipleRecordLinks': 'multi_select', // FIXED: Use underscore to route through GenericSelectField
    'singleCollaborator': 'text',
    'multipleCollaborators': 'text',
    'richText': 'textarea',
    'barcode': 'text',
    'button': 'text',
  };

  return typeMap[airtableType] || 'text';
}
