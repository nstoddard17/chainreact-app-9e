"use client"

import { ReactNode } from "react"
import { BuilderHeader } from "./BuilderHeader"

interface BuilderLayoutProps {
  children: ReactNode
  headerProps?: any
}

export function BuilderLayout({ children, headerProps }: BuilderLayoutProps) {
  return (
    <div className="flex h-screen overflow-hidden bg-background">
      {/* Full Width Canvas - No Sidebar for Maximum Space */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Header */}
        <BuilderHeader {...headerProps} />

        {/* Canvas Content */}
        <main className="flex-1 overflow-hidden relative">
          {children}
        </main>
      </div>
    </div>
  )
}
