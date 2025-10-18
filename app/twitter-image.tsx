import { ImageResponse } from 'next/server'

export const runtime = 'edge'

const size = {
  width: 1200,
  height: 600,
}

const fontDataPromise = fetch(
  new URL('../public/fonts/SpaceGrotesk-Bold.woff2', import.meta.url)
).then(res => res.arrayBuffer())

export const contentType = 'image/png'

export default async function TwitterImage() {
  const fontData = await fontDataPromise

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
