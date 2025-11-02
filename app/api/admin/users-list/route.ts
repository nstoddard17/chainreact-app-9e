import { NextResponse } from "next/server"
import { jsonResponse, errorResponse, successResponse } from '@/lib/utils/api-response'
import { createSupabaseRouteHandlerClient, createSupabaseServiceClient } from "@/utils/supabase/server"

import { logger } from '@/lib/utils/logger'

export async function GET() {
    const supabase = await createSupabaseRouteHandlerClient()

    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
        return errorResponse("Unauthorized" , 401)
    }

    // Check if user is admin
    const { data: userProfile } = await supabase
        .from('user_profiles')
        .select('admin')
        .eq('id', user.id)
        .single()

    if (!userProfile || userProfile.admin !== true) {
        return errorResponse("Admin access required" , 403)
    }

    try {
        // Use service client to bypass RLS and get all users
        const adminSupabase = await createSupabaseServiceClient()

        // Get all users with their profiles using service client
        const { data: profiles, error: profilesError } = await adminSupabase
            .from('user_profiles')
            .select('id, full_name, username, role, created_at, avatar_url')
            .order('created_at', { ascending: false })

        if (profilesError) {
            return errorResponse(profilesError.message , 500)
        }

        // Get auth users to get real email addresses
        const { data: authUsers, error: authError } = await adminSupabase.auth.admin.listUsers()
        
        if (authError) {
            logger.error('Error fetching auth users:', authError)
            return errorResponse('Failed to fetch user emails' , 500)
        }

        // Create a map of user IDs to email addresses and creation dates
        const emailMap = new Map()
        const createdAtMap = new Map()
        authUsers.users.forEach(authUser => {
            emailMap.set(authUser.id, authUser.email)
            createdAtMap.set(authUser.id, authUser.created_at)
        })

        // Get online users from Supabase Realtime Presence channel
        // Query the SAME channel that users are tracked in (presence-room)
        // Use service client to bypass RLS and access presence data
        const channel = adminSupabase.channel('presence-room', {
            config: {
                presence: {
                    key: `admin-query-${user.id}`,
                },
            },
        });

        // Subscribe to the channel to get presence state
        const presenceData = await new Promise<any[]>((resolve) => {
            const timeout = setTimeout(() => {
                logger.error('[Admin Users] ⚠️ Presence query timed out after 3s - no sync event received')
                resolve([])
            }, 3000);

            let syncReceived = false

            channel
                .on('presence', { event: 'sync' }, () => {
                    syncReceived = true
                    clearTimeout(timeout);
                    const state = channel.presenceState();
                    const users = Object.values(state).flat();
                    resolve(users);
                })
                .subscribe(async (status) => {
                    if (status === 'SUBSCRIBED') {
                        // Track briefly to sync state
                        await channel.track({
                            user_id: user.id,
                            query_only: true,
                        });
                    } else if (status === 'CHANNEL_ERROR') {
                        logger.error('[Admin Users] Channel error occurred')
                        clearTimeout(timeout)
                        resolve([])
                    } else if (status === 'TIMED_OUT') {
                        logger.error('[Admin Users] Channel subscription timed out')
                        clearTimeout(timeout)
                        resolve([])
                    }
                });

            // Log if we never get a sync after 4 seconds
            setTimeout(() => {
                if (!syncReceived) {
                    logger.error('[Admin Users] No sync event after 4 seconds - possible channel issue')
                }
            }, 4000)
        });

        // Clean up the channel
        try {
            await channel.untrack();
            await channel.unsubscribe();
        } catch (e) {
            logger.error('[Admin Users] Error cleaning up presence channel:', e)
        }

        // Extract user IDs from presence data
        const onlineUserIds = new Set(
            presenceData
                .filter((p: any) => p.user_id && !p.query_only)
                .map((p: any) => p.user_id)
        )

        logger.debug('[Admin Users] Online users detected:', {
            onlineCount: onlineUserIds.size,
            onlineUserIds: Array.from(onlineUserIds)
        })

        // Format the data for the component with real email addresses
        const usersWithOnlineStatus = profiles?.map((profile: any) => ({
            ...profile,
            email: emailMap.get(profile.id) || 'No email available',
            displayEmail: emailMap.get(profile.id) || profile.username || 'No email set',
            created_at: createdAtMap.get(profile.id) || profile.created_at,
            isOnline: onlineUserIds.has(profile.id)
        })) || []

        return jsonResponse({
            success: true,
            users: usersWithOnlineStatus
        })
    } catch (error: any) {
        return errorResponse(error.message , 500)
    }
}
