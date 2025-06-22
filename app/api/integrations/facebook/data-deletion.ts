import { NextRequest, NextResponse } from 'next/server'

// Helper to parse Facebook signed_request (stub for now)
function parseSignedRequest(signedRequest: string) {
  // TODO: Implement signature verification using your Facebook App Secret
  // For now, just decode the payload
  const [encodedSig, payload] = signedRequest.split('.')
  const decoded = JSON.parse(Buffer.from(payload, 'base64').toString('utf-8'))
  return decoded
}

export async function POST(request: NextRequest) {
  const contentType = request.headers.get('content-type') || ''
  let data: any = {}

  if (contentType.includes('application/json')) {
    data = await request.json()
  } else if (contentType.includes('application/x-www-form-urlencoded')) {
    const formData = await request.formData()
    data = Object.fromEntries(formData.entries())
  }

  // Facebook-initiated deletion (signed_request)
  if (data.signed_request) {
    const signed = parseSignedRequest(data.signed_request)
    // TODO: Find user by Facebook user_id (signed.user_id) and delete their data
    // ...
    // Return status URL as required by Facebook
    return NextResponse.json({ url: 'https://chainreact.app/settings/security?deletion=facebook' })
  }

  // User-initiated deletion (authenticated user)
  // TODO: Authenticate user (e.g., via session/cookie/JWT)
  // TODO: Delete all Facebook-related data for the authenticated user
  // ...
  return NextResponse.json({ success: true, message: 'Your Facebook data deletion request has been received and will be processed.' })
}

export async function GET(request: NextRequest) {
  // Status page for Facebook deletion requests (optional)
  // You can render a status or confirmation message here
  return NextResponse.json({ status: 'pending', message: 'Your Facebook data deletion request is being processed.' })
}
