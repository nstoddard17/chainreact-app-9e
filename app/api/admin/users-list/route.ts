import { NextResponse } from "next/server"
import { createSupabaseServerClient, createSupabaseServiceClient } from "@/utils/supabase/server"

import { logger } from '@/lib/utils/logger'

export async function GET() {
    const supabase = await createSupabaseServerClient()

    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
        return errorResponse("Unauthorized" , 401)
    }

    // Check if user is admin
    const { data: userProfile } = await supabase
        .from('user_profiles')
        .select('role')
        .eq('id', user.id)
        .single()

    if (!userProfile || userProfile.role !== 'admin') {
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

        // Get online users (active in last 5 minutes) using service client
        const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000)
        const { data: onlineUsers } = await adminSupabase
            .from('user_presence')
            .select('id')
            .gte('last_seen', fiveMinutesAgo.toISOString())

        const onlineUserIds = new Set(onlineUsers?.map(u => u.id) || [])

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