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

    // Check if user exists and get their provider
    const { data: users, error } = await supabase.auth.admin.listUsers();

    if (error) {
      console.error('Error fetching users:', error);
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

    // Check if user has Google as provider
    const hasGoogleProvider = user.app_metadata?.provider === 'google' || 
                             user.app_metadata?.providers?.includes('google') ||
                             user.user_metadata?.provider === 'google' ||
                             user.identities?.some(identity => identity.provider === 'google');

    return NextResponse.json({ 
      exists: true,
      provider: hasGoogleProvider ? 'google' : 'email',
      user_id: user.id
    });

  } catch (error) {
    console.error('Error in check-provider:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
} 