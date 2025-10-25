import { NextResponse } from "next/server"
import { jsonResponse, errorResponse, successResponse } from '@/lib/utils/api-response'
import { createSupabaseRouteHandlerClient } from "@/utils/supabase/server"
import { type UserRole } from "@/lib/utils/roles"

export async function POST(request: Request) {
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
        const { userId, newRole } = await request.json()

        if (!userId || !newRole) {
            return errorResponse("Missing required fields" , 400)
        }

        // Validate the role
        const validRoles: UserRole[] = ['free', 'pro', 'beta-pro', 'business', 'enterprise', 'admin']
        if (!validRoles.includes(newRole)) {
            return errorResponse("Invalid role" , 400)
        }

        // Update the user's role
        const { error } = await supabase
            .from('user_profiles')
            .update({ role: newRole })
            .eq('id', userId)

        if (error) {
            return errorResponse(error.message , 500)
        }

        return jsonResponse({
            success: true,
            message: "User role updated successfully"
        })
    } catch (error: any) {
        return errorResponse(error.message , 500)
    }
} 