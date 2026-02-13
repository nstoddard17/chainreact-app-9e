"use client"

import { useState, useCallback } from "react"
import { NewSidebar } from "./NewSidebar"
import { NewHeader } from "./NewHeader"
import { NewFooter } from "./NewFooter"
import { GlobalKeyboardShortcuts } from "@/components/common/GlobalKeyboardShortcuts"
import { AuthReadyGuard } from "@/components/common/AuthReadyGuard"
import { type KeyboardShortcut } from "@/hooks/useKeyboardShortcuts"

interface NewAppLayoutProps {
  children: React.ReactNode
  title?: string
  subtitle?: string
  headerActions?: React.ReactNode
  /** Callback for Cmd+S save action */
  onSave?: () => void
  /** Additional page-specific keyboard shortcuts */
  pageShortcuts?: KeyboardShortcut[]
  /** Custom loading message while auth is initializing */
  loadingMessage?: string
}

export function NewAppLayout({
  children,
  title,
  subtitle,
  headerActions,
  onSave,
  pageShortcuts,
  loadingMessage = "Loading...",
}: NewAppLayoutProps) {
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false)

  const handleOpenCommandPalette = useCallback(() => {
    setCommandPaletteOpen(true)
  }, [])

  return (
    <AuthReadyGuard loadingMessage={loadingMessage}>
      <GlobalKeyboardShortcuts
        onOpenCommandPalette={handleOpenCommandPalette}
        onSave={onSave}
        pageShortcuts={pageShortcuts}
      >
        <div className="flex h-screen overflow-hidden bg-gray-50 dark:bg-gray-950">
          {/* Sidebar */}
          <NewSidebar />

          {/* Main Content Area */}
          <div className="flex-1 flex flex-col overflow-hidden">
            {/* Header */}
            <NewHeader
              title={title}
              subtitle={subtitle}
              actions={headerActions}
              commandPaletteOpen={commandPaletteOpen}
              onCommandPaletteOpenChange={setCommandPaletteOpen}
            />

            {/* Page Content */}
            {/* Note: 'relative' is required for PageAccessGuard's absolute positioning to be contained within main */}
            <main className="flex-1 overflow-y-auto bg-gray-50 dark:bg-gray-950 relative">
              <div className="h-full w-full pl-6 pr-6 py-6">
                {children}
              </div>
            </main>

            {/* Footer */}
            <NewFooter />
          </div>
        </div>
      </GlobalKeyboardShortcuts>
    </AuthReadyGuard>
  )
}
