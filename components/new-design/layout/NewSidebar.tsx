"use client"

import { usePathname, useRouter } from "next/navigation"
import { useAuthStore } from "@/stores/authStore"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Home,
  Zap,
  Layers,
  Layout,
  Settings,
  HelpCircle,
  LogOut,
  ChevronDown,
  Sparkles,
  BarChart3,
  Users
} from "lucide-react"
import { cn } from "@/lib/utils"

interface NavItem {
  label: string
  href: string
  icon: React.ComponentType<{ className?: string }>
  badge?: string
}

export function NewSidebar() {
  const router = useRouter()
  const pathname = usePathname()
  const { profile, signOut } = useAuthStore()

  const mainNav: NavItem[] = [
    { label: "Workflows", href: "/workflows", icon: Home },
    { label: "Templates", href: "/templates", icon: Layers },
    { label: "Apps", href: "/apps", icon: Layout },
    { label: "AI Assistant", href: "/ai-assistant", icon: Sparkles },
  ]

  const secondaryNav: NavItem[] = [
    { label: "Analytics", href: "/analytics", icon: BarChart3 },
    { label: "Organization", href: "/organization-settings", icon: Users },
  ]

  const isActive = (href: string) => {
    if (href === "/workflows") {
      return pathname === "/workflows"
    }
    return pathname?.startsWith(href)
  }

  const handleSignOut = async () => {
    await signOut()
    router.push("/")
  }

  const userInitials = profile?.username?.[0]?.toUpperCase() || profile?.email?.[0]?.toUpperCase() || "U"

  return (
    <div className="flex flex-col h-screen w-60 border-r bg-background">
      {/* Logo */}
      <div className="h-14 flex items-center px-4 border-b">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-primary flex items-center justify-center">
            <Zap className="w-4 h-4 text-primary-foreground" />
          </div>
          <span className="font-semibold text-lg">ChainReact</span>
        </div>
      </div>

      {/* Main Navigation */}
      <div className="flex-1 overflow-y-auto py-4">
        <nav className="px-3 space-y-1">
          {mainNav.map((item) => {
            const Icon = item.icon
            const active = isActive(item.href)

            return (
              <button
                key={item.href}
                onClick={() => router.push(item.href)}
                className={cn(
                  "w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors",
                  active
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                )}
              >
                <Icon className="w-4 h-4 flex-shrink-0" />
                <span>{item.label}</span>
                {item.badge && (
                  <span className="ml-auto text-xs px-1.5 py-0.5 rounded bg-primary/10 text-primary">
                    {item.badge}
                  </span>
                )}
              </button>
            )
          })}
        </nav>

        {/* Divider */}
        <div className="my-4 px-3">
          <div className="h-px bg-border" />
        </div>

        {/* Secondary Navigation */}
        <nav className="px-3 space-y-1">
          {secondaryNav.map((item) => {
            const Icon = item.icon
            const active = isActive(item.href)

            return (
              <button
                key={item.href}
                onClick={() => router.push(item.href)}
                className={cn(
                  "w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors",
                  active
                    ? "bg-accent text-accent-foreground"
                    : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                )}
              >
                <Icon className="w-4 h-4 flex-shrink-0" />
                <span>{item.label}</span>
              </button>
            )
          })}
        </nav>
      </div>

      {/* User Profile */}
      <div className="border-t p-3">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              className="w-full flex items-center gap-3 px-2 py-2 h-auto justify-start hover:bg-accent"
            >
              <Avatar className="w-8 h-8">
                <AvatarFallback className="text-xs bg-primary text-primary-foreground">
                  {userInitials}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1 text-left min-w-0">
                <div className="text-sm font-medium truncate">
                  {profile?.username || profile?.email?.split('@')[0] || "User"}
                </div>
                <div className="text-xs text-muted-foreground truncate">
                  {profile?.email || ""}
                </div>
              </div>
              <ChevronDown className="w-4 h-4 text-muted-foreground flex-shrink-0" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuItem onClick={() => router.push('/settings')}>
              <Settings className="w-4 h-4 mr-2" />
              Settings
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => router.push('/support')}>
              <HelpCircle className="w-4 h-4 mr-2" />
              Help & Support
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={handleSignOut} className="text-destructive">
              <LogOut className="w-4 h-4 mr-2" />
              Sign Out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  )
}
