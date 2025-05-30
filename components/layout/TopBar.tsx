"use client"

import { useAuthStore } from "@/stores/authStore"
import { Button } from "@/components/ui/button"
import { LogOut, User } from "lucide-react"

export default function TopBar() {
  const { user, signOut } = useAuthStore()

  return (
    <header className="h-16 bg-white border-b border-slate-200 flex items-center justify-between px-6">
      <div className="flex items-center space-x-4">
        <h1 className="text-xl font-semibold text-slate-900">Dashboard</h1>
      </div>

      <div className="flex items-center space-x-4">
        <div className="flex items-center space-x-2 text-sm text-slate-600">
          <User className="w-4 h-4" />
          <span>{user?.email}</span>
        </div>
        <Button variant="outline" size="sm" onClick={signOut} className="flex items-center space-x-2">
          <LogOut className="w-4 h-4" />
          <span>Sign Out</span>
        </Button>
      </div>
    </header>
  )
}
