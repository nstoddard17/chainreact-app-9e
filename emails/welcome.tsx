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
    <Head />
    <Preview>Confirm your ChainReact account</Preview>
    <Body style={{
      backgroundColor: '#f4f4f5',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
      margin: '0',
      padding: '40px 20px',
    }}>
      <Container style={{
        backgroundColor: '#ffffff',
        borderRadius: '8px',
        maxWidth: '480px',
        margin: '0 auto',
        padding: '0',
        border: '1px solid #e4e4e7',
      }}>
        {/* Orange accent bar */}
        <Section style={{
          backgroundColor: '#f97316',
          height: '4px',
          borderRadius: '8px 8px 0 0',
        }} />

        {/* Logo */}
        <Section style={{ padding: '32px 40px 0 40px', textAlign: 'center' as const }}>
          <img
            src="https://chainreact.app/logo_transparent.png"
            alt="ChainReact"
            width="40"
            height="40"
            style={{ display: 'inline-block' }}
          />
        </Section>

        {/* Content */}
        <Section style={{ padding: '24px 40px 32px 40px' }}>
          <Heading style={{
            fontSize: '22px',
            fontWeight: '600',
            color: '#18181b',
            margin: '0 0 16px 0',
            lineHeight: '1.4',
            textAlign: 'left' as const,
          }}>
            Welcome, {username}
          </Heading>

          <Text style={{
            fontSize: '15px',
            color: '#52525b',
            margin: '0 0 28px 0',
            lineHeight: '1.6',
            textAlign: 'left' as const,
          }}>
            Thanks for signing up for ChainReact. Click the button below to confirm your email address.
          </Text>

          {/* Button */}
          <Section style={{ textAlign: 'center' as const }}>
            <Link
              href={confirmationUrl}
              style={{
                display: 'inline-block',
                backgroundColor: '#18181b',
                color: '#ffffff',
                fontSize: '14px',
                fontWeight: '600',
                textDecoration: 'none',
                padding: '12px 32px',
                borderRadius: '6px',
              }}
            >
              Confirm email address
            </Link>
          </Section>

          <Text style={{
            fontSize: '13px',
            color: '#a1a1aa',
            margin: '28px 0 0 0',
            lineHeight: '1.5',
            textAlign: 'center' as const,
          }}>
            This link expires in 24 hours.
          </Text>
        </Section>

        {/* Footer */}
        <Section style={{
          padding: '24px 40px',
          borderTop: '1px solid #e4e4e7',
        }}>
          <Text style={{
            fontSize: '13px',
            fontWeight: '600',
            color: '#18181b',
            margin: '0 0 4px 0',
            textAlign: 'center' as const,
          }}>
            ChainReact
          </Text>
          <Text style={{
            fontSize: '12px',
            color: '#a1a1aa',
            margin: '0',
            textAlign: 'center' as const,
          }}>
            Workflow automation that thinks for itself
          </Text>
        </Section>
      </Container>
    </Body>
  </Html>
)

export default WelcomeEmail
