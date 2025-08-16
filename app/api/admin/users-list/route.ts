import { NextResponse } from "next/server"
import { createSupabaseServerClient, createSupabaseServiceClient } from "@/utils/supabase/server"

export async function GET() {
    const supabase = await createSupabaseServerClient()

    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // Check if user is admin
    const { data: userProfile } = await supabase
        .from('user_profiles')
        .select('role')
        .eq('id', user.id)
        .single()

    if (!userProfile || userProfile.role !== 'admin') {
        return NextResponse.json({ error: "Admin access required" }, { status: 403 })
    }

    try {
        // Use service client to get auth users data
        const adminSupabase = await createSupabaseServiceClient()
        
        // Get all users with their profiles
        const { data: profiles, error: profilesError } = await supabase
            .from('user_profiles')
            .select('id, full_name, username, role, created_at, avatar_url')
            .order('created_at', { ascending: false })

        if (profilesError) {
            return NextResponse.json({ error: profilesError.message }, { status: 500 })
        }

        // Get auth users to get real email addresses
        const { data: authUsers, error: authError } = await adminSupabase.auth.admin.listUsers()
        
        if (authError) {
            console.error('Error fetching auth users:', authError)
            return NextResponse.json({ error: 'Failed to fetch user emails' }, { status: 500 })
        }

        // Create a map of user IDs to email addresses and creation dates
        const emailMap = new Map()
        const createdAtMap = new Map()
        authUsers.users.forEach(authUser => {
            emailMap.set(authUser.id, authUser.email)
            createdAtMap.set(authUser.id, authUser.created_at)
        })

        // Get online users (active in last 5 minutes)
        const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000)
        const { data: onlineUsers } = await supabase
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

        return NextResponse.json({
            success: true,
            users: usersWithOnlineStatus
        })
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 })
    }
} 