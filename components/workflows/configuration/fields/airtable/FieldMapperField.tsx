"use client"

import React, { useState, useCallback, useEffect, useMemo } from 'react';
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowRight, Wand2 } from "lucide-react";
import { cn } from "@/lib/utils";

const SKIP_FIELD_OPTION = "__chainreact_internal__skip_field__";

interface FieldMappingFieldProps {
  value: any;
  onChange: (value: any) => void;
  field: any;
  airtableTableSchema?: any;
  parentValues?: Record<string, any>;
  workflowData?: any;
  currentNodeId?: string;
}

export function FieldMapperField({
  value,
  onChange,
  field,
  airtableTableSchema,
  parentValues,
  workflowData,
  currentNodeId
}: FieldMappingFieldProps) {
  // Parse value - should be an object mapping source fields to target fields
  // Format: { "sourceField1": "targetField1", "sourceField2": "targetField2" }
  const mappings = typeof value === 'object' && value !== null ? value : {};

  // Get source fields from the sourceArray
  const sourceFields = useMemo(() => {
    const sourceArray = parentValues?.sourceArray;
    if (!sourceArray) return [];

    // Try to extract field names from the merge field syntax
    // e.g., "{{step1.records}}" -> try to find the output schema for step1
    const mergeFieldMatch = sourceArray.match(/\{\{([^}]+)\}\}/);
    if (mergeFieldMatch) {
      const path = mergeFieldMatch[1]; // e.g., "step1.records"
      const [nodeId, ...rest] = path.split('.');

      // Try to find the node in workflow
      const node = workflowData?.nodes?.find((n: any) => n.id === nodeId);
      if (node?.data?.outputSchema) {
        // If it's an array field, return its item properties
        const fieldPath = rest.join('.');
        const outputField = node.data.outputSchema.find((f: any) => f.name === fieldPath);

        if (outputField?.type === 'array' && outputField?.itemSchema) {
          return outputField.itemSchema.map((f: any) => ({
            name: f.name,
            label: f.label || f.name,
            type: f.type
          }));
        }

        // Otherwise return all output fields
        return node.data.outputSchema.map((f: any) => ({
          name: f.name,
          label: f.label || f.name,
          type: f.type
        }));
      }
    }

    // Fallback: return empty array with a note
    return [];
  }, [parentValues?.sourceArray, workflowData, currentNodeId]);

  // Get target fields (Airtable fields)
  const targetFields = useMemo(() => {
    if (!airtableTableSchema?.fields) return [];

    return airtableTableSchema.fields
      .filter((f: any) => {
        // Filter out computed/read-only fields
        const readOnlyTypes = ['formula', 'rollup', 'createdTime', 'lastModifiedTime', 'createdBy', 'lastModifiedBy', 'autoNumber'];
        return !readOnlyTypes.includes(f.type);
      })
      .map((f: any) => ({
        id: f.id,
        name: f.name,
        type: f.type
      }));
  }, [airtableTableSchema]);

  // Auto-map fields with matching names
  const handleAutoMap = useCallback(() => {
    const newMappings: Record<string, string> = {};

    sourceFields.forEach(sourceField => {
      const matchingTarget = targetFields.find(
        targetField => targetField.name.toLowerCase() === sourceField.name.toLowerCase()
      );

      if (matchingTarget) {
        newMappings[sourceField.name] = matchingTarget.name;
      }
    });

    onChange({ ...mappings, ...newMappings });
  }, [sourceFields, targetFields, mappings, onChange]);

  // Update a single mapping
  const handleMappingChange = useCallback((sourceField: string, targetField: string | null) => {
    const newMappings = { ...mappings };

    if (targetField === null || targetField === '') {
      delete newMappings[sourceField];
    } else {
      newMappings[sourceField] = targetField;
    }

    onChange(newMappings);
  }, [mappings, onChange]);

  if (sourceFields.length === 0) {
    return (
      <div className="p-4 border border-dashed rounded-md text-center space-y-2">
        <p className="text-sm text-muted-foreground">
          No source fields detected
        </p>
        <p className="text-xs text-muted-foreground">
          Make sure you've selected a source array from a previous step
        </p>
      </div>
    );
  }

  if (targetFields.length === 0) {
    return (
      <div className="p-4 border border-dashed rounded-md text-center text-sm text-muted-foreground">
        No editable fields found in the selected table
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Map {sourceFields.length} source fields to Airtable
        </p>
        {field.metadata?.allowAutoMap !== false && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleAutoMap}
          >
            <Wand2 className="h-4 w-4 mr-2" />
            Auto-Map Matching Fields
          </Button>
        )}
      </div>

      <div className="space-y-3">
        {sourceFields.map((sourceField: any, index: number) => (
          <div
            key={sourceField.name}
            className="flex items-center gap-3 p-3 border rounded-lg bg-card"
          >
            {/* Source field (read-only) */}
            <div className="flex-1">
              <div className="text-sm font-medium">{sourceField.label}</div>
              <div className="text-xs text-muted-foreground">{sourceField.type}</div>
            </div>

            {/* Arrow */}
            <ArrowRight className="h-4 w-4 text-muted-foreground flex-shrink-0" />

            {/* Target field (select) */}
            <div className="flex-1">
              <Select
                value={
                  mappings[sourceField.name] && mappings[sourceField.name] !== ''
                    ? mappings[sourceField.name]
                    : SKIP_FIELD_OPTION
                }
                onValueChange={(value) =>
                  handleMappingChange(
                    sourceField.name,
                    value === SKIP_FIELD_OPTION ? '' : value
                  )
                }
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select Airtable field..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={SKIP_FIELD_OPTION}>-- Skip this field --</SelectItem>
                  {targetFields.map((targetField: any) => (
                    <SelectItem key={targetField.id} value={targetField.name}>
                      {targetField.name}
                      <span className="text-xs text-muted-foreground ml-2">
                        ({targetField.type})
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        ))}
      </div>

      <div className="text-xs text-muted-foreground space-y-1">
        <p>• Mapped fields will be used to create records in Airtable</p>
        <p>• Unmapped fields will be skipped</p>
        <p>• Each item in your source array will create one record</p>
      </div>
    </div>
  );
}
