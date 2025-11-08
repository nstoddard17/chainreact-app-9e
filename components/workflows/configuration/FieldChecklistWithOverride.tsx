"use client"

import React, { useState, useCallback, useMemo } from 'react';
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { Lock, Unlock } from "lucide-react";
import { logger } from '@/lib/utils/logger';

interface FieldChecklistItem {
  name: string;
  label: string;
  value: any;
  type: string; // Airtable field type
  enabled: boolean; // Is this field checked to be copied?
  override: boolean; // Is override enabled for this field?
  overrideValue?: any; // The overridden value (if override is true)
}

interface FieldChecklistWithOverrideProps {
  fields: FieldChecklistItem[];
  onChange: (fields: FieldChecklistItem[]) => void;
  disabled?: boolean;
}

/**
 * Component for selecting fields to duplicate and optionally overriding their values
 * Used in Airtable duplicate record action
 */
export function FieldChecklistWithOverride({
  fields,
  onChange,
  disabled = false
}: FieldChecklistWithOverrideProps) {

  // Select/Deselect All handlers
  const handleSelectAll = useCallback(() => {
    const updated = fields.map(field => ({ ...field, enabled: true }));
    onChange(updated);
  }, [fields, onChange]);

  const handleDeselectAll = useCallback(() => {
    const updated = fields.map(field => ({
      ...field,
      enabled: false,
      override: false, // Reset override when deselecting
      overrideValue: undefined
    }));
    onChange(updated);
  }, [fields, onChange]);

  // Toggle field enabled/disabled
  const handleToggleField = useCallback((fieldName: string) => {
    const updated = fields.map(field => {
      if (field.name === fieldName) {
        // If disabling field, also reset override
        if (field.enabled) {
          return { ...field, enabled: false, override: false, overrideValue: undefined };
        }
        return { ...field, enabled: true };
      }
      return field;
    });
    onChange(updated);
  }, [fields, onChange]);

  // Toggle override for a field
  const handleToggleOverride = useCallback((fieldName: string) => {
    const updated = fields.map(field => {
      if (field.name === fieldName && field.enabled) {
        // When enabling override, initialize with current value
        if (!field.override) {
          return {
            ...field,
            override: true,
            overrideValue: field.value // Initialize with current value
          };
        }
        // When disabling override, clear override value
        return { ...field, override: false, overrideValue: undefined };
      }
      return field;
    });
    onChange(updated);
  }, [fields, onChange]);

  // Update override value
  const handleOverrideValueChange = useCallback((fieldName: string, newValue: any) => {
    const updated = fields.map(field => {
      if (field.name === fieldName) {
        return { ...field, overrideValue: newValue };
      }
      return field;
    });
    onChange(updated);
  }, [fields, onChange]);

  // Render value display (read-only) or input (if override enabled)
  const renderFieldValue = useCallback((field: FieldChecklistItem) => {
    const isReadOnly = !field.override;

    // Format display value
    const displayValue = useMemo(() => {
      const val = field.override ? field.overrideValue : field.value;

      if (val === null || val === undefined) return '(empty)';
      if (Array.isArray(val)) {
        if (val.length === 0) return '(empty array)';
        // For arrays, show comma-separated values
        return val.map(v => {
          if (typeof v === 'object' && v !== null) {
            return v.name || v.label || v.id || JSON.stringify(v);
          }
          return String(v);
        }).join(', ');
      }
      if (typeof val === 'object' && val !== null) {
        return val.name || val.label || JSON.stringify(val);
      }
      if (typeof val === 'boolean') return val ? 'True' : 'False';
      return String(val);
    }, [field.override, field.overrideValue, field.value]);

    // Read-only display
    if (isReadOnly) {
      return (
        <div className="px-3 py-2 text-sm bg-gray-50 border border-gray-300 rounded-md text-gray-700 truncate">
          {displayValue}
        </div>
      );
    }

    // Editable input (override mode)
    // For simplicity, we'll use text inputs for all types
    // In a more complex implementation, you'd use appropriate inputs per type
    const currentValue = field.overrideValue ?? field.value ?? '';

    // Handle multiline text
    if (field.type === 'multilineText' || (typeof currentValue === 'string' && currentValue.length > 50)) {
      return (
        <Textarea
          value={String(currentValue)}
          onChange={(e) => handleOverrideValueChange(field.name, e.target.value)}
          className="min-h-[80px] text-sm"
          placeholder="Enter new value..."
          disabled={disabled}
        />
      );
    }

    // Regular text input
    return (
      <Input
        type="text"
        value={String(currentValue)}
        onChange={(e) => handleOverrideValueChange(field.name, e.target.value)}
        className="text-sm"
        placeholder="Enter new value..."
        disabled={disabled}
      />
    );
  }, [disabled, handleOverrideValueChange]);

  // Check if any fields are enabled
  const hasEnabledFields = useMemo(() =>
    fields.some(f => f.enabled),
    [fields]
  );

  const allEnabled = useMemo(() =>
    fields.length > 0 && fields.every(f => f.enabled),
    [fields]
  );

  if (fields.length === 0) {
    return (
      <div className="p-4 text-center text-sm text-gray-600">
        No fields available. Select a record first.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Select All / Deselect All buttons */}
      <div className="flex items-center gap-2 pb-2 border-b border-gray-300">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={handleSelectAll}
          disabled={disabled || allEnabled}
          className="text-xs"
        >
          Select All
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={handleDeselectAll}
          disabled={disabled || !hasEnabledFields}
          className="text-xs"
        >
          Deselect All
        </Button>
        <span className="text-xs text-gray-600 ml-auto">
          {fields.filter(f => f.enabled).length} of {fields.length} fields selected
        </span>
      </div>

      {/* Field List */}
      <div className="space-y-2">
        {fields.map((field) => (
          <div
            key={field.name}
            className={cn(
              "p-2.5 rounded-lg border transition-colors",
              field.enabled
                ? "bg-white border-gray-300"
                : "bg-gray-50 border-gray-200"
            )}
          >
            <div className="flex gap-2.5">
              {/* Checkbox to enable/disable field */}
              <Checkbox
                id={`field-${field.name}`}
                checked={field.enabled}
                onCheckedChange={() => handleToggleField(field.name)}
                disabled={disabled}
                className="flex-shrink-0 mt-px"
              />

              {/* Field info and value */}
              <div className="flex-1 min-w-0 space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <Label
                    htmlFor={`field-${field.name}`}
                    className={cn(
                      "text-sm font-medium cursor-pointer",
                      field.enabled ? "text-gray-900" : "text-gray-500"
                    )}
                  >
                    {field.label}
                  </Label>

                  {/* Override toggle button */}
                  <Button
                    type="button"
                    variant={field.override ? "default" : "ghost"}
                    size="sm"
                    onClick={() => handleToggleOverride(field.name)}
                    disabled={disabled || !field.enabled}
                    className={cn(
                      "h-7 px-2 text-xs gap-1",
                      field.override && "bg-blue-600 hover:bg-blue-700"
                    )}
                    title={field.override ? "Disable override" : "Enable override to change this value"}
                  >
                    {field.override ? (
                      <>
                        <Unlock className="h-3 w-3" />
                        Override
                      </>
                    ) : (
                      <>
                        <Lock className="h-3 w-3" />
                        Override
                      </>
                    )}
                  </Button>
                </div>

                {/* Value display/input */}
                {renderFieldValue(field)}

                {/* Show help text for override mode */}
                {field.override && field.enabled && (
                  <p className="text-xs text-blue-600 mt-1">
                    This value will replace the original value in the duplicate
                  </p>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Summary */}
      {hasEnabledFields && (
        <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg text-xs text-gray-700">
          <strong className="text-gray-900">Summary:</strong>
          <ul className="mt-1 space-y-1 ml-4 list-disc">
            <li>{fields.filter(f => f.enabled).length} fields will be copied</li>
            <li>{fields.filter(f => f.enabled && f.override).length} fields will be overridden with new values</li>
          </ul>
        </div>
      )}
    </div>
  );
}
