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
    <div className="flex h-screen overflow-hidden bg-gray-50 dark:bg-gray-950">
      {/* Sidebar */}
      <NewSidebar />

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Header */}
        <NewHeader title={title} subtitle={subtitle} actions={headerActions} />

        {/* Page Content */}
        <main className="flex-1 overflow-y-auto bg-gray-50 dark:bg-gray-950">
          <div className="h-full w-full pl-6 pr-6 py-6">
            {children}
          </div>
        </main>

        {/* Footer */}
        <NewFooter />
      </div>
    </div>
  )
}
