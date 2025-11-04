"use client"

/**
 * FieldLabel Component
 *
 * Universal label component for all configuration fields with integrated help system.
 * Provides consistent styling, required indicators, tooltips, and contextual examples.
 *
 * Features:
 * - Required indicator (red asterisk - industry standard)
 * - Help icon with detailed tooltips
 * - Keyboard shortcut hints
 * - Context-aware examples
 * - Loop indicator (when applicable)
 */

import React from 'react'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { HelpCircle, RefreshCw } from 'lucide-react'
import { cn } from '@/lib/utils'

interface FieldLabelProps {
  /** Field name/identifier */
  name: string
  /** Display label */
  label: string
  /** Whether field is required */
  required?: boolean
  /** Help text explaining what this field does */
  helpText?: string
  /** Example values to show in tooltip */
  examples?: string[]
  /** Whether this field supports variables/merge fields */
  supportsVariables?: boolean
  /** Whether this field is part of a loop */
  isLooping?: boolean
  /** Custom className for the label */
  className?: string
  /** Keyboard shortcut hint (e.g., "Ctrl+V to paste") */
  keyboardHint?: string
}

export function FieldLabel({
  name,
  label,
  required = false,
  helpText,
  examples = [],
  supportsVariables = true,
  isLooping = false,
  className,
  keyboardHint,
}: FieldLabelProps) {
  const hasHelp = helpText || examples.length > 0 || keyboardHint

  return (
    <div className="flex items-center gap-2 mb-1.5">
      <Label
        htmlFor={name}
        className={cn(
          "text-sm font-medium text-slate-700 dark:text-slate-300",
          className
        )}
      >
        {label}
        {required && <span className="text-red-500 ml-1">*</span>}
      </Label>

      {/* Loop Indicator (only shown when field is actively looping) */}
      {isLooping && (
        <Badge
          variant="outline"
          className="text-[10px] h-5 px-1.5 font-medium border-blue-300 text-blue-700 bg-blue-50 dark:border-blue-700 dark:text-blue-300 dark:bg-blue-950"
        >
          <RefreshCw className="w-2.5 h-2.5 mr-1" />
          Looping
        </Badge>
      )}

      {/* Help Icon with Detailed Tooltip */}
      {hasHelp && (
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                className="flex items-center justify-center rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                aria-label={`Help for ${label}`}
              >
                <HelpCircle className="h-4 w-4 text-muted-foreground hover:text-foreground cursor-help" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="right" className="max-w-xs">
              <div className="space-y-2">
                {/* Help Text */}
                {helpText && (
                  <p className="text-sm">{helpText}</p>
                )}

                {/* Examples */}
                {examples.length > 0 && (
                  <div>
                    <p className="text-xs font-semibold text-slate-400 mb-1">Examples:</p>
                    <ul className="text-xs text-slate-300 space-y-0.5 list-disc list-inside">
                      {examples.map((example, i) => (
                        <li key={i} className="font-mono">{example}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Keyboard Hint */}
                {keyboardHint && (
                  <p className="text-xs text-slate-400 mt-2 pt-2 border-t border-slate-600">
                    💡 {keyboardHint}
                  </p>
                )}
              </div>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      )}
    </div>
  )
}

/**
 * Usage Examples:
 *
 * Required field (shows red asterisk):
 * <FieldLabel name="email" label="Email Address" required />
 *
 * Optional field (no indicator):
 * <FieldLabel name="notes" label="Notes" />
 *
 * With help tooltip:
 * <FieldLabel
 *   name="recipients"
 *   label="Recipients"
 *   required
 *   helpText="Enter one or more email addresses. Separate multiple addresses with commas."
 *   examples={["user@example.com", "team@company.com, admin@company.com"]}
 * />
 *
 * With keyboard hint:
 * <FieldLabel
 *   name="subject"
 *   label="Email Subject"
 *   required
 *   helpText="The subject line of your email"
 *   examples={["Welcome to our newsletter", "Your order #{{Order ID}} is ready"]}
 *   keyboardHint="Type {{ to insert variables"
 * />
 *
 * Looping field (shows loop badge):
 * <FieldLabel
 *   name="item"
 *   label="Item Name"
 *   isLooping
 *   helpText="This field will be processed once for each item in the loop"
 * />
 */
