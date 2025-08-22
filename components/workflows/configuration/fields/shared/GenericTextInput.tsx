"use client"

import React from "react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { useDragDrop } from "@/hooks/use-drag-drop";

interface GenericTextInputProps {
  field: any;
  value: any;
  onChange: (value: any) => void;
  error?: string;
}

/**
 * Generic text input field for basic text, email, number, and textarea fields
 * Supports drag and drop for variables
 */
export function GenericTextInput({
  field,
  value,
  onChange,
  error,
}: GenericTextInputProps) {

  // Drag and drop functionality
  const { handleDragOver, handleDrop } = useDragDrop({
    onVariableDrop: (variable: string) => {
      if (typeof value === 'string') {
        const newValue = value + variable;
        onChange(newValue);
      } else {
        onChange(variable);
      }
    }
  });

  // Handle input changes
  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    onChange(e.target.value);
  };

  const commonProps = {
    id: field.name,
    placeholder: field.placeholder || `Enter ${field.label || field.name}...`,
    value: value || "",
    onChange: handleChange,
    onDragOver: handleDragOver,
    onDrop: handleDrop,
    className: cn(
      error && "border-red-500"
    ),
  };

  switch (field.type) {
    case "textarea":
      return (
        <Textarea
          {...commonProps}
          className={cn(
            "min-h-[80px] resize-none",
            error && "border-red-500"
          )}
          rows={(field as any).rows || 3}
        />
      );

    case "number":
      return (
        <Input
          {...commonProps}
          type="number"
          min={(field as any).min}
          max={(field as any).max}
          step={(field as any).step || 1}
        />
      );

    case "email":
      return (
        <Input
          {...commonProps}
          type="email"
        />
      );

    case "time":
      return (
        <Input
          {...commonProps}
          type="time"
        />
      );

    case "file":
      return (
        <Input
          {...commonProps}
          type="file"
        />
      );

    case "text":
    default:
      return (
        <Input
          {...commonProps}
          type="text"
        />
      );
  }
}