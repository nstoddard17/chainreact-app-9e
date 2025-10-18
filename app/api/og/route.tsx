import type React from 'react'
import { ImageResponse } from 'next/og'

export const runtime = 'edge'

export async function GET() {
  try {
    return new ImageResponse(
      (
        <div style={containerStyle}>
          {/* Subtle gradient mesh background */}
          <div style={gradientMesh1} />
          <div style={gradientMesh2} />
          <div style={gradientMesh3} />

          {/* Noise texture overlay for depth */}
          <div style={noiseOverlay} />

          {/* Grid pattern for sophistication */}
          <div style={gridPattern} />

          {/* Main content */}
          <div style={contentWrapperStyle}>
            {/* Logo - match homepage header */}
            <div style={logoContainerStyle}>
              <span style={logoTextStyle}>ChainReact</span>
            </div>

            {/* Main headline - Bold, impactful */}
            <div style={headlineContainerStyle}>
              <h1 style={mainHeadlineStyle}>
                Automate your workflow
              </h1>
              <h1 style={gradientHeadlineStyle}>
                effortlessly
              </h1>
            </div>

            {/* Subheading */}
            <p style={subheadingStyle}>
              From simple tasks to complex orchestration—everything you need to automate.
            </p>

            {/* Key Features Grid */}
            <div style={featuresContainerStyle}>
              <div style={featuresGridStyle}>
                {/* Feature 1 - Lightning Fast */}
                <div style={featureCardStyle}>
                  <div style={featureIconContainerStyle}>
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                      <path d="M13 2L3 14h8l-1 8 10-12h-8l1-8z" fill="#60a5fa" />
                    </svg>
                  </div>
                  <div style={featureLabelStyle}>Lightning Fast</div>
                </div>

                {/* Feature 2 - Enterprise Security */}
                <div style={featureCardStyle}>
                  <div style={featureIconContainerStyle}>
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                      <path d="M12 2L4 6v6c0 5.5 3.8 10.7 8 12 4.2-1.3 8-6.5 8-12V6l-8-4z" stroke="#a855f7" strokeWidth="2" fill="none" />
                    </svg>
                  </div>
                  <div style={featureLabelStyle}>Enterprise Security</div>
                </div>

                {/* Feature 3 - Visual Builder */}
                <div style={featureCardStyle}>
                  <div style={featureIconContainerStyle}>
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                      <path d="M4 6h16M4 12h16M4 18h16" stroke="#34d399" strokeWidth="2" strokeLinecap="round" />
                      <circle cx="8" cy="6" r="2" fill="#34d399" />
                      <circle cx="16" cy="12" r="2" fill="#34d399" />
                      <circle cx="8" cy="18" r="2" fill="#34d399" />
                    </svg>
                  </div>
                  <div style={featureLabelStyle}>Visual Builder</div>
                </div>

                {/* Feature 4 - Real-time Monitoring */}
                <div style={featureCardStyle}>
                  <div style={featureIconContainerStyle}>
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                      <circle cx="12" cy="12" r="10" stroke="#f59e0b" strokeWidth="2" fill="none" />
                      <path d="M12 6v6l4 2" stroke="#f59e0b" strokeWidth="2" strokeLinecap="round" />
                    </svg>
                  </div>
                  <div style={featureLabelStyle}>24/7 Monitoring</div>
                </div>

                {/* Feature 5 - Team Collaboration */}
                <div style={featureCardStyle}>
                  <div style={featureIconContainerStyle}>
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                      <circle cx="9" cy="7" r="3" stroke="#ec4899" strokeWidth="2" fill="none" />
                      <circle cx="15" cy="7" r="3" stroke="#ec4899" strokeWidth="2" fill="none" />
                      <path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6M15 20c0-3.3 2.7-6 6-6" stroke="#ec4899" strokeWidth="2" fill="none" />
                    </svg>
                  </div>
                  <div style={featureLabelStyle}>Team Collaboration</div>
                </div>

                {/* Feature 6 - Advanced Analytics */}
                <div style={featureCardStyle}>
                  <div style={featureIconContainerStyle}>
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                      <path d="M3 20h18M7 20V10m5 10V4m5 16v-8" stroke="#06b6d4" strokeWidth="2" strokeLinecap="round" />
                    </svg>
                  </div>
                  <div style={featureLabelStyle}>Advanced Analytics</div>
                </div>
              </div>

              {/* Bottom badge */}
              <div style={badgeStyle}>
                <div style={badgeDotStyle} />
                <span style={badgeTextStyle}>Now in Public Beta</span>
              </div>
            </div>
          </div>
        </div>
      ),
      {
        width: 1200,
        height: 630,
      }
    )
  } catch (error) {
    console.error('OG Image generation error:', error)
    return new Response('Failed to generate image', { status: 500 })
  }
}

// ============================================================================
// CONTAINER & BACKGROUND
// ============================================================================

const containerStyle: React.CSSProperties = {
  width: '100%',
  height: '100%',
  display: 'flex',
  position: 'relative',
  background: 'linear-gradient(to bottom, #0f172a, #020617)', // slate-900 to slate-950
  overflow: 'hidden',
}

