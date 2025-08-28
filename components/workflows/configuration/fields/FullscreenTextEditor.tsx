"use client"

import React, { useState, useEffect } from "react";
import { Dialog, DialogContentWithoutClose, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Maximize2, X, Save } from "lucide-react";
import { cn } from "@/lib/utils";

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
            value={localValue}
            onChange={(e) => setLocalValue(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            className="w-full h-full resize-none font-mono text-sm"
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
}

export function FullscreenTextArea({
  value,
  onChange,
  placeholder,
  className,
  error,
  rows = 6,
  fieldLabel = "Content",
}: FullscreenTextAreaProps) {
  const [isFullscreen, setIsFullscreen] = useState(false);

  return (
    <>
      <div className="relative">
        <Textarea
          value={value || ""}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className={cn(
            "min-h-[120px] resize-y pr-10",
            error && "border-red-500",
            className
          )}
          rows={rows}
        />
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