import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Img,
  Link,
  Preview,
  Section,
  Text,
} from '@react-email/components'

interface WelcomeEmailProps {
  username?: string
  confirmationUrl: string
}

// Brand colors
const colors = {
  // Primary gradient: orange to rose (for CTAs)
  orange: '#f97316',
  rose: '#f43f5e',
  // Logo gradient: blue to purple
  blue: '#3b82f6',
  purple: '#a855f7',
  // Neutrals
  dark: '#0f172a',
  darkGray: '#1e293b',
  gray: '#64748b',
  lightGray: '#f1f5f9',
  white: '#ffffff',
}

export const WelcomeEmail = ({
  username = 'there',
  confirmationUrl,
}: WelcomeEmailProps) => (
  <Html>
    <Head>
      <meta name="color-scheme" content="light" />
      <meta name="supported-color-schemes" content="light" />
      <style>
        {`
          @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');
        `}
      </style>
    </Head>
    <Preview>Welcome to ChainReact - Confirm your email to start building intelligent workflows</Preview>
    <Body style={main}>
      {/* Outer wrapper with gradient accent */}
      <table cellPadding="0" cellSpacing="0" style={outerWrapper}>
        <tr>
          <td>
            <Container style={container}>
              {/* Gradient top bar */}
              <table cellPadding="0" cellSpacing="0" style={{ width: '100%' }}>
                <tr>
                  <td style={gradientBar}></td>
                </tr>
              </table>

              {/* Header with animated-style logo */}
              <Section style={header}>
                <table cellPadding="0" cellSpacing="0" style={{ width: '100%' }}>
                  <tr>
                    <td style={{ textAlign: 'center', paddingBottom: '8px' }}>
                      {/* Custom SVG chain link logo inline */}
                      <img
                        src="https://chainreact.app/logo_transparent.png"
                        alt="ChainReact"
                        width="56"
                        height="56"
                        style={logoImage}
                      />
                    </td>
                  </tr>
                  <tr>
                    <td style={{ textAlign: 'center' }}>
                      <span style={logoTextChain}>Chain</span>
                      <span style={logoTextReact}>React</span>
                    </td>
                  </tr>
                </table>
              </Section>

              {/* Hero section */}
              <Section style={heroSection}>
                <table cellPadding="0" cellSpacing="0" style={{ width: '100%' }}>
                  <tr>
                    <td style={{ textAlign: 'center' }}>
                      <Heading style={heroHeading}>
                        Welcome aboard, {username}!
                      </Heading>
                      <Text style={heroSubtext}>
                        You're one step away from building workflows that think for themselves.
                      </Text>
                    </td>
                  </tr>
                </table>
              </Section>

              {/* CTA Section */}
              <Section style={ctaSection}>
                <table cellPadding="0" cellSpacing="0" style={{ width: '100%' }}>
                  <tr>
                    <td style={{ textAlign: 'center' }}>
                      {/* Button with gradient background using table hack for email */}
                      <table cellPadding="0" cellSpacing="0" style={{ margin: '0 auto' }}>
                        <tr>
                          <td style={buttonOuter}>
                            <a href={confirmationUrl} style={buttonInner}>
                              Confirm My Email
                            </a>
                          </td>
                        </tr>
                      </table>
                      <Text style={ctaSubtext}>
                        This link expires in 24 hours
                      </Text>
                    </td>
                  </tr>
                </table>
              </Section>

              {/* Features Grid */}
              <Section style={featuresSection}>
                <Text style={sectionTitle}>What you can build with ChainReact</Text>

                {/* Feature cards - using cellspacing for gaps */}
                <table cellPadding="0" cellSpacing="12" style={featureGrid}>
                  <tr>
                    {/* Card 1: Integrations */}
                    <td style={featureCard}>
                      <table cellPadding="0" cellSpacing="0" align="center" style={{ width: '100%' }}>
                        <tr>
                          <td align="center" style={{ paddingBottom: '10px' }}>
                            <table cellPadding="0" cellSpacing="0">
                              <tr>
                                <td style={{ width: '44px', height: '44px', backgroundColor: '#fff7ed', borderRadius: '10px', textAlign: 'center', fontSize: '20px', lineHeight: '44px' }}>
                                  🔗
                                </td>
                              </tr>
                            </table>
                          </td>
                        </tr>
                        <tr>
                          <td align="center" style={featureTitle}>20+ Integrations</td>
                        </tr>
                        <tr>
                          <td align="center" style={featureDesc}>Gmail, Slack, HubSpot, Notion, and more</td>
                        </tr>
                      </table>
                    </td>
                    {/* Card 2: AI-Powered */}
                    <td style={featureCard}>
                      <table cellPadding="0" cellSpacing="0" align="center" style={{ width: '100%' }}>
                        <tr>
                          <td align="center" style={{ paddingBottom: '10px' }}>
                            <table cellPadding="0" cellSpacing="0">
                              <tr>
                                <td style={{ width: '44px', height: '44px', backgroundColor: '#fff1f2', borderRadius: '10px', textAlign: 'center', fontSize: '20px', lineHeight: '44px' }}>
                                  🤖
                                </td>
                              </tr>
                            </table>
                          </td>
                        </tr>
                        <tr>
                          <td align="center" style={featureTitle}>AI-Powered</td>
                        </tr>
                        <tr>
                          <td align="center" style={featureDesc}>AI that reads docs and remembers context</td>
                        </tr>
                      </table>
                    </td>
                  </tr>
                  <tr>
                    {/* Card 3: No Code */}
                    <td style={featureCard}>
                      <table cellPadding="0" cellSpacing="0" align="center" style={{ width: '100%' }}>
                        <tr>
                          <td align="center" style={{ paddingBottom: '10px' }}>
                            <table cellPadding="0" cellSpacing="0">
                              <tr>
                                <td style={{ width: '44px', height: '44px', backgroundColor: '#faf5ff', borderRadius: '10px', textAlign: 'center', fontSize: '20px', lineHeight: '44px' }}>
                                  ✨
                                </td>
                              </tr>
                            </table>
                          </td>
                        </tr>
                        <tr>
                          <td align="center" style={featureTitle}>No Code</td>
                        </tr>
                        <tr>
                          <td align="center" style={featureDesc}>Visual drag-and-drop workflow builder</td>
                        </tr>
                      </table>
                    </td>
                    {/* Card 4: Team Ready */}
                    <td style={featureCard}>
                      <table cellPadding="0" cellSpacing="0" align="center" style={{ width: '100%' }}>
                        <tr>
                          <td align="center" style={{ paddingBottom: '10px' }}>
                            <table cellPadding="0" cellSpacing="0">
                              <tr>
                                <td style={{ width: '44px', height: '44px', backgroundColor: '#eff6ff', borderRadius: '10px', textAlign: 'center', fontSize: '20px', lineHeight: '44px' }}>
                                  👥
                                </td>
                              </tr>
                            </table>
                          </td>
                        </tr>
                        <tr>
                          <td align="center" style={featureTitle}>Team Ready</td>
                        </tr>
                        <tr>
                          <td align="center" style={featureDesc}>Collaborate and share workflows</td>
                        </tr>
                      </table>
                    </td>
                  </tr>
                </table>
              </Section>

              {/* Security notice */}
              <Section style={securitySection}>
                <table cellPadding="0" cellSpacing="0" style={securityBox}>
                  <tr>
                    <td style={securityIconCell}>
                      <span style={{ fontSize: '24px' }}>🔒</span>
                    </td>
                    <td style={securityTextCell}>
                      <Text style={securityText}>
                        Didn't sign up for ChainReact? No worries — just ignore this email and your account won't be created.
                      </Text>
                    </td>
                  </tr>
                </table>
              </Section>

              {/* Footer */}
              <Section style={footer}>
                <table cellPadding="0" cellSpacing="0" style={{ width: '100%' }}>
                  <tr>
                    <td style={{ textAlign: 'center', paddingBottom: '16px' }}>
                      <Text style={footerTitle}>Need the link?</Text>
                      <Text style={footerLink}>{confirmationUrl}</Text>
                    </td>
                  </tr>
                  <tr>
                    <td style={footerDivider}></td>
                  </tr>
                  <tr>
                    <td style={{ textAlign: 'center', paddingTop: '16px' }}>
                      <Text style={footerText}>
                        Questions? Reply to this email or reach us at{' '}
                        <Link href="mailto:support@chainreact.app" style={footerLinkStyle}>
                          support@chainreact.app
                        </Link>
                      </Text>
                    </td>
                  </tr>
                  <tr>
                    <td style={{ textAlign: 'center', paddingTop: '24px' }}>
                      <table cellPadding="0" cellSpacing="0" style={{ margin: '0 auto' }}>
                        <tr>
                          <td style={socialIcon}>
                            <Link href="https://twitter.com/chainreactapp" style={socialLinkStyle}>
                              𝕏
                            </Link>
                          </td>
                          <td style={{ width: '12px' }}></td>
                          <td style={socialIcon}>
                            <Link href="https://linkedin.com/company/chainreact" style={socialLinkStyle}>
                              in
                            </Link>
                          </td>
                        </tr>
                      </table>
                    </td>
                  </tr>
                  <tr>
                    <td style={{ textAlign: 'center', paddingTop: '20px' }}>
                      <Text style={copyright}>
                        © {new Date().getFullYear()} ChainReact, Inc. All rights reserved.
                      </Text>
                    </td>
                  </tr>
                </table>
              </Section>
            </Container>
          </td>
        </tr>
      </table>
    </Body>
  </Html>
)

