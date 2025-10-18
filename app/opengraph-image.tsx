import { ImageResponse } from 'next/og'
import { readFileSync } from 'fs'
import { join } from 'path'

export const runtime = 'nodejs'

const size = {
  width: 1200,
  height: 630,
}

export const contentType = 'image/png'

export default async function OpengraphImage() {
  const fontData = readFileSync(
    join(process.cwd(), 'public', 'fonts', 'SpaceGrotesk-Bold.woff2')
  )

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          padding: '64px',
          background: 'radial-gradient(circle at top left, #3b82f6 0%, #312e81 40%, #0f172a 100%)',
          color: '#f8fafc',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 16,
            fontSize: 28,
            letterSpacing: 1,
            textTransform: 'uppercase',
            opacity: 0.9,
          }}
        >
          <div
            style={{
              width: 16,
              height: 16,
              borderRadius: '50%',
              background: '#38bdf8',
              boxShadow: '0 0 16px rgba(56, 189, 248, 0.55)',
            }}
          />
          <span>ChainReact</span>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          <h1
            style={{
              fontSize: 86,
              fontWeight: 700,
              lineHeight: 1.05,
              letterSpacing: -2,
              margin: 0,
            }}
          >
            Automate Workflows{" "}
            <span style={{ color: '#38bdf8' }}>10x faster</span> with AI
          </h1>
          <p
            style={{
              fontSize: 32,
              lineHeight: 1.45,
              maxWidth: 800,
              opacity: 0.88,
              margin: 0,
            }}
          >
            Connect your apps, design intelligent automations, and let ChainReact keep teams moving without the busywork.
          </p>
        </div>

        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            opacity: 0.85,
          }}
        >
          <div style={{ fontSize: 24, letterSpacing: 0.5 }}>chainreact.app</div>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 24,
            }}
          >
            <div style={{ fontSize: 22 }}>Build once. Automate forever.</div>
          </div>
        </div>
      </div>
    ),
    {
      ...size,
      fonts: [
        {
          name: 'Space Grotesk',
          data: fontData,
          weight: 700,
          style: 'normal',
        },
      ],
    },
  )
}