// Subtle gradient mesh for depth (Linear-style)
const gradientMesh1: React.CSSProperties = {
  position: 'absolute',
  top: '-20%',
  left: '-10%',
  width: '600px',
  height: '600px',
  background: 'radial-gradient(circle, rgba(59, 130, 246, 0.15) 0%, transparent 70%)',
  filter: 'blur(80px)',
}

const gradientMesh2: React.CSSProperties = {
  position: 'absolute',
  top: '-10%',
  right: '-5%',
  width: '500px',
  height: '500px',
  background: 'radial-gradient(circle, rgba(139, 92, 246, 0.12) 0%, transparent 70%)',
  filter: 'blur(90px)',
}

const gradientMesh3: React.CSSProperties = {
  position: 'absolute',
  bottom: '-15%',
  left: '30%',
  width: '550px',
  height: '550px',
  background: 'radial-gradient(circle, rgba(99, 102, 241, 0.1) 0%, transparent 70%)',
  filter: 'blur(100px)',
}

// Noise texture for premium feel
const noiseOverlay: React.CSSProperties = {
  position: 'absolute',
  top: 0,
  left: 0,
  width: '100%',
  height: '100%',
  backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 400 400' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='3.5' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)' opacity='0.025'/%3E%3C/svg%3E")`,
  opacity: 0.6,
}

// Grid pattern (Stripe-style sophistication)
const gridPattern: React.CSSProperties = {
  position: 'absolute',
  top: 0,
  left: 0,
  width: '100%',
  height: '100%',
  backgroundImage: `linear-gradient(rgba(148, 163, 184, 0.03) 1px, transparent 1px),
                    linear-gradient(90deg, rgba(148, 163, 184, 0.03) 1px, transparent 1px)`,
  backgroundSize: '50px 50px',
}

// ============================================================================
// CONTENT WRAPPER
// ============================================================================

const contentWrapperStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  justifyContent: 'space-between',
  width: '100%',
  height: '100%',
  padding: '70px 80px',
  position: 'relative',
}

// ============================================================================
// LOGO
// ============================================================================

const logoContainerStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  marginBottom: 80,
}

const logoTextStyle: React.CSSProperties = {
  fontSize: 30,
  fontWeight: 700,
  background: 'linear-gradient(to right, #60a5fa, #a78bfa)',
  backgroundClip: 'text',
  WebkitBackgroundClip: 'text',
  color: 'transparent',
  letterSpacing: '-0.8px',
}

// ============================================================================
// HEADLINES
// ============================================================================

const headlineContainerStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  marginBottom: 24,
}

const mainHeadlineStyle: React.CSSProperties = {
  fontSize: 72,
  fontWeight: 700,
  color: '#ffffff',
  margin: 0,
  lineHeight: 0.95,
  letterSpacing: '-2.5px',
  marginBottom: 8,
}

const gradientHeadlineStyle: React.CSSProperties = {
  fontSize: 72,
  fontWeight: 700,
  background: 'linear-gradient(135deg, #60a5fa 0%, #a78bfa 50%, #c084fc 100%)',
  backgroundClip: 'text',
  WebkitBackgroundClip: 'text',
  color: 'transparent',
  margin: 0,
  lineHeight: 0.95,
  letterSpacing: '-2.5px',
}

const subheadingStyle: React.CSSProperties = {
  fontSize: 24,
  color: '#94a3b8',
  marginBottom: 60,
  lineHeight: 1.4,
  letterSpacing: '-0.3px',
}

// ============================================================================
// FEATURES GRID
// ============================================================================

const featuresContainerStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 32,
  marginBottom: 'auto',
}

const featuresGridStyle: React.CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: 16,
  maxWidth: 900,
}

const featureCardStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 12,
  padding: '16px 24px',
  background: 'rgba(15, 23, 42, 0.6)',
  border: '1px solid rgba(148, 163, 184, 0.15)',
  borderRadius: 12,
  backdropFilter: 'blur(20px)',
  boxShadow: '0 4px 16px rgba(0, 0, 0, 0.2), inset 0 1px 0 rgba(255, 255, 255, 0.05)',
  width: 280,
}

const featureIconContainerStyle: React.CSSProperties = {
  width: 40,
  height: 40,
  borderRadius: 10,
  background: 'rgba(59, 130, 246, 0.1)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  flexShrink: 0,
}

const featureLabelStyle: React.CSSProperties = {
  fontSize: 16,
  fontWeight: 600,
  color: '#e2e8f0',
  letterSpacing: '-0.2px',
}

// ============================================================================
// BADGE
// ============================================================================

const badgeStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  padding: '10px 20px',
  background: 'rgba(59, 130, 246, 0.1)',
  border: '1px solid rgba(59, 130, 246, 0.2)',
  borderRadius: 100,
  alignSelf: 'flex-start',
}

const badgeDotStyle: React.CSSProperties = {
  width: 8,
  height: 8,
  borderRadius: '50%',
  background: '#3b82f6',
  boxShadow: '0 0 12px rgba(59, 130, 246, 0.6)',
}

const badgeTextStyle: React.CSSProperties = {
  fontSize: 15,
  fontWeight: 600,
  color: '#93c5fd',
  letterSpacing: '-0.2px',
}
