import { type NextRequest } from 'next/server'
import supabaseAdmin from '@/lib/supabase/admin'
import { createPopupResponse } from '@/lib/utils/createPopupResponse'
import { getBaseUrl } from '@/lib/utils/getBaseUrl'

export async function GET(request: NextRequest) {
  const url = new URL(request.url)
  const code = url.searchParams.get('code')
  const state = url.searchParams.get('state')
  const error = url.searchParams.get('error')
  const errorDescription = url.searchParams.get('error_description')

  const baseUrl = getBaseUrl()
  const provider = 'twitter'

  if (error) {
    const message = errorDescription || error
    console.error(`Error with Twitter OAuth: ${message}`)
    return createPopupResponse('error', provider, `OAuth Error: ${message}`, baseUrl)
  }

  if (!code || !state) {
    return createPopupResponse('error', provider, 'No code or state provided for Twitter OAuth.', baseUrl)
  }

  try {
    // Fetch the code_verifier from the database
    const { data: pkceData, error: pkceError } = await supabaseAdmin
      .from("pkce_flow")
      .select("code_verifier, state")
      .eq("state", state)
      .eq("provider", "twitter")
      .single();

    if (pkceError || !pkceData) {
      return createPopupResponse('error', provider, `Failed to retrieve PKCE data: ${pkceError?.message || 'Not found'}`, baseUrl);
    }

    const { code_verifier } = pkceData;
    const stateData = JSON.parse(atob(pkceData.state));
    const { userId } = stateData;
    if (!userId) {
      return createPopupResponse('error', provider, 'Missing userId in Twitter state.', baseUrl);
    }

    const tokenUrl = 'https://api.twitter.com/2/oauth2/token';
    const body = new URLSearchParams({
      code: code,
      grant_type: 'authorization_code',
      client_id: process.env.NEXT_PUBLIC_TWITTER_CLIENT_ID!,
      redirect_uri: `${baseUrl}/api/integrations/twitter/callback`,
      code_verifier: code_verifier,
    });

    const clientId = process.env.NEXT_PUBLIC_TWITTER_CLIENT_ID!;
    const clientSecret = process.env.TWITTER_CLIENT_SECRET!;
    const basicAuth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');

    const response = await fetch(tokenUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: `Basic ${basicAuth}`,
      },
      body: body,
    });

    if (!response.ok) {
      const errorData = await response
        .json()
        .catch(() => ({ error: 'Unknown error', error_description: 'Failed to parse error response from Twitter.' }));
      const message = errorData.error_description || errorData.error || 'Failed to get Twitter access token.';
      console.error('Failed to exchange Twitter code for token:', errorData);
      return createPopupResponse('error', provider, message, baseUrl);
    }

    const tokens = await response.json();
    const expiresIn = tokens.expires_in;
    const expiresAt = expiresIn ? new Date(new Date().getTime() + expiresIn * 1000) : null;

    const integrationData = {
      user_id: userId,
      provider: 'twitter',
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      scopes: tokens.scope.split(' '),
      status: 'connected',
      expires_at: expiresAt ? expiresAt.toISOString() : null,
      updated_at: new Date().toISOString(),
    };

    const { error: dbError } = await supabaseAdmin
      .from('integrations')
      .upsert(integrationData, { onConflict: 'user_id, provider' });

    // Clean up PKCE entry
    await supabaseAdmin.from('pkce_flow').delete().eq('state', state).eq('provider', 'twitter');

    if (dbError) {
      console.error('Error saving Twitter integration to DB:', dbError);
      return createPopupResponse('error', provider, `Database Error: ${dbError.message}`, baseUrl);
    }

    return createPopupResponse('success', provider, 'Twitter account connected successfully.', baseUrl);
  } catch (error) {
    console.error('Error during Twitter OAuth callback:', error);
    const message = error instanceof Error ? error.message : 'An unexpected error occurred.';
    return createPopupResponse('error', provider, message, baseUrl);
  }
}
