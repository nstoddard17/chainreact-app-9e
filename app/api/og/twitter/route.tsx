import type React from 'react'
import { ImageResponse } from 'next/og'

export const runtime = 'edge'

export async function GET() {
  try {
    return new ImageResponse(<TwitterOg />, {
      width: 1200,
      height: 600,
    })
  } catch (error) {
    console.error('Twitter OG Image generation error:', error)
    return new Response('Failed to generate image', { status: 500 })
  }
}

function TwitterOg() {
  return (
    <div style={twitterContainerStyle}>
      <div style={twitterHeaderStyle}>
        <div style={brandStyle}>
          <div style={brandDotStyle} />
          <span style={brandLabelStyle}>ChainReact</span>
        </div>
        <div style={twitterBadgeStyle}>AI-Powered Workflow Automation</div>
      </div>

      <div style={twitterBodyStyle}>
        <div style={twitterCopyStyle}>
          <h1 style={headlineStyle}>
            Build intelligent workflows that connect your apps, automate busywork, and scale with your team.
          </h1>
          <div style={twitterFeaturesStyle}>
            {featureHighlights.map((feature) => (
              <div key={feature.title} style={{ ...twitterFeatureItemStyle, borderColor: feature.accent }}>
                <div style={{ ...pillIconStyle, background: feature.accent }} />
                <div style={featureCopyStyle}>
                  <span style={featureTitleStyle}>{feature.title}</span>
                  <span style={featureSubtitleStyle}>{feature.subtitle}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div style={twitterPreviewShellStyle}>
          <div style={twitterPreviewInnerStyle}>
            <div style={previewHeaderStyle}>
              <div style={previewTitleStyle}>
                <span style={previewBulletStyle} />
                Lead Enrichment Flow
              </div>
              <div style={previewTagStyle}>Active</div>
            </div>

            <div style={twitterWorkflowRowStyle}>
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
        <span style={footerCaptionStyle}>Automate smarter, not harder</span>
      </div>
    </div>
  )
}

const twitterContainerStyle: React.CSSProperties = {
  width: '100%',
  height: '100%',
  display: 'flex',
  flexDirection: 'column',
  justifyContent: 'space-between',
  padding: '48px 64px',
  background: 'linear-gradient(130deg, rgba(8,16,28,1) 10%, rgba(15,23,42,0.96) 35%, rgba(30,64,175,0.62) 90%)',
  color: '#e2e8f0',
}

const twitterHeaderStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  fontSize: 24,
}

const twitterBadgeStyle: React.CSSProperties = {
  padding: '10px 20px',
  borderRadius: 999,
  border: '1px solid rgba(148,163,184,0.25)',
  background: 'rgba(15,23,42,0.55)',
}

const twitterBodyStyle: React.CSSProperties = {
  display: 'flex',
  gap: 48,
  alignItems: 'stretch',
  flex: 1,
}

const twitterCopyStyle: React.CSSProperties = {
  flex: 1,
  display: 'flex',
  flexDirection: 'column',
  gap: 24,
  justifyContent: 'center',
}

const twitterFeaturesStyle: React.CSSProperties = {
  display: 'flex',
  gap: 16,
  marginTop: 12,
  flexWrap: 'wrap',
}

const twitterFeatureItemStyle: React.CSSProperties = {
  display: 'flex',
  gap: 16,
  padding: '14px 20px',
  borderRadius: 14,
  border: '1px solid rgba(148,163,184,0.2)',
  background: 'rgba(15,23,42,0.45)',
  alignItems: 'flex-start',
  flexGrow: 1,
  flexBasis: '48%',
  minWidth: 0,
}

const twitterPreviewShellStyle: React.CSSProperties = {
  flex: 1,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'flex-end',
}

const twitterPreviewInnerStyle: React.CSSProperties = {
  width: 500,
  borderRadius: 32,
  padding: '26px 28px',
  background: 'linear-gradient(140deg, rgba(15,23,42,0.9) 0%, rgba(30,41,59,0.75) 100%)',
  border: '1px solid rgba(148,163,184,0.24)',
  boxShadow: '0 35px 110px rgba(15,23,42,0.75)',
  display: 'flex',
  flexDirection: 'column',
  gap: 18,
}

const twitterWorkflowRowStyle: React.CSSProperties = {
  display: 'flex',
  gap: 12,
}

// Shared styles & data imported from primary OG implementation
const brandStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 14,
  fontSize: 26,
  textTransform: 'uppercase',
  letterSpacing: 2.6,
  color: '#e0f2fe',
  fontWeight: 600,
}

const brandDotStyle: React.CSSProperties = {
  width: 16,
  height: 16,
  borderRadius: '50%',
  background: 'radial-gradient(circle, #38bdf8 0%, #0ea5e9 60%, rgba(8,47,73,0.6) 100%)',
  boxShadow: '0 0 16px rgba(56,189,248,0.55)',
}

const brandLabelStyle: React.CSSProperties = {
  letterSpacing: 3,
}

const headlineStyle: React.CSSProperties = {
  fontSize: 54,
  lineHeight: 1.1,
  margin: 0,
  color: '#f8fafc',
  fontWeight: 700,
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
  {
    title: 'No-Code Builder',
    subtitle: 'Visual workflow designer anyone can use.',
    accent: '#facc15',
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
    badge: '#fef3c7',
    badgeBg: 'rgba(250,204,21,0.16)',
    title: 'Send to Slack',
    description: 'Notify team & create follow-up task.',
    bg: 'rgba(202,138,4,0.2)',
  },
]

const previewHeaderStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
}

const previewTitleStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 12,
  fontSize: 21,
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
  fontSize: 16,
  fontWeight: 600,
  border: '1px solid rgba(94,234,212,0.45)',
}

const stepCardStyle: React.CSSProperties = {
  flex: 1,
  borderRadius: 18,
  padding: '16px 18px',
  border: '1px solid rgba(148,163,184,0.16)',
  display: 'flex',
  flexDirection: 'column',
  gap: 8,
  color: '#e2e8f0',
}

const stepBadgeStyle: React.CSSProperties = {
  alignSelf: 'flex-start',
  padding: '4px 12px',
  borderRadius: 999,
  fontSize: 14,
  fontWeight: 600,
}

const stepTitleStyle: React.CSSProperties = {
  fontSize: 18,
  fontWeight: 600,
}

const stepDescriptionStyle: React.CSSProperties = {
  fontSize: 15,
  opacity: 0.75,
  lineHeight: 1.4,
}

const pillIconStyle: React.CSSProperties = {
  width: 10,
  height: 10,
  borderRadius: '9999px',
  boxShadow: '0 0 14px rgba(56,189,248,0.55)',
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
  color: 'rgba(226,232,240,0.76)',
}

const timeline = [
  { label: '10x Faster Setup', meta: 'vs traditional automation', color: '#60a5fa' },
  { label: '99.9% Uptime', meta: 'Enterprise-grade reliability', color: '#a855f7' },
  { label: 'Real-Time Logs', meta: 'Full execution visibility', color: '#5eead4' },
]

const timelineStyle: React.CSSProperties = {
  marginTop: 'auto',
  display: 'flex',
  gap: 16,
  justifyContent: 'space-between',
  paddingTop: 10,
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
  fontSize: 16,
  color: '#f8fafc',
  fontWeight: 600,
}

const timelineMetaStyle: React.CSSProperties = {
  fontSize: 15,
  color: 'rgba(226,232,240,0.68)',
}

const footerStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  fontSize: 20,
  color: 'rgba(226,232,240,0.75)',
}

const footerDomainStyle: React.CSSProperties = {
  fontSize: 22,
  letterSpacing: 0.6,
  color: '#bae6fd',
}

const footerCaptionStyle: React.CSSProperties = {
  fontSize: 20,
}
