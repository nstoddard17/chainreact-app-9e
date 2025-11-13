"use client"

import * as React from "react"
import { Check, ChevronsUpDown, X, ChevronRight, Loader2 } from "lucide-react"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { Badge } from "@/components/ui/badge"

import { logger } from '@/lib/utils/logger'

export interface ComboboxOption {
  value: string;
  label: React.ReactNode; // was string, now ReactNode
  description?: string;
  isExisting?: boolean;
  disabled?: boolean;
  searchValue?: string; // Additional searchable text for enhanced search
  group?: string; // Optional group name for grouped display
  color?: string; // Optional hex color for color preview ball
}

interface ComboboxProps {
  options: ComboboxOption[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  searchPlaceholder?: string;
  emptyPlaceholder?: string;
  disabled?: boolean;
  loading?: boolean; // Show loading spinner instead of chevron
  creatable?: boolean;
  onOpenChange?: (open: boolean) => void;
  selectedValues?: string[]; // Values that already have bubbles/are selected
  displayLabel?: string | null; // Optional display label for when options haven't loaded yet
  disableSearch?: boolean; // Hide search input for simple dropdowns
  hideClearButton?: boolean; // Hide the X button for clearing selection
  showColorPreview?: boolean; // Show color preview balls for options with colors
  onDrop?: (e: React.DragEvent) => void; // Handler for drop events
  onDragOver?: (e: React.DragEvent) => void; // Handler for drag over events
  onDragLeave?: (e: React.DragEvent) => void; // Handler for drag leave events
  onSearchChange?: (searchQuery: string) => void; // Callback for debounced search
}

interface MultiComboboxProps {
  options: ComboboxOption[];
  value: string[];
  onChange: (value: string[]) => void;
  placeholder?: string;
  searchPlaceholder?: string;
  emptyPlaceholder?: string;
  disabled?: boolean;
  loading?: boolean; // Show loading spinner instead of chevron
  creatable?: boolean;
  onOpenChange?: (open: boolean) => void;
  selectedValues?: string[]; // Values that already have bubbles/are selected
  hideSelectedBadges?: boolean; // Hide badges in the dropdown trigger (for Airtable fields with bubbles)
  showFullEmails?: boolean; // Show full email addresses without truncation
  onDrop?: (e: React.DragEvent) => void; // Handler for drop events
  onDragOver?: (e: React.DragEvent) => void; // Handler for drag over events
  onDragLeave?: (e: React.DragEvent) => void; // Handler for drag leave events
}

export interface HierarchicalComboboxOption {
  value: string;
  label: string;
  description?: string;
  isGroup?: boolean;
  groupId?: string;
  groupName?: string;
  emails?: ComboboxOption[];
}

interface HierarchicalComboboxProps {
  options: HierarchicalComboboxOption[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  searchPlaceholder?: string;
  emptyPlaceholder?: string;
  disabled?: boolean;
}

function isValidEmail(email: string): boolean {
  const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/
  return emailRegex.test(email.trim())
}

export function Combobox({
  options,
  value,
  onChange,
  placeholder,
  searchPlaceholder,
  emptyPlaceholder,
  disabled,
  loading = false,
  creatable = false,
  onOpenChange,
  selectedValues = [],
  displayLabel,
  disableSearch = false,
  hideClearButton = false,
  showColorPreview = false,
  onDrop,
  onDragOver,
  onDragLeave,
  onSearchChange,
}: ComboboxProps) {
  const [open, setOpen] = React.useState(false)
  const uniqueId = React.useId()

  const handleOpenChange = (newOpen: boolean) => {
    setOpen(newOpen);
    onOpenChange?.(newOpen);
  };
  const [inputValue, setInputValue] = React.useState("")
  const [localOptions, setLocalOptions] = React.useState<ComboboxOption[]>(options)
  const [collapsedGroups, setCollapsedGroups] = React.useState<Set<string>>(new Set())

  // Debounced search timer
  const searchTimerRef = React.useRef<NodeJS.Timeout | null>(null)

  React.useEffect(() => {
    setLocalOptions(options)
  }, [options])

  // Filter options based on search input
  const filteredOptions = React.useMemo(() => {
    if (!inputValue.trim()) {
      return localOptions
    }

    const searchLower = inputValue.toLowerCase()
    logger.debug('🔍 Combobox filtering:', { inputValue, searchLower, totalOptions: localOptions.length })

    const filtered = localOptions.filter(option => {
      // Include group name in search text to allow filtering by group
      const labelText = typeof option.label === 'string' ? option.label : '';
      const groupText = option.group || '';

      const descriptionText = typeof option.description === 'string' ? option.description : '';
      const searchText = (option.searchValue ||
        `${labelText} ${groupText} ${descriptionText}`).toLowerCase()
      const matches = searchText.includes(searchLower)

      if (matches) {
        logger.debug('🎯 Match found:', { searchText: searchText.substring(0, 50), searchLower })
      }

      return matches
    })

    logger.debug('🔍 Filtered results:', filtered.length)
    return filtered
  }, [localOptions, inputValue])

  React.useEffect(() => {
    // Clear input value when dropdown opens to show all options
    if (open) {
      setInputValue("")
    }
  }, [open])
  
  // Fix selectedOption logic - check if value exists in options or is a custom value
  const selectedOption = localOptions.find((option) => option.value === value) ||
    (value && displayLabel ? { value, label: displayLabel } : null) ||
    (value && creatable ? { value, label: value } : null);

  const handleSelect = (currentValue: string) => {
    // Allow clearing when empty string is passed
    if (currentValue === "") {
      onChange("")
    } else {
      // Don't toggle - just select the value (prevents deselection when clicking same value)
      onChange(currentValue)
    }
    setInputValue("")
    setOpen(false)
  }

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation()
    onChange("")
    setInputValue("")
  }

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value;
    setInputValue(newValue);
    onChange(newValue);
  };
  
