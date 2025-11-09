"use client"

import React, { useState, useEffect } from 'react'
import { Mail, User } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList
} from '@/components/ui/command'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'

interface Contact {
  email: string
  name?: string
}

interface ContactPickerProps {
  value?: string // Comma-separated emails
  onChange: (value: string) => void
  placeholder?: string
  disabled?: boolean
  className?: string
  loadOnMount?: boolean
  dynamic?: string
}

// TODO: Load contacts from dynamic source (Gmail contacts)
function useContactSuggestions(dynamic?: string): Contact[] {
  const [contacts, setContacts] = useState<Contact[]>([])

  useEffect(() => {
    // TODO: Fetch from dynamic source
    // For now, return empty array
    setContacts([])
  }, [dynamic])

  return contacts
}

export function ContactPicker({
  value,
  onChange,
  placeholder = "Type email addresses or names",
  disabled = false,
  className,
  loadOnMount,
  dynamic
}: ContactPickerProps) {
  const [inputValue, setInputValue] = useState('')
  const [open, setOpen] = useState(false)
  const contacts = useContactSuggestions(dynamic)

  const emails = value ? value.split(',').map(e => e.trim()).filter(Boolean) : []

  const addEmail = (email: string) => {
    if (!emails.includes(email)) {
      const updated = [...emails, email].join(', ')
      onChange(updated)
    }
    setInputValue('')
    setOpen(false)
  }

  const removeEmail = (emailToRemove: string) => {
    const updated = emails.filter(e => e !== emailToRemove).join(', ')
    onChange(updated)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault()
      if (inputValue.trim()) {
        addEmail(inputValue.trim())
      }
    }
  }

  return (
    <div className={cn("space-y-2", className)}>
      {/* Selected emails */}
      {emails.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {emails.map((email) => (
            <Badge key={email} variant="secondary" className="gap-1">
              <Mail className="h-3 w-3" />
              {email}
              <button
                type="button"
                onClick={() => removeEmail(email)}
                disabled={disabled}
                className="ml-1 hover:bg-secondary-foreground/20 rounded-full p-0.5"
              >
                ×
              </button>
            </Badge>
          ))}
        </div>
      )}

      {/* Input with autocomplete */}
      <Popover open={open && contacts.length > 0} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <div className="relative">
            <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              type="text"
              value={inputValue}
              onChange={(e) => {
                setInputValue(e.target.value)
                setOpen(true)
              }}
              onKeyDown={handleKeyDown}
              placeholder={placeholder}
              disabled={disabled}
              className="pl-9"
            />
          </div>
        </PopoverTrigger>
        {contacts.length > 0 && (
          <PopoverContent className="w-full p-0" align="start">
            <Command>
              <CommandList>
                <CommandEmpty>No contacts found.</CommandEmpty>
                <CommandGroup>
                  {contacts.map((contact) => (
                    <CommandItem
                      key={contact.email}
                      value={contact.email}
                      onSelect={() => addEmail(contact.email)}
                    >
                      <Mail className="mr-2 h-4 w-4" />
                      <div className="flex flex-col">
                        {contact.name && (
                          <span className="font-medium">{contact.name}</span>
                        )}
                        <span className="text-sm text-muted-foreground">
                          {contact.email}
                        </span>
                      </div>
                    </CommandItem>
                  ))}
                </CommandGroup>
              </CommandList>
            </Command>
          </PopoverContent>
        )}
      </Popover>

      <p className="text-xs text-muted-foreground">
        Type emails separated by commas or press Enter
      </p>
    </div>
  )
}
