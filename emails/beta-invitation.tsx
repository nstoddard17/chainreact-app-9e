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
import * as React from 'react'

interface BetaInvitationEmailProps {
  email: string
  signupUrl: string
  maxWorkflows?: number
  maxExecutions?: number
  expiresInDays?: number
}

export const BetaInvitationEmail = ({
  email,
  signupUrl,
  maxWorkflows = 50,
  maxExecutions = 5000,
  expiresInDays = 30,
}: BetaInvitationEmailProps) => {
  const previewText = `You're invited to join ChainReact Beta - Exclusive early access awaits!`

  return (
    <Html>
      <Head />
      <Preview>{previewText}</Preview>
      <Body style={main}>
        <Container style={container}>
          <Section style={header}>
            <Heading style={h1}>🚀 Welcome to ChainReact Beta!</Heading>
          </Section>

          <Section style={content}>
            <Heading as="h2" style={h2}>
              You're Invited to Join Our Beta Program!
            </Heading>

            <Text style={paragraph}>Hi there,</Text>

            <Text style={paragraph}>
              We're excited to invite you to be one of our exclusive beta testers for ChainReact -
              the workflow automation platform that's changing how people work.
            </Text>

            <Section style={featuresBox}>
              <Heading as="h3" style={h3}>🎁 Your Exclusive Beta Benefits:</Heading>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '15px' }}>
                <Text style={feature}>✨ <strong>Free Pro Access</strong> - All premium features at no cost during beta</Text>
                <Text style={feature}>🔧 <strong>{maxWorkflows} Workflows</strong> - Create unlimited complex automations</Text>
                <Text style={feature}>⚡ <strong>{maxExecutions.toLocaleString()} Monthly Executions</strong> - Run workflows without limits</Text>
                <Text style={feature}>🔌 <strong>30+ Integrations</strong> - Connect Gmail, Slack, Notion, and more</Text>
                <Text style={feature}>💬 <strong>Priority Support</strong> - Direct access to our development team</Text>
                <Text style={feature}>🎯 <strong>Shape the Product</strong> - Your feedback drives our roadmap</Text>
              </div>
            </Section>

            <Text style={urgent}>
              <strong>This exclusive offer expires in {expiresInDays} days!</strong>
            </Text>

            <Section style={buttonContainer}>
              <Button style={button} href={signupUrl}>
                Claim Your Beta Access
              </Button>
            </Section>

            <Text style={paragraph}>
              Simply click the button above to create your account. Your email is already pre-registered,
              so you'll get instant access to all beta features.
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
  display: 'flex',
  alignItems: 'center',
}

const urgent = {
  color: '#dc2626',
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

export default BetaInvitationEmail