  // We need to handle the input within the Command component separately
  const handleCommandInputChange = (search: string) => {
    setInputValue(search);
    // Don't call onChange during typing - only when an item is actually selected
    // This prevents dependent fields from appearing while user is still typing

    // If onSearchChange callback is provided, debounce the search
    if (onSearchChange) {
      // Clear previous timer
      if (searchTimerRef.current) {
        clearTimeout(searchTimerRef.current);
      }

      // Set new timer for debounced search (1.5 seconds after last keystroke)
      searchTimerRef.current = setTimeout(() => {
        onSearchChange(search);
      }, 1500);
    }
  }

  // Cleanup timer on unmount
  React.useEffect(() => {
    return () => {
      if (searchTimerRef.current) {
        clearTimeout(searchTimerRef.current);
      }
    };
  }, [])

  // Handle Enter key for creatable
  const handleInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (creatable && (e.key === "Enter" || e.key === "Tab") && inputValue.trim()) {
      const exists = localOptions.some(
        (option) => option.value === inputValue.trim()
      )
      if (!exists) {
        const newOption = { value: inputValue.trim(), label: inputValue.trim(), isExisting: false }
        setLocalOptions((prev) => [...prev, newOption])
        onChange(inputValue.trim())
        setInputValue("")
        setOpen(false)
        e.preventDefault()
      } else {
        // If already exists, just select it
        handleSelect(inputValue.trim())
        setInputValue("")
        e.preventDefault()
      }
    }
  }

  // Add drop zone state
  const [isDragOver, setIsDragOver] = React.useState(false);

  // Handle drag and drop
  React.useEffect(() => {
    const buttonId = `combobox-${uniqueId}`;

    const handleGlobalDragOver = (e: DragEvent) => {
      if (!onDrop) return;

      // Check if the event target is within our component
      const target = e.target as HTMLElement;

      // Check if target or any parent is specifically THIS combobox
      let currentElement: HTMLElement | null = target;
      let foundCombobox = false;

      while (currentElement) {
        // Only match if it's specifically our button ID
        if (currentElement.id === buttonId) {
          foundCombobox = true;
          break;
        }
        // Also check if we find the specific button element
        const button = document.getElementById(buttonId);
        if (button && button.contains(currentElement)) {
          foundCombobox = true;
          break;
        }
        currentElement = currentElement.parentElement;
      }

      if (foundCombobox) {
        e.preventDefault();
        e.stopPropagation();
        setIsDragOver(true);
        logger.debug('🎯 [Combobox] Drag over detected!', { buttonId, targetClass: target.className });
        if (onDragOver) onDragOver(e as any);
      }
    };

    const handleGlobalDrop = (e: DragEvent) => {
      if (!onDrop) return;

      const target = e.target as HTMLElement;

      // Check if target or any parent is specifically THIS combobox
      let currentElement: HTMLElement | null = target;
      let foundCombobox = false;

      while (currentElement) {
        // Only match if it's specifically our button ID
        if (currentElement.id === buttonId) {
          foundCombobox = true;
          break;
        }
        // Also check if we find the specific button element
        const button = document.getElementById(buttonId);
        if (button && button.contains(currentElement)) {
          foundCombobox = true;
          break;
        }
        currentElement = currentElement.parentElement;
      }

      if (foundCombobox) {
        e.preventDefault();
        e.stopPropagation();
        const droppedText = e.dataTransfer?.getData('text/plain') || '';
        logger.debug('💧 [Combobox] Drop detected!', { buttonId, droppedText });
        setIsDragOver(false);
        if (onDrop) onDrop(e as any);
      }
    };

    const handleGlobalDragLeave = (e: DragEvent) => {
      const target = e.target as HTMLElement;
      const button = document.getElementById(buttonId);
      if (button && !button.contains(e.relatedTarget as HTMLElement)) {
        setIsDragOver(false);
        if (onDragLeave) onDragLeave(e as any);
      }
    };

    document.addEventListener('dragover', handleGlobalDragOver, true);
    document.addEventListener('drop', handleGlobalDrop, true);
    document.addEventListener('dragleave', handleGlobalDragLeave, true);

    return () => {
      document.removeEventListener('dragover', handleGlobalDragOver, true);
      document.removeEventListener('drop', handleGlobalDrop, true);
      document.removeEventListener('dragleave', handleGlobalDragLeave, true);
    };
  }, [uniqueId, onDrop, onDragOver, onDragLeave]);

  return (
      <Popover open={open} onOpenChange={handleOpenChange}>
        <PopoverTrigger asChild>
          <Button
            id={`combobox-${uniqueId}`}
            variant="outline"
            role="combobox"
            aria-expanded={open}
            className={cn(
              "w-full justify-between",
              isDragOver && "ring-2 ring-blue-500 bg-blue-50"
            )}
            disabled={disabled}
          >
          <span className="flex-1 text-left break-words line-clamp-2">
            {selectedOption ? selectedOption.label : (displayLabel || value || placeholder || "Select option...")}
          </span>
          <div className="flex items-center gap-0.5">
            {value && !disabled && !hideClearButton && (
              <div
                className="group p-0.5 hover:bg-slate-100 rounded transition-colors cursor-pointer"
                onClick={handleClear}
                aria-label="Clear selection"
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    handleClear(e as any);
                  }
                }}
              >
                <X className="h-3 w-3 sm:h-3.5 sm:w-3.5 text-slate-400 group-hover:text-slate-600 transition-colors pointer-events-none" />
              </div>
            )}
            {loading ? (
              <Loader2 className="h-3.5 w-3.5 sm:h-4 sm:w-4 shrink-0 animate-spin" />
            ) : (
              <ChevronsUpDown className="h-3.5 w-3.5 sm:h-4 sm:w-4 shrink-0 opacity-50" />
            )}
          </div>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start" sideOffset={4}>
        <Command shouldFilter={false}>
          {!disableSearch && (
            <CommandInput
              placeholder={searchPlaceholder || "Search..."}
              value={inputValue}
              onValueChange={handleCommandInputChange}
              onKeyDown={handleInputKeyDown}
            />
          )}
          <CommandList
            className="max-h-[300px] overflow-y-auto"
            style={{
              scrollbarWidth: 'auto',
              scrollbarGutter: 'stable',
              overscrollBehavior: 'contain',
              WebkitOverflowScrolling: 'touch'
            }}
            onWheelCapture={(e) => {
              // Ensure the scroll wheel scrolls the dropdown, not the page behind
              e.stopPropagation()
            }}
          >
            {(() => {
              // Check if any options have groups
              const hasGroups = filteredOptions.some(option => option.group);

              // Only show "No results" if there are truly no options, not just collapsed groups
              if (filteredOptions.length === 0) {
                return <CommandEmpty>{emptyPlaceholder || "No results found."}</CommandEmpty>
              }

              if (!hasGroups) {
                // Render single CommandGroup for ungrouped options
                return (
                  <CommandGroup>
                    {filteredOptions.map((option, index) => {
                      const isSelected = value === option.value;
                      return (
                        <CommandItem
                          key={`${index}-${option.value || 'undefined'}`}
                          value={option.value}
                          onSelect={() => {
                            if (!option.disabled) handleSelect(option.value)
                          }}
                          disabled={option.disabled}
                          className={cn(
                            option.disabled && "opacity-50 pointer-events-none cursor-not-allowed",
                            isSelected && "!bg-blue-100 dark:!bg-blue-900/30 !text-blue-900 dark:!text-blue-100",
                            !isSelected && "hover:bg-accent hover:text-accent-foreground"
                          )}
                        >
                          <div className="flex items-center gap-2 w-full">
                            {showColorPreview && option.color && (
                              <div
                                className="w-4 h-4 rounded-full flex-shrink-0 border border-gray-300 dark:border-gray-600"
                                style={{ backgroundColor: option.color }}
                              />
                            )}
                            <div className="flex flex-col flex-1">
                              {option.label !== undefined && option.label !== null ? option.label : String(option.value)}
                              {option.description && (
                                <span className="text-xs sm:text-sm text-muted-foreground">{option.description}</span>
                              )}
                            </div>
                          </div>
                        </CommandItem>
                      );
                    })}
                  </CommandGroup>
                );
              }

              // Group options by their group property
              const grouped = filteredOptions.reduce((acc, option) => {
                const groupName = option.group || 'Other';
                if (!acc[groupName]) {
                  acc[groupName] = [];
                }
                acc[groupName].push(option);
                return acc;
              }, {} as Record<string, ComboboxOption[]>);

              // Toggle group collapse
              const toggleGroup = (groupName: string) => {
                setCollapsedGroups(prev => {
                  const newSet = new Set(prev);
                  if (newSet.has(groupName)) {
                    newSet.delete(groupName);
                  } else {
                    newSet.add(groupName);
                  }
                  return newSet;
                });
              };

              // Render groups with collapsible headers
              const groupElements = Object.entries(grouped).map(([groupName, groupOptions]) => {
                const isCollapsed = collapsedGroups.has(groupName);
                return (
                  <CommandGroup key={groupName}>
                    {/* Collapsible Group Header */}
                    <div
                      className="flex items-center gap-2 px-2 py-1.5 text-xs font-semibold text-muted-foreground cursor-pointer hover:bg-accent/50 select-none"
                      onClick={() => toggleGroup(groupName)}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          toggleGroup(groupName);
                        }
                      }}
                    >
                      <ChevronRight
                        className={cn(
                          "h-4 w-4 transition-transform",
                          !isCollapsed && "rotate-90"
                        )}
                      />
                      <span>{groupName}</span>
                      <span className="ml-auto text-muted-foreground">
                        {groupOptions.length}
                      </span>
                    </div>

                    {/* Group Items */}
                    {!isCollapsed && groupOptions.map((option, index) => {
                      const isSelected = value === option.value;
                      return (
                        <CommandItem
                          key={`${groupName}-${index}-${option.value || 'undefined'}`}
                          value={option.value}
                          onSelect={() => {
                            if (!option.disabled) handleSelect(option.value)
                          }}
                          disabled={option.disabled}
                          className={cn(
                            "pl-8",
                            option.disabled && "opacity-50 pointer-events-none cursor-not-allowed",
                            isSelected && "!bg-blue-100 dark:!bg-blue-900/30 !text-blue-900 dark:!text-blue-100",
                            !isSelected && "hover:bg-accent hover:text-accent-foreground"
                          )}
                        >
                          <div className="flex items-center gap-2 w-full">
                            {showColorPreview && option.color && (
                              <div
                                className="w-4 h-4 rounded-full flex-shrink-0 border border-gray-300 dark:border-gray-600"
                                style={{ backgroundColor: option.color }}
                              />
                            )}
                            <div className="flex flex-col flex-1">
                              {option.label !== undefined && option.label !== null ? option.label : String(option.value)}
                              {option.description && (
                                <span className="text-xs sm:text-sm text-muted-foreground">{option.description}</span>
                              )}
                            </div>
                          </div>
                        </CommandItem>
                      );
                    })}
                  </CommandGroup>
                );
              });

              return groupElements;
            })()}
          </CommandList>
        </Command>

        {/* Render create button outside Command to avoid cmdk filtering - only show if value doesn't exactly match an existing option */}
        {creatable && inputValue.trim() && !localOptions.some(option => option.value === inputValue.trim()) && (
          <div
            className="border-t border-gray-200 dark:border-gray-700 p-2 bg-blue-50 dark:bg-blue-950/20 cursor-pointer hover:bg-blue-100 dark:hover:bg-blue-900/30 transition-colors"
            onClick={() => {
              const newOption = { value: inputValue.trim(), label: inputValue.trim(), isExisting: false }
              setLocalOptions((prev) => [...prev, newOption])
              onChange(inputValue.trim())
              setInputValue("")
              setOpen(false)
            }}
          >
            <div className="flex items-center w-full">
              <div className="flex items-center gap-2 flex-1">
                <div className="h-4 w-4 rounded bg-blue-500 flex items-center justify-center">
                  <span className="text-white text-xs font-bold">+</span>
                </div>
                <span className="text-blue-700 dark:text-blue-300 font-semibold">
                  {inputValue.trim().startsWith('{{') && inputValue.trim().endsWith('}}')
                    ? `Use variable: ${inputValue.trim()}`
                    : `Use custom value: "${inputValue.trim()}"`}
                </span>
              </div>
              <span className="text-xs text-muted-foreground">Press Enter</span>
            </div>
          </div>
        )}
      </PopoverContent>
    </Popover>
  )
}

