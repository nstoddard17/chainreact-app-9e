import { NextResponse } from "next/server"
import { createSupabaseServerClient } from "@/utils/supabase/server"
import { type UserRole } from "@/lib/utils/roles"

export async function POST(request: Request) {
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
        const { userId, newRole } = await request.json()

        if (!userId || !newRole) {
            return NextResponse.json({ error: "Missing required fields" }, { status: 400 })
        }

        // Validate the role
        const validRoles: UserRole[] = ['free', 'pro', 'beta-pro', 'business', 'enterprise', 'admin']
        if (!validRoles.includes(newRole)) {
            return NextResponse.json({ error: "Invalid role" }, { status: 400 })
        }

        // Update the user's role
        const { error } = await supabase
            .from('user_profiles')
            .update({ role: newRole })
            .eq('id', userId)

        if (error) {
            return NextResponse.json({ error: error.message }, { status: 500 })
        }

        return NextResponse.json({
            success: true,
            message: "User role updated successfully"
        })
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 })
    }
} 