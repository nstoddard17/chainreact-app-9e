"use client"

import { useAuthStore } from "@/stores/authStore"
import { Button } from "@/components/ui/button"
import { LogOut, User, Menu } from "lucide-react"
import { useRouter } from "next/navigation"

interface TopBarProps {
  onMobileMenuChange: (isOpen: boolean) => void
  title: string
}

export default function TopBar({ onMobileMenuChange, title }: TopBarProps) {
  const { user, profile, signOut } = useAuthStore()
  const router = useRouter()

  const handleSignOut = async () => {
    try {
      await signOut()
      // Redirect to homepage after successful logout
      router.push("/")
    } catch (error) {
      console.error("Logout error:", error)
      // Still redirect even if there's an error
      router.push("/")
    }
  }

  return (
    <header className="h-16 bg-background border-b border-border flex items-center justify-between px-6 shrink-0">
      <div className="flex items-center space-x-4">
        <Button
          variant="ghost"
          size="icon"
          className="lg:hidden"
          onClick={() => onMobileMenuChange(true)}
        >
          <Menu className="h-5 w-5" />
        </Button>
        <h1 className="text-xl font-semibold text-foreground">{title}</h1>
      </div>

      <div className="flex items-center space-x-4">
        <div className="hidden sm:flex items-center space-x-2 text-sm text-muted-foreground">
          <User className="w-4 h-4" />
          <span>{profile?.username || user?.email}</span>
        </div>
        <Button variant="outline" size="sm" onClick={handleSignOut} className="flex items-center space-x-2">
          <LogOut className="w-4 h-4" />
          <span className="hidden sm:inline">Sign Out</span>
        </Button>
      </div>
    </header>
  )
}
