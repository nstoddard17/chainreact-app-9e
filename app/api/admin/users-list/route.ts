import { jsonResponse, errorResponse } from '@/lib/utils/api-response'
import { requireAdmin } from '@/lib/utils/admin-auth'
import { logger } from '@/lib/utils/logger'

export async function GET() {
  const authResult = await requireAdmin({ capabilities: ['user_admin'] })
  if (!authResult.isAdmin) return authResult.response

  // This route needs serviceClient for presence channel operations
  // that can't be extracted into a scoped helper
  const { userId, serviceClient: adminSupabase } = authResult

  try {
    const { data: profiles, error: profilesError } = await adminSupabase
      .from('user_profiles')
      .select('id, full_name, first_name, last_name, role, created_at, avatar_url')
      .order('created_at', { ascending: false })

    if (profilesError) {
      return errorResponse(profilesError.message, 500)
    }

    // Get auth users to get real email addresses
    const { data: authUsers, error: authError } = await adminSupabase.auth.admin.listUsers()

    if (authError) {
      logger.error('Error fetching auth users:', authError)
      return errorResponse('Failed to fetch user emails', 500)
    }

    const emailMap = new Map<string, string>()
    const createdAtMap = new Map<string, string>()
    authUsers.users.forEach(authUser => {
      emailMap.set(authUser.id, authUser.email!)
      createdAtMap.set(authUser.id, authUser.created_at)
    })

    // Get online users from Supabase Realtime Presence channel
    const channel = adminSupabase.channel('presence-room', {
      config: {
        presence: {
          key: `admin-query-${userId}`,
        },
      },
    })

    const presenceData = await new Promise<any[]>((resolve) => {
      const timeout = setTimeout(() => {
        logger.error('[Admin Users] Presence query timed out after 3s')
        resolve([])
      }, 3000)

      let syncReceived = false

      channel
        .on('presence', { event: 'sync' }, () => {
          syncReceived = true
          clearTimeout(timeout)
          const state = channel.presenceState()
          const users = Object.values(state).flat()
          resolve(users)
        })
        .subscribe(async (status) => {
          if (status === 'SUBSCRIBED') {
            await channel.track({ user_id: userId, query_only: true })
          } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
            logger.error(`[Admin Users] Channel ${status}`)
            clearTimeout(timeout)
            resolve([])
          }
        })

      setTimeout(() => {
        if (!syncReceived) {
          logger.error('[Admin Users] No sync event after 4 seconds')
        }
      }, 4000)
    })

    // Clean up the channel
    try {
      await channel.untrack()
      await channel.unsubscribe()
    } catch (e) {
      logger.error('[Admin Users] Error cleaning up presence channel:', e)
    }

    const onlineUserIds = new Set(
      presenceData
        .filter((p: any) => p.user_id && !p.query_only)
        .map((p: any) => p.user_id)
    )

    const usersWithOnlineStatus = profiles?.map((profile: any) => ({
      ...profile,
      email: emailMap.get(profile.id) || 'No email available',
      displayEmail: emailMap.get(profile.id) || profile.full_name || 'No email set',
      created_at: createdAtMap.get(profile.id) || profile.created_at,
      isOnline: onlineUserIds.has(profile.id),
    })) || []

    return jsonResponse({
      success: true,
      users: usersWithOnlineStatus,
    })
  } catch (error: any) {
    return errorResponse(error.message, 500)
  }
}
