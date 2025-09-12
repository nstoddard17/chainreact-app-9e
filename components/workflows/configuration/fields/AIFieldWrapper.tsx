"use client"

import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Bot, X, Lock } from "lucide-react";
import { cn } from "@/lib/utils";
import { EnhancedTooltip } from "@/components/ui/enhanced-tooltip";
import { FieldRenderer } from "./FieldRenderer";

interface AIFieldWrapperProps {
  field: any;
  value: any;
  onChange: (value: any) => void;
  error?: string;
  workflowData?: any;
  currentNodeId?: string;
  dynamicOptions?: any;
  loadingDynamic?: boolean;
  nodeInfo?: any;
  onDynamicLoad?: any;
  parentValues?: any;
  isAIEnabled?: boolean;
  onAIToggle?: (fieldName: string, enabled: boolean) => void;
  isReadOnly?: boolean;
  isNonEditable?: boolean;
  setFieldValue?: (field: string, value: any) => void;
}

export function AIFieldWrapper({
  field,
  value,
  onChange,
  error,
  workflowData,
  currentNodeId,
  dynamicOptions,
  loadingDynamic,
  nodeInfo,
  onDynamicLoad,
  parentValues,
  isAIEnabled = false,
  onAIToggle,
  isReadOnly = false,
  isNonEditable = false,
  setFieldValue,
}: AIFieldWrapperProps) {
  // Initialize AI mode based on either the prop or if the value is an AI placeholder
  const [isAIMode, setIsAIMode] = useState(
    isAIEnabled || (typeof value === 'string' && value.startsWith('{{AI_FIELD:'))
  );
  
  // Check if field is the recordId field for update record
  const isRecordIdField = field.name === 'recordId' && nodeInfo?.type === 'airtable_action_update_record';
  
  // Check if field supports AI (all fields except recordId, and only if onAIToggle is provided)
  const supportsAI = !isRecordIdField && !isReadOnly && !isNonEditable && !!onAIToggle;
  
  console.log('🎯 [AIFieldWrapper] Rendering:', {
    fieldName: field.name,
    isAIEnabled,
    hasOnAIToggle: !!onAIToggle,
    isReadOnly,
    isNonEditable,
    supportsAI,
    willShowButton: supportsAI && !isAIMode,
    isAIMode
  });
  
  // Check if field is non-editable (computed fields, auto-number, etc.)
  const isLocked = isNonEditable || field.computed || field.autoNumber || field.formula;

  const handleAIToggle = () => {
    const newState = !isAIMode;
    setIsAIMode(newState);
    
    if (newState) {
      // Set the AI placeholder value
      onChange(`{{AI_FIELD:${field.name}}}`);
    } else {
      // Clear the value when disabling AI mode
      onChange('');
    }
    
    // Notify parent about AI state change
    if (onAIToggle) {
      onAIToggle(field.name, newState);
    }
  };

  return (
    <div className={cn(
      "relative",
      isLocked && "opacity-60"
    )}>
      <div className="flex items-start gap-2">
        <div className="flex-1">
          {isAIMode ? (
            // AI Mode Display - styled like the reference image
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium flex items-center gap-2">
                  {isLocked && <Lock className="h-3 w-3" />}
                  {field.label || field.name}
                  {field.required && <span className="text-red-500">*</span>}
                </label>
              </div>
              <div className="bg-gray-700 text-gray-300 rounded-md px-3 py-2 flex items-center gap-2">
                <Bot className="h-4 w-4 text-gray-400" />
                <span className="text-sm flex-1">
                  Defined automatically by the model
                </span>
                {supportsAI && (
                  <button
                    type="button"
                    onClick={handleAIToggle}
                    className="text-gray-400 hover:text-gray-200 transition-colors"
                  >
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>
              {field.description && (
                <p className="text-xs text-slate-500">{field.description}</p>
              )}
            </div>
          ) : (
            // Normal Field Display
            <div className="space-y-2">
              {/* Field Label */}
              <div className="flex items-center gap-2 mb-1">
                <label className="text-sm font-medium flex items-center gap-2">
                  {isLocked && (
                    <EnhancedTooltip content={
                      field.computed ? "This field is computed automatically" :
                      field.autoNumber ? "This field is auto-numbered" :
                      field.formula ? "This field is calculated by a formula" :
                      "This field cannot be edited"
                    }>
                      <Lock className="h-3 w-3" />
                    </EnhancedTooltip>
                  )}
                  {field.label || field.name}
                  {field.required && <span className="text-red-500">*</span>}
                </label>
                {supportsAI && (
                  <button
                    type="button"
                    onClick={handleAIToggle}
                    className="ml-auto p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded transition-all"
                    title="Use AI to fill this field"
                  >
                    <Bot className="h-4 w-4" />
                  </button>
                )}
              </div>
              
              {/* Field Renderer */}
              <div className={cn(isLocked && "pointer-events-none")}>
                <FieldRenderer
                  field={{
                    ...field,
                    readOnly: field.readOnly || isRecordIdField || isLocked,
                    disabled: isLocked
                  }}
                  value={value}
                  onChange={onChange}
                  error={error}
                  workflowData={workflowData}
                  currentNodeId={currentNodeId}
                  dynamicOptions={dynamicOptions}
                  loadingDynamic={loadingDynamic}
                  nodeInfo={nodeInfo}
                  onDynamicLoad={onDynamicLoad}
                  parentValues={parentValues}
                  setFieldValue={setFieldValue}
                />
              </div>
            </div>
          )}
        </div>
      </div>
      
      {/* Error Display */}
      {error && (
        <p className="text-xs text-red-500 mt-1">{error}</p>
      )}
    </div>
  );
}