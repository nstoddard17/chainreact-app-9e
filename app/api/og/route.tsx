import type React from 'react'
import { ImageResponse } from 'next/og'

export const runtime = 'edge'

export async function GET() {
  try {
    return new ImageResponse(
      (
        <div style={containerStyle}>
          <div style={topRowStyle}>
            <div style={brandStyle}>
              <div style={brandDotStyle} />
              <span style={brandLabelStyle}>ChainReact</span>
            </div>
            <span style={taglineStyle}>Visual Workflow Automation Platform</span>
          </div>

          <div style={contentRowStyle}>
            <div style={copyColumnStyle}>
              <h1 style={headlineStyle}>
                Automate Your Workflows 10x Faster with AI
              </h1>
              <p style={bodyStyle}>
                The visual automation platform that connects your favorite apps, runs intelligent workflows, and keeps your team in complete control. From simple tasks to complex AI-driven processes.
              </p>

              <div style={featureListStyle}>
                {featureHighlights.map((feature) => (
                  <div key={feature.title} style={featureItemStyle}>
                    <div style={{ ...pillIconStyle, background: feature.accent }} />
                    <div style={featureCopyStyle}>
                      <span style={featureTitleStyle}>{feature.title}</span>
                      <span style={featureSubtitleStyle}>{feature.subtitle}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div style={previewWrapperStyle}>
            <div style={previewCardStyle}>
              <div style={previewHeaderStyle}>
                <div style={previewTitleStyle}>
                  <span style={previewBulletStyle} />
                  Sales Lead Automation
                </div>
                <div style={previewTagStyle}>Active</div>
              </div>

              <div style={previewGridStyle}>
                  {workflowSteps.map((step) => (
                    <div key={step.title} style={{ ...stepCardStyle, background: step.bg }}>
                      <div style={{ ...stepBadgeStyle, color: step.badge, background: step.badgeBg }}>
                        {step.badgeLabel}
                      </div>
                      <div style={stepTitleStyle}>{step.title}</div>
                      <div style={stepDescriptionStyle}>{step.description}</div>
                    </div>
                  ))}
                </div>

                <div style={timelineStyle}>
                  {timeline.map((item, index) => (
                    <div key={`${item.label}-${index}`} style={timelineItemStyle}>
                      <div style={{ ...timelineDotStyle, background: item.color }} />
                      <div style={timelineTextStyle}>
                        <span style={timelineLabelStyle}>{item.label}</span>
                        <span style={timelineMetaStyle}>{item.meta}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          <div style={footerStyle}>
            <span style={footerDomainStyle}>chainreact.app</span>
            <span style={footerCaptionStyle}>Build workflows that scale with your business</span>
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

const containerStyle: React.CSSProperties = {
  width: '100%',
  height: '100%',
  display: 'flex',
  flexDirection: 'column',
  justifyContent: 'space-between',
  padding: '56px 72px',
  background: 'radial-gradient(circle at 12% 18%, rgba(56,189,248,0.75) 0%, rgba(15,23,42,0.45) 28%, rgba(2,6,23,0.95) 68%, rgba(2,6,23,1) 100%)',
  color: '#e2e8f0',
}

const topRowStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  fontSize: 26,
  marginBottom: 24,
}

const brandStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 14,
  fontSize: 28,
  letterSpacing: 1.2,
  textTransform: 'uppercase',
  color: '#e0f2fe',
  fontWeight: 600,
}

const brandDotStyle: React.CSSProperties = {
  width: 18,
  height: 18,
  borderRadius: '50%',
  background: 'radial-gradient(circle, #38bdf8 0%, #0ea5e9 60%, rgba(8,47,73,0.6) 100%)',
  boxShadow: '0 0 18px rgba(56,189,248,0.6)',
}

const brandLabelStyle: React.CSSProperties = {
  letterSpacing: 3.2,
}

const taglineStyle: React.CSSProperties = {
  fontSize: 22,
  opacity: 0.78,
  letterSpacing: 0.4,
}

const contentRowStyle: React.CSSProperties = {
  display: 'flex',
  gap: 68,
  alignItems: 'flex-start',
  flex: 1,
}

const copyColumnStyle: React.CSSProperties = {
  flex: 1.1,
  display: 'flex',
  flexDirection: 'column',
  gap: 22,
  justifyContent: 'flex-start',
  maxWidth: 520,
}

const headlineStyle: React.CSSProperties = {
  fontSize: 48,
  lineHeight: 1.12,
  margin: 0,
  color: '#f8fafc',
  fontWeight: 700,
  letterSpacing: -0.5,
}

const bodyStyle: React.CSSProperties = {
  fontSize: 22,
  lineHeight: 1.5,
  margin: 0,
  maxWidth: 520,
  color: 'rgba(226,232,240,0.85)',
}

const featureListStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 18,
  marginTop: 16,
}

const featureItemStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 18,
  background: 'rgba(8,16,32,0.65)',
  borderRadius: 16,
  padding: '18px 26px',
  border: '1px solid rgba(148,163,184,0.28)',
  backdropFilter: 'blur(6px)',
  boxShadow: '0 18px 38px rgba(2,6,23,0.45)',
}

const pillIconStyle: React.CSSProperties = {
  width: 12,
  height: 12,
  borderRadius: '9999px',
  boxShadow: '0 0 16px rgba(56,189,248,0.65)',
}

const featureCopyStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 4,
}

const featureTitleStyle: React.CSSProperties = {
  fontSize: 22,
  fontWeight: 600,
  color: '#f8fafc',
}

const featureSubtitleStyle: React.CSSProperties = {
  fontSize: 18,
  color: 'rgba(226,232,240,0.72)',
}

const previewWrapperStyle: React.CSSProperties = {
  flex: 1,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'flex-end',
}

const previewCardStyle: React.CSSProperties = {
  width: 520,
  height: 360,
  borderRadius: 32,
  padding: '28px 30px',
  background: 'linear-gradient(130deg, rgba(15,23,42,0.92) 0%, rgba(15,23,42,0.68) 100%)',
  border: '1px solid rgba(148,163,184,0.25)',
  boxShadow: '0 40px 120px rgba(15,23,42,0.75)',
  display: 'flex',
  flexDirection: 'column',
  gap: 20,
}

const previewHeaderStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
}

const previewTitleStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 12,
  fontSize: 22,
  fontWeight: 600,
  color: '#e2e8f0',
}

const previewBulletStyle: React.CSSProperties = {
  width: 10,
  height: 10,
  borderRadius: '50%',
  background: '#38bdf8',
  boxShadow: '0 0 10px rgba(56,189,248,0.65)',
}

const previewTagStyle: React.CSSProperties = {
  padding: '6px 16px',
  borderRadius: 999,
  background: 'rgba(45,212,191,0.12)',
  color: '#5eead4',
  fontSize: 18,
  fontWeight: 600,
  border: '1px solid rgba(94,234,212,0.45)',
}

const previewGridStyle: React.CSSProperties = {
  display: 'flex',
  gap: 14,
}

const stepCardStyle: React.CSSProperties = {
  borderRadius: 18,
  padding: '16px 18px',
  border: '1px solid rgba(148,163,184,0.16)',
  display: 'flex',
  flexDirection: 'column',
  gap: 8,
  color: '#e2e8f0',
  flex: 1,
}

const stepBadgeStyle: React.CSSProperties = {
  alignSelf: 'flex-start',
  padding: '4px 12px',
  borderRadius: 999,
  fontSize: 16,
  fontWeight: 600,
}

const stepTitleStyle: React.CSSProperties = {
  fontSize: 20,
  fontWeight: 600,
}

const stepDescriptionStyle: React.CSSProperties = {
  fontSize: 16,
  opacity: 0.75,
  lineHeight: 1.35,
}

const timelineStyle: React.CSSProperties = {
  marginTop: 'auto',
  display: 'flex',
  gap: 16,
  justifyContent: 'space-between',
  paddingTop: 12,
  borderTop: '1px solid rgba(148,163,184,0.18)',
}

const timelineItemStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 12,
  flex: 1,
  minWidth: 0,
}

const timelineDotStyle: React.CSSProperties = {
  width: 10,
  height: 10,
  borderRadius: '50%',
}

const timelineTextStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 4,
}

const timelineLabelStyle: React.CSSProperties = {
  fontSize: 18,
  color: '#f8fafc',
  fontWeight: 600,
}

const timelineMetaStyle: React.CSSProperties = {
  fontSize: 16,
  color: 'rgba(226,232,240,0.74)',
}

const footerStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  fontSize: 22,
  color: 'rgba(226,232,240,0.75)',
}

