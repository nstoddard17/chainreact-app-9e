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

    // First check if user exists in auth.users with timeout handling
    let users, authError;
    try {
      // Add a timeout wrapper for the Supabase call
      const listUsersPromise = supabase.auth.admin.listUsers();
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Supabase request timeout')), 8000)
      );

      const result = await Promise.race([listUsersPromise, timeoutPromise]) as any;
      users = result.data;
      authError = result.error;
    } catch (timeoutError: any) {
      console.error('Supabase timeout or error:', timeoutError.message);
      // In case of timeout or network error, allow the user to proceed
      // This is better than blocking the entire auth flow
      return NextResponse.json({
        exists: false,
        provider: null,
        warning: 'Could not verify existing account due to network issues'
      });
    }

    if (authError) {
      console.error('Error fetching users:', authError);
      // Allow user to proceed even if we can't check
      return NextResponse.json({
        exists: false,
        provider: null,
        warning: 'Could not verify existing account'
      });
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