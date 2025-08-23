"use client"

import React, { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { FileSignature, ChevronDown } from 'lucide-react'
import { useToast } from '@/hooks/use-toast'

interface GmailSignature {
  id: string
  name: string
  content: string
  isDefault: boolean
}

interface GmailEmailRichTextEditorProps {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  className?: string
  error?: string
  userId?: string
  autoIncludeSignature?: boolean
}

export function GmailEmailRichTextEditor({
  value,
  onChange,
  placeholder = "Compose your email...",
  className = "",
  error,
  userId,
  autoIncludeSignature = false
}: GmailEmailRichTextEditorProps) {
  const [signatures, setSignatures] = useState<GmailSignature[]>([])
  const [selectedSignature, setSelectedSignature] = useState<string>('')
  const [isLoadingSignatures, setIsLoadingSignatures] = useState(false)
  const { toast } = useToast()

  // Load Gmail signatures
  useEffect(() => {
    if (userId) {
      loadGmailSignatures()
    }
  }, [userId])

  const loadGmailSignatures = async () => {
    try {
      setIsLoadingSignatures(true)
      const response = await fetch(`/api/integrations/gmail/signatures?userId=${userId}`)
      
      if (response.ok) {
        const data = await response.json()
        setSignatures(data.signatures || [])
        
        // Auto-select default signature
        const defaultSignature = data.signatures?.find((sig: GmailSignature) => sig.isDefault)
        if (defaultSignature && autoIncludeSignature && !value.includes(defaultSignature.content)) {
          setSelectedSignature(defaultSignature.id)
          onChange(value + '\n\n' + defaultSignature.content)
        }
      } else {
        console.error('Failed to load Gmail signatures:', response.status)
      }
    } catch (error) {
      console.error('Failed to load Gmail signatures:', error)
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
      newValue = newValue + '\n\n' + signature.content
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
      {/* Gmail-specific toolbar */}
      <div className="flex items-center gap-2 p-2 border rounded-lg bg-gray-50">
        <FileSignature className="h-4 w-4 text-gray-600" />
        <span className="text-sm text-gray-600">Gmail Signatures</span>
        
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
                <h4 className="font-medium">Gmail Signatures</h4>
                <ScrollArea className="max-h-60">
                  {signatures.map((signature) => (
                    <div key={signature.id} className="p-2 hover:bg-gray-100 rounded cursor-pointer">
                      <div className="flex items-center justify-between">
                        <span className="font-medium">{signature.name}</span>
                        {signature.isDefault && <Badge variant="secondary">Default</Badge>}
                      </div>
                      <div 
                        className="text-sm text-gray-600 mt-1 truncate"
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

      {/* Simple textarea for Gmail */}
      <div>
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className={`w-full min-h-[200px] p-3 border rounded-lg resize-y focus:outline-none focus:ring-2 focus:ring-blue-500 ${
            error ? 'border-red-500' : 'border-gray-300'
          }`}
        />
        {error && <p className="text-red-500 text-sm mt-1">{error}</p>}
      </div>
    </div>
  )
}