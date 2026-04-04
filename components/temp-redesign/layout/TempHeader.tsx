"use client"

import { useEffect, useState, useCallback } from "react"
import { Search, Bell } from "lucide-react"
import { NotificationDropdown } from "@/components/ui/notification-dropdown"
import { CommandPalette } from "@/components/new-design/CommandPalette"

interface TempHeaderProps {
  title?: string
  actions?: React.ReactNode
}

export function TempHeader({ title, actions }: TempHeaderProps) {
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false)

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key === "k") {
      e.preventDefault()
      setCommandPaletteOpen(true)
    }
  }, [])

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [handleKeyDown])

  return (
    <>
      <header className="flex items-center justify-between h-12 px-6 border-b border-slate-200 dark:border-slate-800/50 shrink-0">
        {/* Left: Title */}
        <div className="flex items-center min-w-0">
          {title && (
            <h1 className="text-sm font-medium text-slate-900 dark:text-slate-100 truncate">
              {title}
            </h1>
          )}
        </div>

        {/* Right: Search + Notifications + Actions */}
        <div className="flex items-center gap-1">
          <button
            onClick={() => setCommandPaletteOpen(true)}
            className="hidden md:flex items-center gap-2 h-8 px-3 rounded-md border border-slate-200 dark:border-slate-700 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 hover:border-slate-300 dark:hover:border-slate-600 transition-colors text-xs"
          >
            <Search className="h-3.5 w-3.5" />
            <span>Search...</span>
            <kbd className="hidden sm:inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-[10px] font-mono text-slate-400">
              <span className="text-xs">&#8984;</span>K
            </kbd>
          </button>

          <button
            onClick={() => setCommandPaletteOpen(true)}
            className="md:hidden flex items-center justify-center h-8 w-8 rounded-md text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors"
          >
            <Search className="h-4 w-4" />
          </button>

          <NotificationDropdown />

          {actions && (
            <>
              <div className="w-px h-4 bg-slate-200 dark:bg-slate-700 mx-1" />
              {actions}
            </>
          )}
        </div>
      </header>

      <CommandPalette open={commandPaletteOpen} onOpenChange={setCommandPaletteOpen} />
    </>
  )
}