export function MultiCombobox({
  options: initialOptions,
  value,
  onChange,
  placeholder,
  searchPlaceholder,
  emptyPlaceholder,
  disabled,
  loading = false,
  creatable = false,
  onOpenChange,
  selectedValues = [],
  hideSelectedBadges = false,
  showFullEmails = false,
  onDrop,
  onDragOver,
  onDragLeave,
}: MultiComboboxProps) {
  const [open, setOpen] = React.useState(false)
  const [inputValue, setInputValue] = React.useState("")
  const [options, setOptions] = React.useState<ComboboxOption[]>(initialOptions)
  const uniqueId = React.useId()
  const [isDragOver, setIsDragOver] = React.useState(false)

  React.useEffect(() => {
    setOptions(initialOptions)
  }, [initialOptions])

  const buildSearchValue = React.useCallback((option: ComboboxOption) => {
    const parts: string[] = []
    if (typeof option.label === 'string') parts.push(option.label)
    if (typeof option.description === 'string') parts.push(option.description)
    if (option.searchValue) parts.push(option.searchValue)
    if (parts.length === 0 && typeof option.value === 'string') parts.push(option.value)
    return parts.join(' ').trim().toLowerCase()
  }, [])

  const filteredOptions = React.useMemo(() => {
    const search = inputValue.trim().toLowerCase()
    if (!search) return options
    return options.filter(option => buildSearchValue(option).includes(search))
  }, [options, inputValue, buildSearchValue])

  // Get selected options - include saved values even if not in current options
  const selectedOptions = React.useMemo(() => {
    const optionsMap = new Map(options.map(opt => [opt.value, opt]));
    // Use selectedValues if provided (for bubble-managed fields), otherwise use value
    const effectiveValues = selectedValues && selectedValues.length > 0 ? selectedValues : value;

    // Debug logging
    if (placeholder?.toLowerCase().includes('task')) {
      logger.debug('🔍 [MultiCombobox] Tasks field debug:', {
        placeholder,
        value,
        valueLength: value.length,
        selectedValues,
        selectedValuesLength: selectedValues?.length,
        effectiveValues,
        effectiveValuesLength: effectiveValues.length,
        hideSelectedBadges
      });
    }

    return effectiveValues.map(val => {
      // If we have the option in our list, use it (for label)
      if (optionsMap.has(val)) {
        return optionsMap.get(val)!;
      }
      // Otherwise create a temporary option for the saved value
      return { value: val, label: val };
    });
  }, [options, value, selectedValues, placeholder, hideSelectedBadges])

  const handleSelect = (currentValue: string) => {
    const newValue = value.includes(currentValue)
      ? value.filter((v) => v !== currentValue)
      : [...value, currentValue]
    onChange(newValue)
    // Don't close the dropdown for multi-select
    // The dropdown stays open so users can select multiple items
  }

  const handleRemove = (valueToRemove: string) => {
    onChange(value.filter((v) => v !== valueToRemove))
  }

  const handleClearAll = (e: React.MouseEvent) => {
    e.stopPropagation()
    onChange([])
  }

  const handleCommandInputChange = (search: string) => {
    setInputValue(search)
  }

  // Handle Enter key for creatable
  const handleInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (creatable && (e.key === "Enter" || e.key === "Tab") && inputValue.trim()) {
      const exists = options.some(
        (option) => option.value === inputValue.trim()
      )
      if (!exists) {
        const newOption = { value: inputValue.trim(), label: inputValue.trim() }
        setOptions((prev) => [...prev, newOption])
        onChange([...value, inputValue.trim()])
        setInputValue("")
        e.preventDefault()
      } else {
        // If already exists, just select it
        handleSelect(inputValue.trim())
        setInputValue("")
        e.preventDefault()
      }
    }
  }

  const handleOpenChange = (newOpen: boolean) => {
    setOpen(newOpen);
    onOpenChange?.(newOpen);
  };

  // Handle drag and drop
  React.useEffect(() => {
    if (!onDrop) return;

    const buttonId = `combobox-${uniqueId}`;

    const handleGlobalDragOver = (e: DragEvent) => {
      const target = e.target as HTMLElement;
      const button = document.getElementById(buttonId);
      if (button && button.contains(target)) {
        e.preventDefault();
        e.stopPropagation();
        setIsDragOver(true);
        logger.debug('🎯 [MultiCombobox] Drag over detected via global listener');
        if (onDragOver) onDragOver(e as any);
      }
    };

    const handleGlobalDrop = (e: DragEvent) => {
      const target = e.target as HTMLElement;
      const button = document.getElementById(buttonId);
      if (button && button.contains(target)) {
        e.preventDefault();
        e.stopPropagation();
        const droppedText = e.dataTransfer?.getData('text/plain') || '';
        logger.debug('💧 [MultiCombobox] Drop detected via global listener:', droppedText);
        setIsDragOver(false);
        if (onDrop) onDrop(e as any);
      }
    };

    const handleGlobalDragLeave = (e: DragEvent) => {
      const target = e.target as HTMLElement;
      const button = document.getElementById(buttonId);
      if (button && !button.contains(e.relatedTarget as HTMLElement)) {
        setIsDragOver(false);
        if (onDragLeave) onDragLeave(e as any);
      }
    };

    document.addEventListener('dragover', handleGlobalDragOver, true);
    document.addEventListener('drop', handleGlobalDrop, true);
    document.addEventListener('dragleave', handleGlobalDragLeave, true);

    return () => {
      document.removeEventListener('dragover', handleGlobalDragOver, true);
      document.removeEventListener('drop', handleGlobalDrop, true);
      document.removeEventListener('dragleave', handleGlobalDragLeave, true);
    };
  }, [uniqueId, onDrop, onDragOver, onDragLeave]);

  return (
      <Popover open={open} onOpenChange={handleOpenChange}>
        <PopoverTrigger asChild>
          <Button
            id={`combobox-${uniqueId}`}
            variant="outline"
            role="combobox"
            aria-expanded={open}
            className={cn(
              "w-full justify-between min-h-9 sm:min-h-10",
              isDragOver && "ring-2 ring-blue-500 bg-blue-50"
            )}
            disabled={disabled}
          >
          <div className="flex gap-1 flex-1 overflow-hidden">
            {hideSelectedBadges || selectedOptions.length === 1 ? (
              // When badges are hidden OR only one item is selected, show value directly
              selectedOptions.length > 0 ? (
                <span className="text-gray-900 dark:text-white">
                  {selectedOptions.length === 1 ? (selectedOptions[0].label || selectedOptions[0].value) : `${selectedOptions.length} selected`}
                </span>
              ) : (
                <span className="text-gray-900 dark:text-white">
                  {placeholder || "Select option(s)..."}
                </span>
              )
            ) : selectedOptions.length > 0 ? (
              <>
                {selectedOptions.length <= 3 ? (
                  // Show all items if 3 or fewer
                  selectedOptions.map((option, index) => (
                    <Badge
                      key={`selected-${index}-${option.value || 'undefined'}`}
                      variant="secondary"
                      className={cn(
                        "flex-shrink-0",
                        !showFullEmails && "max-w-48"
                      )}
                      onClick={(e) => {
                        e.stopPropagation()
                        handleRemove(option.value)
                      }}
                    >
                      <span className={!showFullEmails ? "break-all line-clamp-1" : "break-words"}>{option.label || option.value}</span>
                      <X className="ml-1 h-2.5 w-2.5 sm:h-3 sm:w-3 flex-shrink-0" />
                    </Badge>
                  ))
                ) : (
                  // Show first 2 items and "... +N more"
                  <>
                    {selectedOptions.slice(0, 2).map((option, index) => (
                      <Badge
                        key={`selected-${index}-${option.value || 'undefined'}`}
                        variant="secondary"
                        className={cn(
                          "flex-shrink-0",
                          !showFullEmails && "max-w-48"
                        )}
                        onClick={(e) => {
                          e.stopPropagation()
                          handleRemove(option.value)
                        }}
                      >
                        <span className={!showFullEmails ? "break-all line-clamp-1" : "break-words"}>{option.label || option.value}</span>
                        <X className="ml-1 h-2.5 w-2.5 sm:h-3 sm:w-3 flex-shrink-0" />
                      </Badge>
                    ))}
                    <span className="text-muted-foreground text-xs sm:text-sm flex-shrink-0">
                      ... +{selectedOptions.length - 2} more
                    </span>
                  </>
                )}
              </>
            ) : (
              <span className="text-gray-900 dark:text-white">{placeholder || "Select option(s)..."}</span>
            )}
          </div>
          <div className="flex items-center gap-0.5">
            {selectedOptions.length > 0 && !disabled && (
              <div
                className="group p-0.5 hover:bg-slate-100 rounded transition-colors cursor-pointer"
                onClick={handleClearAll}
                aria-label="Clear all selections"
                title="Clear all"
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    handleClearAll(e as any);
                  }
                }}
              >
                <X className="h-3 w-3 sm:h-3.5 sm:w-3.5 text-slate-400 group-hover:text-slate-600 transition-colors pointer-events-none" />
              </div>
            )}
            <ChevronsUpDown className="h-3.5 w-3.5 sm:h-4 sm:w-4 shrink-0 opacity-50" />
          </div>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0 z-[9999]" align="start" sideOffset={4}>
        <Command shouldFilter={false}>
          <CommandInput
            placeholder={searchPlaceholder || "Search..."}
            value={inputValue}
            onValueChange={handleCommandInputChange}
            onKeyDown={handleInputKeyDown}
          />
          <CommandList
            className="max-h-[300px] overflow-y-auto"
            style={{
              scrollbarWidth: 'auto',
              scrollbarGutter: 'stable',
              overscrollBehavior: 'contain',
              WebkitOverflowScrolling: 'touch'
            }}
            onWheelCapture={(e) => {
              e.stopPropagation()
            }}
          >
            <CommandEmpty>{emptyPlaceholder || "No results found."}</CommandEmpty>
            <CommandGroup>
              {filteredOptions.map((option, index) => {
                // Debug logging for checkmark visibility
                if (placeholder?.toLowerCase().includes('task') || placeholder?.toLowerCase().includes('project') || placeholder?.toLowerCase().includes('feedback')) {
                  const isChecked = value.includes(option.value) || (Array.isArray(selectedValues) && selectedValues.some(v => {
                    if (v === option.value) return true;
                    if (typeof option.value === 'string' && option.value.includes('::')) {
                      const [optionId] = option.value.split('::');
                      return v === optionId;
                    }
                    if (typeof v === 'string' && v.includes('::')) {
                      const [id] = v.split('::');
                      return id === option.value;
                    }
                    return false;
                  }));

                  logger.debug(`🔍 [Checkmark] ${option.label}:`, {
                    optionValue: option.value,
                    value,
                    selectedValues,
                    isChecked
                  });
                }

                return (
                <CommandItem
                  key={`multi-option-${index}-${option.value || 'undefined'}`}
                  value={
                    typeof option.label === 'string'
                      ? option.label
                      : typeof option.value === 'string'
                        ? option.value
                        : String(option.value ?? '')
                  }
                  onSelect={() => {
                    // Just handle the selection, don't close
                    handleSelect(option.value);
                  }}
                >
                  <Check
                    className={cn(
                      "mr-2 h-3.5 w-3.5 sm:h-4 sm:w-4",
                      value.includes(option.value) || (Array.isArray(selectedValues) && selectedValues.some(v => {
                        // Handle both direct matches and id::name format
                        if (v === option.value) return true;

                        // If option value has :: format, extract ID and compare
                        if (typeof option.value === 'string' && option.value.includes('::')) {
                          const [optionId] = option.value.split('::');
                          return v === optionId;
                        }

                        // If selectedValue has :: format, extract ID and compare
                        if (typeof v === 'string' && v.includes('::')) {
                          const [id] = v.split('::');
                          return id === option.value;
                        }

                        return false;
                      })) ? "opacity-100" : "opacity-0"
                    )}
                  />
                  <div className="flex flex-col">
                    <span>{option.label}</span>
                    {option.description && (
                      <span className="text-xs sm:text-sm text-muted-foreground">{option.description}</span>
                    )}
                  </div>
                </CommandItem>
              );
              })}
            </CommandGroup>
          </CommandList>
        </Command>

        {/* Render create button outside Command to avoid cmdk filtering - only show if value doesn't exactly match an existing option */}
        {creatable && inputValue.trim() && !options.some(option => option.value === inputValue.trim()) && (
          <div
            className="border-t border-gray-200 dark:border-gray-700 p-2 bg-blue-50 dark:bg-blue-950/20 cursor-pointer hover:bg-blue-100 dark:hover:bg-blue-900/30 transition-colors"
            onClick={() => {
              const newOption = { value: inputValue.trim(), label: inputValue.trim() }
              setOptions((prev) => [...prev, newOption])
              onChange([...value, inputValue.trim()])
              setInputValue("")
            }}
          >
            <div className="flex items-center w-full">
              <div className="flex items-center gap-2 flex-1">
                <div className="h-4 w-4 rounded bg-blue-500 flex items-center justify-center">
                  <span className="text-white text-xs font-bold">+</span>
                </div>
                <span className="text-blue-700 dark:text-blue-300 font-semibold">
                  {inputValue.trim().startsWith('{{') && inputValue.trim().endsWith('}}')
                    ? `Use variable: ${inputValue.trim()}`
                    : `Add custom value: "${inputValue.trim()}"`}
                </span>
              </div>
              <span className="text-xs text-muted-foreground">Press Enter</span>
            </div>
          </div>
        )}
      </PopoverContent>
    </Popover>
  )
}

