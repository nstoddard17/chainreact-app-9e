"use client"

import { useAuthStore } from "@/stores/authStore"
import { Button } from "@/components/ui/button"
import { LogOut, User, Menu, Settings, ChevronDown, Crown } from "lucide-react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { ThemeToggle } from "@/components/ui/theme-toggle"
import { RoleBadgeCompact } from "@/components/ui/role-badge"
import { type UserRole } from "@/lib/utils/roles"

interface TopBarProps {
  onMobileMenuChange: (isOpen: boolean) => void
  title: string
  subtitle?: string
}

export default function TopBar({ onMobileMenuChange, title, subtitle }: TopBarProps) {
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

  const userRole = (profile?.role as UserRole) || 'free'
  const isAdmin = userRole === 'admin'

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
        <div>
          <h1 className="text-xl font-semibold text-foreground">{title}</h1>
          {subtitle && (
            <p className="text-sm text-muted-foreground">{subtitle}</p>
          )}
        </div>
      </div>

      <div className="flex items-center space-x-4">
        <ThemeToggle />
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="flex items-center space-x-2">
              <User className="w-4 h-4" />
              <div className="hidden sm:flex items-center space-x-2">
                <span>{profile?.username || profile?.full_name || "User"}</span>
                <RoleBadgeCompact role={userRole} />
              </div>
              <ChevronDown className="w-4 h-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56 bg-gray-900/95 backdrop-blur-sm border border-gray-700">
            <div className="px-2 py-1.5 text-sm text-gray-300">
              <div className="font-medium">{profile?.username || profile?.full_name || "User"}</div>
              <div className="text-xs text-gray-400 truncate">{user?.email}</div>
            </div>
            <DropdownMenuSeparator className="bg-gray-700" />
            <DropdownMenuItem asChild>
              <Link href="/profile" className="flex items-center text-gray-200 hover:text-white hover:bg-gray-700">
                <User className="w-4 h-4 mr-2" />
                Profile
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link href="/settings" className="flex items-center text-gray-200 hover:text-white hover:bg-gray-700">
                <Settings className="w-4 h-4 mr-2" />
                Settings
              </Link>
            </DropdownMenuItem>
            {isAdmin && (
              <>
                <DropdownMenuSeparator className="bg-gray-700" />
                <DropdownMenuItem asChild>
                  <Link href="/admin" className="flex items-center text-yellow-400 hover:text-yellow-300 hover:bg-gray-700">
                    <Crown className="w-4 h-4 mr-2" />
                    Admin Panel
                  </Link>
                </DropdownMenuItem>
              </>
            )}
            <DropdownMenuSeparator className="bg-gray-700" />
            <DropdownMenuItem 
              onClick={handleSignOut}
              className="flex items-center text-red-400 hover:text-red-300 hover:bg-gray-700 cursor-pointer"
            >
              <LogOut className="w-4 h-4 mr-2" />
              Sign Out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  )
}
