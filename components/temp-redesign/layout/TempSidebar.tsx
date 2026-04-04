"use client"

import { useState } from "react"
import { usePathname, useRouter } from "next/navigation"
import Link from "next/link"
import Image from "next/image"
import { useAuthStore } from "@/stores/authStore"
import { isProfileAdmin } from "@/lib/types/admin"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { useSignedAvatarUrl } from "@/hooks/useSignedAvatarUrl"
import { useWorkspaceContext } from "@/hooks/useWorkspaceContext"
import { useWorkflowCreation } from "@/hooks/useWorkflowCreation"
import { useCreateAndOpenWorkflow } from "@/hooks/useCreateAndOpenWorkflow"
import { WorkspaceSelectionModal } from "@/components/workflows/WorkspaceSelectionModal"
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
  LayoutGrid,
  Settings,
  HelpCircle,
  LogOut,
  ChevronDown,
  Sparkles,
  BarChart3,
  Users,
  User,
  Building,
  Plus,
  PanelLeftClose,
  PanelLeft,
  Shield,
  ChevronRight,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { useSidebarState } from "@/hooks/useSidebarState"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"

// Temp routes mapping
const TEMP_ROUTES: Record<string, string> = {
  workflows: "/workflows/temp",
  templates: "/templates/temp",
  apps: "/apps/temp",
  "ai-assistant": "/ai-assistant/temp",
  analytics: "/analytics/temp",
  teams: "/teams/temp",
  organization: "/organization/temp",
  admin: "/admin",
  settings: "/settings",
  support: "/support",
}

interface NavItem {
  key: string
  label: string
  icon: React.ElementType
  href: string
  badge?: string
}