const footerDomainStyle: React.CSSProperties = {
  fontSize: 24,
  letterSpacing: 0.6,
  color: '#bae6fd',
}

const footerCaptionStyle: React.CSSProperties = {
  fontSize: 22,
}

const featureHighlights = [
  {
    title: 'AI-Powered Workflows',
    subtitle: 'Build intelligent automations that learn and adapt.',
    accent: '#a855f7',
  },
  {
    title: '20+ Integrations',
    subtitle: 'Connect Gmail, Slack, Notion, HubSpot & more instantly.',
    accent: '#60a5fa',
  },
  {
    title: 'Real-Time Monitoring',
    subtitle: 'Track every execution with full observability.',
    accent: '#5eead4',
  },
]

const workflowSteps = [
  {
    badgeLabel: 'Trigger',
    badge: '#93c5fd',
    badgeBg: 'rgba(59,130,246,0.15)',
    title: 'New Lead in HubSpot',
    description: 'Auto-detect form submission & enrich data.',
    bg: 'rgba(30,64,175,0.28)',
  },
  {
    badgeLabel: 'AI Action',
    badge: '#f0abfc',
    badgeBg: 'rgba(192,132,252,0.18)',
    title: 'Generate Outreach',
    description: 'AI crafts personalized email from context.',
    bg: 'rgba(88,28,135,0.26)',
  },
  {
    badgeLabel: 'Action',
    badge: '#6ee7b7',
    badgeBg: 'rgba(16,185,129,0.18)',
    title: 'Send to Slack',
    description: 'Notify team & create follow-up task.',
    bg: 'rgba(22,101,52,0.24)',
  },
]

const timeline = [
  { label: '10x Faster Setup', meta: 'vs traditional automation', color: '#60a5fa' },
  { label: '99.9% Uptime', meta: 'Enterprise-grade reliability', color: '#a855f7' },
  { label: 'Real-Time Logs', meta: 'Full execution visibility', color: '#5eead4' },
]
