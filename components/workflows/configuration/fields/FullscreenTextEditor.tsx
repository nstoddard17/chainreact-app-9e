"use client"

import React, { useState, useEffect, useRef, useCallback } from "react";
import { Dialog, DialogContentWithoutClose, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Maximize2, X, Save, Bot } from "lucide-react";
import { cn } from "@/lib/utils";
import { useVariableDropTarget } from "../hooks/useVariableDropTarget";
import { insertVariableIntoTextInput, normalizeDraggedVariable } from "@/lib/workflows/variableInsertion";

interface FullscreenTextEditorProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  title?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function FullscreenTextEditor({
  value,
  onChange,
  placeholder,
  title = "Edit Content",
  open,
  onOpenChange,
}: FullscreenTextEditorProps) {
  const [localValue, setLocalValue] = useState(value || "");
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  const handleVariableInsert = useCallback((rawVariable: string) => {
    if (!textareaRef.current) return;

    const variableText = normalizeDraggedVariable(rawVariable);
    if (!variableText) return;

    const textarea = textareaRef.current;
    const start = textarea.selectionStart ?? localValue.length;
    const end = textarea.selectionEnd ?? start;

    const newValue =
      localValue.slice(0, start) +
      variableText +
      localValue.slice(end);

    setLocalValue(newValue);

    queueMicrotask(() => {
      try {
        const cursorPosition = start + variableText.length;
        textarea.focus();
        textarea.setSelectionRange(cursorPosition, cursorPosition);
      } catch {
        /* focus best-effort */
      }
    });
  }, [localValue]);

  const { eventHandlers: dropHandlers, isDragOver } = useVariableDropTarget({
    fieldId: "fullscreen-editor",
    fieldLabel: title,
    elementRef: textareaRef,
    onInsert: handleVariableInsert,
  });

  // Update local value when prop changes
  useEffect(() => {
    setLocalValue(value || "");
  }, [value]);

  const handleSave = () => {
    onChange(localValue);
    onOpenChange(false);
  };

  const handleCancel = () => {
    setLocalValue(value || ""); // Reset to original value
    onOpenChange(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    // Save on Ctrl/Cmd + Enter
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      handleSave();
    }
    // Cancel on Escape
    if (e.key === 'Escape') {
      e.preventDefault();
      handleCancel();
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContentWithoutClose className="max-w-[90vw] w-full h-[85vh] flex flex-col p-0">
        <DialogHeader className="px-6 py-4 border-b">
          <DialogTitle className="flex items-center justify-between">
            <span>{title}</span>
            <Button
              variant="ghost"
              size="icon"
              onClick={handleCancel}
              className="h-8 w-8"
            >
              <X className="h-4 w-4" />
            </Button>
          </DialogTitle>
        </DialogHeader>
        
        <div className="flex-1 px-6 py-4 overflow-hidden">
          <Textarea
            ref={textareaRef}
            value={localValue}
            onChange={(e) => setLocalValue(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            onFocus={dropHandlers.onFocus}
            onBlur={dropHandlers.onBlur}
            onDragOver={dropHandlers.onDragOver}
            onDragLeave={dropHandlers.onDragLeave}
            onDrop={dropHandlers.onDrop}
            className={cn(
              "w-full h-full resize-none font-mono text-sm",
              isDragOver && "ring-2 ring-blue-500 ring-offset-1"
            )}
            style={{ minHeight: "100%" }}
            autoFocus
          />
        </div>

        <DialogFooter className="px-6 py-4 border-t">
          <div className="flex items-center justify-between w-full">
            <span className="text-xs text-muted-foreground">
              Press Ctrl+Enter to save, Esc to cancel
            </span>
            <div className="flex gap-2">
              <Button variant="outline" onClick={handleCancel}>
                Cancel
              </Button>
              <Button onClick={handleSave} className="gap-2">
                <Save className="h-4 w-4" />
                Save Changes
              </Button>
            </div>
          </div>
        </DialogFooter>
      </DialogContentWithoutClose>
    </Dialog>
  );
}

interface FullscreenTextAreaProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  error?: boolean;
  rows?: number;
  fieldLabel?: string;
  disabled?: boolean;
  showPlaceholderOverlay?: boolean;
  placeholderOverlayLabel?: string;
  onPlaceholderClear?: () => void;
}

export function FullscreenTextArea({
  value,
  onChange,
  placeholder,
  className,
  error,
  rows = 6,
  fieldLabel = "Content",
  disabled = false,
  showPlaceholderOverlay = false,
  placeholderOverlayLabel = "Defined by the model",
  onPlaceholderClear,
}: FullscreenTextAreaProps) {
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [localValue, setLocalValue] = useState(value || "");
  const timeoutRef = useRef<NodeJS.Timeout>();
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Update local value when prop changes
  useEffect(() => {
    setLocalValue(value || "");
  }, [value]);

  // Debounced change handler to prevent cursor jumping
  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newValue = e.target.value;
    setLocalValue(newValue);
    
    // Clear existing timeout
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    
    // Debounce the onChange call to parent
    timeoutRef.current = setTimeout(() => {
      onChange(newValue);
    }, 300); // 300ms debounce
  };

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  const showOverlay = showPlaceholderOverlay && !disabled;

  const handleClearPlaceholder = () => {
    if (showOverlay) {
      setLocalValue("");
      onPlaceholderClear?.();
      requestAnimationFrame(() => {
        textareaRef.current?.focus();
      });
    }
  };

  const handleVariableInsert = useCallback((rawVariable: string) => {
    if (!textareaRef.current) return;

    const variableText = normalizeDraggedVariable(rawVariable);
    if (!variableText) return;

    const textarea = textareaRef.current;
    const start = textarea.selectionStart ?? localValue.length;
    const end = textarea.selectionEnd ?? start;

    const newValue =
      localValue.slice(0, start) +
      variableText +
      localValue.slice(end);

    setLocalValue(newValue);

    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    onChange(newValue);

    queueMicrotask(() => {
      try {
        const cursorPosition = start + variableText.length;
        textarea.focus();
        textarea.setSelectionRange(cursorPosition, cursorPosition);
      } catch {
        /* focus best-effort */
      }
    });
  }, [localValue, onChange]);

  const { eventHandlers: dropHandlers, isDragOver } = useVariableDropTarget({
    fieldId: fieldLabel || "fullscreen-text-area",
    fieldLabel: fieldLabel || "Content",
    elementRef: textareaRef,
    onInsert: handleVariableInsert,
  });

  return (
    <>
      <div className="relative">
        <Textarea
          ref={textareaRef}
          value={localValue}
          onChange={handleChange}
          placeholder={placeholder}
          onFocus={dropHandlers.onFocus}
          onBlur={dropHandlers.onBlur}
          onDragOver={dropHandlers.onDragOver}
          onDragLeave={dropHandlers.onDragLeave}
          onDrop={dropHandlers.onDrop}
          className={cn(
            "min-h-[120px] resize-y",
            !disabled && "pr-10",
            error && "border-red-500",
            disabled && "bg-muted cursor-not-allowed opacity-75",
            showOverlay && "opacity-0 pointer-events-none select-none",
            isDragOver && "ring-2 ring-blue-500 ring-offset-1",
            className
          )}
          rows={rows}
          disabled={disabled}
          readOnly={disabled || showOverlay}
        />
        {!disabled && !showOverlay && (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="absolute top-2 right-2 h-8 w-8"
            onClick={() => setIsFullscreen(true)}
            title="Expand to fullscreen"
          >
            <Maximize2 className="h-4 w-4" />
          </Button>
        )}
        {showOverlay && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-between rounded-md bg-muted/80 text-muted-foreground px-3">
            <div className="flex items-center gap-2 text-sm">
              <Bot className="h-4 w-4" />
              <span>{placeholderOverlayLabel}</span>
            </div>
            <button
              type="button"
              onClick={handleClearPlaceholder}
              className="pointer-events-auto text-muted-foreground hover:text-foreground transition-colors"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        )}
      </div>
      
      <FullscreenTextEditor
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        title={`Edit ${fieldLabel}`}
        open={isFullscreen}
        onOpenChange={setIsFullscreen}
      />
    </>
  );
}
