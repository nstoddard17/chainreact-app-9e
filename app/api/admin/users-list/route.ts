import { NextResponse } from "next/server"
import { createSupabaseServerClient } from "@/utils/supabase/server"

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
        // Get all users with their profiles
        const { data: users, error } = await supabase
            .from('user_profiles')
            .select('id, full_name, username, role, created_at, avatar_url')
            .order('created_at', { ascending: false })

        if (error) {
            return NextResponse.json({ error: error.message }, { status: 500 })
        }

        // Get online users (active in last 5 minutes)
        const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000)
        const { data: onlineUsers } = await supabase
            .from('user_presence')
            .select('id')
            .gte('last_seen', fiveMinutesAgo.toISOString())

        const onlineUserIds = new Set(onlineUsers?.map(u => u.id) || [])

        // Format the data for the component
        const usersWithOnlineStatus = users?.map((user: any) => ({
            ...user,
            email: user.username ? `${user.username}@example.com` : 'No email available',
            displayEmail: user.username || 'No username set',
            isOnline: onlineUserIds.has(user.id)
        })) || []

        return NextResponse.json({
            success: true,
            users: usersWithOnlineStatus
        })
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 })
    }
} 