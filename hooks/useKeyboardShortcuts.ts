"use client"

import { useEffect, useCallback, useRef } from "react"

export interface KeyboardShortcut {
  key: string
  ctrl?: boolean
  meta?: boolean
  shift?: boolean
  alt?: boolean
  handler: () => void
  description: string
  category?: string
}

interface UseKeyboardShortcutsOptions {
  shortcuts: KeyboardShortcut[]
  enabled?: boolean
  /** Disable shortcuts when user is typing in an input/textarea */
  disableWhenTyping?: boolean
}

/**
 * Hook to handle keyboard shortcuts globally
 *
 * Usage:
 * ```tsx
 * useKeyboardShortcuts({
 *   shortcuts: [
 *     { key: 'n', handler: () => createNew(), description: 'Create new workflow' },
 *     { key: 'd', handler: () => duplicate(), description: 'Duplicate selected' },
 *     { key: 'Delete', handler: () => deleteSelected(), description: 'Delete selected' },
 *     { key: 'e', handler: () => edit(), description: 'Edit selected' },
 *   ]
 * })
 * ```
 */
export function useKeyboardShortcuts({
  shortcuts,
  enabled = true,
  disableWhenTyping = true
}: UseKeyboardShortcutsOptions) {
  const shortcutsRef = useRef(shortcuts)
  shortcutsRef.current = shortcuts

  const handleKeyDown = useCallback((event: KeyboardEvent) => {
    if (!enabled) return

    // Don't trigger shortcuts when typing in input fields
    if (disableWhenTyping) {
      const target = event.target as HTMLElement
      const tagName = target.tagName.toLowerCase()
      const isEditable = target.isContentEditable
      const isInput = tagName === 'input' || tagName === 'textarea' || tagName === 'select'

      if (isInput || isEditable) {
        return
      }
    }

    const matchedShortcut = shortcutsRef.current.find(shortcut => {
      const keyMatch = event.key.toLowerCase() === shortcut.key.toLowerCase()
      const ctrlMatch = shortcut.ctrl ? (event.ctrlKey || event.metaKey) : !event.ctrlKey
      const metaMatch = shortcut.meta ? event.metaKey : !shortcut.meta
      const shiftMatch = shortcut.shift ? event.shiftKey : !event.shiftKey
      const altMatch = shortcut.alt ? event.altKey : !event.altKey

      // For shortcuts that require ctrl/cmd, check both
      if (shortcut.ctrl) {
        return keyMatch && (event.ctrlKey || event.metaKey) && shiftMatch && altMatch
      }

      return keyMatch && ctrlMatch && metaMatch && shiftMatch && altMatch
    })

    if (matchedShortcut) {
      event.preventDefault()
      matchedShortcut.handler()
    }
  }, [enabled, disableWhenTyping])

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [handleKeyDown])

  return {
    shortcuts: shortcutsRef.current
  }
}

/**
 * Format a shortcut for display
 * e.g., { key: 'd', ctrl: true } => "⌘D" on Mac, "Ctrl+D" on Windows
 */
export function formatShortcut(shortcut: Pick<KeyboardShortcut, 'key' | 'ctrl' | 'meta' | 'shift' | 'alt'>): string {
  const isMac = typeof window !== 'undefined' && navigator.platform.toUpperCase().includes('MAC')
  const parts: string[] = []

  if (shortcut.ctrl || shortcut.meta) {
    parts.push(isMac ? '⌘' : 'Ctrl')
  }
  if (shortcut.alt) {
    parts.push(isMac ? '⌥' : 'Alt')
  }
  if (shortcut.shift) {
    parts.push(isMac ? '⇧' : 'Shift')
  }

  // Format the key
  let keyDisplay = shortcut.key.toUpperCase()
  if (shortcut.key === 'Delete' || shortcut.key === 'Backspace') {
    keyDisplay = isMac ? '⌫' : 'Del'
  } else if (shortcut.key === 'Escape') {
    keyDisplay = 'Esc'
  } else if (shortcut.key === 'Enter') {
    keyDisplay = '↵'
  } else if (shortcut.key === 'ArrowUp') {
    keyDisplay = '↑'
  } else if (shortcut.key === 'ArrowDown') {
    keyDisplay = '↓'
  } else if (shortcut.key === 'ArrowLeft') {
    keyDisplay = '←'
  } else if (shortcut.key === 'ArrowRight') {
    keyDisplay = '→'
  }

  parts.push(keyDisplay)

  return isMac ? parts.join('') : parts.join('+')
}

/**
 * Common workflow shortcuts configuration
 */
export function getWorkflowShortcuts(handlers: {
  onNew?: () => void
  onDuplicate?: () => void
  onDelete?: () => void
  onEdit?: () => void
  onSelectAll?: () => void
  onDeselectAll?: () => void
  onToggleStatus?: () => void
  onSearch?: () => void
}): KeyboardShortcut[] {
  const shortcuts: KeyboardShortcut[] = []

  if (handlers.onNew) {
    shortcuts.push({
      key: 'n',
      handler: handlers.onNew,
      description: 'Create new workflow',
      category: 'Workflows'
    })
  }

  if (handlers.onDuplicate) {
    shortcuts.push({
      key: 'd',
      handler: handlers.onDuplicate,
      description: 'Duplicate selected workflow',
      category: 'Workflows'
    })
  }

  if (handlers.onDelete) {
    shortcuts.push({
      key: 'Delete',
      handler: handlers.onDelete,
      description: 'Delete selected workflows',
      category: 'Workflows'
    })
    shortcuts.push({
      key: 'Backspace',
      handler: handlers.onDelete,
      description: 'Delete selected workflows',
      category: 'Workflows'
    })
  }

  if (handlers.onEdit) {
    shortcuts.push({
      key: 'e',
      handler: handlers.onEdit,
      description: 'Edit selected workflow',
      category: 'Workflows'
    })
    shortcuts.push({
      key: 'Enter',
      handler: handlers.onEdit,
      description: 'Open selected workflow',
      category: 'Workflows'
    })
  }

  if (handlers.onSelectAll) {
    shortcuts.push({
      key: 'a',
      ctrl: true,
      handler: handlers.onSelectAll,
      description: 'Select all workflows',
      category: 'Selection'
    })
  }

  if (handlers.onDeselectAll) {
    shortcuts.push({
      key: 'Escape',
      handler: handlers.onDeselectAll,
      description: 'Deselect all',
      category: 'Selection'
    })
  }

  if (handlers.onToggleStatus) {
    shortcuts.push({
      key: 's',
      handler: handlers.onToggleStatus,
      description: 'Toggle workflow status (active/draft)',
      category: 'Workflows'
    })
  }

  if (handlers.onSearch) {
    shortcuts.push({
      key: '/',
      handler: handlers.onSearch,
      description: 'Focus search',
      category: 'Navigation'
    })
  }

  return shortcuts
}