export function TempSidebar() {
  const pathname = usePathname()
  const router = useRouter()
  const { isCollapsed, toggleSidebar } = useSidebarState()
  const { user, profile, signOut } = useAuthStore()
  const { workspaceContext } = useWorkspaceContext()
  const { signedUrl: signedAvatarUrl } = useSignedAvatarUrl(profile?.avatar_url)

  const displayName = profile?.username || user?.email?.split("@")[0] || "User"
  const planLabel = profile?.plan === "free" ? "Free" : profile?.plan || "Free"

  // Workflow creation
  const {
    showWorkspaceModal,
    initiateWorkflowCreation,
    handleWorkspaceSelected,
    handleCancelWorkspaceSelection,
  } = useWorkflowCreation()
  const { createAndOpen } = useCreateAndOpenWorkflow()

  const handleCreateWorkflow = () => {
    initiateWorkflowCreation(() => createAndOpen())
  }

  const handleSignOut = async () => {
    await signOut()
    router.push("/auth/login")
  }

  // Determine which icon to use for workflows based on workspace
  const workflowIcon = workspaceContext.isPersonal ? Home : Zap

  const mainNav: NavItem[] = [
    { key: "workflows", label: "Workflows", icon: workflowIcon, href: TEMP_ROUTES.workflows },
    { key: "templates", label: "Templates", icon: Layers, href: TEMP_ROUTES.templates },
    { key: "apps", label: "Apps", icon: LayoutGrid, href: TEMP_ROUTES.apps },
    { key: "ai-assistant", label: "AI Assistant", icon: Sparkles, href: TEMP_ROUTES["ai-assistant"] },
  ]

  const secondaryNav: NavItem[] = [
    { key: "analytics", label: "Analytics", icon: BarChart3, href: TEMP_ROUTES.analytics },
    { key: "teams", label: "Teams", icon: Users, href: TEMP_ROUTES.teams },
    { key: "organization", label: "Organization", icon: Building, href: TEMP_ROUTES.organization },
  ]

  const isActive = (key: string) => {
    const route = TEMP_ROUTES[key]
    return pathname === route || pathname?.startsWith(route + "/")
  }

  // Tasks usage
  const tasksUsed = profile?.tasks_used ?? 0
  const tasksLimit = profile?.tasks_limit ?? 100
  const tasksPercent = Math.min((tasksUsed / tasksLimit) * 100, 100)

  const isAdmin = profile ? isProfileAdmin({ admin_capabilities: profile.admin_capabilities } as any) : false

  return (
    <TooltipProvider delayDuration={0}>
      <aside
        className={cn(
          "flex flex-col h-full bg-slate-950 text-slate-300 border-r border-slate-800/50 transition-all duration-200 ease-in-out shrink-0",
          isCollapsed ? "w-[52px]" : "w-[220px]"
        )}
      >
        {/* Logo + Collapse */}
        <div className={cn(
          "flex items-center h-12 border-b border-slate-800/50 shrink-0",
          isCollapsed ? "justify-center px-0" : "justify-between px-3"
        )}>
          {!isCollapsed && (
            <Link href="/temp" className="flex items-center gap-2">
              <Image
                src="/ChainReactLogo.png"
                alt="ChainReact"
                width={22}
                height={22}
                className="brightness-0 invert"
              />
              <span className="text-sm font-semibold text-white tracking-tight">
                ChainReact
              </span>
            </Link>
          )}
          <button
            onClick={toggleSidebar}
            className={cn(
              "text-slate-500 hover:text-slate-300 transition-colors",
              isCollapsed && "mx-auto"
            )}
          >
            {isCollapsed ? (
              <PanelLeft className="h-4 w-4" />
            ) : (
              <PanelLeftClose className="h-4 w-4" />
            )}
          </button>
        </div>

        {/* Workspace indicator */}
        {!isCollapsed && (
          <div className="px-3 py-2 border-b border-slate-800/50">
            <div className="flex items-center gap-2 text-xs text-slate-500">
              {workspaceContext.isPersonal ? (
                <User className="h-3 w-3" />
              ) : workspaceContext.type === "team" ? (
                <Users className="h-3 w-3" />
              ) : (
                <Building className="h-3 w-3" />
              )}
              <span className="truncate">{workspaceContext.name || "Personal"}</span>
            </div>
          </div>
        )}

        {/* New Workflow Button */}
        <div className={cn("shrink-0", isCollapsed ? "px-1.5 py-2" : "px-3 py-2")}>
          {isCollapsed ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={handleCreateWorkflow}
                  className="flex items-center justify-center w-full h-8 rounded-md bg-orange-500 hover:bg-orange-400 text-white transition-colors"
                >
                  <Plus className="h-4 w-4" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="right" sideOffset={8}>
                New Workflow
              </TooltipContent>
            </Tooltip>
          ) : (
            <button
              onClick={handleCreateWorkflow}
              className="flex items-center gap-2 w-full h-8 px-2.5 rounded-md bg-orange-500 hover:bg-orange-400 text-white text-sm font-medium transition-colors"
            >
              <Plus className="h-3.5 w-3.5" />
              New Workflow
            </button>
          )}
        </div>

        {/* Main Navigation */}
        <nav className="flex-1 overflow-y-auto px-1.5 py-1">
          <div className="space-y-0.5">
            {mainNav.map((item) => {
              const active = isActive(item.key)
              const Icon = item.icon

              if (isCollapsed) {
                return (
                  <Tooltip key={item.key}>
                    <TooltipTrigger asChild>
                      <Link
                        href={item.href}
                        className={cn(
                          "flex items-center justify-center h-8 w-full rounded-md transition-colors",
                          active
                            ? "bg-slate-800 text-white"
                            : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/50"
                        )}
                      >
                        <Icon className="h-4 w-4" />
                      </Link>
                    </TooltipTrigger>
                    <TooltipContent side="right" sideOffset={8}>
                      {item.label}
                    </TooltipContent>
                  </Tooltip>
                )
              }

              return (
                <Link
                  key={item.key}
                  href={item.href}
                  className={cn(
                    "flex items-center gap-2.5 h-8 px-2.5 rounded-md text-sm transition-colors relative",
                    active
                      ? "bg-slate-800 text-white font-medium"
                      : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/50"
                  )}
                >
                  {active && (
                    <div className="absolute left-0 top-1/2 -translate-y-1/2 w-[2px] h-4 bg-orange-500 rounded-r-full" />
                  )}
                  <Icon className="h-4 w-4 shrink-0" />
                  <span className="truncate">{item.label}</span>
                </Link>
              )
            })}
          </div>

          {/* Divider */}
          <div className="my-2 mx-2 border-t border-slate-800/50" />

          {/* Secondary Navigation */}
          <div className="space-y-0.5">
            {secondaryNav.map((item) => {
              const active = isActive(item.key)
              const Icon = item.icon

              if (isCollapsed) {
                return (
                  <Tooltip key={item.key}>
                    <TooltipTrigger asChild>
                      <Link
                        href={item.href}
                        className={cn(
                          "flex items-center justify-center h-8 w-full rounded-md transition-colors",
                          active
                            ? "bg-slate-800 text-white"
                            : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/50"
                        )}
                      >
                        <Icon className="h-4 w-4" />
                      </Link>
                    </TooltipTrigger>
                    <TooltipContent side="right" sideOffset={8}>
                      {item.label}
                    </TooltipContent>
                  </Tooltip>
                )
              }

              return (
                <Link
                  key={item.key}
                  href={item.href}
                  className={cn(
                    "flex items-center gap-2.5 h-8 px-2.5 rounded-md text-sm transition-colors relative",
                    active
                      ? "bg-slate-800 text-white font-medium"
                      : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/50"
                  )}
                >
                  {active && (
                    <div className="absolute left-0 top-1/2 -translate-y-1/2 w-[2px] h-4 bg-orange-500 rounded-r-full" />
                  )}
                  <Icon className="h-4 w-4 shrink-0" />
                  <span className="truncate">{item.label}</span>
                </Link>
              )
            })}

            {/* Admin link */}
            {isAdmin && (
              <>
                {isCollapsed ? (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Link
                        href="/admin"
                        className="flex items-center justify-center h-8 w-full rounded-md text-red-400 hover:text-red-300 hover:bg-slate-800/50 transition-colors"
                      >
                        <Shield className="h-4 w-4" />
                      </Link>
                    </TooltipTrigger>
                    <TooltipContent side="right" sideOffset={8}>
                      Admin Panel
                    </TooltipContent>
                  </Tooltip>
                ) : (
                  <Link
                    href="/admin"
                    className="flex items-center gap-2.5 h-8 px-2.5 rounded-md text-sm text-red-400 hover:text-red-300 hover:bg-slate-800/50 transition-colors"
                  >
                    <Shield className="h-4 w-4 shrink-0" />
                    <span className="truncate">Admin</span>
                  </Link>
                )}
              </>
            )}
          </div>
        </nav>

        {/* Bottom section */}
        <div className="shrink-0 border-t border-slate-800/50">
          {/* Tasks usage bar */}
          {!isCollapsed ? (
            <div className="px-3 py-2.5">
              <div className="flex items-center justify-between text-[11px] text-slate-500 mb-1.5">
                <span>Tasks</span>
                <span>{tasksUsed} / {tasksLimit}</span>
              </div>
              <div className="h-1 bg-slate-800 rounded-full overflow-hidden">
                <div
                  className={cn(
                    "h-full rounded-full transition-all duration-300",
                    tasksPercent > 90
                      ? "bg-red-500"
                      : tasksPercent > 70
                        ? "bg-amber-500"
                        : "bg-orange-500"
                  )}
                  style={{ width: `${tasksPercent}%` }}
                />
              </div>
            </div>
          ) : (
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="px-2 py-2.5 cursor-default">
                  <div className="h-1 bg-slate-800 rounded-full overflow-hidden">
                    <div
                      className={cn(
                        "h-full rounded-full",
                        tasksPercent > 90
                          ? "bg-red-500"
                          : tasksPercent > 70
                            ? "bg-amber-500"
                            : "bg-orange-500"
                      )}
                      style={{ width: `${tasksPercent}%` }}
                    />
                  </div>
                </div>
              </TooltipTrigger>
              <TooltipContent side="right" sideOffset={8}>
                {tasksUsed} / {tasksLimit} tasks
              </TooltipContent>
            </Tooltip>
          )}

          {/* User profile */}
          <div className={cn("border-t border-slate-800/50", isCollapsed ? "px-1.5 py-2" : "px-3 py-2")}>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                {isCollapsed ? (
                  <button className="flex items-center justify-center w-full">
                    <Avatar className="h-7 w-7">
                      <AvatarImage src={signedAvatarUrl || undefined} />
                      <AvatarFallback className="bg-slate-800 text-slate-300 text-xs">
                        {displayName.charAt(0).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                  </button>
                ) : (
                  <button className="flex items-center gap-2.5 w-full rounded-md px-1 py-1 hover:bg-slate-800/50 transition-colors">
                    <Avatar className="h-7 w-7 shrink-0">
                      <AvatarImage src={signedAvatarUrl || undefined} />
                      <AvatarFallback className="bg-slate-800 text-slate-300 text-xs">
                        {displayName.charAt(0).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0 text-left">
                      <p className="text-xs font-medium text-slate-200 truncate">{displayName}</p>
                      <p className="text-[10px] text-slate-500">{planLabel}</p>
                    </div>
                    <ChevronDown className="h-3 w-3 text-slate-500 shrink-0" />
                  </button>
                )}
              </DropdownMenuTrigger>
              <DropdownMenuContent
                side={isCollapsed ? "right" : "top"}
                align="start"
                className="w-48"
              >
                <DropdownMenuItem asChild>
                  <Link href="/settings" className="flex items-center gap-2">
                    <Settings className="h-4 w-4" />
                    Settings
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link href="/support" className="flex items-center gap-2">
                    <HelpCircle className="h-4 w-4" />
                    Help & Support
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={handleSignOut} className="text-red-400 focus:text-red-400">
                  <LogOut className="h-4 w-4 mr-2" />
                  Sign Out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        {/* Workspace selection modal */}
        <WorkspaceSelectionModal
          open={showWorkspaceModal}
          onOpenChange={(open) => { if (!open) handleCancelWorkspaceSelection() }}
          onWorkspaceSelected={handleWorkspaceSelected}
          onCancel={handleCancelWorkspaceSelection}
        />
      </aside>
    </TooltipProvider>
  )
}
