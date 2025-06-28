import { NextResponse } from "next/server"
import { createSupabaseServerClient } from "@/utils/supabase/server"

export async function GET() {
    return NextResponse.json({ message: "User presence API is working" });
}

export async function POST() {
    console.log("User presence POST called");
    
    const supabase = await createSupabaseServerClient();

    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
        console.log("No user found");
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    console.log("User found:", user.id);

    // Get user profile - using the correct column names
    const { data: userProfile, error: profileError } = await supabase
        .from('user_profiles')
        .select('full_name, username, role')
        .eq('id', user.id)
        .single();

    if (profileError) {
        console.log("Error fetching user profile:", profileError);
        return NextResponse.json({ error: "Failed to fetch user profile", details: profileError.message }, { status: 500 });
    }

    if (!userProfile) {
        console.log("User profile not found, creating basic profile");
        // Create a basic profile if it doesn't exist
        const basicProfile = {
            full_name: user.email?.split('@')[0] || 'Unknown User',
            email: user.email || '',
            role: 'free'
        };
        
        try {
            // Upsert user presence with basic info
            const { error } = await supabase
                .from('user_presence')
                .upsert({
                    id: user.id,
                    full_name: basicProfile.full_name,
                    email: basicProfile.email,
                    role: basicProfile.role,
                    last_seen: new Date().toISOString()
                });

            if (error) {
                console.error("Error updating user presence:", error);
                return NextResponse.json({ error: "Failed to update presence", details: error.message }, { status: 500 });
            }

            console.log("User presence updated successfully with basic profile");
            return NextResponse.json({ success: true });
        } catch (error) {
            console.error("Error updating user presence:", error);
            return NextResponse.json({ error: "Failed to update presence" }, { status: 500 });
        }
    }

    console.log("User profile found:", userProfile);

    try {
        // Upsert user presence
        const { error } = await supabase
            .from('user_presence')
            .upsert({
                id: user.id,
                full_name: userProfile.full_name,
                email: user.email || '', // Use auth user email since user_profiles doesn't have email column
                role: userProfile.role,
                last_seen: new Date().toISOString()
            });

        if (error) {
            console.error("Error updating user presence:", error);
            return NextResponse.json({ error: "Failed to update presence", details: error.message }, { status: 500 });
        }

        console.log("User presence updated successfully");
        return NextResponse.json({ success: true });
    } catch (error) {
        console.error("Error updating user presence:", error);
        return NextResponse.json({ error: "Failed to update presence" }, { status: 500 });
    }
} 