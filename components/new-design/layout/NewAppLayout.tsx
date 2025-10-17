"use client"

import { NewSidebar } from "./NewSidebar"
import { NewHeader } from "./NewHeader"
import { NewFooter } from "./NewFooter"

interface NewAppLayoutProps {
  children: React.ReactNode
  title?: string
  subtitle?: string
  headerActions?: React.ReactNode
}

export function NewAppLayout({ children, title, subtitle, headerActions }: NewAppLayoutProps) {
  return (
    <div className="flex h-screen overflow-hidden bg-background">
      {/* Sidebar */}
      <NewSidebar />

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Header */}
        <NewHeader title={title} subtitle={subtitle} actions={headerActions} />

        {/* Page Content */}
        <main className="flex-1 overflow-y-auto">
          <div className="max-w-7xl mx-auto px-6 py-6">
            {children}
          </div>
        </main>

        {/* Footer */}
        <NewFooter />
      </div>
    </div>
  )
}
