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
  Hr,
} from '@react-email/components'

interface WelcomeEmailProps {
  username?: string
  confirmationUrl: string
}

export const WelcomeEmail = ({
  username = 'there',
  confirmationUrl = 'https://chainreact.app/auth/email-confirmed?token=preview-token-123&userId=preview-user-id',
}: WelcomeEmailProps) => (
  <Html>
    <Head />
    <Preview>Confirm your ChainReact account</Preview>
    <Body style={main}>
      <Container style={container}>
        {/* Gradient top bar */}
        <div style={gradientBar} />

        {/* Logo */}
        <Section style={logoSection}>
          <img
            src="https://chainreact.app/logo_transparent.png"
            alt="ChainReact"
            width="48"
            height="48"
            style={logo}
          />
        </Section>

        {/* Content */}
        <Section style={content}>
          <Heading style={heading}>Welcome, {username}</Heading>

          <Text style={paragraph}>
            Thanks for signing up for ChainReact. To get started building
            workflows that think for themselves, please confirm your email
            address.
          </Text>

          {/* Button */}
          <Section style={buttonContainer}>
            <Link href={confirmationUrl} style={button}>
              Confirm email address
            </Link>
          </Section>

          <Text style={disclaimer}>
            This link will expire in 24 hours. If you didn't create an account,
            you can safely ignore this email.
          </Text>
        </Section>

        <Hr style={hr} />

        {/* Footer */}
        <Section style={footer}>
          <Text style={footerText}>
            If the button above doesn't work, paste this link into your browser:
          </Text>
          <Link href={confirmationUrl} style={link}>
            {confirmationUrl}
          </Link>

          <Text style={brand}>
            <span style={brandChain}>Chain</span>
            <span style={brandReact}>React</span>
          </Text>
          <Text style={tagline}>
            Workflow automation that thinks for itself
          </Text>
        </Section>
      </Container>
    </Body>
  </Html>
)

export default WelcomeEmail

// Styles
const main = {
  backgroundColor: '#f4f4f5',
  fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
  padding: '40px 0',
}

const container = {
  backgroundColor: '#ffffff',
  borderRadius: '8px',
  margin: '0 auto',
  maxWidth: '465px',
  boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.1)',
}

const gradientBar = {
  height: '4px',
  borderRadius: '8px 8px 0 0',
  background: 'linear-gradient(90deg, #3b82f6 0%, #8b5cf6 50%, #ec4899 100%)',
}

const logoSection = {
  padding: '32px 0 0 0',
  textAlign: 'center' as const,
}

const logo = {
  display: 'block',
  margin: '0 auto',
}

const content = {
  padding: '24px 40px 32px 40px',
}

const heading = {
  color: '#18181b',
  fontSize: '24px',
  fontWeight: '600',
  lineHeight: '1.3',
  margin: '0 0 20px 0',
}

const paragraph = {
  color: '#52525b',
  fontSize: '15px',
  lineHeight: '1.6',
  margin: '0 0 24px 0',
}

const buttonContainer = {
  textAlign: 'center' as const,
  margin: '32px 0',
}

const button = {
  backgroundColor: '#18181b',
  borderRadius: '6px',
  color: '#ffffff',
  display: 'inline-block',
  fontSize: '14px',
  fontWeight: '600',
  padding: '12px 32px',
  textDecoration: 'none',
}

const disclaimer = {
  color: '#71717a',
  fontSize: '13px',
  lineHeight: '1.5',
  margin: '0',
  textAlign: 'center' as const,
}

const hr = {
  borderColor: '#e4e4e7',
  borderTop: '1px solid #e4e4e7',
  margin: '0 40px',
}

const footer = {
  padding: '24px 40px 32px 40px',
}

const footerText = {
  color: '#71717a',
  fontSize: '12px',
  lineHeight: '1.5',
  margin: '0 0 8px 0',
}

const link = {
  color: '#3b82f6',
  fontSize: '12px',
  lineHeight: '1.5',
  textDecoration: 'none',
  wordBreak: 'break-all' as const,
}

const brand = {
  fontSize: '16px',
  fontWeight: '600',
  margin: '24px 0 4px 0',
  textAlign: 'center' as const,
}

const brandChain = {
  color: '#18181b',
}

const brandReact = {
  color: '#3b82f6',
}

const tagline = {
  color: '#71717a',
  fontSize: '12px',
  margin: '0',
  textAlign: 'center' as const,
}
