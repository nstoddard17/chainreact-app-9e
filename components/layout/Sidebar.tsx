"use client"

import Link from "next/link"
import { PrefetchLink } from "@/components/ui/prefetch-link"
import { usePathname, useRouter } from "next/navigation"
import { useState } from "react"
import {
  LayoutDashboard,
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
  HelpCircle,
  Webhook,
  Clock,
  MessageSquare,
  Sparkles,
  Headphones,
  LayoutTemplate,
} from "lucide-react"
import Image from "next/image"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { useAuthStore } from "@/stores/authStore"
import { WorkflowsIcon } from "@/components/icons/WorkflowsIcon"
import { TeamsIcon } from "@/components/icons/TeamsIcon"
import { CommunityIcon } from "@/components/icons/CommunityIcon"
import { canAccessPage, type UserRole, getRoleInfo, hasPermission } from "@/lib/utils/roles"
import { Badge } from "@/components/ui/badge"
import { UpgradeOverlay } from "@/components/ui/upgrade-overlay"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"

interface SidebarProps {
  isMobileMenuOpen: boolean
  onMobileMenuChange: (isOpen: boolean) => void
  isCollapsed: boolean
  onToggleCollapse: () => void
}

const navigation = [
  { name: "Dashboard", href: "/dashboard", icon: LayoutDashboard, minRole: 'free' },
  { name: "AI Assistant", href: "/ai-assistant", icon: Sparkles, minRole: 'free', comingSoon: true },
  { name: "Workflows", href: "/workflows", icon: WorkflowsIcon, minRole: 'free' },
  { name: "Templates", href: "/workflows/templates", icon: LayoutTemplate, minRole: 'free' },
  { name: "Integrations", href: "/integrations", icon: Puzzle, minRole: 'free' },
  { name: "Webhooks", href: "/webhooks", icon: Webhook, minRole: 'pro', comingSoon: true },
  { name: "Analytics", href: "/analytics", icon: BarChart3, minRole: 'pro', comingSoon: true },
  { name: "Teams", href: "/teams", icon: TeamsIcon, minRole: 'business' },
  { name: "Enterprise", href: "/enterprise", icon: Shield, minRole: 'enterprise' },
]

