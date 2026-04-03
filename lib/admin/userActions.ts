import { createSupabaseServiceClient } from '@/utils/supabase/server'
import { createClient } from '@supabase/supabase-js'
import { logAdminAction } from '@/lib/utils/admin-audit'
import { logger } from '@/lib/utils/logger'
import type { UserRole } from '@/lib/utils/roles'

/**
 * Action-scoped admin helpers for user management operations.
 * All service-role DB access is contained here — route files should
 * never create or receive a service client directly.
 */

function getAdminAuthClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SECRET_KEY!
  )
}

export async function listUsers() {
  const supabase = await createSupabaseServiceClient()
  const { data: profiles, error } = await supabase
    .from('user_profiles')
    .select('*')

  return { data: profiles, error }
}

export async function getUserStats() {
  const supabase = await createSupabaseServiceClient()
  const { data: profiles, error } = await supabase
    .from('user_profiles')
    .select('role, plan')

  return { data: profiles, error }
}

export async function getOnlineUsers() {
  const supabase = await createSupabaseServiceClient()
  const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString()
  return supabase
    .from('user_presence')
    .select('*')
    .gte('last_seen', fiveMinutesAgo)
    .order('last_seen', { ascending: false })
}

const VALID_ROLES: UserRole[] = ['free', 'pro', 'beta-pro', 'business', 'enterprise', 'admin']

export async function updateUserRole(
  adminUserId: string,
  targetUserId: string,
  newRole: string,
  request?: Request
): Promise<{ success: boolean; error?: string }> {
  if (!VALID_ROLES.includes(newRole as UserRole)) {
    return { success: false, error: 'Invalid role' }
  }

  const supabase = await createSupabaseServiceClient()

  // Get current role for audit log
  const { data: currentProfile } = await supabase
    .from('user_profiles')
    .select('role')
    .eq('id', targetUserId)
    .single()

  const { error } = await supabase
    .from('user_profiles')
    .update({ role: newRole })
    .eq('id', targetUserId)

  if (error) {
    return { success: false, error: error.message }
  }

  await logAdminAction({
    userId: adminUserId,
    action: 'user_role_update',
    resourceType: 'user_profiles',
    resourceId: targetUserId,
    oldValues: { role: currentProfile?.role },
    newValues: { role: newRole },
    request,
  })

  return { success: true }
}

export interface DeleteUserResult {
  success: boolean
  action?: 'disabled' | 'deleted'
  message?: string
  tablesProcessed?: number
  errors?: string[]
}

export async function deleteUser(
  adminUserId: string,
  targetUserId: string,
  deleteData: boolean,
  request?: Request
): Promise<DeleteUserResult> {
  if (targetUserId === adminUserId) {
    return { success: false, message: 'Cannot delete your own account' }
  }

  const adminSupabase = getAdminAuthClient()

  // Check if user exists
  const { data: existingUser } = await adminSupabase.auth.admin.getUserById(targetUserId)
  if (!existingUser.user) {
    return { success: false, message: 'User not found' }
  }

  // Prevent deletion of other admin accounts
  const { data: userProfile } = await adminSupabase
    .from('user_profiles')
    .select('admin_capabilities, full_name, username')
    .eq('id', targetUserId)
    .single()

  const targetCaps = (userProfile as any)?.admin_capabilities || {}
  if (targetCaps.super_admin === true || Object.values(targetCaps).some((v: unknown) => v === true)) {
    return { success: false, message: 'Cannot delete admin accounts' }
  }

  if (!deleteData) {
    // Soft disable
    const { error: disableError } = await adminSupabase.auth.admin.updateUserById(
      targetUserId,
      {
        user_metadata: {
          ...existingUser.user.user_metadata,
          disabled: true,
          disabled_at: new Date().toISOString(),
          disabled_by: adminUserId,
        }
      }
    )

    if (disableError) {
      return { success: false, message: disableError.message }
    }

    await adminSupabase
      .from('user_profiles')
      .update({ updated_at: new Date().toISOString() })
      .eq('id', targetUserId)

    await logAdminAction({
      userId: adminUserId,
      action: 'user_disable',
      resourceType: 'user_profiles',
      resourceId: targetUserId,
      oldValues: { full_name: userProfile?.full_name, username: userProfile?.username },
      request,
    })

    return { success: true, action: 'disabled', message: 'User account disabled successfully' }
  }

  // Hard delete
  try {
    const { UserDeletionService } = await import('@/lib/services/userDeletionService')
    const deletionService = new UserDeletionService(adminSupabase)
    const result = await deletionService.deleteUser(targetUserId, 'full')

    if (result.errors.length > 0) {
      logger.warn(`[Admin Delete] Completed with ${result.errors.length} errors:`, result.errors)
    }

    await logAdminAction({
      userId: adminUserId,
      action: 'user_delete',
      resourceType: 'user_profiles',
      resourceId: targetUserId,
      oldValues: { full_name: userProfile?.full_name, username: userProfile?.username },
      request,
    })

    return {
      success: true,
      action: 'deleted',
      message: 'User and all associated data deleted successfully',
      tablesProcessed: result.tablesProcessed,
      errors: result.errors.length > 0 ? result.errors : undefined,
    }
  } catch (error: any) {
    logger.error('Error deleting user data:', error)
    return { success: false, message: 'Failed to delete user data' }
  }
}

