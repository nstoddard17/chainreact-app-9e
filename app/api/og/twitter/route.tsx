import { ImageResponse } from 'next/og'

export const runtime = 'edge'

export async function GET() {
  try {
    return new ImageResponse(
      (
        <div
          style={{
            width: '100%',
            height: '100%',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            padding: '56px',
            background: 'linear-gradient(135deg, #0f172a 15%, #1d4ed8 55%, #7c3aed 100%)',
            color: '#f8fafc',
          }}
        >
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              fontSize: 26,
              opacity: 0.85,
            }}
          >
            <span>ChainReact</span>
            <span style={{ fontSize: 22 }}>AI-Powered Automation</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            <h1
              style={{
                fontSize: 74,
                fontWeight: 700,
                lineHeight: 1.1,
                margin: 0,
                letterSpacing: -1.5,
              }}
            >
              Orchestrate workflows that scale while your team stays focused
            </h1>
            <p
              style={{
                fontSize: 30,
                lineHeight: 1.45,
                maxWidth: 760,
                opacity: 0.9,
                margin: 0,
              }}
            >
              Visual builder • Secure OAuth connections • Real-time monitoring • AI infused actions
            </p>
          </div>
          <div style={{ fontSize: 26, letterSpacing: 0.5 }}>chainreact.app</div>
        </div>
      ),
      {
        width: 1200,
        height: 600,
      }
    )
  } catch (error) {
    console.error('Twitter OG Image generation error:', error)
    return new Response('Failed to generate image', { status: 500 })
  }
}
