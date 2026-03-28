"use client"

import React, { useCallback, useState } from "react";
import { Bot, X, Lock, Link2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { FieldRenderer } from "./FieldRenderer";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

import { logger } from '@/lib/utils/logger'

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
  const [showDisableConfirm, setShowDisableConfirm] = useState(false);
  
  // Check if field is the recordId field for update record
  const isRecordIdField = field.name === 'recordId' && nodeInfo?.type === 'airtable_action_update_record';

  // Check if field supports AI:
  // 1. Must have field.supportsAI explicitly set to true in schema, OR
  // 2. Legacy fallback: all fields except recordId (for backwards compatibility)
  // Also requires: not readonly, not non-editable, and onAIToggle callback provided
  const supportsAI = !isRecordIdField && !isReadOnly && !isNonEditable && !!onAIToggle &&
    (field.supportsAI === true || field.supportsAI === undefined); // undefined = legacy behavior

  logger.info('🎯 [AIFieldWrapper] Rendering:', {
    fieldName: field.name,
    fieldSupportsAI: field.supportsAI,
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

  // Determine field mode for badge display
  const fieldMode: 'fixed' | 'mapped' | 'ai-generated' = (() => {
    if (typeof value === 'string' && value.startsWith('{{AI_FIELD:')) return 'ai-generated';
    if (typeof value === 'string' && value.includes('{{') && value.includes('}}')) return 'mapped';
    return 'fixed';
  })();

  const enableAIMode = useCallback(() => {
    setIsAIMode(true);
    if (!(typeof value === 'string' && value.startsWith('{{AI_FIELD:'))) {
      onChange(`{{AI_FIELD:${field.name}}}`);
    }
    onAIToggle?.(field.name, true);
  }, [field.name, onAIToggle, onChange, value]);

  const disableAIMode = useCallback(() => {
    setIsAIMode(false);
    onChange('');
    onAIToggle?.(field.name, false);
  }, [field.name, onAIToggle, onChange]);

  const handleAIToggle = () => {
    if (isLocked) return;
    if (isAIMode) {
      setShowDisableConfirm(true);
    } else {
      enableAIMode();
    }
  };

  // Render field mode badge + AI toggle button (to be passed to FieldRenderer)
  const fieldModeBadge = !isAIMode && fieldMode === 'mapped' ? (
    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-medium rounded bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-300" title="Mapped from workflow data">
      <Link2 className="h-3 w-3" />
      Mapped
    </span>
  ) : null;

  const aiToggleButtonElement = supportsAI ? (
    <div className="flex items-center gap-1">
      {fieldModeBadge}
      <button
        type="button"
        onClick={handleAIToggle}
        className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded transition-all"
        title="Use AI to fill this field"
      >
        <Bot className="h-4 w-4" />
      </button>
    </div>
  ) : fieldModeBadge;

  return (
    <div className={cn(
      "relative",
      isLocked && "opacity-60"
    )}>
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
            <Bot className="h-4 w-4 text-purple-400" />
            <span className="text-sm flex-1 flex items-center gap-2">
              AI-Generated at runtime
              <span className="inline-flex items-center px-1.5 py-0.5 text-[10px] font-medium rounded bg-purple-500/20 text-purple-300">
                AI
              </span>
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
          {/* Error Display */}
          {error && (
            <p className="text-xs text-red-500 mt-1">{error}</p>
          )}
        </div>
      ) : (
        // Normal Field Display - let FieldRenderer handle everything including label
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
            aiToggleButton={aiToggleButtonElement}
          />
        </div>
      )}

      <AlertDialog open={showDisableConfirm} onOpenChange={setShowDisableConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Disable AI-generated value?</AlertDialogTitle>
            <AlertDialogDescription>
              This field is currently filled automatically by the AI step. If you remove the AI reference,
              the workflow will stop generating this value and you&apos;ll need to supply it manually.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep AI Value</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                disableAIMode();
                setShowDisableConfirm(false);
              }}
            >
              Remove AI Value
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
