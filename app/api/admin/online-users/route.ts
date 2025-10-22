import { NextResponse } from "next/server"
import { jsonResponse, errorResponse, successResponse } from '@/lib/utils/api-response'
import { createSupabaseRouteHandlerClient } from "@/utils/supabase/server"

import { logger } from '@/lib/utils/logger'

export async function GET() {
    const supabase = await createSupabaseRouteHandlerClient();

    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
        return errorResponse("Unauthorized" , 401);
    }

    // Check if user is admin
    const { data: userProfile } = await supabase
        .from('user_profiles')
        .select('role')
        .eq('id', user.id)
        .single();

    if (!userProfile || userProfile.role !== 'admin') {
        return errorResponse("Admin access required" , 403);
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
            return errorResponse("Failed to fetch online users" , 500);
        }

        return jsonResponse({ 
            success: true, 
            users: onlineUsers || [] 
        });
    } catch (error) {
        logger.error("Error fetching online users:", error);
        return errorResponse("Failed to fetch online users" , 500);
    }
} 