export default WelcomeEmail

// ============================================
// STYLES
// ============================================

const main = {
  backgroundColor: '#0f172a',
  fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
  padding: '40px 16px',
}

const outerWrapper = {
  width: '100%',
  maxWidth: '600px',
  margin: '0 auto',
}

const container = {
  backgroundColor: colors.white,
  borderRadius: '16px',
  overflow: 'hidden',
  boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
}

const gradientBar = {
  height: '4px',
  background: `linear-gradient(90deg, ${colors.blue} 0%, ${colors.purple} 50%, ${colors.rose} 100%)`,
}

const header = {
  padding: '40px 40px 24px 40px',
  textAlign: 'center' as const,
  backgroundColor: colors.white,
}

const logoImage = {
  display: 'block',
  margin: '0 auto',
  borderRadius: '12px',
}

const logoTextChain = {
  fontSize: '28px',
  fontWeight: '700' as const,
  color: colors.dark,
  letterSpacing: '-0.5px',
}

const logoTextReact = {
  fontSize: '28px',
  fontWeight: '700' as const,
  color: colors.blue,
  letterSpacing: '-0.5px',
}

const heroSection = {
  padding: '0 40px 32px 40px',
  textAlign: 'center' as const,
}

const heroHeading = {
  fontSize: '28px',
  fontWeight: '700' as const,
  color: colors.dark,
  margin: '0 0 12px 0',
  lineHeight: '1.2',
}

