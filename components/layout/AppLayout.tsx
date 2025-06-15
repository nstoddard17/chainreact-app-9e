"use client"

import type React from "react"
import type { ReactNode } from "react"
import { usePathname } from "next/navigation"

interface AppLayoutProps {
  children: ReactNode
}

const AppLayout: React.FC<AppLayoutProps> = ({ children }) => {
  const pathname = usePathname()

  return (
    <div className="app-layout">
      <header className="app-header">
        {/* Header content (e.g., navigation) */}
        <h1>My App</h1>
        <p>Current Path: {pathname}</p>
      </header>
      <main className="app-main">{children}</main>
      <footer className="app-footer">
        {/* Footer content */}
        <p>&copy; 2023 My App</p>
      </footer>
    </div>
  )
}

export default AppLayout