const supportNavigation = [
  { name: "Learn", href: "/learn", icon: GraduationCap, minRole: 'free', comingSoon: true },
  { name: "Community", href: "/community", icon: CommunityIcon, minRole: 'free', comingSoon: true },
  { name: "Support", href: "/support", icon: Headphones, minRole: 'free' },
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
  const router = useRouter()
  const { profile } = useAuthStore()
  const isAdmin = profile?.admin === true
  const userRole = (profile?.role || 'free') as UserRole
  const [upgradeOverlay, setUpgradeOverlay] = useState<{
    requiredRole: UserRole
    featureName: string
  } | null>(null)

  const handleNavigationClick = (item: typeof navigation[0], e: React.MouseEvent) => {
    // Check if it's a coming soon feature (only accessible to admins)
    if (item.comingSoon && !isAdmin) {
      e.preventDefault()
      // You could show a coming soon message here if desired
      return
    }
    
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
          isCollapsed ? "w-16" : "w-72",
          isMobileMenuOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
        )}
      >
        {/* Logo */}
        <div className="p-4 sm:p-6 border-b border-border flex items-center justify-between relative">
          {isCollapsed ? (
            <div className="absolute inset-0 flex items-center justify-center">
              <Button
                variant="ghost"
                size="icon"
                className="hidden lg:flex h-8 w-8 sm:h-10 sm:w-10"
                onClick={onToggleCollapse}
              >
                <ChevronRight className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
              </Button>
            </div>
          ) : (
            <>
              <Link href="/" className="flex items-center space-x-2">
                <Image src="/logo_transparent.png" alt="ChainReact Logo" width={32} height={32} className="w-7 h-7 sm:w-8 sm:h-8" />
                <span className="text-lg sm:text-xl font-bold text-foreground">ChainReact</span>
              </Link>
              <div className="flex items-center space-x-2">
                <Button
                  variant="ghost"
                  size="icon"
                  className="hidden lg:flex h-8 w-8 sm:h-10 sm:w-10"
                  onClick={onToggleCollapse}
                >
                  <ChevronLeft className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="lg:hidden h-8 w-8 sm:h-10 sm:w-10"
                  onClick={() => onMobileMenuChange(false)}
                >
                  <X className="h-4 w-4 sm:h-5 sm:w-5" />
                </Button>
              </div>
            </>
          )}
          {isCollapsed && (
            <Button
              variant="ghost"
              size="icon"
              className="lg:hidden h-8 w-8 sm:h-10 sm:w-10"
              onClick={() => onMobileMenuChange(false)}
            >
              <X className="h-4 w-4 sm:h-5 sm:w-5" />
            </Button>
          )}
        </div>

        {/* Navigation */}
        <nav className="flex-1 p-3 sm:p-4 space-y-1.5 sm:space-y-2 overflow-y-auto">
          {/* Main Navigation */}
          {navigation.map((item) => {
            const isActive = pathname === item.href || pathname.startsWith(`${item.href }/`)
            const RoleIcon = roleIcons[item.minRole as keyof typeof roleIcons]
            const showRoleBadge = item.minRole !== 'free'
            const canAccess = canAccessPage(userRole, item.href)
            const isComingSoon = item.comingSoon && !isAdmin

            return (
              <PrefetchLink
                key={item.name}
                href={canAccess && !isComingSoon ? item.href : "#"}
                onClick={(e) => handleNavigationClick(item, e)}
                className={cn(
                  "flex items-center justify-between px-3 py-2.5 sm:px-4 sm:py-3 rounded-xl transition-all duration-200 group",
                  isCollapsed && "justify-center px-2",
                  isActive && !isComingSoon
                    ? "bg-gradient-to-r from-blue-500 to-purple-600 text-white shadow-lg"
                    : canAccess && !isComingSoon
                    ? "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                    : "text-muted-foreground/50 hover:bg-muted/50 cursor-pointer opacity-75",
                )}
                title={isCollapsed ? item.name : undefined}
              >
                <div className="flex items-center space-x-2.5 sm:space-x-3 min-w-0 flex-1">
                  <item.icon className="w-4 h-4 sm:w-5 sm:h-5 flex-shrink-0" />
                  {!isCollapsed && <span className="font-medium text-sm sm:text-base">{item.name}</span>}
                </div>

                {/* Coming Soon Badge for non-admins */}
                {!isCollapsed && isComingSoon && (
                  <>
                    {/* Full badge when there's enough space */}
                    <Badge
                      variant="secondary"
                      className="hidden xl:flex text-[10px] sm:text-[11px] px-2 sm:px-2.5 py-0.5 ml-auto mr-1 bg-yellow-100 text-yellow-800 dark:bg-yellow-900/50 dark:text-yellow-300 whitespace-nowrap flex-shrink-0"
                    >
                      Coming Soon
                    </Badge>

                    {/* Icon with tooltip on smaller screens or when text is long */}
                    <TooltipProvider delayDuration={0}>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <div className="xl:hidden ml-auto mr-1 p-1 sm:p-1.5 rounded-md bg-yellow-100 dark:bg-yellow-900/50 flex-shrink-0 cursor-help">
                            <Clock className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-yellow-800 dark:text-yellow-300" />
                          </div>
                        </TooltipTrigger>
                        <TooltipContent side="right">
                          <p className="text-xs">Coming Soon</p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </>
                )}

                {/* Role Badge - show for all non-free roles (but not if coming soon is shown) */}
                {!isCollapsed && showRoleBadge && !isComingSoon && (
                  <Badge
                    variant="secondary"
                    className={cn(
                      "text-[10px] sm:text-xs px-1 sm:px-1.5 py-0.5 ml-auto mr-1 flex-shrink-0",
                      roleColors[item.minRole as keyof typeof roleColors],
                      isActive && "bg-white/20 text-white border-white/30"
                    )}
                  >
                    {RoleIcon && <RoleIcon className="w-2 h-2 sm:w-2.5 sm:h-2.5 mr-0.5 sm:mr-1" />}
                    {getRoleInfo(item.minRole as UserRole).displayName}
                  </Badge>
                )}
              </PrefetchLink>
            )
          })}

          {/* Support Section - Learn, Community, Support */}
          <div className="pt-3 sm:pt-4 border-t border-border">
            {!isCollapsed && (
              <div className="px-3 sm:px-4 py-1.5 sm:py-2 text-[10px] sm:text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Resources
              </div>
            )}
          </div>
          {supportNavigation.map((item) => {
            const isActive = pathname === item.href || pathname.startsWith(`${item.href }/`)
            const canAccess = canAccessPage(userRole, item.href)
            const isComingSoon = item.comingSoon && !isAdmin

            return (
              <PrefetchLink
                key={item.name}
                href={canAccess && !isComingSoon ? item.href : "#"}
                onClick={(e) => handleNavigationClick(item, e)}
                className={cn(
                  "flex items-center justify-between px-3 py-2.5 sm:px-4 sm:py-3 rounded-xl transition-all duration-200 group",
                  isCollapsed && "justify-center px-2",
                  isActive && !isComingSoon
                    ? "bg-gradient-to-r from-blue-500 to-purple-600 text-white shadow-lg"
                    : canAccess && !isComingSoon
                    ? "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                    : "text-muted-foreground/50 hover:bg-muted/50 cursor-pointer opacity-75",
                )}
                title={isCollapsed ? item.name : undefined}
              >
                <div className="flex items-center space-x-2.5 sm:space-x-3 min-w-0 flex-1">
                  <item.icon className="w-4 h-4 sm:w-5 sm:h-5 flex-shrink-0" />
                  {!isCollapsed && <span className="font-medium text-sm sm:text-base">{item.name}</span>}
                </div>

                {/* Coming Soon Badge for non-admins */}
                {!isCollapsed && isComingSoon && (
                  <>
                    {/* Full badge when there's enough space */}
                    <Badge
                      variant="secondary"
                      className="hidden xl:flex text-[10px] sm:text-[11px] px-2 sm:px-2.5 py-0.5 ml-auto mr-1 bg-yellow-100 text-yellow-800 dark:bg-yellow-900/50 dark:text-yellow-300 whitespace-nowrap flex-shrink-0"
                    >
                      Coming Soon
                    </Badge>

                    {/* Icon with tooltip on smaller screens or when text is long */}
                    <TooltipProvider delayDuration={0}>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <div className="xl:hidden ml-auto mr-1 p-1 sm:p-1.5 rounded-md bg-yellow-100 dark:bg-yellow-900/50 flex-shrink-0 cursor-help">
                            <Clock className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-yellow-800 dark:text-yellow-300" />
                          </div>
                        </TooltipTrigger>
                        <TooltipContent side="right">
                          <p className="text-xs">Coming Soon</p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </>
                )}
              </PrefetchLink>
            )
          })}

          {/* Admin Navigation - only show for admins */}
          {isAdmin && (
            <>
              <div className="pt-3 sm:pt-4 border-t border-border">
                {!isCollapsed && (
                  <div className="px-3 sm:px-4 py-1.5 sm:py-2 text-[10px] sm:text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                    Admin
                  </div>
                )}
              </div>
              {adminNavigation.map((item) => {
                const isActive = pathname === item.href || pathname.startsWith(`${item.href }/`)

                return (
                  <PrefetchLink
                    key={item.name}
                    href={item.href}
                    onClick={() => onMobileMenuChange(false)}
                    className={cn(
                      "flex items-center space-x-2.5 sm:space-x-3 px-3 py-2.5 sm:px-4 sm:py-3 rounded-xl transition-all duration-200",
                      isCollapsed && "justify-center px-2",
                      isActive
                        ? "bg-gradient-to-r from-red-500 to-orange-600 text-white shadow-lg"
                        : "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
                    )}
                    title={isCollapsed ? item.name : undefined}
                  >
                    <item.icon className="w-4 h-4 sm:w-5 sm:h-5" />
                    {!isCollapsed && <span className="font-medium text-sm sm:text-base">{item.name}</span>}
                  </PrefetchLink>
                )
              })}
            </>
          )}

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
