"use client"

import { create } from "zustand"
import { getSupabaseClient } from "@/lib/supabase"

interface Organization {
  id: string
  name: string
  slug: string
  description?: string
  logo_url?: string
  settings: any
  owner_id: string
  billing_email?: string
  billing_address?: any
  created_at: string
  updated_at: string
}

interface OrganizationMember {
  id: string
  organization_id: string
  user_id: string
  role: "admin" | "editor" | "viewer"
  permissions: any
  invited_by?: string
  invited_at?: string
  joined_at: string
  created_at: string
  updated_at: string
  user?: {
    email: string
    user_metadata?: any
  }
}

interface OrganizationInvitation {
  id: string
  organization_id: string
  email: string
  role: "admin" | "editor" | "viewer"
  permissions: any
  invited_by: string
  token: string
  expires_at: string
  accepted_at?: string
  created_at: string
}

interface AuditLog {
  id: string
  organization_id?: string
  user_id: string
  action: string
  resource_type: string
  resource_id?: string
  details: any
  ip_address?: string
  user_agent?: string
  created_at: string
}

interface OrganizationState {
  organizations: Organization[]
  currentOrganization: Organization | null
  members: OrganizationMember[]
  invitations: OrganizationInvitation[]
  auditLogs: AuditLog[]
  loading: boolean
  error: string | null
}

interface OrganizationActions {
  fetchOrganizations: () => Promise<void>
  createOrganization: (data: Partial<Organization>) => Promise<Organization>
  updateOrganization: (id: string, data: Partial<Organization>) => Promise<void>
  deleteOrganization: (id: string) => Promise<void>
  setCurrentOrganization: (org: Organization | null) => void

  fetchMembers: (orgId: string) => Promise<void>
  inviteMember: (orgId: string, email: string, role: string) => Promise<void>
  updateMemberRole: (memberId: string, role: string) => Promise<void>
  removeMember: (memberId: string) => Promise<void>

  fetchInvitations: (orgId: string) => Promise<void>
  cancelInvitation: (invitationId: string) => Promise<void>
  resendInvitation: (invitationId: string) => Promise<void>

  fetchAuditLogs: (orgId: string) => Promise<void>
  logAction: (action: string, resourceType: string, resourceId?: string, details?: any) => Promise<void>
}

