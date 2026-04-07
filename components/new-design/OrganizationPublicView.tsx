"use client"

import { useEffect, useState, useRef } from "react"
import { useRouter } from "next/navigation"
import { useAuthStore } from "@/stores/authStore"
import { isProfileAdmin } from "@/lib/types/admin"
import { Button } from "@/components/ui/button"
import {
  Building2,
  Users,
  Loader2,
  User as UserIcon,
  Settings,
  Plus,
  Crown,
  Shield,
} from "lucide-react"
import { toast } from "sonner"
import CreateOrganizationDialog from "@/components/teams/CreateOrganizationDialog"

interface Organization {
  id: string
  name: string
  slug: string
  description?: string
  logo_url?: string
  owner_id: string
  user_role: string
  member_count: number
  team_count: number
  created_at: string
  is_workspace?: boolean
}

export function OrganizationPublicView() {
  const router = useRouter()
  const { user, profile } = useAuthStore()
  const [organizations, setOrganizations] = useState<Organization[]>([])
  const [loading, setLoading] = useState(true)
  const [createDialogOpen, setCreateDialogOpen] = useState(false)
  const hasFetchedRef = useRef(false)

  useEffect(() => {
    if (user && !hasFetchedRef.current) {
      hasFetchedRef.current = true
      fetchUserOrganizations()
    }
  }, [user])

  useEffect(() => {
    const handleCreateOrganization = () => {
      if (isProfileAdmin(profile)) {
        setCreateDialogOpen(true)
        return
      }
      if (!profile?.role || !['business', 'organization'].includes(profile.role)) {
        toast.error('Upgrade to a Business or Organization plan to create organizations')
        router.push('/subscription')
        return
      }
      setCreateDialogOpen(true)
    }

    window.addEventListener('create-organization', handleCreateOrganization)
    return () => window.removeEventListener('create-organization', handleCreateOrganization)
  }, [profile, router])

  const fetchUserOrganizations = async () => {
    setLoading(true)
    try {
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 8000)

      try {
        const response = await fetch('/api/organizations?type=organizations_only', { signal: controller.signal })
        if (!response.ok) throw new Error('Failed to fetch organizations')

        const data = await response.json()
        const allOrgs = Array.isArray(data) ? data : data.organizations || []
        const realOrgs = allOrgs.filter((org: Organization) => !org.is_workspace && org.team_count > 0)
        setOrganizations(realOrgs)
      } catch (error: any) {
        if (error.name === 'AbortError') throw new Error('Request timed out. Please try again.')
        throw error
      } finally {
        clearTimeout(timeoutId)
      }
    } catch (error: any) {
      console.error('Error fetching organizations:', error)
      toast.error(error.message || 'Failed to load organizations')
      setOrganizations([])
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <>
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
        <CreateOrganizationDialog
          open={createDialogOpen}
          onOpenChange={(open) => { setCreateDialogOpen(open); if (!open) fetchUserOrganizations() }}
        />
      </>
    )
  }

  if (organizations.length === 0) {
    return (
      <>
        <div className="max-w-md mx-auto text-center py-16">
          <Building2 className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
          <h2 className="text-lg font-semibold mb-1">No organizations yet</h2>
          <p className="text-sm text-muted-foreground mb-5">Create an organization to collaborate with your team, share integrations, and manage billing together.</p>
          <Button
            onClick={() => window.dispatchEvent(new CustomEvent('create-organization'))}
            className="bg-gradient-to-r from-orange-500 to-rose-500 hover:from-orange-600 hover:to-rose-600 text-white"
          >
            <Plus className="w-4 h-4 mr-1.5" />
            Create Organization
          </Button>
        </div>
        <CreateOrganizationDialog
          open={createDialogOpen}
          onOpenChange={(open) => { setCreateDialogOpen(open); if (!open) fetchUserOrganizations() }}
        />
      </>
    )
  }

  return (
    <>
      <div className="w-full">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-xl font-semibold">Organizations</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              {organizations.length} {organizations.length === 1 ? 'organization' : 'organizations'}
            </p>
          </div>
          <Button
            size="sm"
            onClick={() => window.dispatchEvent(new CustomEvent('create-organization'))}
            className="bg-gradient-to-r from-orange-500 to-rose-500 hover:from-orange-600 hover:to-rose-600 text-white"
          >
            <Plus className="w-3.5 h-3.5 mr-1.5" />
            New Organization
          </Button>
        </div>

        {/* Org cards */}
        <div className="space-y-2">
          {organizations.map((org, i) => (
            <OrgRow
              key={org.id}
              org={org}
              index={i}
              onNavigate={() => router.push(`/org/${org.slug}/settings`)}
              canAccess={['owner', 'admin'].includes(org.user_role)}
            />
          ))}
        </div>
      </div>

      <CreateOrganizationDialog
        open={createDialogOpen}
        onOpenChange={(open) => { setCreateDialogOpen(open); if (!open) fetchUserOrganizations() }}
      />
    </>
  )
}

function OrgRow({
  org,
  index,
  onNavigate,
  canAccess,
}: {
  org: Organization
  index: number
  onNavigate: () => void
  canAccess: boolean
}) {
  return (
    <div
      className={`group w-full flex items-center gap-4 px-5 py-4 rounded-xl border bg-card transition-colors animate-fade-in-up ${canAccess ? 'hover:bg-muted/50 cursor-pointer' : ''}`}
      style={{ animationDelay: `${index * 50}ms`, animationFillMode: "both" }}
      onClick={canAccess ? onNavigate : undefined}
    >
      {/* Icon */}
      <div className="w-10 h-10 rounded-lg bg-orange-50 dark:bg-orange-950/30 flex items-center justify-center flex-shrink-0">
        {org.logo_url ? (
          <img src={org.logo_url} alt={org.name} className="w-full h-full object-cover rounded-lg" />
        ) : (
          <Building2 className="w-5 h-5 text-orange-500 dark:text-orange-400" />
        )}
      </div>

      {/* Name + status + pills below */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1.5">
          <p className="text-sm font-semibold truncate">{org.name}</p>
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-orange-500 text-white">
            <svg className="w-3 h-3" viewBox="0 0 16 16" fill="currentColor"><path d="M8 16A8 8 0 108 0a8 8 0 000 16zm3.78-9.72a.75.75 0 00-1.06-1.06L7 8.94 5.28 7.22a.75.75 0 00-1.06 1.06l2.25 2.25a.75.75 0 001.06 0l4.25-4.25z" /></svg>
            Active
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium border border-orange-300 text-orange-700 dark:border-orange-700 dark:text-orange-400">
            {org.user_role === 'owner' ? <Crown className="w-3 h-3" /> : <Shield className="w-3 h-3" />}
            {org.user_role.charAt(0).toUpperCase() + org.user_role.slice(1)}
          </span>
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium border border-gray-300 dark:border-gray-600 text-muted-foreground">
            <UserIcon className="w-3 h-3" />
            {org.member_count} {org.member_count === 1 ? 'member' : 'members'}
          </span>
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium border border-gray-300 dark:border-gray-600 text-muted-foreground">
            <Users className="w-3 h-3" />
            {org.team_count} {org.team_count === 1 ? 'team' : 'teams'}
          </span>
        </div>
      </div>

      {/* Settings cog — only for admin/owner */}
      {canAccess && (
        <button
          onClick={(e) => {
            e.stopPropagation()
            onNavigate()
          }}
          className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors flex-shrink-0"
          title="Organization settings"
        >
          <Settings className="w-4 h-4" />
        </button>
      )}
    </div>
  )
}
