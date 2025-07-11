"use client"

import * as React from "react"
import { Check, ChevronsUpDown, X, ChevronRight } from "lucide-react"

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

export interface ComboboxOption {
  value: string;
  label: React.ReactNode; // was string, now ReactNode
  description?: string;
  isExisting?: boolean;
  disabled?: boolean;
}

interface ComboboxProps {
  options: ComboboxOption[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  searchPlaceholder?: string;
  emptyPlaceholder?: string;
  disabled?: boolean;
  creatable?: boolean;
}

interface MultiComboboxProps {
  options: ComboboxOption[];
  value: string[];
  onChange: (value: string[]) => void;
  placeholder?: string;
  searchPlaceholder?: string;
  emptyPlaceholder?: string;
  disabled?: boolean;
  creatable?: boolean;
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
  creatable = false,
}: ComboboxProps) {
  const [open, setOpen] = React.useState(false)
  const [inputValue, setInputValue] = React.useState("")
  const [localOptions, setLocalOptions] = React.useState<ComboboxOption[]>(options)

  React.useEffect(() => {
    setLocalOptions(options)
  }, [options])

  React.useEffect(() => {
    // Clear input value when dropdown opens to show all options
    if (open) {
      setInputValue("")
    }
  }, [open])
  
  // Fix selectedOption logic
  const selectedOption = localOptions.find((option) => option.value === value);

  const handleSelect = (currentValue: string) => {
    const newValue = currentValue === value ? "" : currentValue
    onChange(newValue)
    setInputValue("")
    setOpen(false)
  }

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value;
    setInputValue(newValue);
    onChange(newValue);
  };
  
  // We need to handle the input within the Command component separately
  const handleCommandInputChange = (search: string) => {
    setInputValue(search);
    // Don't call onChange here for creatable comboboxes - only when item is selected/created
    if (!creatable) {
      onChange(search);
    }
  }

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

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-full justify-between"
          disabled={disabled}
        >
          {selectedOption ? selectedOption.label : value || placeholder || "Select option..."}
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0 max-h-80">
        <Command>
          <CommandInput 
            placeholder={searchPlaceholder || "Search..."}
            value={inputValue}
            onValueChange={handleCommandInputChange}
            onKeyDown={handleInputKeyDown}
          />
          <CommandList 
            className="max-h-60 overflow-y-auto" 
            style={{ maxHeight: '240px', overflowY: 'auto' }}
            onWheel={(e) => {
              e.preventDefault();
              const target = e.currentTarget;
              target.scrollTop += e.deltaY;
            }}
          >
            <CommandEmpty>{emptyPlaceholder || "No results found."}</CommandEmpty>
            <CommandGroup>
              {localOptions.map((option, index) => (
                <CommandItem
                  key={`${index}-${option.value || 'undefined'}`}
                  value={option.value}
                  onSelect={() => {
                    if (!option.disabled) handleSelect(option.value)
                  }}
                  disabled={option.disabled}
                  className={cn(option.disabled ? "opacity-50 pointer-events-none cursor-not-allowed" : "")}
                >
                  <Check
                    className={cn(
                      "mr-2 h-4 w-4",
                      value === option.value ? "opacity-100" : "opacity-0"
                    )}
                  />
                  <div className="flex flex-col">
                    {option.label !== undefined && option.label !== null ? option.label : String(option.value)}
                    {option.description && (
                      <span className="text-sm text-muted-foreground">{option.description}</span>
                    )}
                  </div>
                </CommandItem>
              ))}
              {/* Show create option if creatable and inputValue is not empty and not in options */}
              {creatable && inputValue.trim() && !localOptions.some(option => option.value === inputValue.trim()) && (
                <CommandItem
                  key={"create-" + inputValue.trim()}
                  value={inputValue.trim()}
                  onSelect={() => {
                    const newOption = { value: inputValue.trim(), label: inputValue.trim(), isExisting: false }
                    setLocalOptions((prev) => [...prev, newOption])
                    onChange(inputValue.trim())
                    setInputValue("")
                    setOpen(false)
                  }}
                >
                  <div className="flex items-center">
                    <span className="text-primary font-semibold">Create "{inputValue.trim()}"</span>
                    <span className="ml-auto text-xs text-muted-foreground">Press Enter</span>
                  </div>
                </CommandItem>
              )}
            </CommandGroup>
          </CommandList>
        </Command>
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
  creatable = false,
}: MultiComboboxProps) {
  const [open, setOpen] = React.useState(false)
  const [inputValue, setInputValue] = React.useState("")
  const [options, setOptions] = React.useState<ComboboxOption[]>(initialOptions)

  React.useEffect(() => {
    setOptions(initialOptions)
  }, [initialOptions])

  const selectedOptions = options.filter((option) => value.includes(option.value))

  const handleSelect = (currentValue: string) => {
    const newValue = value.includes(currentValue)
      ? value.filter((v) => v !== currentValue)
      : [...value, currentValue]
    onChange(newValue)
  }

  const handleRemove = (valueToRemove: string) => {
    onChange(value.filter((v) => v !== valueToRemove))
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

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-full justify-between min-h-10"
          disabled={disabled}
        >
          <div className="flex flex-wrap gap-1 flex-1">
            {selectedOptions.length > 0 ? (
              selectedOptions.map((option, index) => (
                <Badge
                  key={`selected-${index}-${option.value || 'undefined'}`}
                  variant="secondary"
                  className="mr-1"
                  onClick={(e) => {
                    e.stopPropagation()
                    handleRemove(option.value)
                  }}
                >
                  {option.label}
                  <X className="ml-1 h-3 w-3" />
                </Badge>
              ))
            ) : (
              <span className="text-muted-foreground">{placeholder || "Select option(s)..."}</span>
            )}
          </div>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0 max-h-80">
        <Command>
          <CommandInput
            placeholder={searchPlaceholder || "Search..."}
            value={inputValue}
            onValueChange={handleCommandInputChange}
            onKeyDown={handleInputKeyDown}
          />
          <CommandList
            className="max-h-60 overflow-y-auto"
            style={{ maxHeight: '240px', overflowY: 'auto' }}
            onWheel={(e) => {
              e.preventDefault();
              const target = e.currentTarget;
              target.scrollTop += e.deltaY;
            }}
          >
            <CommandEmpty>{emptyPlaceholder || "No results found."}</CommandEmpty>
            <CommandGroup>
              {options.map((option, index) => (
                <CommandItem
                  key={`multi-option-${index}-${option.value || 'undefined'}`}
                  value={option.value}
                  onSelect={handleSelect}
                >
                  <Check
                    className={cn(
                      "mr-2 h-4 w-4",
                      value.includes(option.value) ? "opacity-100" : "opacity-0"
                    )}
                  />
                  <div className="flex flex-col">
                    <span>{option.label}</span>
                    {option.description && (
                      <span className="text-sm text-muted-foreground">{option.description}</span>
                    )}
                  </div>
                </CommandItem>
              ))}
              {/* Show create option if inputValue is not empty, not in options, and is a valid email */}
              {creatable && inputValue.trim() && isValidEmail(inputValue.trim()) && !options.some(option => option.value === inputValue.trim()) && (
                <CommandItem
                  key={"create-" + inputValue.trim()}
                  value={inputValue.trim()}
                  onSelect={() => {
                    const newOption = { value: inputValue.trim(), label: inputValue.trim() }
                    setOptions((prev) => [...prev, newOption])
                    onChange([...value, inputValue.trim()])
                    setInputValue("")
                  }}
                >
                  <div className="flex items-center">
                    <span className="text-primary font-semibold">Invite {inputValue.trim()}</span>
                    <span className="ml-auto text-xs text-muted-foreground">Press Enter</span>
                  </div>
                </CommandItem>
              )}
            </CommandGroup>
          </CommandList>
        </Command>
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
    console.log('🔍 HierarchicalCombobox received options:', options)
    console.log('🔍 Options structure:', JSON.stringify(options, null, 2))
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
          className="w-full justify-between min-h-10"
          disabled={disabled}
        >
          {selectedOption ? (
            <div className="flex flex-col items-start">
              <span>{selectedOption.label}</span>
              {selectedOption.description && (
                <span className="text-sm text-muted-foreground">{selectedOption.description}</span>
              )}
            </div>
          ) : (
            <span className="text-muted-foreground">{placeholder || "Select option..."}</span>
          )}
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0 max-h-80">
        <Command>
          <CommandInput 
            placeholder={searchPlaceholder || "Search..."}
            value={inputValue}
            onValueChange={handleCommandInputChange}
          />
          <CommandList 
            className="max-h-60 overflow-y-auto" 
            style={{ maxHeight: '240px', overflowY: 'auto' }}
            onWheel={(e) => {
              e.preventDefault();
              const target = e.currentTarget;
              target.scrollTop += e.deltaY;
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
                        key={"groupitem-" + option.value}
                      >
                        <ChevronRight 
                          className={cn(
                            "mr-2 h-4 w-4 transition-transform",
                            isExpanded && "rotate-90"
                          )}
                        />
                        <div className="flex flex-col">
                          <span>{option.label}</span>
                          {option.description && (
                            <span className="text-sm text-muted-foreground">{option.description}</span>
                          )}
                        </div>
                      </CommandItem>
                      {isExpanded && (
                        <div className="ml-4">
                          {option.emails.map((email, emailIndex) => (
                            <CommandItem
                              key={`sub-${optionIndex}-${emailIndex}-${email.value || 'undefined'}`}
                              value={email.value}
                              onSelect={handleSelect}
                              className="pl-8"
                            >
                              <Check
                                className={cn(
                                  "mr-2 h-4 w-4",
                                  value === email.value ? "opacity-100" : "opacity-0"
                                )}
                              />
                              <div className="flex flex-col">
                                <span>{email.label}</span>
                                {email.description && (
                                  <span className="text-sm text-muted-foreground">{email.description}</span>
                                )}
                              </div>
                            </CommandItem>
                          ))}
                        </div>
                      )}
                    </div>
                  )
                }
                return (
                  <CommandItem
                    key={`item-${optionIndex}-${option.value || 'undefined'}`}
                    value={option.value}
                    onSelect={handleSelect}
                  >
                    <Check
                      className={cn(
                        "mr-2 h-4 w-4",
                        value === option.value ? "opacity-100" : "opacity-0"
                      )}
                    />
                    <div className="flex flex-col">
                      <span>{option.label}</span>
                      {option.description && (
                        <span className="text-sm text-muted-foreground">{option.description}</span>
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
