import { NextResponse } from "next/server"
import { jsonResponse, errorResponse, successResponse } from '@/lib/utils/api-response'
import { createSupabaseServerClient } from "@/utils/supabase/server"

import { logger } from '@/lib/utils/logger'

export async function GET() {
    const supabase = await createSupabaseServerClient();

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
        // Get total users count
        const { count: totalUsers, error: totalError } = await supabase
            .from('user_profiles')
            .select('*', { count: 'exact', head: true });

        if (totalError) {
            logger.error("Error fetching total users:", totalError);
            return errorResponse("Failed to fetch total users" , 500);
        }

        // Get role breakdown
        const { data: roleData, error: roleError } = await supabase
            .from('user_profiles')
            .select('role');

        if (roleError) {
            logger.error("Error fetching role data:", roleError);
            return errorResponse("Failed to fetch role data" , 500);
        }

        // Count users by role
        const roleCounts: Record<string, number> = {
            free: 0,
            pro: 0,
            'beta-pro': 0,
            business: 0,
            enterprise: 0,
            admin: 0
        };

        roleData?.forEach(user => {
            const role = user.role || 'free';
            if (role in roleCounts) {
                roleCounts[role]++;
            }
        });

        const userStats = {
            totalUsers: totalUsers || 0,
            freeUsers: roleCounts.free,
            proUsers: roleCounts.pro,
            betaUsers: roleCounts['beta-pro'],
            businessUsers: roleCounts.business,
            enterpriseUsers: roleCounts.enterprise,
            adminUsers: roleCounts.admin
        };

        return jsonResponse({ success: true, data: userStats });
    } catch (error) {
        logger.error("Error fetching user stats:", error);
        return errorResponse("Failed to fetch user statistics" , 500);
    }
} 