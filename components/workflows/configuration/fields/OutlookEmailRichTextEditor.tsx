"use client"

import React, { useState, useEffect, useRef, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Badge } from '@/components/ui/badge'
import { FileSignature, ChevronDown, Building, User } from 'lucide-react'
import { useToast } from '@/hooks/use-toast'
import { useVariableDropTarget } from '../hooks/useVariableDropTarget'
import { insertVariableIntoContentEditable, normalizeDraggedVariable } from '@/lib/workflows/variableInsertion'

import { logger } from '@/lib/utils/logger'

interface OutlookSignature {
  id: string
  name: string
  content: string
  isDefault: boolean
  email?: string
  displayName?: string
}

interface OutlookEmailRichTextEditorProps {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  className?: string
  error?: string
  userId?: string
  // autoIncludeSignature removed - signatures must be manually added
}

export function OutlookEmailRichTextEditor({
  value,
  onChange,
  placeholder = "Compose your email...",
  className = "",
  error,
  userId
}: OutlookEmailRichTextEditorProps) {
  const [signatures, setSignatures] = useState<OutlookSignature[]>([])
  const [selectedSignature, setSelectedSignature] = useState<string>('')
  const [isLoadingSignatures, setIsLoadingSignatures] = useState(false)
  const [profile, setProfile] = useState<any>(null)
  const { toast } = useToast()
  const editorRef = useRef<HTMLDivElement | null>(null)

  const handleVariableInsert = useCallback((rawVariable: string) => {
    if (!editorRef.current) return

    const variableText = normalizeDraggedVariable(rawVariable)
    if (!variableText) return

    const updatedHtml = insertVariableIntoContentEditable(editorRef.current, variableText)
    onChange(updatedHtml)
  }, [onChange])

  const { eventHandlers: dropHandlers, isDragOver } = useVariableDropTarget({
    fieldId: "outlook-email-body",
    fieldLabel: "Email Body",
    elementRef: editorRef,
    onInsert: handleVariableInsert
  })

  // Load Outlook signatures
  useEffect(() => {
    if (userId) {
      loadOutlookSignatures()
    }
  }, [userId])

  const loadOutlookSignatures = async () => {
    try {
      setIsLoadingSignatures(true)
      const response = await fetch(`/api/integrations/microsoft-outlook/signatures?userId=${userId}`)
      
      if (response.ok) {
        const data = await response.json()
        setSignatures(data.signatures || [])
        setProfile(data.profile)
        
        // Check if signature is already present but DON'T auto-add
        const defaultSignature = data.signatures?.find((sig: OutlookSignature) => sig.isDefault)
        if (defaultSignature) {
          // Check if signature is already in the content
          if (value && value.includes(defaultSignature.content)) {
            // If the signature is already in the value, just set it as selected
            setSelectedSignature(defaultSignature.id)
          }
          // Don't auto-add signature - user must manually add it using the signature button
        }
      } else {
        logger.error('Failed to load Outlook signatures:', response.status)
      }
    } catch (error) {
      logger.error('Failed to load Outlook signatures:', error)
    } finally {
      setIsLoadingSignatures(false)
    }
  }

  const insertSignature = (signatureId: string) => {
    const signature = signatures.find(s => s.id === signatureId)
    if (signature) {
      // Remove existing signature if any
      let newValue = value
      signatures.forEach(sig => {
        newValue = newValue.replace(sig.content, '').trim()
      })
      
      // Add new signature
      newValue = `${newValue }\n\n${ signature.content}`
      onChange(newValue)
      setSelectedSignature(signatureId)
      
      toast({
        title: "Signature added",
        description: `${signature.name} signature has been added to your email.`,
      })
    }
  }

  return (
    <div className={`space-y-4 ${className}`}>
      {/* Outlook-specific toolbar */}
      <div className="flex items-center gap-2 p-2 border rounded-lg bg-blue-50">
        <Building className="h-4 w-4 text-blue-600" />
        <span className="text-sm text-blue-600">Outlook Signatures</span>
        
        {profile && (
          <div className="flex items-center gap-1 text-xs text-blue-600">
            <User className="h-3 w-3" />
            {profile.displayName} ({profile.emailAddress})
          </div>
        )}
        
        {signatures.length > 0 && (
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" disabled={isLoadingSignatures}>
                {selectedSignature ? 
                  signatures.find(s => s.id === selectedSignature)?.name || 'Select signature'
                  : 'Select signature'
                }
                <ChevronDown className="ml-2 h-4 w-4" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-80">
              <div className="space-y-2">
                <h4 className="font-medium">Outlook Signatures</h4>
                <ScrollArea className="max-h-60">
                  {signatures.map((signature) => (
                    <div key={signature.id} className="p-2 hover:bg-gray-100 rounded cursor-pointer">
                      <div className="flex items-center justify-between">
                        <span className="font-medium">{signature.name}</span>
                        {signature.isDefault && <Badge variant="secondary">Default</Badge>}
                      </div>
                      {signature.email && (
                        <div className="text-xs text-gray-500">{signature.email}</div>
                      )}
                      <div 
                        className="text-sm text-gray-600 mt-1 max-h-20 overflow-hidden"
                        dangerouslySetInnerHTML={{ __html: signature.content }}
                      />
                      <Button 
                        size="sm" 
                        variant="outline" 
                        className="mt-2"
                        onClick={() => insertSignature(signature.id)}
                      >
                        Insert
                      </Button>
                    </div>
                  ))}
                </ScrollArea>
              </div>
            </PopoverContent>
          </Popover>
        )}
      </div>

      {/* Rich text area for Outlook with HTML support */}
      <div className="relative">
        <div
          ref={editorRef}
          contentEditable
          dangerouslySetInnerHTML={{ __html: value }}
          onInput={(e) => onChange(e.currentTarget.innerHTML)}
          onFocus={dropHandlers.onFocus}
          onBlur={dropHandlers.onBlur}
          onDragOver={dropHandlers.onDragOver}
          onDragLeave={dropHandlers.onDragLeave}
          onDrop={dropHandlers.onDrop}
          className={`w-full min-h-[200px] p-3 border rounded-lg resize-y focus:outline-none focus:ring-2 focus:ring-blue-500 ${
            error ? 'border-red-500' : 'border-gray-300'
          } ${isDragOver ? 'ring-2 ring-blue-500 ring-offset-1' : ''}`}
          style={{ 
            whiteSpace: 'pre-wrap',
            fontFamily: 'Segoe UI, Tahoma, Geneva, Verdana, sans-serif',
            fontSize: '14px',
            lineHeight: '1.5'
          }}
          suppressContentEditableWarning
        />
        {!value && (
          <div className="absolute inset-0 p-3 pointer-events-none text-gray-400">
            {placeholder}
          </div>
        )}
        {error && <p className="text-red-500 text-sm mt-1">{error}</p>}
      </div>
    </div>
  )
}
