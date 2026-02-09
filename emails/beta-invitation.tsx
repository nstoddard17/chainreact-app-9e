import {
  Body,
  Container,
  Head,
  Heading,
  Html,
  Preview,
  Section,
  Text,
} from '@react-email/components'

interface BetaInvitationEmailProps {
  email: string
  signupUrl: string
  expiresInDays?: number
}

const colors = {
  blue: '#3b82f6',
  purple: '#a855f7',
  rose: '#f43f5e',
  dark: '#0f172a',
  gray: '#64748b',
  lightGray: '#f8fafc',
  white: '#ffffff',
}

export const BetaInvitationEmail = ({
  email,
  signupUrl,
  expiresInDays = 30,
}: BetaInvitationEmailProps) => {
  const previewText = `You're invited to join ChainReact Beta - Exclusive early access awaits!`

  return (
    <Html>
      <Head>
        <meta name="color-scheme" content="light" />
        <meta name="supported-color-schemes" content="light" />
      </Head>
      <Preview>{previewText}</Preview>
      <Body style={main}>
        <Container style={container}>
          {/* Gradient top accent */}
          <table cellPadding="0" cellSpacing="0" width="100%">
            <tr>
              <td style={gradientBar}></td>
            </tr>
          </table>

          {/* Logo */}
          <Section style={logoSection}>
            <table cellPadding="0" cellSpacing="0" width="100%">
              <tr>
                <td align="center">
                  <img
                    src="https://chainreact.app/logo_transparent.png"
                    alt="ChainReact"
                    width="48"
                    height="48"
                    style={{ display: 'block', margin: '0 auto' }}
                  />
                </td>
              </tr>
            </table>
          </Section>

          {/* Main Content */}
          <Section style={contentSection}>
            <Heading style={heading}>
              You're invited to Beta
            </Heading>

            <Text style={paragraph}>
              You've been selected to join ChainReact Beta! Get early access to workflow automation that thinks for itself—before anyone else.
            </Text>

            {/* CTA Button */}
            <table cellPadding="0" cellSpacing="0" width="100%">
              <tr>
                <td align="center" style={{ padding: '32px 0' }}>
                  <table cellPadding="0" cellSpacing="0">
                    <tr>
                      <td style={buttonStyle}>
                        <a href={signupUrl} style={buttonLinkStyle}>
                          Claim your access
                        </a>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>
            </table>

            <Text style={smallText}>
              This invitation expires in {expiresInDays} days. If you weren't expecting this, you can safely ignore it.
            </Text>
          </Section>

          {/* Divider */}
          <table cellPadding="0" cellSpacing="0" width="100%">
            <tr>
              <td style={{ padding: '0 48px' }}>
                <table cellPadding="0" cellSpacing="0" width="100%">
                  <tr>
                    <td style={{ height: '1px', backgroundColor: '#e2e8f0' }}></td>
                  </tr>
                </table>
              </td>
            </tr>
          </table>

          {/* Footer */}
          <Section style={footerSection}>
            <Text style={footerText}>
              If the button above doesn't work, paste this link into your browser:
            </Text>
            <Text style={linkText}>
              {signupUrl}
            </Text>

            <table cellPadding="0" cellSpacing="0" width="100%" style={{ marginTop: '32px' }}>
              <tr>
                <td align="center">
                  <Text style={footerBrand}>
                    <span style={{ color: colors.dark, fontWeight: 600 }}>Chain</span>
                    <span style={{ color: colors.blue, fontWeight: 600 }}>React</span>
                  </Text>
                  <Text style={copyright}>
                    Workflow automation that thinks for itself
                  </Text>
                </td>
              </tr>
            </table>
          </Section>
        </Container>
      </Body>
    </Html>
  )
}

export default BetaInvitationEmail

const main = {
  backgroundColor: colors.lightGray,
  fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
  padding: '40px 20px',
}

const container = {
  backgroundColor: colors.white,
  borderRadius: '12px',
  maxWidth: '480px',
  margin: '0 auto',
  overflow: 'hidden',
}

const gradientBar = {
  height: '3px',
  background: `linear-gradient(90deg, ${colors.blue} 0%, ${colors.purple} 50%, ${colors.rose} 100%)`,
}

const logoSection = {
  padding: '40px 48px 0 48px',
}

const contentSection = {
  padding: '32px 48px 40px 48px',
}

const heading = {
  fontSize: '24px',
  fontWeight: '600' as const,
  color: colors.dark,
  margin: '0 0 16px 0',
  lineHeight: '1.3',
}

const paragraph = {
  fontSize: '15px',
  color: colors.gray,
  margin: '0',
  lineHeight: '1.6',
}

const buttonStyle = {
  backgroundColor: colors.dark,
  borderRadius: '8px',
}

const buttonLinkStyle = {
  display: 'inline-block',
  padding: '14px 28px',
  fontSize: '14px',
  fontWeight: '500' as const,
  color: colors.white,
  textDecoration: 'none',
}

const smallText = {
  fontSize: '13px',
  color: '#94a3b8',
  margin: '0',
  lineHeight: '1.5',
  textAlign: 'center' as const,
}

const footerSection = {
  padding: '32px 48px 40px 48px',
}

const footerText = {
  fontSize: '12px',
  color: '#94a3b8',
  margin: '0 0 8px 0',
  lineHeight: '1.5',
}

const linkText = {
  fontSize: '12px',
  color: colors.blue,
  margin: '0',
  wordBreak: 'break-all' as const,
}

const footerBrand = {
  fontSize: '16px',
  margin: '0 0 4px 0',
}

const copyright = {
  fontSize: '12px',
  color: '#94a3b8',
  margin: '0',
}
