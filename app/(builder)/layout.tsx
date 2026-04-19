"use client"

import { AuthReadyGuard } from "@/components/common/AuthReadyGuard"

export default function BuilderLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthReadyGuard loadingMessage="Loading...">
      <div className="h-screen w-screen overflow-hidden bg-white dark:bg-gray-950">
        {children}
      </div>
    </AuthReadyGuard>
  )
}
