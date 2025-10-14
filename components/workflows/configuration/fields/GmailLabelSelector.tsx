"use client"

import React, { useState, useEffect, useRef } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Check, ChevronsUpDown, Plus, Loader2, X } from 'lucide-react'
import { useToast } from '@/hooks/use-toast'
import { useIntegrationStore } from '@/stores/integrationStore'
import { cn } from '@/lib/utils'

import { logger } from '@/lib/utils/logger'

interface GmailLabelSelectorProps {
  value?: string[]
  onChange: (value: string[]) => void
  options?: Array<{ value: string; label: string }>
  onRefresh?: () => void
  fieldName?: string
  placeholder?: string
  isLoading?: boolean
}

export function GmailLabelSelector({
  value = [],
  onChange,
  options = [],
  onRefresh,
  fieldName,
  placeholder = "Select or create a label",
  isLoading = false
}: GmailLabelSelectorProps) {
  const [open, setOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState("")
  const [inputValue, setInputValue] = useState("")
  const [creating, setCreating] = useState(false)
  const [popoverWidth, setPopoverWidth] = useState<number | undefined>(undefined)
  const [tempNewLabel, setTempNewLabel] = useState<{ value: string; label: string } | null>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const { toast } = useToast()
  const { getIntegrationByProvider } = useIntegrationStore()

  // Update popover width when trigger size changes
  useEffect(() => {
    if (open && triggerRef.current) {
      setPopoverWidth(triggerRef.current.offsetWidth)
    }
  }, [open])

  // Reset input value when a label is selected
  useEffect(() => {
    if (value.length > 0) {
      setInputValue("")
    }
  }, [value])

  // Sync search query with input value when dropdown opens
  useEffect(() => {
    if (open && inputValue) {
      setSearchQuery(inputValue)
    } else if (!open) {
      // Clear search query when dropdown closes
      setSearchQuery("")
    }
  }, [open, inputValue])

  // Clear temp label once it appears in the options list
  useEffect(() => {
    if (tempNewLabel && options.some(opt => opt.value === tempNewLabel.value)) {
      setTempNewLabel(null)
    }
  }, [options, tempNewLabel])

  // Use inputValue for filtering when dropdown is open, otherwise use searchQuery
  const activeSearch = open ? inputValue : searchQuery

  // Merge options with temp label if it exists and isn't in options yet
  const allOptions = tempNewLabel && !options.some(opt => opt.value === tempNewLabel.value)
    ? [...options, tempNewLabel]
    : options

  // Filter options based on active search and exclude already selected labels
  const filteredOptions = allOptions.filter(option =>
    option.label.toLowerCase().includes(activeSearch.toLowerCase()) &&
    !value.includes(option.value)
  )

  // Check if the active search matches an existing label (including already selected ones)
  const exactMatch = allOptions.some(
    option => option.label.toLowerCase() === activeSearch.toLowerCase()
  )

  // Show create option if there's an active search and no exact match
  const showCreateOption = activeSearch.trim() && !exactMatch

  // Get all selected labels
  const selectedLabels = value
    .map(val => allOptions.find(opt => opt.value === val) || (tempNewLabel?.value === val ? tempNewLabel : null))
    .filter(Boolean) as Array<{ value: string; label: string }>

  const createLabel = async (labelName: string) => {
    if (!labelName.trim()) return

    setCreating(true)
    try {
      const integration = getIntegrationByProvider('gmail')
      if (!integration) throw new Error('No Gmail integration found')

      const response = await fetch('/api/gmail/labels', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          integrationId: integration.id,
          name: labelName.trim()
        }),
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || 'Failed to create label')
      }

      const data = await response.json()

      toast({
        title: "Label created",
        description: `Successfully created label "${data.name}"`,
      })

      // Store the newly created label temporarily so it shows immediately
      const newLabel = { value: data.id, label: data.name }
      setTempNewLabel(newLabel)

      // Add the newly created label to the selected values
      onChange([...value, data.id])

      // Clear input and search
      setInputValue("")
      setSearchQuery("")

      // Refresh the options list
      if (onRefresh) {
        // Small delay to ensure Gmail API has processed the change
        setTimeout(() => {
          onRefresh()
        }, 500)
      }

      // Keep the popover open so user can select more labels
      // setOpen(false)
    } catch (error) {
      logger.error('Error creating label:', error)
      toast({
        title: "Error creating label",
        description: error instanceof Error ? error.message : "Failed to create label",
        variant: "destructive",
      })
    } finally {
      setCreating(false)
    }
  }

  const handleSelect = (optionValue: string) => {
    // Toggle selection (add/remove from array)
    if (value.includes(optionValue)) {
      // Remove from selection
      onChange(value.filter(v => v !== optionValue))
    } else {
      // Add to selection
      onChange([...value, optionValue])
    }
    setInputValue("")
    setSearchQuery("")
    // Keep the popover open so user can select more labels
    // setOpen(false)
  }

  const handleRemoveLabel = (labelValue: string) => {
    onChange(value.filter(v => v !== labelValue))
  }

  const handleInputKeyDown = async (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && inputValue.trim()) {
      e.preventDefault()

      // Check if label already exists
      const existingLabel = options.find(
        opt => opt.label.toLowerCase() === inputValue.trim().toLowerCase()
      )

      if (existingLabel) {
        // Add to selection if not already selected
        if (!value.includes(existingLabel.value)) {
          onChange([...value, existingLabel.value])
        }
        setInputValue("")
        setSearchQuery("")
      } else {
        // Create new label
        await createLabel(inputValue.trim())
      }
    } else if (e.key === 'Escape') {
      // Close dropdown on escape
      setOpen(false)
    } else if (e.key === 'Backspace' && !inputValue && selectedLabels.length > 0) {
      // Remove last label when backspace is pressed with empty input
      e.preventDefault()
      const lastLabel = selectedLabels[selectedLabels.length - 1]
      handleRemoveLabel(lastLabel.value)
    }
  }

  const handleInputBlur = async () => {
    // Delay to allow clicking on dropdown items
    setTimeout(async () => {
      // Don't create label if dropdown is open (user might be selecting)
      if (open) return

      if (inputValue.trim()) {
        // Check if label already exists
        const existingLabel = allOptions.find(
          opt => opt.label.toLowerCase() === inputValue.trim().toLowerCase()
        )

        if (existingLabel) {
          // Add to selection if not already selected
          if (!value.includes(existingLabel.value)) {
            onChange([...value, existingLabel.value])
          }
          setInputValue("")
          setSearchQuery("")
        } else {
          // Create new label
          await createLabel(inputValue.trim())
        }
      }
    }, 200)
  }

  return (
    <div className="space-y-2">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <div ref={triggerRef} className="relative">
            <div className="min-h-[40px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2">
              <div className="flex flex-wrap gap-1.5 items-center">
                {selectedLabels.map((label) => (
                  <Badge key={label.value} variant="outline" className="gap-1">
                    {label.label}
                    <button
                      type="button"
                      onClick={(e) => {
                        e.preventDefault()
                        e.stopPropagation()
                        handleRemoveLabel(label.value)
                      }}
                      className="ml-1 hover:bg-muted rounded-sm"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                ))}
                <input
                  ref={inputRef}
                  type="text"
                  value={inputValue}
                  onChange={(e) => {
                    setInputValue(e.target.value)
                    if (!open) setOpen(true)
                  }}
                  onKeyDown={handleInputKeyDown}
                  onBlur={handleInputBlur}
                  onClick={() => !isLoading && setOpen(true)}
                  placeholder={selectedLabels.length === 0 ? (isLoading ? "Loading options..." : placeholder) : ""}
                  disabled={isLoading || creating}
                  className="flex-1 min-w-[120px] outline-none bg-transparent placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50"
                />
                {(isLoading || creating) && (
                  <Loader2 className="h-4 w-4 animate-spin text-muted-foreground flex-shrink-0" />
                )}
                {!isLoading && !creating && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.preventDefault()
                      e.stopPropagation()
                      setOpen(!open)
                    }}
                    className="flex-shrink-0 focus:outline-none"
                  >
                    <ChevronsUpDown className="h-4 w-4 text-muted-foreground" />
                  </button>
                )}
              </div>
            </div>
          </div>
        </PopoverTrigger>
          <PopoverContent
            className="p-0"
            align="start"
            style={{ width: triggerRef.current ? `${triggerRef.current.offsetWidth}px` : 'auto' }}
            onOpenAutoFocus={(e) => e.preventDefault()}
          >
          <Command shouldFilter={false}>
            <CommandList>
              {isLoading && filteredOptions.length === 0 ? (
                <div className="flex items-center justify-center py-8 text-sm text-muted-foreground">
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Loading labels...
                </div>
              ) : filteredOptions.length === 0 && !showCreateOption ? (
                <CommandEmpty>No labels found.</CommandEmpty>
              ) : null}
              <CommandGroup>
                {filteredOptions.map((option) => (
                  <CommandItem
                    key={option.value}
                    value={option.value}
                    onSelect={() => handleSelect(option.value)}
                  >
                    <Check
                      className={cn(
                        "mr-2 h-4 w-4",
                        value.includes(option.value) ? "opacity-100" : "opacity-0"
                      )}
                    />
                    <Badge variant="outline" className="mr-2">
                      {option.label}
                    </Badge>
                  </CommandItem>
                ))}
                {showCreateOption && (
                  <CommandItem
                    value={`create-${activeSearch}`}
                    onSelect={() => createLabel(activeSearch)}
                    disabled={creating}
                    className="text-primary"
                  >
                    {creating ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Creating...
                      </>
                    ) : (
                      <>
                        <Plus className="mr-2 h-4 w-4" />
                        Create label "{activeSearch}"
                      </>
                    )}
                  </CommandItem>
                )}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  )
}
