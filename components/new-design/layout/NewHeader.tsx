"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Bell, Command } from "lucide-react"
import { OrganizationSwitcher } from "@/components/new-design/OrganizationSwitcher"
import { CommandPalette } from "@/components/new-design/CommandPalette"

interface NewHeaderProps {
  title?: string
  subtitle?: string
  actions?: React.ReactNode
}

export function NewHeader({ title, subtitle, actions }: NewHeaderProps) {
  const [notifications] = useState(0)
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false)

  // Keyboard shortcut: Cmd+K or Ctrl+K
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault()
        setCommandPaletteOpen(true)
      }
    }

    document.addEventListener("keydown", handleKeyDown)
    return () => document.removeEventListener("keydown", handleKeyDown)
  }, [])

  return (
    <div className="h-14 bg-gray-50 dark:bg-gray-950 flex items-center justify-between px-6">
      {/* Left Side - Title and Subtitle */}
      <div className="flex-1 min-w-0">
        {title && (
          <div>
            <h1 className="text-xl font-semibold truncate">{title}</h1>
            {subtitle && (
              <p className="text-sm text-muted-foreground truncate">{subtitle}</p>
            )}
          </div>
        )}
      </div>

      {/* Right Side - Organization Switcher, Search, Notifications, Actions */}
      <div className="flex items-center gap-3">
        {/* Organization Switcher */}
        <OrganizationSwitcher />

        {/* Quick Search */}
        <Button
          variant="outline"
          className="hidden md:flex items-center gap-2 text-muted-foreground"
          onClick={() => setCommandPaletteOpen(true)}
        >
          <span className="text-sm">Search</span>
          <kbd className="pointer-events-none inline-flex h-5 select-none items-center gap-1 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium text-muted-foreground opacity-100">
            <Command className="w-3 h-3" />K
          </kbd>
        </Button>

        {/* Notifications */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="relative">
              <Bell className="w-4 h-4" />
              {notifications > 0 && (
                <Badge
                  variant="destructive"
                  className="absolute -top-1 -right-1 h-5 w-5 p-0 flex items-center justify-center text-xs"
                >
                  {notifications}
                </Badge>
              )}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-80">
            <div className="p-3">
              <p className="text-sm text-muted-foreground text-center py-8">
                No notifications
              </p>
            </div>
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Custom Actions */}
        {actions}
      </div>

      {/* Command Palette */}
      <CommandPalette open={commandPaletteOpen} onOpenChange={setCommandPaletteOpen} />
    </div>
  )
}
