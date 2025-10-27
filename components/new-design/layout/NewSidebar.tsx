"use client"

import { useState, useEffect } from "react"
import { usePathname, useRouter } from "next/navigation"
import Image from "next/image"
import { useAuthStore } from "@/stores/authStore"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { useToast } from "@/hooks/use-toast"
import { useSignedAvatarUrl } from "@/hooks/useSignedAvatarUrl"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
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
  Users,
  User,
  Coins,
  Crown,
  Gift,
  Info,
  Check,
  Building,
  Link as LinkIcon,
  Share2,
  MessageSquare,
  Copy,
  ExternalLink,
  Plus
} from "lucide-react"
import { cn } from "@/lib/utils"
import { Badge } from "@/components/ui/badge"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"

interface NavItem {
  label: string
  href: string
  icon: React.ComponentType<{ className?: string }>
  badge?: string
}

export function NewSidebar() {
  const router = useRouter()
  const pathname = usePathname()
  const { profile, signOut, user } = useAuthStore()
  const [creditsModalOpen, setCreditsModalOpen] = useState(false)
  const [upgradePlanModalOpen, setUpgradePlanModalOpen] = useState(false)
  const [freeCreditsModalOpen, setFreeCreditsModalOpen] = useState(false)
  const [socialPostUrl, setSocialPostUrl] = useState("")
  const [referralLink, setReferralLink] = useState("")
  const [hasAdminTeam, setHasAdminTeam] = useState(false)
  const [hasAdminOrg, setHasAdminOrg] = useState(false)
  const { toast } = useToast()

  // Check if user is admin
  const isAdmin = profile?.admin === true

  // Check if user has admin/owner privileges in any team or organization
  useEffect(() => {
    const checkAdminPrivileges = async () => {
      if (!user) return

      try {
        const orgId = localStorage.getItem('current_workspace_id')
        if (!orgId) {
          setHasAdminTeam(false)
          setHasAdminOrg(false)
          return
        }

        // Check if user has admin/owner role at team level
        const teamsResponse = await fetch(`/api/organizations/${orgId}/teams`)
        if (teamsResponse.ok) {
          const { teams } = await teamsResponse.json()
          const adminTeams = teams?.filter((team: any) =>
            team.user_role === 'owner' || team.user_role === 'admin'
          ) || []
          setHasAdminTeam(adminTeams.length > 0)
        }

        // Check if user has admin/owner role at organization level
        // Use the new organization_members endpoint
        const orgMemberResponse = await fetch(`/api/organizations/${orgId}/members/me`)
        if (orgMemberResponse.ok) {
          const { member } = await orgMemberResponse.json()
          // User has org-level admin privileges if they have owner/admin role
          const hasOrgAdminRole = member && ['owner', 'admin'].includes(member.role)

          // Also check if this is a real organization (not a workspace)
          const orgResponse = await fetch(`/api/organizations/${orgId}`)
          if (orgResponse.ok) {
            const org = await orgResponse.json()
            const isRealOrg = org && org.team_count > 0
            setHasAdminOrg(hasOrgAdminRole && isRealOrg)
          }
        } else {
          // Fallback to old method if new endpoint doesn't exist yet
          const orgsResponse = await fetch('/api/organizations')
          if (orgsResponse.ok) {
            const { organizations } = await orgsResponse.json()
            const realOrgs = organizations?.filter((org: any) =>
              org.team_count > 0 && (org.user_role === 'owner' || org.user_role === 'admin')
            ) || []
            setHasAdminOrg(realOrgs.length > 0)
          }
        }
      } catch (error) {
        console.error('Error checking admin privileges:', error)
      }
    }

    checkAdminPrivileges()
  }, [user])

  // Generate referral link based on user ID
  const userReferralLink = profile?.id
    ? `${typeof window !== 'undefined' ? window.location.origin : ''}/signup?ref=${profile.id}`
    : ""

  const mainNav: NavItem[] = [
    { label: "Workflows", href: "/workflows", icon: Home },
    { label: "Templates", href: "/templates", icon: Layers },
    { label: "Apps", href: "/apps", icon: Layout },
    { label: "AI Assistant", href: "/ai-assistant", icon: Sparkles },
  ]

  const secondaryNav: NavItem[] = [
    { label: "Analytics", href: "/analytics", icon: BarChart3 },
    { label: "Teams", href: "/teams", icon: Users },
    { label: "Organization", href: "/organization", icon: Building },
  ]

  // Organization admin navigation - visible to org/team admins/owners
  const orgAdminNav: NavItem[] = []
  if (hasAdminTeam) {
    orgAdminNav.push({ label: "Team Settings", href: "/team-settings", icon: Users })
  }
  if (hasAdminOrg) {
    orgAdminNav.push({ label: "Organization Settings", href: "/organization-settings", icon: Building })
  }

  const adminNav: NavItem[] = isAdmin ? [
    { label: "Admin Panel", href: "/admin", icon: Crown },
  ] : []

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

  const avatarUrl = profile?.avatar_url || null
  const { signedUrl: avatarSignedUrl } = useSignedAvatarUrl(avatarUrl || undefined)
  const displayName = profile?.username || profile?.email?.split('@')[0] || "User"

  return (
    <div className="flex flex-col h-screen w-60 bg-white dark:bg-gray-950">
      {/* Logo */}
      <div className="h-14 flex items-center px-4">
        <div className="flex items-center gap-2">
          <Image
            src="/logo_transparent.png"
            alt="ChainReact Logo"
            width={40}
            height={40}
            className="w-10 h-10"
          />
          <span className="font-semibold text-lg">ChainReact</span>
        </div>
      </div>

      {/* New Workflow Button */}
      <div className="px-3 pt-2 pb-2">
        <Button
          onClick={() => router.push('/workflows/ai-agent')}
          className="w-full justify-center gap-2 h-10"
          size="default"
        >
          <Plus className="w-4 h-4" />
          Create New Workflow
        </Button>
      </div>

      {/* Main Navigation */}
      <div className="flex-1 overflow-y-auto pt-2 pb-4">
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
                    ? "bg-gray-100 dark:bg-gray-800 text-foreground font-semibold"
                    : "text-muted-foreground hover:bg-gray-50 dark:hover:bg-gray-900 hover:text-foreground"
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

        {/* Secondary Navigation */}
        <nav className="px-3 space-y-1 mt-2">
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
                    ? "bg-gray-100 dark:bg-gray-800 text-foreground font-semibold"
                    : "text-muted-foreground hover:bg-gray-50 dark:hover:bg-gray-900 hover:text-foreground"
                )}
              >
                <Icon className="w-4 h-4 flex-shrink-0" />
                <span>{item.label}</span>
              </button>
            )
          })}
        </nav>

        {/* Organization Admin Navigation - Only show for org admins */}
        {orgAdminNav.length > 0 && (
          <nav className="px-3 space-y-1 mt-2 pt-2 border-t border-gray-200 dark:border-gray-800">
            {orgAdminNav.map((item) => {
              const Icon = item.icon
              const active = isActive(item.href)

              return (
                <button
                  key={item.href}
                  onClick={() => router.push(item.href)}
                  className={cn(
                    "w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors",
                    active
                      ? "bg-blue-100 dark:bg-blue-900/30 text-blue-900 dark:text-blue-100 font-semibold"
                      : "text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20"
                  )}
                >
                  <Icon className="w-4 h-4 flex-shrink-0" />
                  <span>{item.label}</span>
                </button>
              )
            })}
          </nav>
        )}

        {/* Admin Navigation - Only show for admins */}
        {isAdmin && adminNav.length > 0 && (
          <nav className="px-3 space-y-1 mt-2 pt-2 border-t border-gray-200 dark:border-gray-800">
            {adminNav.map((item) => {
              const Icon = item.icon
              const active = isActive(item.href)

              return (
                <button
                  key={item.href}
                  onClick={() => {
                    console.log('🔴 Admin nav clicked:', item.href)
                    console.log('🔴 Attempting navigation...')
                    // Use window.location for now to bypass any router issues
                    window.location.href = item.href
                  }}
                  className={cn(
                    "w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors",
                    active
                      ? "bg-red-100 dark:bg-red-900/30 text-red-900 dark:text-red-100 font-semibold"
                      : "text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20"
                  )}
                >
                  <Icon className="w-4 h-4 flex-shrink-0" />
                  <span>{item.label}</span>
                </button>
              )
            })}
          </nav>
        )}
      </div>

      {/* Tasks Widget */}
      <div className="px-3 pb-3">
        <div className="bg-white dark:bg-gray-900 rounded-lg border p-3 space-y-2">
          <div className="space-y-1">
            <div className="flex items-center gap-1.5">
              <Zap className="w-4 h-4 text-primary" />
              <span className="text-sm font-medium">Tasks This Month</span>
              <button
                onClick={() => setCreditsModalOpen(true)}
                className="hover:bg-accent rounded-full p-0.5 transition-colors"
              >
                <Info className="w-3.5 h-3.5 text-muted-foreground cursor-pointer" />
              </button>
            </div>
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">
                  {profile?.tasks_used || 0} / {profile?.tasks_limit || 100} used
                </span>
                <span className="text-xs text-muted-foreground">
                  {Math.round(((profile?.tasks_used || 0) / (profile?.tasks_limit || 100)) * 100)}%
                </span>
              </div>
              <div className="w-full bg-muted rounded-full h-1.5">
                <div
                  className="bg-primary rounded-full h-1.5 transition-all"
                  style={{ width: `${Math.min(((profile?.tasks_used || 0) / (profile?.tasks_limit || 100)) * 100, 100)}%` }}
                />
              </div>
            </div>
          </div>
          <Button
            size="sm"
            className="w-full h-8"
            onClick={() => setUpgradePlanModalOpen(true)}
          >
            <Crown className="w-3 h-3 mr-1" />
            Upgrade Plan
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="w-full h-8"
            onClick={() => setFreeCreditsModalOpen(true)}
          >
            <Gift className="w-3 h-3 mr-1" />
            Get Free Tasks
          </Button>
        </div>
      </div>

      {/* User Profile */}
      <div className="p-3">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              className="w-full flex items-center gap-3 px-2 py-2 h-auto justify-start hover:bg-accent"
            >
              <Avatar className="w-8 h-8 bg-muted">
                {avatarSignedUrl && (
                  <AvatarImage
                    src={avatarSignedUrl}
                    alt={`${displayName} avatar`}
                    className="object-cover"
                  />
                )}
                <AvatarFallback className="bg-muted text-muted-foreground">
                  <User className="w-4 h-4" />
                </AvatarFallback>
              </Avatar>
              <div className="flex-1 text-left min-w-0">
                <div className="text-sm font-medium truncate">
                  {displayName}
                </div>
                <div className="text-xs text-muted-foreground truncate capitalize">
                  {profile?.plan || 'free'} plan
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

      {/* Tasks Info Modal */}
      <Dialog open={creditsModalOpen} onOpenChange={setCreditsModalOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Zap className="w-5 h-5 text-primary" />
              How Tasks Work
            </DialogTitle>
            <DialogDescription>
              Understand how tasks are counted in ChainReact
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-6 py-4">
            {/* Overview */}
            <div className="space-y-2">
              <h3 className="font-semibold text-sm">What is a Task?</h3>
              <p className="text-sm text-muted-foreground">
                A task is counted each time a workflow successfully runs. Every time your workflow executes from start to finish, it uses one task from your monthly allowance.
              </p>
            </div>

            {/* How Tasks are Counted */}
            <div className="space-y-3">
              <h3 className="font-semibold text-sm">How Tasks Are Counted</h3>
              <div className="space-y-2 text-sm text-muted-foreground">
                <div className="flex items-start gap-2">
                  <div className="w-1.5 h-1.5 rounded-full bg-primary mt-1.5 flex-shrink-0" />
                  <p><span className="font-medium text-foreground">Simple Count:</span> 1 workflow execution = 1 task</p>
                </div>
                <div className="flex items-start gap-2">
                  <div className="w-1.5 h-1.5 rounded-full bg-primary mt-1.5 flex-shrink-0" />
                  <p><span className="font-medium text-foreground">Unlimited Actions:</span> Add as many actions as you need - still counts as 1 task per run</p>
                </div>
                <div className="flex items-start gap-2">
                  <div className="w-1.5 h-1.5 rounded-full bg-primary mt-1.5 flex-shrink-0" />
                  <p><span className="font-medium text-foreground">Monthly Reset:</span> Your task count resets every billing cycle</p>
                </div>
              </div>
            </div>

            {/* Examples */}
            <div className="space-y-3">
              <h3 className="font-semibold text-sm">Examples</h3>
              <div className="rounded-lg border bg-muted/30 p-4 space-y-3 text-sm">
                <div>
                  <p className="font-medium mb-1">Example 1: Email to Slack</p>
                  <p className="text-muted-foreground">Trigger: New email → Send Slack message = <span className="font-semibold text-foreground">1 task</span></p>
                </div>
                <div>
                  <p className="font-medium mb-1">Example 2: Complex Workflow</p>
                  <p className="text-muted-foreground">Trigger: Form submission → Update database → Send email → Create task → Post to Slack = <span className="font-semibold text-foreground">1 task</span></p>
                </div>
              </div>
            </div>

            {/* Plan Limits */}
            <div className="space-y-3">
              <h3 className="font-semibold text-sm">Task Limits by Plan</h3>
              <div className="rounded-lg border bg-primary/5 p-4">
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Free:</span>
                    <span className="font-medium">100 tasks/month</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Starter:</span>
                    <span className="font-medium">1,000 tasks/month</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Professional:</span>
                    <span className="font-medium">5,000 tasks/month</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Team:</span>
                    <span className="font-medium">50,000 tasks/month</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Getting More Tasks */}
            <div className="space-y-3">
              <h3 className="font-semibold text-sm">Need More Tasks?</h3>
              <div className="space-y-2">
                <Button
                  size="sm"
                  className="w-full"
                  onClick={() => {
                    setCreditsModalOpen(false)
                    setUpgradePlanModalOpen(true)
                  }}
                >
                  <Crown className="w-3.5 h-3.5 mr-2" />
                  Upgrade Your Plan
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="w-full"
                  onClick={() => {
                    setCreditsModalOpen(false)
                    setFreeCreditsModalOpen(true)
                  }}
                >
                  <Gift className="w-3.5 h-3.5 mr-2" />
                  Get Free Tasks
                </Button>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Upgrade Plan Modal */}
      <Dialog open={upgradePlanModalOpen} onOpenChange={setUpgradePlanModalOpen}>
        <DialogContent className="max-w-[1400px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-2xl">
              <Crown className="w-6 h-6 text-primary" />
              Choose Your Plan
            </DialogTitle>
            <DialogDescription className="text-base">
              Automate more with higher task limits and advanced features
            </DialogDescription>
          </DialogHeader>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-6 py-6">
            {/* Starter Plan */}
            <div className="rounded-lg border-2 bg-card p-6 space-y-4">
              <div className="space-y-2">
                <h3 className="font-bold text-xl">Starter</h3>
                <div className="flex items-baseline gap-1">
                  <span className="text-3xl font-bold">$14.99</span>
                  <span className="text-muted-foreground text-sm">/mo</span>
                </div>
                <p className="text-sm text-muted-foreground">Perfect for individuals getting started</p>
              </div>

              <div className="space-y-3 text-sm">
                <div className="font-semibold">1,000 tasks/month</div>
                <div className="flex items-start gap-2">
                  <Check className="w-4 h-4 text-primary mt-0.5 flex-shrink-0" />
                  <span>Multi-step workflows</span>
                </div>
                <div className="flex items-start gap-2">
                  <Check className="w-4 h-4 text-primary mt-0.5 flex-shrink-0" />
                  <span>Unlimited workflows</span>
                </div>
                <div className="flex items-start gap-2">
                  <Check className="w-4 h-4 text-primary mt-0.5 flex-shrink-0" />
                  <span>Conditional logic</span>
                </div>
                <div className="flex items-start gap-2">
                  <Check className="w-4 h-4 text-primary mt-0.5 flex-shrink-0" />
                  <span>Webhooks & scheduling</span>
                </div>
              </div>

              <Button variant="outline" className="w-full" onClick={() => {
                toast({
                  title: "Coming Soon",
                  description: "Starter plan will be available soon!"
                })
              }}>
                Select Plan
              </Button>
            </div>

            {/* Professional Plan */}
            <div className="rounded-lg border-2 border-primary bg-primary/5 p-6 space-y-4 relative">
              <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                <Badge className="bg-primary">Most Popular</Badge>
              </div>

              <div className="space-y-2">
                <h3 className="font-bold text-xl">Professional</h3>
                <div className="flex items-baseline gap-1">
                  <span className="text-3xl font-bold">$39</span>
                  <span className="text-muted-foreground text-sm">/mo</span>
                </div>
                <p className="text-sm text-muted-foreground">For professionals and small teams</p>
              </div>

              <div className="space-y-3 text-sm">
                <div className="font-semibold">5,000 tasks/month</div>
                <div className="flex items-start gap-2">
                  <Check className="w-4 h-4 text-primary mt-0.5 flex-shrink-0" />
                  <span>Everything in Starter</span>
                </div>
                <div className="flex items-start gap-2">
                  <Check className="w-4 h-4 text-primary mt-0.5 flex-shrink-0" />
                  <span className="font-semibold">AI Agents included</span>
                </div>
                <div className="flex items-start gap-2">
                  <Check className="w-4 h-4 text-primary mt-0.5 flex-shrink-0" />
                  <span>Advanced analytics</span>
                </div>
                <div className="flex items-start gap-2">
                  <Check className="w-4 h-4 text-primary mt-0.5 flex-shrink-0" />
                  <span>Priority support</span>
                </div>
              </div>

              <Button className="w-full" onClick={() => {
                toast({
                  title: "Coming Soon",
                  description: "Professional plan will be available soon!"
                })
              }}>
                Select Plan
              </Button>
            </div>

            {/* Team Plan */}
            <div className="rounded-lg border-2 bg-card p-6 space-y-4">
              <div className="space-y-2">
                <h3 className="font-bold text-xl">Team</h3>
                <div className="flex items-baseline gap-1">
                  <span className="text-3xl font-bold">$79</span>
                  <span className="text-muted-foreground text-sm">/mo</span>
                </div>
                <p className="text-sm text-muted-foreground">For growing teams</p>
              </div>

              <div className="space-y-3 text-sm">
                <div className="font-semibold">50,000 tasks/month</div>
                <div className="flex items-start gap-2">
                  <Check className="w-4 h-4 text-primary mt-0.5 flex-shrink-0" />
                  <span>Everything in Professional</span>
                </div>
                <div className="flex items-start gap-2">
                  <Check className="w-4 h-4 text-primary mt-0.5 flex-shrink-0" />
                  <span>Team sharing (up to 25 members)</span>
                </div>
                <div className="flex items-start gap-2">
                  <Check className="w-4 h-4 text-primary mt-0.5 flex-shrink-0" />
                  <span>Shared workspaces</span>
                </div>
                <div className="flex items-start gap-2">
                  <Check className="w-4 h-4 text-primary mt-0.5 flex-shrink-0" />
                  <span>365-day history retention</span>
                </div>
              </div>

              <Button variant="outline" className="w-full" onClick={() => {
                toast({
                  title: "Coming Soon",
                  description: "Team plan will be available soon!"
                })
              }}>
                Select Plan
              </Button>
            </div>

            {/* Enterprise Plan */}
            <div className="rounded-lg border-2 bg-card p-6 space-y-4">
              <div className="space-y-2">
                <h3 className="font-bold text-xl">Enterprise</h3>
                <div className="flex items-baseline gap-1">
                  <span className="text-2xl font-bold">Contact Us</span>
                </div>
                <p className="text-sm text-muted-foreground">For large organizations</p>
              </div>

              <div className="space-y-3 text-sm">
                <div className="font-semibold">Unlimited tasks</div>
                <div className="flex items-start gap-2">
                  <Check className="w-4 h-4 text-primary mt-0.5 flex-shrink-0" />
                  <span>Everything in Team</span>
                </div>
                <div className="flex items-start gap-2">
                  <Check className="w-4 h-4 text-primary mt-0.5 flex-shrink-0" />
                  <span>Advanced admin & security</span>
                </div>
                <div className="flex items-start gap-2">
                  <Check className="w-4 h-4 text-primary mt-0.5 flex-shrink-0" />
                  <span>Dedicated support</span>
                </div>
                <div className="flex items-start gap-2">
                  <Check className="w-4 h-4 text-primary mt-0.5 flex-shrink-0" />
                  <span>Custom integrations</span>
                </div>
              </div>

              <Button variant="outline" className="w-full" onClick={() => {
                router.push('/contact-sales')
              }}>
                Contact Sales
              </Button>
            </div>
          </div>

          <div className="border-t pt-4 text-center text-sm text-muted-foreground">
            <p>Need more tasks? <button className="text-primary hover:underline" onClick={() => router.push('/contact-sales')}>Contact us</button> for custom pricing with higher task limits</p>
          </div>
        </DialogContent>
      </Dialog>

      {/* Get Free Tasks Modal */}
      <Dialog open={freeCreditsModalOpen} onOpenChange={setFreeCreditsModalOpen}>
        <DialogContent className="max-w-[1400px] max-h-[90vh]">
          <DialogHeader>
            <DialogTitle className="text-2xl font-bold">Get Free Tasks</DialogTitle>
            <p className="text-muted-foreground mt-2">Choose from the options below to earn additional tasks</p>
          </DialogHeader>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-6 py-6">
            {/* Share Your Success */}
            <div className="rounded-xl border-2 bg-gradient-to-br from-primary/5 to-transparent p-5 space-y-4 hover:border-primary/50 transition-colors flex flex-col">
              <div className="space-y-2 flex-1">
                <div className="flex flex-col gap-2">
                  <h3 className="font-semibold text-base">Share Your Success</h3>
                  <div className="flex items-center gap-1.5 text-sm font-bold text-primary bg-primary/10 px-2.5 py-1 rounded-full w-fit">
                    <span>1500</span>
                    <Zap className="w-3.5 h-3.5" />
                  </div>
                </div>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Share your success story on LinkedIn or X. Screenshot and email to{" "}
                  <a href="mailto:hello@chainreact.com" className="text-primary hover:underline font-medium">
                    hello@chainreact.com
                  </a>
                </p>
              </div>
              <div className="space-y-2">
                <Input
                  placeholder="Paste your post URL"
                  value={socialPostUrl}
                  onChange={(e) => setSocialPostUrl(e.target.value)}
                  className="h-10 text-sm"
                />
                <Button
                  className="w-full h-10 text-sm"
                  disabled={!socialPostUrl}
                  onClick={async () => {
                    try {
                      // Detect platform from URL
                      let platform: 'twitter' | 'linkedin' | 'x' = 'x'
                      if (socialPostUrl.includes('linkedin.com')) {
                        platform = 'linkedin'
                      } else if (socialPostUrl.includes('twitter.com') || socialPostUrl.includes('x.com')) {
                        platform = socialPostUrl.includes('x.com') ? 'x' : 'twitter'
                      } else {
                        toast({
                          title: "Invalid URL",
                          description: "Please enter a valid LinkedIn or X (Twitter) post URL",
                          variant: "destructive"
                        })
                        return
                      }

                      // Submit to API
                      const response = await fetch('/api/social-posts/submit', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ postUrl: socialPostUrl, platform })
                      })

                      const data = await response.json()

                      if (!response.ok) {
                        toast({
                          title: "Submission Failed",
                          description: data.error || "Failed to submit post",
                          variant: "destructive"
                        })
                        return
                      }

                      toast({
                        title: "Success! 🎉",
                        description: data.message || "1,500 tasks added! We'll verify your post in 7 days."
                      })

                      setSocialPostUrl("")
                      setFreeCreditsModalOpen(false)

                      // Refresh page to update task count
                      window.location.reload()
                    } catch (error) {
                      toast({
                        title: "Error",
                        description: "Failed to submit post. Please try again.",
                        variant: "destructive"
                      })
                    }
                  }}
                >
                  Share & Earn
                </Button>
              </div>
            </div>

            {/* Invite Friends */}
            <div className="rounded-xl border-2 bg-gradient-to-br from-primary/5 to-transparent p-5 space-y-4 hover:border-primary/50 transition-colors flex flex-col">
              <div className="space-y-2 flex-1">
                <div className="flex flex-col gap-2">
                  <h3 className="font-semibold text-base">Invite Friends</h3>
                  <div className="flex items-center gap-1.5 text-sm font-bold text-primary bg-primary/10 px-2.5 py-1 rounded-full w-fit">
                    <span>1000</span>
                    <Zap className="w-3.5 h-3.5" />
                  </div>
                </div>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Get 1000 tasks per friend. Help your team discover ChainReact. Win-win for everyone.
                </p>
              </div>
              <div className="space-y-2">
                <Input
                  readOnly
                  value={userReferralLink}
                  className="text-xs font-mono h-10"
                />
                <Button
                  variant="outline"
                  className="w-full h-10 text-sm"
                  onClick={() => {
                    navigator.clipboard.writeText(userReferralLink)
                    toast({
                      title: "Copied!",
                      description: "Referral link copied"
                    })
                  }}
                >
                  Copy Link
                </Button>
              </div>
            </div>

            {/* Quick Feedback Call */}
            <div className="rounded-xl border-2 bg-gradient-to-br from-primary/5 to-transparent p-5 space-y-4 hover:border-primary/50 transition-colors flex flex-col">
              <div className="space-y-2 flex-1">
                <div className="flex flex-col gap-2">
                  <h3 className="font-semibold text-base">Feedback Call</h3>
                  <div className="flex items-center gap-1.5 text-sm font-bold text-primary bg-primary/10 px-2.5 py-1 rounded-full w-fit">
                    <span>500</span>
                    <Zap className="w-3.5 h-3.5" />
                  </div>
                </div>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  10 minutes = 500 tasks. Share your experience and help shape ChainReact's future.
                </p>
              </div>
              <div>
                <Button
                  variant="outline"
                  className="w-full h-10 text-sm"
                  onClick={() => {
                    toast({
                      title: "Coming Soon",
                      description: "Scheduling will be available soon!"
                    })
                  }}
                >
                  Book Call
                </Button>
              </div>
            </div>

            {/* Redeem Coupon */}
            <div className="rounded-xl border-2 bg-gradient-to-br from-primary/5 to-transparent p-5 space-y-4 hover:border-primary/50 transition-colors flex flex-col">
              <div className="space-y-2 flex-1">
                <div className="flex flex-col gap-2">
                  <h3 className="font-semibold text-base">Redeem Coupon</h3>
                  <Zap className="w-4 h-4 text-primary" />
                </div>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Have a coupon code? Enter your code below to redeem tasks.
                </p>
              </div>
              <div className="space-y-2">
                <Input
                  placeholder="Enter coupon code"
                  className="h-10 text-sm"
                />
                <Button
                  variant="outline"
                  className="w-full h-10 text-sm"
                  disabled
                >
                  Redeem
                </Button>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
