"use client"

import { useEffect, useState, useCallback } from "react"
import { useRouter, usePathname } from "next/navigation"
import { useKeyboardShortcuts, type KeyboardShortcut, formatShortcut } from "@/hooks/useKeyboardShortcuts"
import { KeyboardShortcutsHelp } from "./KeyboardShortcutsHelp"

interface GlobalKeyboardShortcutsProps {
  /** Command palette open state setter */
  onOpenCommandPalette?: () => void
  /** Callback for save action (context-dependent) */
  onSave?: () => void
  /** Additional page-specific shortcuts */
  pageShortcuts?: KeyboardShortcut[]
  children?: React.ReactNode
}

/**
 * Global keyboard shortcuts provider
 * Provides consistent keyboard shortcuts across the entire app
 *
 * Standard shortcuts:
 * - Cmd/Ctrl+K: Open command palette
 * - Cmd/Ctrl+S: Save (context-dependent)
 * - Cmd/Ctrl+N: New workflow
 * - Escape: Close dialogs/modals
 * - ?: Show keyboard shortcuts help
 * - /: Focus search
 * - G then W: Go to Workflows
 * - G then T: Go to Templates
 * - G then I: Go to Integrations
 * - G then S: Go to Settings
 */
export function GlobalKeyboardShortcuts({
  onOpenCommandPalette,
  onSave,
  pageShortcuts = [],
  children,
}: GlobalKeyboardShortcutsProps) {
  const router = useRouter()
  const pathname = usePathname()
  const [showHelp, setShowHelp] = useState(false)
  const [pendingGoTo, setPendingGoTo] = useState(false)

  // Build global shortcuts
  const globalShortcuts: KeyboardShortcut[] = [
    // Command palette
    ...(onOpenCommandPalette
      ? [{
          key: "k",
          ctrl: true,
          handler: onOpenCommandPalette,
          description: "Open command palette",
          category: "Navigation",
        }]
      : []),

    // Save
    ...(onSave
      ? [{
          key: "s",
          ctrl: true,
          handler: () => {
            onSave()
          },
          description: "Save",
          category: "Actions",
        }]
      : []),

    // New workflow
    {
      key: "n",
      ctrl: true,
      handler: () => {
        router.push("/workflows/new")
      },
      description: "New workflow",
      category: "Actions",
    },

    // Show help
    {
      key: "?",
      handler: () => setShowHelp(true),
      description: "Show keyboard shortcuts",
      category: "Help",
    },

    // Go-to shortcuts (G then letter)
    {
      key: "g",
      handler: () => {
        setPendingGoTo(true)
        // Auto-cancel after 2 seconds
        setTimeout(() => setPendingGoTo(false), 2000)
      },
      description: "Go to... (press G then W/T/I/S/A)",
      category: "Navigation",
    },

    // Page-specific shortcuts
    ...pageShortcuts,
  ]

  // Handle go-to shortcuts (two-key combo)
  useEffect(() => {
    if (!pendingGoTo) return

    const handleGoTo = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement
      const isInput = target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable
      if (isInput) return

      const key = event.key.toLowerCase()
      let route: string | null = null

      switch (key) {
        case "w":
          route = "/workflows"
          break
        case "t":
          route = "/templates"
          break
        case "i":
          route = "/integrations"
          break
        case "s":
          route = "/settings"
          break
        case "a":
          route = "/analytics"
          break
        case "h":
          route = "/dashboard"
          break
        case "d":
          route = "/dashboard"
          break
      }

      if (route) {
        event.preventDefault()
        router.push(route)
      }

      setPendingGoTo(false)
    }

    document.addEventListener("keydown", handleGoTo)
    return () => document.removeEventListener("keydown", handleGoTo)
  }, [pendingGoTo, router])

  // Initialize keyboard shortcuts
  useKeyboardShortcuts({
    shortcuts: globalShortcuts,
    enabled: true,
    disableWhenTyping: true,
  })

  // All shortcuts for help dialog
  const allShortcuts: KeyboardShortcut[] = [
    ...globalShortcuts,
    // Go-to sub-shortcuts
    {
      key: "g w",
      handler: () => router.push("/workflows"),
      description: "Go to Workflows",
      category: "Navigation",
    },
    {
      key: "g t",
      handler: () => router.push("/templates"),
      description: "Go to Templates",
      category: "Navigation",
    },
    {
      key: "g i",
      handler: () => router.push("/integrations"),
      description: "Go to Integrations",
      category: "Navigation",
    },
    {
      key: "g s",
      handler: () => router.push("/settings"),
      description: "Go to Settings",
      category: "Navigation",
    },
    {
      key: "g a",
      handler: () => router.push("/analytics"),
      description: "Go to Analytics",
      category: "Navigation",
    },
    {
      key: "g h",
      handler: () => router.push("/dashboard"),
      description: "Go to Dashboard",
      category: "Navigation",
    },
  ].filter((s) => s.key !== "g") // Remove the "g" trigger from help

  return (
    <>
      {children}

      {/* Pending go-to indicator */}
      {pendingGoTo && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50">
          <div className="bg-foreground text-background px-4 py-2 rounded-lg shadow-lg flex items-center gap-2 text-sm">
            <kbd className="px-2 py-0.5 bg-background/20 rounded text-xs font-mono">g</kbd>
            <span>then press:</span>
            <kbd className="px-2 py-0.5 bg-background/20 rounded text-xs font-mono">w</kbd>
            <span>Workflows</span>
            <kbd className="px-2 py-0.5 bg-background/20 rounded text-xs font-mono">t</kbd>
            <span>Templates</span>
            <kbd className="px-2 py-0.5 bg-background/20 rounded text-xs font-mono">i</kbd>
            <span>Integrations</span>
          </div>
        </div>
      )}

      <KeyboardShortcutsHelp
        open={showHelp}
        onOpenChange={setShowHelp}
        shortcuts={allShortcuts}
        title="Keyboard Shortcuts"
      />
    </>
  )
}

/**
 * Hook to get keyboard shortcut badge for display
 */
export function useShortcutBadge(shortcut: Pick<KeyboardShortcut, "key" | "ctrl" | "meta" | "shift" | "alt">) {
  const [formatted, setFormatted] = useState("")

  useEffect(() => {
    setFormatted(formatShortcut(shortcut))
  }, [shortcut])

  return formatted
}

/**
 * Keyboard shortcut badge component for inline display
 */
export function ShortcutBadge({
  shortcut,
  className,
}: {
  shortcut: Pick<KeyboardShortcut, "key" | "ctrl" | "meta" | "shift" | "alt">
  className?: string
}) {
  const formatted = useShortcutBadge(shortcut)

  return (
    <kbd
      className={`inline-flex items-center px-1.5 py-0.5 text-[10px] font-mono bg-muted/50 text-muted-foreground rounded border border-muted ${className || ""}`}
    >
      {formatted}
    </kbd>
  )
}
