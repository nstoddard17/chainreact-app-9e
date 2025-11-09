"use client"

import React, { useState, useEffect } from 'react'
import { Mail, X } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { Combobox } from '@/components/ui/combobox'

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

// Load contacts from dynamic source (Gmail contacts)
function useContactSuggestions(dynamic?: string, loadOnMount?: boolean): Contact[] {
  const [contacts, setContacts] = useState<Contact[]>([])

  useEffect(() => {
    if (!dynamic || !loadOnMount) return

    const fetchContacts = async () => {
      try {
        // Get the integration ID for Gmail
        const integrationsResponse = await fetch('/api/integrations')
        if (!integrationsResponse.ok) return

        const integrationsData = await integrationsResponse.json()
        const integrations = Array.isArray(integrationsData) ? integrationsData : integrationsData.data || []
        const gmailIntegration = integrations.find((i: any) => i.provider === 'gmail' && i.status === 'connected')

        if (!gmailIntegration) return

        // Fetch recent recipients
        const dataResponse = await fetch('/api/integrations/gmail/data', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            integrationId: gmailIntegration.id,
            dataType: dynamic,
            options: {}
          })
        })

        if (!dataResponse.ok) return

        const result = await dataResponse.json()
        if (result.data && Array.isArray(result.data)) {
          // Transform the data to Contact format
          const transformedContacts: Contact[] = result.data.map((item: any) => ({
            email: item.value || item.email,
            name: item.label || item.name
          }))
          setContacts(transformedContacts)
        }
      } catch (error) {
        console.error('Error loading contacts:', error)
      }
    }

    fetchContacts()
  }, [dynamic, loadOnMount])

  return contacts
}

export function ContactPicker({
  value,
  onChange,
  placeholder = "Select guests",
  disabled = false,
  className,
  loadOnMount,
  dynamic
}: ContactPickerProps) {
  const contacts = useContactSuggestions(dynamic, loadOnMount)
  const emails = value ? value.split(',').map(e => e.trim()).filter(Boolean) : []

  const addEmail = (email: string) => {
    if (!emails.includes(email)) {
      const updated = [...emails, email].join(', ')
      onChange(updated)
    }
  }

  const removeEmail = (emailToRemove: string) => {
    const updated = emails.filter(e => e !== emailToRemove).join(', ')
    onChange(updated)
  }

  // Convert contacts to combobox options format
  const options = contacts.map(contact => ({
    value: contact.email,
    label: contact.name || contact.email
  }))

  // Get currently selected contact for display
  const selectedEmail = emails[emails.length - 1] || ''

  return (
    <div className={cn("space-y-2", className)}>
      {/* Selected emails as badges */}
      {emails.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {emails.map((email) => {
            const contact = contacts.find(c => c.email === email)
            return (
              <Badge key={email} variant="secondary" className="gap-1 px-2 py-1">
                <Mail className="h-3 w-3" />
                <span className="max-w-[200px] truncate">
                  {contact?.name || email}
                </span>
                {!disabled && (
                  <button
                    type="button"
                    onClick={() => removeEmail(email)}
                    className="ml-1 hover:bg-secondary-foreground/20 rounded-full p-0.5"
                  >
                    <X className="h-3 w-3" />
                  </button>
                )}
              </Badge>
            )
          })}
        </div>
      )}

      {/* Combobox for adding emails */}
      <Combobox
        value={selectedEmail}
        onChange={(newEmail) => {
          if (newEmail && newEmail !== selectedEmail) {
            addEmail(newEmail)
          }
        }}
        options={options}
        placeholder={placeholder}
        searchPlaceholder="Search contacts..."
        emptyPlaceholder="No contacts found"
        disabled={disabled}
      />
    </div>
  )
}
