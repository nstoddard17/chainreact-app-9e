import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getAuthSession } from '@/lib/auth'

export async function GET(req: NextRequest) {
  const searchParams = req.nextUrl.searchParams
  const code = searchParams.get('code')
  const state = searchParams.get('state')

  if (!code || !state) {
    return NextResponse.json({ error: 'Missing code or state' }, { status: 400 })
  }

  const session = await getAuthSession()

  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    // Verify state (CSRF protection)
    const storedState = await db.oAuthState.findUnique({
      where: {
        id: state,
      },
    })

    if (!storedState) {
      return NextResponse.json({ error: 'Invalid state' }, { status: 400 })
    }

    await db.oAuthState.delete({
      where: {
        id: state,
      },
    })

    // Exchange code for token
    const clientId = process.env.TEAMS_CLIENT_ID
    const clientSecret = process.env.TEAMS_CLIENT_SECRET
    const redirectUri = process.env.TEAMS_REDIRECT_URI

    if (!clientId || !clientSecret || !redirectUri) {
      console.error('Missing Teams OAuth credentials')
      return NextResponse.json({ error: 'Missing Teams OAuth credentials' }, { status: 500 })
    }

    const tokenEndpoint = 'https://login.microsoftonline.com/common/oauth2/v2.0/token'

    const params = new URLSearchParams()
    params.append('client_id', clientId)
    params.append('client_secret', clientSecret)
    params.append('grant_type', 'authorization_code')
    params.append('code', code)
    params.append('redirect_uri', redirectUri)

    const tokenResponse = await fetch(tokenEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params,
    })

    if (!tokenResponse.ok) {
      console.error('Failed to retrieve token:', tokenResponse.status, await tokenResponse.text())
      return NextResponse.json({ error: 'Failed to retrieve token' }, { status: 500 })
    }

    const tokenData = await tokenResponse.json()

    const accessToken = tokenData.access_token
    const refreshToken = tokenData.refresh_token

    if (!accessToken || !refreshToken) {
      console.error('Missing access token or refresh token')
      return NextResponse.json({ error: 'Missing access token or refresh token' }, { status: 500 })
    }

    // After getting tokenData
    const expiresIn = tokenData.expires_in
    const refreshExpiresIn = tokenData.refresh_expires_in || (90 * 24 * 60 * 60) // 90 days default for Microsoft
    const expiresAt = expiresIn ? new Date(Date.now() + expiresIn * 1000) : null
    const refreshTokenExpiresAt = new Date(Date.now() + refreshExpiresIn * 1000)

    // Store tokens in database
    const integrationData = {
      access_token: accessToken,
      refresh_token: refreshToken,
      expires_at: expiresAt?.toISOString() || null,
      refresh_token_expires_at: refreshTokenExpiresAt.toISOString(),
    }

    await db.integration.create({
      data: {
        userId: session.user.id,
        type: 'microsoft-teams',
        data: integrationData,
      },
    })

    return NextResponse.json({ message: 'Teams integration successful' }, { status: 200 })
  } catch (error) {
    console.error('Teams integration error:', error)
    return NextResponse.json({ error: 'Teams integration failed' }, { status: 500 })
  }
}