export const useOrganizationStore = create<OrganizationState & OrganizationActions>((set, get) => ({
  organizations: [],
  currentOrganization: null,
  members: [],
  invitations: [],
  auditLogs: [],
  loading: false,
  error: null,

  fetchOrganizations: async () => {
    const supabase = getSupabaseClient()
    set({ loading: true, error: null })

    try {
      const { data, error } = await supabase
        .from("organizations")
        .select(`
          *,
          organization_members!inner(role)
        `)
        .order("created_at", { ascending: false })

      if (error) throw error

      set({ organizations: data || [], loading: false })
    } catch (error: any) {
      set({ error: error.message, loading: false })
    }
  },

  createOrganization: async (data: Partial<Organization>) => {
    const supabase = getSupabaseClient()

    try {
      const { data: org, error } = await supabase.from("organizations").insert(data).select().single()

      if (error) throw error

      // Add creator as admin
      await supabase.from("organization_members").insert({
        organization_id: org.id,
        user_id: (await supabase.auth.getUser()).data.user?.id,
        role: "admin",
      })

      set((state) => ({
        organizations: [org, ...state.organizations],
      }))

      return org
    } catch (error: any) {
      set({ error: error.message })
      throw error
    }
  },

  updateOrganization: async (id: string, data: Partial<Organization>) => {
    const supabase = getSupabaseClient()

    try {
      const { error } = await supabase.from("organizations").update(data).eq("id", id)

      if (error) throw error

      set((state) => ({
        organizations: state.organizations.map((org) => (org.id === id ? { ...org, ...data } : org)),
        currentOrganization:
          state.currentOrganization?.id === id ? { ...state.currentOrganization, ...data } : state.currentOrganization,
      }))
    } catch (error: any) {
      set({ error: error.message })
      throw error
    }
  },

  deleteOrganization: async (id: string) => {
    const supabase = getSupabaseClient()

    try {
      const { error } = await supabase.from("organizations").delete().eq("id", id)

      if (error) throw error

      set((state) => ({
        organizations: state.organizations.filter((org) => org.id !== id),
        currentOrganization: state.currentOrganization?.id === id ? null : state.currentOrganization,
      }))
    } catch (error: any) {
      set({ error: error.message })
      throw error
    }
  },

  setCurrentOrganization: (org: Organization | null) => {
    set({ currentOrganization: org })
  },

  fetchMembers: async (orgId: string) => {
    const supabase = getSupabaseClient()
    set({ loading: true })

    try {
      const { data, error } = await supabase
        .from("organization_members")
        .select(`
          *,
          user:auth.users(email, user_metadata)
        `)
        .eq("organization_id", orgId)
        .order("created_at", { ascending: false })

      if (error) throw error

      set({ members: data || [], loading: false })
    } catch (error: any) {
      set({ error: error.message, loading: false })
    }
  },

  inviteMember: async (orgId: string, email: string, role: string) => {
    const supabase = getSupabaseClient()

    try {
      const token = crypto.randomUUID()
      const expiresAt = new Date()
      expiresAt.setDate(expiresAt.getDate() + 7) // 7 days

      const { error } = await supabase.from("organization_invitations").insert({
        organization_id: orgId,
        email,
        role,
        token,
        expires_at: expiresAt.toISOString(),
        invited_by: (await supabase.auth.getUser()).data.user?.id,
      })

      if (error) throw error

      // In a real app, send invitation email here
      await get().fetchInvitations(orgId)
    } catch (error: any) {
      set({ error: error.message })
      throw error
    }
  },

  updateMemberRole: async (memberId: string, role: string) => {
    const supabase = getSupabaseClient()

    try {
      const { error } = await supabase.from("organization_members").update({ role }).eq("id", memberId)

      if (error) throw error

      set((state) => ({
        members: state.members.map((member) => (member.id === memberId ? { ...member, role: role as any } : member)),
      }))
    } catch (error: any) {
      set({ error: error.message })
      throw error
    }
  },

  removeMember: async (memberId: string) => {
    const supabase = getSupabaseClient()

    try {
      const { error } = await supabase.from("organization_members").delete().eq("id", memberId)

      if (error) throw error

      set((state) => ({
        members: state.members.filter((member) => member.id !== memberId),
      }))
    } catch (error: any) {
      set({ error: error.message })
      throw error
    }
  },

  fetchInvitations: async (orgId: string) => {
    const supabase = getSupabaseClient()

    try {
      const { data, error } = await supabase
        .from("organization_invitations")
        .select("*")
        .eq("organization_id", orgId)
        .is("accepted_at", null)
        .order("created_at", { ascending: false })

      if (error) throw error

      set({ invitations: data || [] })
    } catch (error: any) {
      set({ error: error.message })
    }
  },

  cancelInvitation: async (invitationId: string) => {
    const supabase = getSupabaseClient()

    try {
      const { error } = await supabase.from("organization_invitations").delete().eq("id", invitationId)

      if (error) throw error

      set((state) => ({
        invitations: state.invitations.filter((inv) => inv.id !== invitationId),
      }))
    } catch (error: any) {
      set({ error: error.message })
      throw error
    }
  },

  resendInvitation: async (invitationId: string) => {
    const supabase = getSupabaseClient()

    try {
      const expiresAt = new Date()
      expiresAt.setDate(expiresAt.getDate() + 7)

      const { error } = await supabase
        .from("organization_invitations")
        .update({
          expires_at: expiresAt.toISOString(),
          token: crypto.randomUUID(),
        })
        .eq("id", invitationId)

      if (error) throw error

      // In a real app, resend invitation email here
    } catch (error: any) {
      set({ error: error.message })
      throw error
    }
  },

  fetchAuditLogs: async (orgId: string) => {
    const supabase = getSupabaseClient()

    try {
      const { data, error } = await supabase
        .from("audit_logs")
        .select("*")
        .eq("organization_id", orgId)
        .order("created_at", { ascending: false })
        .limit(100)

      if (error) throw error

      set({ auditLogs: data || [] })
    } catch (error: any) {
      set({ error: error.message })
    }
  },

  logAction: async (action: string, resourceType: string, resourceId?: string, details?: any) => {
    const supabase = getSupabaseClient()
    const { currentOrganization } = get()

    try {
      await supabase.from("audit_logs").insert({
        organization_id: currentOrganization?.id,
        user_id: (await supabase.auth.getUser()).data.user?.id,
        action,
        resource_type: resourceType,
        resource_id: resourceId,
        details: details || {},
      })
    } catch (error) {
      console.error("Failed to log action:", error)
    }
  },
}))
