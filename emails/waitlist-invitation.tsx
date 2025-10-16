import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Preview,
  Section,
  Text,
} from '@react-email/components'
import * as React from 'react'

interface WaitlistInvitationEmailProps {
  email: string
  name: string
  signupUrl: string
}

export const WaitlistInvitationEmail = ({
  email,
  name,
  signupUrl,
}: WaitlistInvitationEmailProps) => {
  const previewText = `Your ChainReact access is ready! Join now from the waitlist.`

  return (
    <Html>
      <Head />
      <Preview>{previewText}</Preview>
      <Body style={main}>
        <Container style={container}>
          <Section style={header}>
            <Heading style={h1}>🎉 Your ChainReact Access is Ready!</Heading>
          </Section>

          <Section style={content}>
            <Heading as="h2" style={h2}>
              Welcome, {name}!
            </Heading>

            <Text style={paragraph}>
              We're thrilled to let you know that your spot is ready! You've been selected from
              the waitlist to get early access to ChainReact.
            </Text>

            <Text style={paragraph}>
              As an early adopter, you'll experience the full power of workflow automation
              and help shape the future of ChainReact.
            </Text>

            <Section style={featuresBox}>
              <Heading as="h3" style={h3}>✨ What's Included:</Heading>
              <Text style={feature}>🔌 Connect your favorite apps and automate workflows</Text>
              <Text style={feature}>🤖 AI-powered workflow assistant to help you build faster</Text>
              <Text style={feature}>⚡ AI actions for intelligent workflow automation</Text>
              <Text style={feature}>💬 Priority support from our team</Text>
              <Text style={feature}>🎯 Your feedback helps us improve</Text>
            </Section>

            <Text style={urgent}>
              <strong>Click below to create your account and get started!</strong>
            </Text>

            <Section style={buttonContainer}>
              <Button style={button} href={signupUrl}>
                Create Your Account
              </Button>
            </Section>

            <Text style={paragraph}>
              Your email is already pre-registered, so you'll get instant access.
              Just click the button above to set up your account.
            </Text>

            <Text style={paragraph}>
              We can't wait to see what you'll build with ChainReact!
            </Text>

            <Text style={paragraph}>
              Best regards,<br />
              The ChainReact Team
            </Text>
          </Section>

          <Hr style={hr} />

          <Section style={footer}>
            <Text style={footerText}>
              This invitation was sent to {email}
            </Text>
            <Text style={footerText}>
              If you have any questions, reply to this email and we'll help you get started.
            </Text>
            <Text style={footerText}>
              © {new Date().getFullYear()} ChainReact. All rights reserved.
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  )
}

const main = {
  backgroundColor: '#f6f9fc',
  fontFamily:
    '-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Helvetica Neue",Ubuntu,sans-serif',
}

const container = {
  backgroundColor: '#ffffff',
  margin: '0 auto',
  padding: '20px 0 48px',
  marginBottom: '64px',
  borderRadius: '8px',
  overflow: 'hidden',
  maxWidth: '800px',
  width: '100%',
}

const header = {
  background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
  padding: '30px',
  textAlign: 'center' as const,
}

const h1 = {
  color: '#ffffff',
  fontSize: '32px',
  fontWeight: 'bold',
  margin: '0',
  letterSpacing: '-0.5px',
}

const content = {
  padding: '0 60px',
}

const h2 = {
  color: '#333',
  fontSize: '28px',
  fontWeight: 'bold',
  margin: '30px 0 20px',
  textAlign: 'center' as const,
}

const h3 = {
  color: '#333',
  fontSize: '20px',
  fontWeight: 'bold',
  margin: '0 0 20px',
}

const paragraph = {
  color: '#525252',
  fontSize: '16px',
  lineHeight: '26px',
  margin: '20px 0',
}

const featuresBox = {
  backgroundColor: '#f9fafb',
  borderRadius: '8px',
  padding: '30px',
  margin: '30px 0',
}

const feature = {
  color: '#525252',
  fontSize: '15px',
  lineHeight: '24px',
  margin: '12px 0',
  paddingLeft: '15px',
}

const urgent = {
  color: '#7c3aed',
  fontSize: '16px',
  fontWeight: 'bold',
  textAlign: 'center' as const,
  margin: '20px 0',
}

const buttonContainer = {
  textAlign: 'center' as const,
  margin: '30px 0',
}

const button = {
  backgroundColor: '#7c3aed',
  borderRadius: '8px',
  color: '#fff',
  fontSize: '18px',
  fontWeight: 'bold',
  textDecoration: 'none',
  textAlign: 'center' as const,
  display: 'inline-block',
  padding: '16px 48px',
  margin: '0 auto',
  boxShadow: '0 4px 14px 0 rgba(124, 58, 237, 0.3)',
}

const hr = {
  borderColor: '#e6ebf1',
  margin: '20px 0',
}

const footer = {
  padding: '0 60px',
}

const footerText = {
  color: '#8898aa',
  fontSize: '13px',
  lineHeight: '18px',
  textAlign: 'center' as const,
  margin: '10px 0',
}

export default WaitlistInvitationEmail
