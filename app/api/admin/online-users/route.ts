import { NextResponse } from "next/server"
import { createSupabaseServerClient } from "@/utils/supabase/server"

import { logger } from '@/lib/utils/logger'

export async function GET() {
    const supabase = await createSupabaseServerClient();

    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Check if user is admin
    const { data: userProfile } = await supabase
        .from('user_profiles')
        .select('role')
        .eq('id', user.id)
        .single();

    if (!userProfile || userProfile.role !== 'admin') {
        return NextResponse.json({ error: "Admin access required" }, { status: 403 });
    }

    try {
        // Get all online users (active in last 5 minutes)
        const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
        
        const { data: onlineUsers, error } = await supabase
            .from('user_presence')
            .select('*')
            .gte('last_seen', fiveMinutesAgo.toISOString())
            .order('last_seen', { ascending: false });

        if (error) {
            logger.error("Error fetching online users:", error);
            return NextResponse.json({ error: "Failed to fetch online users" }, { status: 500 });
        }

        return NextResponse.json({ 
            success: true, 
            users: onlineUsers || [] 
        });
    } catch (error) {
        logger.error("Error fetching online users:", error);
        return NextResponse.json({ error: "Failed to fetch online users" }, { status: 500 });
    }
} 