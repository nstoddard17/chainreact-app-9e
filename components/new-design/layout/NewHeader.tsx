"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Command } from "lucide-react"
import { CommandPalette } from "@/components/new-design/CommandPalette"
import { NotificationDropdown } from "@/components/ui/notification-dropdown"
import { Breadcrumbs } from "@/components/common/Breadcrumbs"

interface BreadcrumbItem {
  label: string
  href?: string
  icon?: React.ReactNode
}

interface NewHeaderProps {
  title?: string
  subtitle?: string
  actions?: React.ReactNode
  /** Controlled command palette state */
  commandPaletteOpen?: boolean
  /** Callback for command palette state changes */
  onCommandPaletteOpenChange?: (open: boolean) => void
  /** Show breadcrumb navigation */
  showBreadcrumbs?: boolean
  /** Custom breadcrumb items (auto-generated if not provided) */
  breadcrumbItems?: BreadcrumbItem[]
}

export function NewHeader({
  title,
  subtitle,
  actions,
  commandPaletteOpen: controlledOpen,
  onCommandPaletteOpenChange,
  showBreadcrumbs = false,
  breadcrumbItems,
}: NewHeaderProps) {
  // Use controlled state if provided, otherwise use internal state
  const [internalOpen, setInternalOpen] = useState(false)
  const isControlled = controlledOpen !== undefined
  const isOpen = isControlled ? controlledOpen : internalOpen
  const setIsOpen = isControlled ? onCommandPaletteOpenChange! : setInternalOpen

  // Keyboard shortcut: Cmd+K or Ctrl+K (only if not controlled)
  useEffect(() => {
    if (isControlled) return // Parent handles shortcuts

    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault()
        setInternalOpen(true)
      }
    }

    document.addEventListener("keydown", handleKeyDown)
    return () => document.removeEventListener("keydown", handleKeyDown)
  }, [isControlled])

  return (
    <div className="h-14 bg-gray-50 dark:bg-gray-950 flex items-center justify-between px-6">
      {/* Left Side - Breadcrumbs, Title and Subtitle */}
      <div className="flex-1 min-w-0 flex flex-col justify-center">
        {/* Breadcrumbs */}
        {showBreadcrumbs && (
          <Breadcrumbs
            items={breadcrumbItems}
            className="mb-0.5"
            showHome={true}
          />
        )}
        {/* Title */}
        {title && !showBreadcrumbs && (
          <div>
            <h1 className="text-xl font-semibold truncate">{title}</h1>
            {subtitle && (
              <p className="text-sm text-muted-foreground truncate">{subtitle}</p>
            )}
          </div>
        )}
      </div>

      {/* Right Side - Search, Notifications, Actions */}
      <div className="flex items-center gap-3">
        {/* Quick Search */}
        <Button
          variant="outline"
          className="hidden md:flex items-center gap-2 text-muted-foreground"
          onClick={() => setIsOpen(true)}
        >
          <span className="text-sm">Search</span>
          <kbd className="pointer-events-none inline-flex h-5 select-none items-center gap-1 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium text-muted-foreground opacity-100">
            <Command className="w-3 h-3" />K
          </kbd>
        </Button>

        {/* Notifications */}
        <NotificationDropdown />

        {/* Custom Actions */}
        {actions}
      </div>

      {/* Command Palette */}
      <CommandPalette open={isOpen} onOpenChange={setIsOpen} />
    </div>
  )
}
