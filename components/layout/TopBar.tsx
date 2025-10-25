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
import { NotificationDropdown } from "@/components/ui/notification-dropdown"
import { AIUsageIndicator } from "@/components/ui/AIUsageIndicator"
import { type UserRole } from "@/lib/utils/roles"

import { logger } from '@/lib/utils/logger'

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
      logger.debug("Starting sign out process...")
      // Navigate to homepage first for smoother UX
      router.push("/")
      // Then sign out (this will clear the state)
      await signOut()
    } catch (error) {
      logger.error("Logout error:", error)
      // Still try to navigate even on error
      router.push("/")
    }
  }

  const isAdmin = profile?.admin === true
  // If user is admin, show admin badge; otherwise show their role badge
  const userRole = isAdmin ? 'admin' : ((profile?.role as UserRole) || 'free')

  return (
    <header className="h-14 sm:h-16 bg-background border-b border-border flex items-center justify-between px-3 sm:px-6 shrink-0">
      <div className="flex items-center space-x-2 sm:space-x-4">
        <Button
          variant="ghost"
          size="icon"
          className="lg:hidden h-9 w-9 sm:h-10 sm:w-10"
          onClick={() => onMobileMenuChange(true)}
        >
          <Menu className="h-4 w-4 sm:h-5 sm:w-5" />
        </Button>
        <div>
          <h1 className="text-lg sm:text-xl font-semibold text-foreground">{title}</h1>
          {subtitle && (
            <p className="text-xs sm:text-sm text-muted-foreground">{subtitle}</p>
          )}
        </div>
      </div>

      <div className="flex items-center space-x-2 sm:space-x-4">
        <ThemeToggle />

        {/* AI Usage Indicator */}
        <AIUsageIndicator />

        {/* Notification Bell - separate from user dropdown */}
        <NotificationDropdown />

        {/* Membership tier - separate and non-clickable */}
        <div className="hidden sm:block">
          <RoleBadgeCompact role={userRole} />
        </div>

        {/* User dropdown */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="flex items-center space-x-1 sm:space-x-2 h-9 sm:h-10 px-2 sm:px-3">
              <User className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
              <div className="hidden sm:flex items-center space-x-2">
                <span className="text-sm">{profile?.username || profile?.full_name || "User"}</span>
              </div>
              <ChevronDown className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48 sm:w-56 bg-gray-900/95 backdrop-blur-sm border border-gray-700">
            <div className="px-2 py-1 sm:py-1.5 text-xs sm:text-sm text-gray-300">
              <div className="font-medium">{profile?.username || profile?.full_name || "User"}</div>
              <div className="text-xs text-gray-400 truncate">{user?.email}</div>
            </div>
            <DropdownMenuSeparator className="bg-gray-700" />

            <DropdownMenuItem asChild>
              <Link href="/profile" className="flex items-center text-xs sm:text-sm text-gray-200 hover:text-white hover:bg-gray-700">
                <User className="w-3.5 h-3.5 sm:w-4 sm:h-4 mr-1.5 sm:mr-2" />
                Profile
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link href="/settings" className="flex items-center text-xs sm:text-sm text-gray-200 hover:text-white hover:bg-gray-700">
                <Settings className="w-3.5 h-3.5 sm:w-4 sm:h-4 mr-1.5 sm:mr-2" />
                Settings
              </Link>
            </DropdownMenuItem>
            {isAdmin && (
              <>
                <DropdownMenuSeparator className="bg-gray-700" />
                <DropdownMenuItem asChild>
                  <Link href="/admin" className="flex items-center text-xs sm:text-sm text-yellow-400 hover:text-yellow-300 hover:bg-gray-700">
                    <Crown className="w-3.5 h-3.5 sm:w-4 sm:h-4 mr-1.5 sm:mr-2" />
                    Admin Panel
                  </Link>
                </DropdownMenuItem>
              </>
            )}
            <DropdownMenuSeparator className="bg-gray-700" />
            <DropdownMenuItem
              onClick={handleSignOut}
              className="flex items-center text-xs sm:text-sm text-red-400 hover:text-red-300 hover:bg-gray-700 cursor-pointer"
            >
              <LogOut className="w-3.5 h-3.5 sm:w-4 sm:h-4 mr-1.5 sm:mr-2" />
              Sign Out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  )
}