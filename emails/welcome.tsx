import {
  Body,
  Container,
  Head,
  Heading,
  Html,
  Link,
  Preview,
  Section,
  Text,
} from '@react-email/components'

interface WelcomeEmailProps {
  username?: string
  confirmationUrl: string
}

export const WelcomeEmail = ({
  username = 'there',
  confirmationUrl,
}: WelcomeEmailProps) => (
  <Html>
    <Head>
      <meta name="color-scheme" content="light" />
      <meta name="supported-color-schemes" content="light" />
    </Head>
    <Preview>Confirm your email to start building workflows</Preview>
    <Body style={main}>
      <Container style={container}>
        {/* Gradient top accent */}
        <Section style={gradientBar} />

        {/* Logo */}
        <Section style={logoSection}>
          <table cellPadding="0" cellSpacing="0" width="100%">
            <tr>
              <td align="center">
                <img
                  src="https://chainreact.app/logo_transparent.png"
                  alt="ChainReact"
                  width="44"
                  height="44"
                  style={{ display: 'block' }}
                />
              </td>
            </tr>
          </table>
        </Section>

        {/* Main Content */}
        <Section style={contentSection}>
          <Heading style={heading}>
            Welcome, {username}
          </Heading>

          <Text style={paragraph}>
            Thanks for signing up for ChainReact. Click the button below to confirm your email address and get started.
          </Text>

          {/* CTA Button */}
          <Section style={buttonSection}>
            <Link href={confirmationUrl} style={button}>
              Confirm email address
            </Link>
          </Section>

          <Text style={smallText}>
            This link expires in 24 hours. If you didn't create an account, you can safely ignore this email.
          </Text>
        </Section>

        {/* Divider */}
        <Section style={dividerSection}>
          <div style={divider} />
        </Section>

        {/* Footer */}
        <Section style={footerSection}>
          <Text style={footerText}>
            If the button doesn't work, copy and paste this link:
          </Text>
          <Text style={linkText}>
            <Link href={confirmationUrl} style={linkStyle}>
              {confirmationUrl}
            </Link>
          </Text>

          <Text style={footerBrand}>
            ChainReact
          </Text>
          <Text style={copyright}>
            Workflow automation that thinks for itself
          </Text>
        </Section>
      </Container>
    </Body>
  </Html>
)

export default WelcomeEmail

// ============================================
// STYLES - Clean, Light, Professional
// ============================================

const main = {
  backgroundColor: '#f6f9fc',
  fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
  padding: '40px 20px',
}

const container = {
  backgroundColor: '#ffffff',
  borderRadius: '8px',
  maxWidth: '480px',
  margin: '0 auto',
  border: '1px solid #e6ebf1',
}

const gradientBar = {
  height: '4px',
  borderRadius: '8px 8px 0 0',
  background: 'linear-gradient(90deg, #f97316 0%, #ec4899 100%)',
}

const logoSection = {
  padding: '32px 40px 0 40px',
}

const contentSection = {
  padding: '24px 40px 32px 40px',
}

const heading = {
  fontSize: '24px',
  fontWeight: '600' as const,
  color: '#1a1a1a',
  margin: '0 0 16px 0',
  lineHeight: '1.3',
  textAlign: 'left' as const,
}

const paragraph = {
  fontSize: '15px',
  color: '#525f7f',
  margin: '0 0 24px 0',
  lineHeight: '1.6',
  textAlign: 'left' as const,
}

const buttonSection = {
  textAlign: 'center' as const,
  margin: '32px 0',
}

const button = {
  display: 'inline-block',
  backgroundColor: '#0f172a',
  color: '#ffffff',
  fontSize: '14px',
  fontWeight: '600' as const,
  textDecoration: 'none',
  padding: '12px 32px',
  borderRadius: '6px',
}

const smallText = {
  fontSize: '13px',
  color: '#8898aa',
  margin: '0',
  lineHeight: '1.5',
  textAlign: 'center' as const,
}

const dividerSection = {
  padding: '0 40px',
}

const divider = {
  height: '1px',
  backgroundColor: '#e6ebf1',
  width: '100%',
}

const footerSection = {
  padding: '24px 40px 32px 40px',
}

const footerText = {
  fontSize: '12px',
  color: '#8898aa',
  margin: '0 0 8px 0',
  lineHeight: '1.5',
  textAlign: 'center' as const,
}

const linkText = {
  fontSize: '12px',
  margin: '0 0 24px 0',
  textAlign: 'center' as const,
  wordBreak: 'break-all' as const,
}

const linkStyle = {
  color: '#f97316',
  textDecoration: 'none',
}

const footerBrand = {
  fontSize: '14px',
  fontWeight: '600' as const,
  color: '#1a1a1a',
  margin: '0 0 4px 0',
  textAlign: 'center' as const,
}

const copyright = {
  fontSize: '12px',
  color: '#8898aa',
  margin: '0',
  textAlign: 'center' as const,
}
