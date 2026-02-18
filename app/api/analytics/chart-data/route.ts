import { NextResponse } from "next/server"
import { jsonResponse, errorResponse, successResponse } from '@/lib/utils/api-response'
import { createSupabaseRouteHandlerClient } from "@/utils/supabase/server"
import { subDays, format, eachDayOfInterval, startOfDay } from 'date-fns';

import { logger } from '@/lib/utils/logger'

export async function GET() {
    const supabase = await createSupabaseRouteHandlerClient();

    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
        return errorResponse("Unauthorized" , 401);
    }

    const today = startOfDay(new Date());
    const sevenDaysAgo = subDays(today, 6);

    const { data: executions, error } = await supabase
        .from('workflow_execution_sessions')
        .select('created_at, started_at, completed_at, status')
        .eq('user_id', user.id)
        .gte('created_at', sevenDaysAgo.toISOString());

    if (error) {
        logger.error("Error fetching workflow executions:", error);
        return errorResponse("Failed to fetch chart data" , 500);
    }

    const days = eachDayOfInterval({ start: sevenDaysAgo, end: today });

    const chartData = days.map(day => {
        const dayString = format(day, 'E'); // Mon, Tue, etc.
        const dayExecutions = executions.filter(ex => {
            const bucketDate = ex.completed_at || ex.started_at || ex.created_at
            if (!bucketDate) return false
            return format(new Date(bucketDate), 'yyyy-MM-dd') === format(day, 'yyyy-MM-dd')
        });
        const successfulExecutions = dayExecutions.filter(ex => ex.status === 'completed');
        
        return {
            name: dayString,
            workflows: successfulExecutions.length, // Changed from completions to workflows to match store
            executions: dayExecutions.length,
        };
    });

    return jsonResponse({ success: true, data: chartData });
}

