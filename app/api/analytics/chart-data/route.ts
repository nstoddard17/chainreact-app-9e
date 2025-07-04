import { NextResponse } from "next/server"
import { createSupabaseServerClient } from "@/utils/supabase/server"
import { subDays, format, eachDayOfInterval, startOfDay } from 'date-fns';

export async function GET() {
    const supabase = await createSupabaseServerClient();

    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const today = startOfDay(new Date());
    const sevenDaysAgo = subDays(today, 6);

    const { data: executions, error } = await supabase
        .from('workflow_executions')
        .select('completed_at, status')
        .eq('user_id', user.id)
        .gte('completed_at', sevenDaysAgo.toISOString());

    if (error) {
        console.error("Error fetching workflow executions:", error);
        return NextResponse.json({ error: "Failed to fetch chart data" }, { status: 500 });
    }

    const days = eachDayOfInterval({ start: sevenDaysAgo, end: today });

    const chartData = days.map(day => {
        const dayString = format(day, 'E'); // Mon, Tue, etc.
        const dayExecutions = executions.filter(ex => 
            ex.completed_at && format(new Date(ex.completed_at), 'yyyy-MM-dd') === format(day, 'yyyy-MM-dd')
        );
        const successfulExecutions = dayExecutions.filter(ex => ex.status === 'success');
        
        return {
            name: dayString,
            completions: successfulExecutions.length,
            executions: dayExecutions.length,
        };
    });

    return NextResponse.json({ success: true, data: chartData });
}
