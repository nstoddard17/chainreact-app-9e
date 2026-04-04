"use client"

import { TempSidebar } from "./TempSidebar"
import { TempHeader } from "./TempHeader"
import { AuthReadyGuard } from "@/components/common/AuthReadyGuard"
import { GlobalKeyboardShortcuts } from "@/components/common/GlobalKeyboardShortcuts"
import { type KeyboardShortcut } from "@/hooks/useKeyboardShortcuts"

interface TempAppLayoutProps {
  children: React.ReactNode
  title?: string
  headerActions?: React.ReactNode
  onSave?: () => void
  pageShortcuts?: KeyboardShortcut[]
  loadingMessage?: string
}

export function TempAppLayout({
  children,
  title,
  headerActions,
  onSave,
  pageShortcuts,
  loadingMessage = "Loading...",
}: TempAppLayoutProps) {
  return (
    <AuthReadyGuard loadingMessage={loadingMessage}>
      <GlobalKeyboardShortcuts
        onSave={onSave}
        pageShortcuts={pageShortcuts}
      >
        <div className="flex h-screen overflow-hidden bg-white dark:bg-slate-950">
          <TempSidebar />
          <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
            <TempHeader title={title} actions={headerActions} />
            <main className="flex-1 overflow-y-auto">
              <div className="px-6 py-6">
                {children}
              </div>
            </main>
          </div>
        </div>
      </GlobalKeyboardShortcuts>
    </AuthReadyGuard>
  )
}
