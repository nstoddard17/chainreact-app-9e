import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get('code');
  const state = searchParams.get('state');
  const error = searchParams.get('error');

  if (error) {
    return NextResponse.redirect(new URL(`/auth/login?error=${error}`, request.url));
  }

  if (!code) {
    return NextResponse.redirect(new URL('/auth/login?error=no_code', request.url));
  }

  try {
    // Exchange the authorization code for tokens
    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        code,
        client_id: process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID!,
        client_secret: process.env.GOOGLE_CLIENT_SECRET!,
        redirect_uri: `${process.env.NEXT_PUBLIC_BASE_URL}/api/auth/callback`,
        grant_type: 'authorization_code',
      }),
    });

    if (!tokenResponse.ok) {
      const errorData = await tokenResponse.text();
      console.error('Token exchange failed:', errorData);
      throw new Error('Failed to exchange code for tokens');
    }

    const tokens = await tokenResponse.json();

    // Get user info from Google
    const userResponse = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: {
        Authorization: `Bearer ${tokens.access_token}`,
      },
    });

    if (!userResponse.ok) {
      throw new Error('Failed to get user info');
    }

    const userInfo = await userResponse.json();

    // Create Supabase client with service role key
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Check if user already exists
    const { data: existingUsers } = await supabase.auth.admin.listUsers();
    const existingUser = existingUsers.users.find(user => user.email === userInfo.email);

    console.log(`🔍 Checking for existing user: ${userInfo.email}`);
    console.log(`🔍 Existing user found: ${existingUser ? 'Yes' : 'No'}`);

    if (existingUser) {
      console.log(`🔍 Existing user metadata:`, {
        app_metadata: existingUser.app_metadata,
        user_metadata: existingUser.user_metadata,
        identities: existingUser.identities
      });

      // Check if the existing user already has Google as provider
      const hasGoogleProvider = existingUser.app_metadata?.provider === 'google' || 
                               existingUser.app_metadata?.providers?.includes('google') ||
                               existingUser.user_metadata?.provider === 'google' ||
                               existingUser.identities?.some(identity => identity.provider === 'google');

      console.log(`🔍 Has Google provider: ${hasGoogleProvider}`);

      if (hasGoogleProvider) {
        console.log(`✅ User already has Google linked, signing in normally`);
        // User already has Google linked, just sign them in
        const { data: sessionData, error: sessionError } = await supabase.auth.admin.generateLink({
          type: 'magiclink',
          email: userInfo.email,
          options: {
            redirectTo: `${process.env.NEXT_PUBLIC_BASE_URL}/dashboard`,
          },
        });

        if (sessionError) {
          throw sessionError;
        }

        // Redirect to the magic link URL
        return NextResponse.redirect(sessionData.properties.action_link);
      } else {
        // User exists but doesn't have Google linked - automatically link them
        console.log(`🔄 Auto-linking existing email account to Google for: ${userInfo.email}`);
        
        const { error: updateError } = await supabase.auth.admin.updateUserById(existingUser.id, {
          user_metadata: {
            ...existingUser.user_metadata,
            full_name: userInfo.name,
            avatar_url: userInfo.picture,
            provider: 'google',
            provider_id: userInfo.id,
            google_linked: true,
            linked_at: new Date().toISOString(),
          },
          app_metadata: {
            ...existingUser.app_metadata,
            provider: 'google',
            providers: ['google'],
          },
        });

        if (updateError) {
          console.error('❌ Error linking account:', updateError);
          throw updateError;
        }

        console.log('✅ User metadata updated successfully');
        console.log('📝 Updated metadata:', {
          user_metadata: {
            full_name: userInfo.name,
            avatar_url: userInfo.picture,
            provider: 'google',
            provider_id: userInfo.id,
            google_linked: true,
          },
          app_metadata: {
            provider: 'google',
            providers: ['google'],
          },
        });

        // Wait a moment for the update to propagate
        await new Promise(resolve => setTimeout(resolve, 1000));

        // Create session for the linked account
        const { data: sessionData, error: sessionError } = await supabase.auth.admin.generateLink({
          type: 'magiclink',
          email: userInfo.email,
          options: {
            redirectTo: `${process.env.NEXT_PUBLIC_BASE_URL}/dashboard`,
          },
        });

        if (sessionError) {
          throw sessionError;
        }

        console.log('✅ Magic link generated:', sessionData.properties.action_link);

        // Redirect to the magic link URL
        return NextResponse.redirect(sessionData.properties.action_link);
      }
    }

    // Create new user (no existing account found)
    const { data: userData, error: userError } = await supabase.auth.admin.createUser({
      email: userInfo.email,
      email_confirm: true,
      user_metadata: {
        full_name: userInfo.name,
        avatar_url: userInfo.picture,
        provider: 'google',
        provider_id: userInfo.id,
      },
      app_metadata: {
        provider: 'google',
        providers: ['google'],
      },
    });

    if (userError) {
      throw userError;
    }

    // Create session for new user
    const { data: sessionData, error: sessionError } = await supabase.auth.admin.generateLink({
      type: 'magiclink',
      email: userInfo.email,
      options: {
        redirectTo: `${process.env.NEXT_PUBLIC_BASE_URL}/dashboard`,
      },
    });

    if (sessionError) {
      throw sessionError;
    }

    return NextResponse.redirect(sessionData.properties.action_link);

  } catch (error) {
    console.error('OAuth callback error:', error);
    return NextResponse.redirect(new URL('/auth/login?error=oauth_failed', request.url));
  }
} 