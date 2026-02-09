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

interface WaitlistWelcomeEmailProps {
  name: string
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

export const WaitlistWelcomeEmail = ({
  name,
}: WaitlistWelcomeEmailProps) => (
  <Html>
    <Head>
      <meta name="color-scheme" content="light" />
      <meta name="supported-color-schemes" content="light" />
    </Head>
    <Preview>Welcome to the ChainReact waitlist</Preview>
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
            You're on the list
          </Heading>

          <Text style={paragraph}>
            Hi {name}, thanks for joining the ChainReact waitlist. We're building workflow automation that thinks for itself, and you'll be among the first to try it.
          </Text>

          <Text style={paragraphSpaced}>
            We'll reach out as soon as your spot is ready. In the meantime, keep an eye on your inbox for updates and early access opportunities.
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
          <table cellPadding="0" cellSpacing="0" width="100%">
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

export default WaitlistWelcomeEmail

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

const paragraphSpaced = {
  fontSize: '15px',
  color: colors.gray,
  margin: '16px 0 0 0',
  lineHeight: '1.6',
}

const footerSection = {
  padding: '32px 48px 40px 48px',
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
