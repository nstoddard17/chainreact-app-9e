"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { useState } from "react"
import {
  LayoutDashboard,
  Workflow,
  Puzzle,
  BarChart3,
  Building2,
  Shield,
  Users,
  GraduationCap,
  X,
  ChevronLeft,
  ChevronRight,
  Crown,
  Star,
  Bot,
  Heart,
  CreditCard,
  HelpCircle,
} from "lucide-react"
import Image from "next/image"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { useAuthStore } from "@/stores/authStore"
import { canAccessPage, type UserRole, getRoleInfo, hasPermission } from "@/lib/utils/roles"
import { Badge } from "@/components/ui/badge"
import { UpgradeOverlay } from "@/components/ui/upgrade-overlay"

interface SidebarProps {
  isMobileMenuOpen: boolean
  onMobileMenuChange: (isOpen: boolean) => void
  isCollapsed: boolean
  onToggleCollapse: () => void
}

const navigation = [
  { name: "Dashboard", href: "/dashboard", icon: LayoutDashboard, minRole: 'free' },
  { name: "AI Assistant", href: "/ai-assistant", icon: Bot, minRole: 'free' },
  { name: "Workflows", href: "/workflows", icon: Workflow, minRole: 'free' },
  { name: "Integrations", href: "/integrations", icon: Puzzle, minRole: 'free' },
  { name: "Analytics", href: "/analytics", icon: BarChart3, minRole: 'pro' },
  { name: "Teams", href: "/teams", icon: Building2, minRole: 'business' },
  { name: "Learn", href: "/learn", icon: GraduationCap, minRole: 'free' },
  { name: "Community", href: "/community", icon: Users, minRole: 'free' },
  { name: "Enterprise", href: "/enterprise", icon: Shield, minRole: 'enterprise' },
  {
    name: "Support",
    href: "/support",
    icon: HelpCircle,
    minRole: "free"
  }
]

const adminNavigation = [
  { name: "Admin Panel", href: "/admin", icon: Crown, minRole: 'admin' },
]

const roleIcons = {
  free: null,
  pro: Star,
  'beta-pro': Star,
  business: Building2,
  enterprise: Shield,
  admin: Crown
}

const roleColors = {
  free: 'bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-300',
  pro: 'bg-blue-100 text-blue-800 dark:bg-blue-900/50 dark:text-blue-300',
  'beta-pro': 'bg-blue-100 text-blue-800 dark:bg-blue-900/50 dark:text-blue-300',
  business: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/50 dark:text-indigo-300',
  enterprise: 'bg-pink-100 text-pink-800 dark:bg-pink-900/50 dark:text-pink-300',
  admin: 'bg-red-100 text-red-800 dark:bg-red-900/50 dark:text-red-300'
}