const heroSubtext = {
  fontSize: '17px',
  color: colors.gray,
  margin: '0',
  lineHeight: '1.5',
}

const ctaSection = {
  padding: '0 40px 40px 40px',
  textAlign: 'center' as const,
}

const buttonOuter = {
  backgroundColor: colors.orange,
  borderRadius: '10px',
  padding: '0',
  background: `linear-gradient(135deg, ${colors.orange} 0%, ${colors.rose} 100%)`,
}

const buttonInner = {
  display: 'inline-block',
  padding: '16px 40px',
  fontSize: '16px',
  fontWeight: '600' as const,
  color: colors.white,
  textDecoration: 'none',
  borderRadius: '10px',
}

const ctaSubtext = {
  fontSize: '13px',
  color: colors.gray,
  margin: '16px 0 0 0',
}

const featuresSection = {
  padding: '32px 40px',
  backgroundColor: colors.lightGray,
}

const sectionTitle = {
  fontSize: '18px',
  fontWeight: '600' as const,
  color: colors.dark,
  margin: '0 0 24px 0',
  textAlign: 'center' as const,
}

const featureGrid = {
  width: '100%',
}

const featureCard = {
  backgroundColor: colors.white,
  borderRadius: '12px',
  padding: '20px',
  width: '50%',
  verticalAlign: 'top' as const,
  boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
}

const featureTitle = {
  fontSize: '14px',
  fontWeight: '600' as const,
  color: colors.dark,
  textAlign: 'center' as const,
  paddingBottom: '4px',
}

const featureDesc = {
  fontSize: '12px',
  color: colors.gray,
  textAlign: 'center' as const,
  lineHeight: '1.4',
}

const securitySection = {
  padding: '0 40px 32px 40px',
  backgroundColor: colors.lightGray,
}

const securityBox = {
  backgroundColor: colors.white,
  borderRadius: '12px',
  padding: '16px 20px',
  width: '100%',
  border: '1px solid #e2e8f0',
}

const securityIconCell = {
  width: '48px',
  verticalAlign: 'middle' as const,
}

const securityTextCell = {
  verticalAlign: 'middle' as const,
}

const securityText = {
  fontSize: '13px',
  color: colors.gray,
  margin: '0',
  lineHeight: '1.5',
}

const footer = {
  padding: '32px 40px',
  backgroundColor: colors.dark,
}

const footerTitle = {
  fontSize: '12px',
  fontWeight: '600' as const,
  color: '#94a3b8',
  margin: '0 0 8px 0',
  textTransform: 'uppercase' as const,
  letterSpacing: '0.5px',
}

const footerLink = {
  fontSize: '11px',
  color: '#64748b',
  margin: '0',
  wordBreak: 'break-all' as const,
}

const footerDivider = {
  height: '1px',
  backgroundColor: '#334155',
}

const footerText = {
  fontSize: '13px',
  color: '#94a3b8',
  margin: '0',
  lineHeight: '1.5',
}

const footerLinkStyle = {
  color: colors.blue,
  textDecoration: 'underline',
}

const socialIcon = {
  width: '32px',
  height: '32px',
  borderRadius: '8px',
  backgroundColor: '#1e293b',
  textAlign: 'center' as const,
  verticalAlign: 'middle' as const,
}

const socialLinkStyle = {
  color: '#94a3b8',
  textDecoration: 'none',
  fontSize: '14px',
  fontWeight: '600' as const,
  lineHeight: '32px',
  display: 'block',
}

const copyright = {
  fontSize: '11px',
  color: '#64748b',
  margin: '0',
}