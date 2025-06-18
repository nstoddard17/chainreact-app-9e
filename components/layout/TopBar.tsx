"use client"

import { useAuthStore } from "@/stores/authStore"
import { Button } from "@/components/ui/button"
import { LogOut, User, Menu } from "lucide-react"

interface TopBarProps {
  onMobileMenuChange: (isOpen: boolean) => void
  title: string
}

export default function TopBar({ onMobileMenuChange, title }: TopBarProps) {
  const { user, signOut } = useAuthStore()

  return (
    <header className="h-16 bg-white border-b border-slate-200 flex items-center justify-between px-6 shrink-0">
      <div className="flex items-center space-x-4">
        <Button
          variant="ghost"
          size="icon"
          className="lg:hidden"
          onClick={() => onMobileMenuChange(true)}
        >
          <Menu className="h-5 w-5" />
        </Button>
        <h1 className="text-xl font-semibold text-slate-900">{title}</h1>
      </div>

      <div className="flex items-center space-x-4">
        <div className="hidden sm:flex items-center space-x-2 text-sm text-slate-600">
          <User className="w-4 h-4" />
          <span>{user?.email}</span>
        </div>
        <Button variant="outline" size="sm" onClick={signOut} className="flex items-center space-x-2">
          <LogOut className="w-4 h-4" />
          <span className="hidden sm:inline">Sign Out</span>
        </Button>
      </div>
    </header>
  )
}
