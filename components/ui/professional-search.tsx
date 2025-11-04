"use client"

import * as React from "react"
import { Search, X } from "lucide-react"
import { cn } from "@/lib/utils"

export interface ProfessionalSearchProps
  extends React.InputHTMLAttributes<HTMLInputElement> {
  onClear?: () => void
  showClearButton?: boolean
}

/**
 * Professional high-end search input component
 * Features: Search icon, optional clear button, smooth transitions, modern styling
 */
const ProfessionalSearch = React.forwardRef<HTMLInputElement, ProfessionalSearchProps>(
  ({ className, value, onChange, onClear, showClearButton = true, ...props }, ref) => {
    const [isFocused, setIsFocused] = React.useState(false)
    const hasValue = value && String(value).length > 0

    const handleClear = () => {
      if (onClear) {
        onClear()
      } else if (onChange) {
        // @ts-ignore - simulate an input event
        onChange({ target: { value: '' } } as React.ChangeEvent<HTMLInputElement>)
      }
    }

    return (
      <div className="relative w-full">
        {/* Search Icon */}
        <Search
          className={cn(
            "absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 transition-colors duration-200",
            isFocused ? "text-primary" : "text-muted-foreground"
          )}
        />

        {/* Input Field */}
        <input
          type="text"
          className={cn(
            // Base styles
            "flex h-10 w-full rounded-lg border bg-white dark:bg-slate-950",
            "pl-9 pr-9 py-2 text-sm",
            // Typography
            "placeholder:text-muted-foreground/60",
            // Focus styles
            "focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary",
            // Transition
            "transition-all duration-200",
            // Border colors
            isFocused
              ? "border-primary shadow-sm"
              : "border-border hover:border-border/80",
            // Disabled state
            "disabled:cursor-not-allowed disabled:opacity-50",
            className
          )}
          value={value}
          onChange={onChange}
          onFocus={() => setIsFocused(true)}
          onBlur={() => setIsFocused(false)}
          ref={ref}
          {...props}
        />

        {/* Clear Button */}
        {showClearButton && hasValue && (
          <button
            type="button"
            onClick={handleClear}
            className={cn(
              "absolute right-3 top-1/2 -translate-y-1/2",
              "h-5 w-5 rounded-full flex items-center justify-center",
              "text-muted-foreground hover:text-foreground",
              "hover:bg-accent transition-colors duration-150",
              "focus:outline-none focus:ring-2 focus:ring-primary/20"
            )}
            aria-label="Clear search"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
    )
  }
)

ProfessionalSearch.displayName = "ProfessionalSearch"

export { ProfessionalSearch }
