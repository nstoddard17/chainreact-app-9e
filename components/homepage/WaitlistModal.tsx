"use client"

import React from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { WaitlistForm } from '@/components/waitlist/WaitlistForm'
import { Sparkles } from 'lucide-react'

interface WaitlistModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function WaitlistModal({ open, onOpenChange }: WaitlistModalProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-2xl font-bold flex items-center gap-2">
            <Sparkles className="w-6 h-6 text-blue-500" />
            Join the ChainReact Waitlist
          </DialogTitle>
          <DialogDescription className="text-base">
            Be among the first to experience the future of workflow automation. Get early access, exclusive features, and help shape the product.
          </DialogDescription>
        </DialogHeader>
        <WaitlistForm />
      </DialogContent>
    </Dialog>
  )
}