export function HierarchicalCombobox({
  options,
  value,
  onChange,
  placeholder,
  searchPlaceholder,
  emptyPlaceholder,
  disabled,
}: HierarchicalComboboxProps) {
  const [open, setOpen] = React.useState(false)
  const [inputValue, setInputValue] = React.useState("")
  const [expandedGroups, setExpandedGroups] = React.useState<Set<string>>(new Set())

  // Debug logging
  React.useEffect(() => {
    logger.debug('🔍 HierarchicalCombobox received options:', options)
    logger.debug('🔍 Options structure:', JSON.stringify(options, null, 2))
  }, [options])

  const selectedOption = options.flatMap(option => 
    option.isGroup && option.emails ? option.emails : [option]
  ).find(option => option.value === value)

  const handleSelect = (currentValue: string) => {
    // Check if this is a group value
    if (currentValue.startsWith('group_')) {
      // Toggle group expansion
      setExpandedGroups(prev => {
        const newSet = new Set(prev)
        if (newSet.has(currentValue)) {
          newSet.delete(currentValue)
        } else {
          newSet.add(currentValue)
        }
        return newSet
      })
      return
    }
    
    // Handle email selection
    onChange(currentValue)
    setOpen(false)
  }

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setInputValue(e.target.value)
  }

  const handleCommandInputChange = (search: string) => {
    setInputValue(search)
  }

  // Flatten all options for search
  const allOptions = options.flatMap(option => {
    if (option.isGroup && option.emails) {
      return [option, ...option.emails]
    }
    return [option]
  })

  const filteredOptions = allOptions.filter((option) => {
    // Only filter by label if label is a string
    const labelMatch = typeof option.label === 'string' ? option.label.toLowerCase().includes(inputValue.toLowerCase()) : false;
    const descMatch = option.description ? option.description.toLowerCase().includes(inputValue.toLowerCase()) : false;
    return labelMatch || descMatch;
  })

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-full justify-between min-h-9 sm:min-h-10"
          style={{ color: 'white' }}
          disabled={disabled}
        >
          {selectedOption ? (
            <div className="flex flex-col items-start">
              <span>{selectedOption.label}</span>
              {selectedOption.description && (
                <span className="text-xs sm:text-sm text-muted-foreground">{selectedOption.description}</span>
              )}
            </div>
          ) : (
            <span>{placeholder || "Select option..."}</span>
          )}
          {loading ? (
            <Loader2 className="ml-2 h-3.5 w-3.5 sm:h-4 sm:w-4 shrink-0 animate-spin" />
          ) : (
            <ChevronsUpDown className="ml-2 h-3.5 w-3.5 sm:h-4 sm:w-4 shrink-0 opacity-50" />
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0 z-[9999]" align="start" sideOffset={4}>
        <Command>
          <CommandInput
            placeholder={searchPlaceholder || "Search..."}
            value={inputValue}
            onValueChange={handleCommandInputChange}
          />
          <CommandList
            className="max-h-[300px] overflow-y-auto"
            style={{
              scrollbarWidth: 'auto',
              scrollbarGutter: 'stable'
            }}
          >
            <CommandEmpty>{emptyPlaceholder || "No results found."}</CommandEmpty>
            <CommandGroup>
              {options.map((option, optionIndex) => {
                if (option.isGroup && option.emails) {
                  const isExpanded = expandedGroups.has(option.value)
                  return (
                    <div key={`group-${optionIndex}-${option.value || 'undefined'}`}>
                      <CommandItem
                        value={option.value}
                        onSelect={handleSelect}
                        className="font-medium"
                        key={`groupitem-${ option.value}`}
                      >
                        <ChevronRight
                          className={cn(
                            "mr-2 h-3.5 w-3.5 sm:h-4 sm:w-4 transition-transform",
                            isExpanded && "rotate-90"
                          )}
                        />
                        <div className="flex flex-col">
                          <span>{option.label}</span>
                          {option.description && (
                            <span className="text-xs sm:text-sm text-muted-foreground">{option.description}</span>
                          )}
                        </div>
                      </CommandItem>
                      {isExpanded && (
                        <div className="ml-4">
                          {option.emails.map((email, emailIndex) => {
                            const isSelected = value === email.value;
                            return (
                              <CommandItem
                                key={`sub-${optionIndex}-${emailIndex}-${email.value || 'undefined'}`}
                                value={email.value}
                                onSelect={handleSelect}
                                className={cn(
                                  "pl-8",
                                  // Selected item: always blue (including on hover) - !important to override data-selected
                                  isSelected && "!bg-blue-100 dark:!bg-blue-900/30 !text-blue-900 dark:!text-blue-100",
                                  // Hover state: grey for non-selected items
                                  !isSelected && "hover:bg-accent hover:text-accent-foreground"
                                )}
                              >
                                <div className="flex flex-col">
                                  <span>{email.label}</span>
                                  {email.description && (
                                    <span className="text-xs sm:text-sm text-muted-foreground">{email.description}</span>
                                  )}
                                </div>
                              </CommandItem>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  )
                }
                const isSelected = value === option.value;
                return (
                  <CommandItem
                    key={`item-${optionIndex}-${option.value || 'undefined'}`}
                    value={option.value}
                    onSelect={handleSelect}
                    className={cn(
                      // Selected item: always blue (including on hover) - !important to override data-selected
                      isSelected && "!bg-blue-100 dark:!bg-blue-900/30 !text-blue-900 dark:!text-blue-100",
                      // Hover state: grey for non-selected items
                      !isSelected && "hover:bg-accent hover:text-accent-foreground"
                    )}
                  >
                    <div className="flex flex-col">
                      <span>{option.label}</span>
                      {option.description && (
                        <span className="text-xs sm:text-sm text-muted-foreground">{option.description}</span>
                      )}
                    </div>
                  </CommandItem>
                )
              })}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
