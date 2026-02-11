"use client"

import { useState, useEffect } from "react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Badge } from "@/components/ui/badge"
import { Keyboard } from "lucide-react"
import { type KeyboardShortcut, formatShortcut } from "@/hooks/useKeyboardShortcuts"

interface KeyboardShortcutsHelpProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  shortcuts: KeyboardShortcut[]
  title?: string
}

export function KeyboardShortcutsHelp({
  open,
  onOpenChange,
  shortcuts,
  title = "Keyboard Shortcuts"
}: KeyboardShortcutsHelpProps) {
  // Group shortcuts by category
  const groupedShortcuts = shortcuts.reduce((acc, shortcut) => {
    const category = shortcut.category || 'General'
    if (!acc[category]) {
      acc[category] = []
    }
    acc[category].push(shortcut)
    return acc
  }, {} as Record<string, KeyboardShortcut[]>)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Keyboard className="w-5 h-5" />
            {title}
          </DialogTitle>
          <DialogDescription>
            Use these shortcuts to work faster
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {Object.entries(groupedShortcuts).map(([category, categoryShortcuts]) => (
            <div key={category}>
              <h4 className="text-sm font-medium text-muted-foreground mb-2">
                {category}
              </h4>
              <div className="space-y-2">
                {categoryShortcuts.map((shortcut, index) => (
                  <div
                    key={`${shortcut.key}-${index}`}
                    className="flex items-center justify-between py-1.5 px-2 rounded-md hover:bg-muted/50"
                  >
                    <span className="text-sm">{shortcut.description}</span>
                    <kbd className="inline-flex items-center gap-1 px-2 py-1 text-xs font-mono bg-muted rounded border">
                      {formatShortcut(shortcut)}
                    </kbd>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        <div className="text-xs text-muted-foreground text-center pt-2 border-t">
          Press <kbd className="px-1.5 py-0.5 bg-muted rounded text-[10px] font-mono">?</kbd> to show this help
        </div>
      </DialogContent>
    </Dialog>
  )
}

/**
 * Hook to show keyboard shortcuts help with '?' key
 */
export function useKeyboardShortcutsHelp(shortcuts: KeyboardShortcut[]) {
  const [isOpen, setIsOpen] = useState(false)

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      // Show help on '?' key (Shift + /)
      if (event.key === '?' && !event.ctrlKey && !event.metaKey && !event.altKey) {
        const target = event.target as HTMLElement
        const isInput = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable

        if (!isInput) {
          event.preventDefault()
          setIsOpen(true)
        }
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [])

  return {
    isOpen,
    setIsOpen,
    shortcuts,
    HelpDialog: () => (
      <KeyboardShortcutsHelp
        open={isOpen}
        onOpenChange={setIsOpen}
        shortcuts={shortcuts}
      />
    )
  }
}
