import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(request: NextRequest) {
  try {
    const { email } = await request.json();

    if (!email) {
      return NextResponse.json({ error: 'Email is required' }, { status: 400 });
    }

    // First check if user exists in auth.users
    const { data: users, error: authError } = await supabase.auth.admin.listUsers();

    if (authError) {
      console.error('Error fetching users:', authError);
      return NextResponse.json({ error: 'Failed to check user provider' }, { status: 500 });
    }

    const user = users.users.find(u => u.email === email);

    if (!user) {
      // User doesn't exist, allow email/password signup
      return NextResponse.json({ 
        exists: false,
        provider: null 
      });
    }

    // Check user_profiles table for provider information
    const { data: profile, error: profileError } = await supabase
      .from('user_profiles')
      .select('provider')
      .eq('id', user.id)
      .single();

    if (profileError) {
      console.error('Error fetching user profile:', profileError);
      // Fallback to auth.users metadata if profile doesn't exist
      const hasGoogleProvider = user.app_metadata?.provider === 'google' || 
                               user.app_metadata?.providers?.includes('google') ||
                               user.user_metadata?.provider === 'google' ||
                               user.identities?.some(identity => identity.provider === 'google');

      return NextResponse.json({ 
        exists: true,
        provider: hasGoogleProvider ? 'google' : 'email',
        user_id: user.id
      });
    }

    // Use provider from user_profiles table as the authoritative source
    const provider = profile?.provider || 'email';

    return NextResponse.json({ 
      exists: true,
      provider: provider,
      user_id: user.id
    });

  } catch (error) {
    console.error('Error in check-provider:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
} 