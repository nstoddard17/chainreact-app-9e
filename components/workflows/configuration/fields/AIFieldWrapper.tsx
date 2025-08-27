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
  isAIEnabled?: boolean;
  onAIToggle?: (fieldName: string, enabled: boolean) => void;
  isReadOnly?: boolean;
  isNonEditable?: boolean;
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
  isAIEnabled = false,
  onAIToggle,
  isReadOnly = false,
  isNonEditable = false,
}: AIFieldWrapperProps) {
  const [isAIMode, setIsAIMode] = useState(isAIEnabled);
  
  // Check if field is the recordId field for update record
  const isRecordIdField = field.name === 'recordId' && nodeInfo?.type === 'airtable_action_update_record';
  
  // Check if field supports AI (all fields except recordId)
  const supportsAI = !isRecordIdField && !isReadOnly && !isNonEditable;
  
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
            // AI Mode Display
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium flex items-center gap-2">
                  {isLocked && <Lock className="h-3 w-3" />}
                  {field.label || field.name}
                  {field.required && <span className="text-red-500">*</span>}
                </label>
                {supportsAI && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={handleAIToggle}
                    className="h-6 px-2 hover:bg-red-50 hover:text-red-600"
                  >
                    <X className="h-3 w-3 mr-1" />
                    Cancel AI
                  </Button>
                )}
              </div>
              <div className="bg-blue-50 border border-blue-200 rounded-md p-3 flex items-center gap-2">
                <Bot className="h-4 w-4 text-blue-600" />
                <span className="text-sm text-blue-700 font-medium">
                  Defined automatically by AI
                </span>
              </div>
              {field.description && (
                <p className="text-xs text-slate-500">{field.description}</p>
              )}
            </div>
          ) : (
            // Normal Field Display
            <div className="space-y-2">
              {/* Field Label with AI Button */}
              <div className="flex items-center justify-between">
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
                  <EnhancedTooltip content="Let AI define this value">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={handleAIToggle}
                      className="h-6 w-6 p-0 hover:bg-blue-50 hover:text-blue-600"
                    >
                      <Bot className="h-4 w-4" />
                    </Button>
                  </EnhancedTooltip>
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