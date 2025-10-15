import {
  Body,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Link,
  Preview,
  Section,
  Text,
} from '@react-email/components'

interface WaitlistWelcomeEmailProps {
  name: string
}

export const WaitlistWelcomeEmail = ({
  name,
}: WaitlistWelcomeEmailProps) => (
  <Html>
    <Head />
    <Preview>Welcome to the ChainReact Waitlist - You're on the list!</Preview>
    <Body style={main}>
      <Container style={container}>
        <Section style={header}>
          <Heading style={h1}>ChainReact</Heading>
        </Section>

        <Section style={content}>
          <Heading style={h2}>You're on the waitlist! 🎉</Heading>

          <Text style={text}>Hi {name},</Text>

          <Text style={text}>
            Thank you for joining the ChainReact early access waitlist! We're thrilled to have you
            as part of our community and can't wait to show you what we're building.
          </Text>

          <Text style={text}>
            <strong>What happens next?</strong>
          </Text>

          <ul style={list}>
            <li style={listItem}>We'll review your preferences and integration needs</li>
            <li style={listItem}>You'll receive priority access when we launch</li>
            <li style={listItem}>We'll send you exclusive updates and behind-the-scenes insights</li>
            <li style={listItem}>You'll get special early adopter benefits and discounts</li>
          </ul>

          <Text style={text}>
            We're working hard to create the most powerful and intuitive workflow automation
            platform. Your interest and feedback will help shape the future of ChainReact.
          </Text>

          <Text style={highlightText}>
            Want to move up the waitlist? Share ChainReact with colleagues who might benefit
            from workflow automation!
          </Text>

          <Text style={text}>
            In the meantime, if you have any questions or specific use cases you'd like to
            discuss, feel free to reach out. We love hearing from our early supporters.
          </Text>

          <Text style={text}>See you soon!</Text>
          <Text style={signature}><strong>The ChainReact Team</strong></Text>
        </Section>

        <Hr style={hr} />

        <Section style={footer}>
          <Text style={footerText}>
            Questions? Contact us at{' '}
            <Link href="mailto:support@chainreact.app" style={link}>
              support@chainreact.app
            </Link>
          </Text>

          <Text style={footerText}>
            Follow our journey:{' '}
            <Link href="https://twitter.com/chainreact" style={link}>
              Twitter
            </Link>{' '}
            |{' '}
            <Link href="https://linkedin.com/company/chainreact" style={link}>
              LinkedIn
            </Link>
          </Text>

          <Text style={copyright}>
            © 2024 ChainReact. All rights reserved.
          </Text>
        </Section>
      </Container>
    </Body>
  </Html>
)

export default WaitlistWelcomeEmail

// Styles
const main = {
  backgroundColor: '#0f172a',
  fontFamily: '-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif',
}

const container = {
  margin: '40px auto',
  width: '600px',
  backgroundColor: '#ffffff',
  borderRadius: '12px',
  boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
  overflow: 'hidden',
}

const header = {
  background: 'linear-gradient(135deg, #3b82f6 0%, #8b5cf6 100%)',
  padding: '40px 30px',
  textAlign: 'center' as const,
}

const h1 = {
  color: '#ffffff',
  fontSize: '28px',
  fontWeight: '700',
  margin: '0',
}

const content = {
  padding: '40px 30px',
}

const h2 = {
  color: '#1e293b',
  fontSize: '24px',
  margin: '0 0 20px 0',
}

const text = {
  color: '#64748b',
  fontSize: '16px',
  lineHeight: '1.6',
  margin: '0 0 20px 0',
}

const highlightText = {
  color: '#3b82f6',
  fontSize: '16px',
  lineHeight: '1.6',
  margin: '0 0 20px 0',
  padding: '16px',
  backgroundColor: '#eff6ff',
  borderRadius: '8px',
  borderLeft: '4px solid #3b82f6',
}

const signature = {
  color: '#64748b',
  fontSize: '16px',
  lineHeight: '1.6',
  margin: '20px 0 0 0',
}

const list = {
  color: '#64748b',
  fontSize: '16px',
  lineHeight: '1.6',
  margin: '0 0 20px 0',
  paddingLeft: '20px',
}

const listItem = {
  margin: '8px 0',
}

const hr = {
  borderColor: '#e2e8f0',
  margin: '0',
}

const footer = {
  backgroundColor: '#f8fafc',
  padding: '30px',
  textAlign: 'center' as const,
}

const footerText = {
  color: '#64748b',
  fontSize: '14px',
  margin: '0 0 10px 0',
}

const link = {
  color: '#3b82f6',
  textDecoration: 'underline',
}

const copyright = {
  color: '#64748b',
  fontSize: '12px',
  margin: '20px 0 0 0',
}
