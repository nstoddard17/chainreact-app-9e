"use client"

import * as React from "react"
import { Check, ChevronsUpDown, X } from "lucide-react"

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
  label: string;
  description?: string;
}

interface ComboboxProps {
  options: ComboboxOption[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  searchPlaceholder?: string;
  emptyPlaceholder?: string;
  disabled?: boolean;
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

export function Combobox({
  options,
  value,
  onChange,
  placeholder,
  searchPlaceholder,
  emptyPlaceholder,
  disabled,
}: ComboboxProps) {
  const [open, setOpen] = React.useState(false)
  const [inputValue, setInputValue] = React.useState(value)

  React.useEffect(() => {
    // If the external value changes, update our internal input value
    setInputValue(value)
  }, [value])
  
  const selectedOption = options.find((option) => option.value.toLowerCase() === inputValue?.toLowerCase());

  const handleSelect = (currentValue: string) => {
    const newValue = currentValue === value ? "" : currentValue
    onChange(newValue)
    setInputValue(newValue)
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
    onChange(search);
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
          {selectedOption ? selectedOption.label : inputValue || placeholder || "Select option..."}
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
              {options.map((option) => (
                <CommandItem
                  key={option.value}
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
              ))}
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
        (option) => option.value.toLowerCase() === inputValue.trim().toLowerCase()
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
              selectedOptions.map((option) => (
                <Badge
                  key={option.value}
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
              {options.map((option) => (
                <CommandItem
                  key={option.value}
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
              {/* Show create option if inputValue is not empty and not in options */}
              {creatable && inputValue.trim() && !options.some(option => option.value.toLowerCase() === inputValue.trim().toLowerCase()) && (
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
                  <span className="text-primary">Create "{inputValue.trim()}"</span>
                </CommandItem>
              )}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
