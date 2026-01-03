'use client'

import React, { useState } from 'react'
import { Sparkles, Loader2, Check, X, ArrowRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

interface PromptEnhancerProps {
  prompt: string
  connectedIntegrations: string[]
  onUseEnhanced: (enhancedPrompt: string) => void
  disabled?: boolean
  variant?: 'default' | 'coral'
}

export function PromptEnhancer({
  prompt,
  connectedIntegrations,
  onUseEnhanced,
  disabled = false,
  variant = 'default',
}: PromptEnhancerProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [enhancedPrompt, setEnhancedPrompt] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const handleEnhance = async () => {
    if (!prompt.trim() || prompt.trim().length < 5) {
      return
    }

    setIsOpen(true)
    setIsLoading(true)
    setError(null)
    setEnhancedPrompt(null)

    try {
      const response = await fetch('/api/ai/enhance-prompt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: prompt.trim(),
          connectedIntegrations,
        }),
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || 'Failed to enhance prompt')
      }

      const data = await response.json()
      setEnhancedPrompt(data.enhanced)
    } catch (err: any) {
      setError(err.message || 'Something went wrong')
    } finally {
      setIsLoading(false)
    }
  }

  const handleUseEnhanced = () => {
    if (enhancedPrompt) {
      onUseEnhanced(enhancedPrompt)
      setIsOpen(false)
      setEnhancedPrompt(null)
    }
  }

  const handleKeepOriginal = () => {
    setIsOpen(false)
    setEnhancedPrompt(null)
  }

  const canEnhance = prompt.trim().length >= 5

  const isCoral = variant === 'coral'

  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        onClick={handleEnhance}
        disabled={disabled || !canEnhance}
        className={
          isCoral
            ? "h-7 px-3 text-xs text-white/50 hover:text-white hover:bg-white/10 gap-1.5 rounded-lg"
            : "h-5 px-1.5 text-[10px] text-muted-foreground hover:text-foreground hover:bg-accent/50 gap-0.5"
        }
        title={canEnhance ? 'Enhance prompt with AI' : 'Type at least 5 characters to enhance'}
      >
        <Sparkles className={isCoral ? "w-3.5 h-3.5 text-orange-400" : "w-2.5 h-2.5 text-purple-500"} />
        {isCoral ? "Enhance with AI" : "enhance"}
      </Button>

      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-purple-500" />
              Enhance Your Prompt
            </DialogTitle>
            <DialogDescription>
              AI will make your prompt more specific for better workflow results
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            {/* Original prompt */}
            <div className="space-y-2">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Your prompt
              </label>
              <div className="p-3 bg-muted/50 rounded-lg text-sm">
                {prompt}
              </div>
            </div>

            {/* Loading state */}
            {isLoading && (
              <div className="flex items-center justify-center py-8">
                <div className="flex items-center gap-3 text-muted-foreground">
                  <Loader2 className="w-5 h-5 animate-spin" />
                  <span className="text-sm">Enhancing your prompt...</span>
                </div>
              </div>
            )}

            {/* Error state */}
            {error && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
                <p className="text-sm text-red-700">{error}</p>
              </div>
            )}

            {/* Enhanced prompt */}
            {enhancedPrompt && !isLoading && (
              <div className="space-y-2">
                <label className="text-xs font-medium text-purple-600 uppercase tracking-wide flex items-center gap-1">
                  <Sparkles className="w-3 h-3" />
                  Enhanced version
                </label>
                <div className="p-3 bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-800 rounded-lg text-sm">
                  {enhancedPrompt}
                </div>
              </div>
            )}
          </div>

          {/* Actions */}
          {enhancedPrompt && !isLoading && (
            <div className="flex items-center justify-end gap-2 pt-2 border-t">
              <Button
                variant="ghost"
                onClick={handleKeepOriginal}
                className="gap-1.5"
              >
                <X className="w-4 h-4" />
                Keep Original
              </Button>
              <Button
                onClick={handleUseEnhanced}
                className="gap-1.5 bg-purple-600 hover:bg-purple-700"
              >
                <Check className="w-4 h-4" />
                Use Enhanced
              </Button>
            </div>
          )}

          {/* Retry on error */}
          {error && (
            <div className="flex items-center justify-end gap-2 pt-2 border-t">
              <Button
                variant="ghost"
                onClick={() => setIsOpen(false)}
              >
                Cancel
              </Button>
              <Button
                onClick={handleEnhance}
                variant="outline"
              >
                Try Again
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}