export default function Sidebar({ isMobileMenuOpen, onMobileMenuChange, isCollapsed, onToggleCollapse }: SidebarProps) {
  const pathname = usePathname()
  const { profile } = useAuthStore()
  const isAdmin = profile?.role === 'admin'
  const userRole = (profile?.role || 'free') as UserRole
  const [upgradeOverlay, setUpgradeOverlay] = useState<{
    requiredRole: UserRole
    featureName: string
  } | null>(null)

  const handleNavigationClick = (item: typeof navigation[0], e: React.MouseEvent) => {
    // If user can access the page, let the link work normally
    if (canAccessPage(userRole, item.href)) {
      onMobileMenuChange(false)
      return
    }

    // Otherwise, prevent navigation and show upgrade overlay
    e.preventDefault()
    setUpgradeOverlay({
      requiredRole: item.minRole as UserRole,
      featureName: item.name
    })
  }

  return (
    <>
      <div
        className={cn(
          "fixed inset-y-0 left-0 bg-background border-r border-border flex flex-col transition-all duration-200 ease-in-out z-50",
          isCollapsed ? "w-16" : "w-64",
          isMobileMenuOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
        )}
      >
        {/* Logo */}
        <div className="p-6 border-b border-border flex items-center justify-between relative">
          {isCollapsed ? (
            <div className="absolute inset-0 flex items-center justify-center">
              <Button
                variant="ghost"
                size="icon"
                className="hidden lg:flex"
                onClick={onToggleCollapse}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          ) : (
            <>
              <Link href="/" className="flex items-center space-x-2">
                <Image src="/logo_transparent.png" alt="ChainReact Logo" width={32} height={32} className="w-8 h-8" />
                <span className="text-xl font-bold text-foreground">ChainReact</span>
              </Link>
              <div className="flex items-center space-x-2">
                <Button
                  variant="ghost"
                  size="icon"
                  className="hidden lg:flex"
                  onClick={onToggleCollapse}
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="lg:hidden"
                  onClick={() => onMobileMenuChange(false)}
                >
                  <X className="h-5 w-5" />
                </Button>
              </div>
            </>
          )}
          {isCollapsed && (
            <Button
              variant="ghost"
              size="icon"
              className="lg:hidden"
              onClick={() => onMobileMenuChange(false)}
            >
              <X className="h-5 w-5" />
            </Button>
          )}
        </div>

        {/* Navigation */}
        <nav className="flex-1 p-4 space-y-2 overflow-y-auto">
          {navigation.map((item) => {
            const isActive = pathname === item.href || pathname.startsWith(item.href + "/")
            const RoleIcon = roleIcons[item.minRole as keyof typeof roleIcons]
            const showRoleBadge = item.minRole !== 'free'
            const canAccess = canAccessPage(userRole, item.href)
            
            return (
              <Link
                key={item.name}
                href={canAccess ? item.href : "#"}
                onClick={(e) => handleNavigationClick(item, e)}
                className={cn(
                  "flex items-center justify-between px-4 py-3 rounded-xl transition-all duration-200 group",
                  isCollapsed && "justify-center px-2",
                  isActive
                    ? "bg-gradient-to-r from-blue-500 to-purple-600 text-white shadow-lg"
                    : canAccess
                    ? "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                    : "text-muted-foreground/50 hover:bg-muted/50 cursor-pointer opacity-75",
                )}
                title={isCollapsed ? item.name : undefined}
              >
                <div className="flex items-center space-x-3">
                  <item.icon className="w-5 h-5" />
                  {!isCollapsed && <span className="font-medium">{item.name}</span>}
                </div>
                
                {/* Role Badge - show for all non-free roles */}
                {!isCollapsed && showRoleBadge && (
                  <Badge 
                    variant="secondary" 
                    className={cn(
                      "text-xs px-1.5 py-0.5 ml-2",
                      roleColors[item.minRole as keyof typeof roleColors],
                      isActive && "bg-white/20 text-white border-white/30"
                    )}
                  >
                    {RoleIcon && <RoleIcon className="w-2.5 h-2.5 mr-1" />}
                    {getRoleInfo(item.minRole as UserRole).displayName}
                  </Badge>
                )}
              </Link>
            )
          })}

          {/* Admin Navigation - only show for admins */}
          {isAdmin && (
            <>
              <div className="pt-4 border-t border-border">
                {!isCollapsed && (
                  <div className="px-4 py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                    Admin
                  </div>
                )}
              </div>
              {adminNavigation.map((item) => {
                const isActive = pathname === item.href || pathname.startsWith(item.href + "/")
                
                return (
                  <Link
                    key={item.name}
                    href={item.href}
                    onClick={() => onMobileMenuChange(false)}
                    className={cn(
                      "flex items-center space-x-3 px-4 py-3 rounded-xl transition-all duration-200",
                      isCollapsed && "justify-center px-2",
                      isActive
                        ? "bg-gradient-to-r from-red-500 to-orange-600 text-white shadow-lg"
                        : "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
                    )}
                    title={isCollapsed ? item.name : undefined}
                  >
                    <item.icon className="w-5 h-5" />
                    {!isCollapsed && <span className="font-medium">{item.name}</span>}
                  </Link>
                )
              })}
            </>
          )}

          {/* Support Buttons - Dynamic placement after last navigation item */}
          <div className="pt-4 border-t border-border space-y-2">
            {!isCollapsed && (
              <div className="px-2 py-1 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Support Us
              </div>
            )}
            <div className="space-y-2">
              <Button
                variant="outline"
                size="sm"
                className={cn(
                  "w-full justify-start text-green-600 border-green-200 hover:bg-green-50 hover:text-green-700 dark:text-green-400 dark:border-green-700 dark:hover:bg-green-900/20",
                  isCollapsed && "justify-center px-2"
                )}
                onClick={() => window.open('/donate', '_blank')}
                title={isCollapsed ? "Donate" : undefined}
              >
                <CreditCard className="w-4 h-4" />
                {!isCollapsed && <span className="ml-2">Donate</span>}
              </Button>
              <Button
                variant="outline"
                size="sm"
                className={cn(
                  "w-full justify-start text-pink-600 border-pink-200 hover:bg-pink-50 hover:text-pink-700 dark:text-pink-400 dark:border-pink-700 dark:hover:bg-pink-900/20",
                  isCollapsed && "justify-center px-2"
                )}
                onClick={() => window.open('https://patreon.com/chainreact', '_blank')}
                title={isCollapsed ? "Patreon" : undefined}
              >
                <Heart className="w-4 h-4" />
                {!isCollapsed && <span className="ml-2">Patreon</span>}
              </Button>
            </div>
          </div>
        </nav>
      </div>

      {/* Upgrade Overlay */}
      {upgradeOverlay && (
        <UpgradeOverlay
          requiredRole={upgradeOverlay.requiredRole}
          currentRole={userRole}
          featureName={upgradeOverlay.featureName}
          onClose={() => setUpgradeOverlay(null)}
        />
      )}
    </>
  )
}
