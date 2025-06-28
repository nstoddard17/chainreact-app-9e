import { NextResponse } from "next/server"
import { createSupabaseServerClient } from "@/utils/supabase/server"

export async function GET() {
    const supabase = await createSupabaseServerClient()

    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    try {
        const { data: presence, error } = await supabase
            .from('user_presence')
            .select('*')
            .eq('id', user.id)
            .single()

        if (error) {
            return NextResponse.json({ error: "Failed to fetch presence" }, { status: 500 })
        }

        return NextResponse.json({ success: true, data: presence })
    } catch (error) {
        return NextResponse.json({ error: "Internal server error" }, { status: 500 })
    }
}

export async function POST() {
    const supabase = await createSupabaseServerClient()

    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    try {
        // Get user profile
        const { data: userProfile, error: profileError } = await supabase
            .from('user_profiles')
            .select('full_name, username, role')
            .eq('id', user.id)
            .single()

        if (profileError) {
            // Create basic profile if not found
            const { data: newProfile, error: createError } = await supabase
                .from('user_profiles')
                .insert({
                    id: user.id,
                    full_name: user.user_metadata?.full_name || 'Unknown User',
                    username: user.user_metadata?.username || 'user',
                    role: 'free'
                })
                .select('full_name, username, role')
                .single()

            if (createError) {
                return NextResponse.json({ error: "Failed to create user profile" }, { status: 500 })
            }

            // Update presence with basic profile
            const { error: presenceError } = await supabase
                .from('user_presence')
                .upsert({
                    id: user.id,
                    full_name: newProfile.full_name,
                    email: user.email,
                    role: newProfile.role,
                    last_seen: new Date().toISOString()
                })

            if (presenceError) {
                return NextResponse.json({ error: "Failed to update presence" }, { status: 500 })
            }

            return NextResponse.json({ success: true })
        }

        // Update presence with existing profile
        const { error: presenceError } = await supabase
            .from('user_presence')
            .upsert({
                id: user.id,
                full_name: userProfile.full_name,
                email: user.email,
                role: userProfile.role,
                last_seen: new Date().toISOString()
            })

        if (presenceError) {
            return NextResponse.json({ error: "Failed to update presence" }, { status: 500 })
        }

        return NextResponse.json({ success: true })
    } catch (error) {
        return NextResponse.json({ error: "Internal server error" }, { status: 500 })
    }
} 