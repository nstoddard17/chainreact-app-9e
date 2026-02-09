import { NextRequest, NextResponse } from 'next/server'
import { render } from '@react-email/render'
import WelcomeEmail from '@/emails/welcome'

/**
 * GET /api/email-preview
 *
 * Returns the rendered welcome email HTML for preview.
 * This is a development-only endpoint for testing email templates.
 *
 * Query params:
 * - username: Name to display (default: "John")
 * - template: Which template to preview (default: "welcome")
 */
export async function GET(request: NextRequest) {
  // Only allow in development
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json(
      { error: 'Email preview is only available in development' },
      { status: 403 }
    )
  }

  const { searchParams } = new URL(request.url)
  const username = searchParams.get('username') || 'John'
  const template = searchParams.get('template') || 'welcome'

  try {
    let html: string

    switch (template) {
      case 'welcome':
      default:
        html = await render(
          WelcomeEmail({
            username,
            confirmationUrl: 'https://chainreact.app/auth/confirm?token=preview-token-123',
          })
        )
        break
    }

    // Return as HTML page
    return new NextResponse(html, {
      headers: {
        'Content-Type': 'text/html',
      },
    })
  } catch (error) {
    console.error('Error rendering email:', error)
    return NextResponse.json(
      { error: 'Failed to render email template' },
      { status: 500 }
    )
  }
}