export interface CreateUserParams {
  email: string
  password?: string
  full_name?: string
  username?: string
  role?: string
}

export async function createUser(adminUserId: string, params: CreateUserParams, request?: Request) {
  const adminSupabase = getAdminAuthClient()

  const { data: authUser, error: authError } = await adminSupabase.auth.admin.createUser({
    email: params.email,
    password: params.password || undefined,
    email_confirm: true,
  })

  if (authError) {
    return { data: null, error: authError }
  }

  if (authUser.user) {
    // Ensure profile exists
    const { ensureUserProfile } = await import('@/lib/auth/ensureUserProfile')
    await ensureUserProfile(adminSupabase, authUser.user)

    if (params.full_name || params.username || params.role) {
      await adminSupabase
        .from('user_profiles')
        .update({
          full_name: params.full_name || null,
          username: params.username || null,
          role: params.role || 'free',
        })
        .eq('id', authUser.user.id)
    }

    await logAdminAction({
      userId: adminUserId,
      action: 'user_create',
      resourceType: 'user_profiles',
      resourceId: authUser.user.id,
      newValues: { email: params.email, role: params.role || 'free' },
      request,
    })
  }

  return { data: authUser, error: null }
}

export async function updateUser(
  adminUserId: string,
  targetUserId: string,
  updates: { email?: string; password?: string; full_name?: string; username?: string; role?: string },
  request?: Request
) {
  const adminSupabase = getAdminAuthClient()

  // Update auth fields if needed
  const authUpdates: Record<string, unknown> = {}
  if (updates.email) authUpdates.email = updates.email
  if (updates.password) authUpdates.password = updates.password
  if (updates.email) authUpdates.email_confirm = true

  if (Object.keys(authUpdates).length > 0) {
    const { error: authError } = await adminSupabase.auth.admin.updateUserById(targetUserId, authUpdates)
    if (authError) {
      return { data: null, error: authError }
    }
  }

  // Update profile fields
  const profileUpdates: Record<string, unknown> = {}
  if (updates.full_name !== undefined) profileUpdates.full_name = updates.full_name
  if (updates.username !== undefined) profileUpdates.username = updates.username
  if (updates.role !== undefined) profileUpdates.role = updates.role

  if (Object.keys(profileUpdates).length > 0) {
    const { error: profileError } = await adminSupabase
      .from('user_profiles')
      .update(profileUpdates)
      .eq('id', targetUserId)

    if (profileError) {
      return { data: null, error: profileError }
    }
  }

  // Fetch updated record
  const { data: updatedProfile } = await adminSupabase
    .from('user_profiles')
    .select('*')
    .eq('id', targetUserId)
    .single()

  await logAdminAction({
    userId: adminUserId,
    action: 'user_update',
    resourceType: 'user_profiles',
    resourceId: targetUserId,
    newValues: { ...updates, password: updates.password ? '[redacted]' : undefined },
    request,
  })

  return { data: updatedProfile, error: null }
}
