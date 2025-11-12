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

interface IntegrationDisconnectedEmailProps {
  userName: string
  providerName: string
  reconnectUrl: string
  disconnectReason?: string
  consecutiveFailures?: number
}

export const IntegrationDisconnectedEmail = ({
  userName,
  providerName,
  reconnectUrl,
  disconnectReason,
  consecutiveFailures = 3,
}: IntegrationDisconnectedEmailProps) => {
  const previewText = `Action Required: ${providerName} integration disconnected`

  return (
    <Html>
      <Head />
      <Preview>{previewText}</Preview>
      <Body style={main}>
        <Container style={container}>
          <Section style={header}>
            <Heading style={h1}>🔴 Integration Disconnected</Heading>
          </Section>

          <Section style={content}>
            <Heading as="h2" style={h2}>
              {providerName} Connection Lost
            </Heading>

            <Text style={paragraph}>Hi {userName},</Text>

            <Text style={paragraph}>
              Your <strong>{providerName}</strong> integration has been disconnected and your workflows using this integration are now paused.
            </Text>

            <Section style={alertBox}>
              <Text style={alertTitle}>⚠️ What Happened?</Text>
              <Text style={alertDescription}>
                {disconnectReason || `We were unable to refresh your ${providerName} access token after ${consecutiveFailures} attempts. This typically happens when:`}
              </Text>
              <Text style={listItem}>• Your password was changed on {providerName}</Text>
              <Text style={listItem}>• Access was revoked in {providerName} settings</Text>
              <Text style={listItem}>• The app authorization expired or was removed</Text>
            </Section>

            <Section style={impactBox}>
              <Text style={impactTitle}>📊 Impact</Text>
              <Text style={impactDescription}>
                All workflows using {providerName} have been automatically paused to prevent errors. They will resume once you reconnect.
              </Text>
            </Section>

            <Section style={buttonContainer}>
              <Button style={button} href={reconnectUrl}>
                Reconnect {providerName} Now
              </Button>
            </Section>

            <Text style={urgentText}>
              This requires immediate action to resume your automated workflows.
            </Text>

            <Hr style={hr} />

            <Text style={helpText}>
              <strong>How to fix this:</strong>
            </Text>
            <Text style={paragraph}>
              1. Click the "Reconnect {providerName} Now" button above<br />
              2. Sign in to your {providerName} account<br />
              3. Authorize ChainReact to access your account<br />
              4. Your workflows will automatically resume
            </Text>

            <Text style={paragraph}>
              If you continue experiencing issues, please check your {providerName} account settings or contact our support team.
            </Text>
          </Section>

          <Hr style={hr} />

          <Section style={footer}>
            <Text style={footerText}>
              This is an automated notification from ChainReact
            </Text>
            <Text style={footerText}>
              If you no longer use this integration, you can safely ignore this email.
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
  maxWidth: '600px',
  width: '100%',
}

const header = {
  background: 'linear-gradient(135deg, #dc2626 0%, #991b1b 100%)',
  padding: '30px',
  textAlign: 'center' as const,
}

const h1 = {
  color: '#ffffff',
  fontSize: '28px',
  fontWeight: 'bold',
  margin: '0',
  letterSpacing: '-0.5px',
}

const content = {
  padding: '0 40px',
}

const h2 = {
  color: '#333',
  fontSize: '24px',
  fontWeight: 'bold',
  margin: '30px 0 20px',
  textAlign: 'center' as const,
}

const paragraph = {
  color: '#525252',
  fontSize: '16px',
  lineHeight: '26px',
  margin: '16px 0',
}

const alertBox = {
  backgroundColor: '#fef2f2',
  borderLeft: '4px solid #dc2626',
  borderRadius: '6px',
  padding: '20px',
  margin: '24px 0',
}

const alertTitle = {
  color: '#991b1b',
  fontSize: '16px',
  fontWeight: 'bold',
  margin: '0 0 12px',
}

const alertDescription = {
  color: '#525252',
  fontSize: '14px',
  lineHeight: '22px',
  margin: '0 0 12px',
}

const listItem = {
  color: '#525252',
  fontSize: '14px',
  lineHeight: '24px',
  margin: '4px 0 4px 16px',
}

const impactBox = {
  backgroundColor: '#fef3c7',
  borderLeft: '4px solid #f59e0b',
  borderRadius: '6px',
  padding: '20px',
  margin: '24px 0',
}

const impactTitle = {
  color: '#92400e',
  fontSize: '16px',
  fontWeight: 'bold',
  margin: '0 0 8px',
}

const impactDescription = {
  color: '#525252',
  fontSize: '14px',
  lineHeight: '22px',
  margin: '8px 0 0',
}

const buttonContainer = {
  textAlign: 'center' as const,
  margin: '32px 0',
}

const button = {
  backgroundColor: '#dc2626',
  borderRadius: '8px',
  color: '#fff',
  fontSize: '16px',
  fontWeight: 'bold',
  textDecoration: 'none',
  textAlign: 'center' as const,
  display: 'inline-block',
  padding: '14px 40px',
  margin: '0 auto',
  boxShadow: '0 4px 14px 0 rgba(220, 38, 38, 0.3)',
}

const urgentText = {
  color: '#dc2626',
  fontSize: '14px',
  fontWeight: 'bold',
  textAlign: 'center' as const,
  margin: '20px 0',
}

const helpText = {
  color: '#333',
  fontSize: '16px',
  fontWeight: 'bold',
  margin: '24px 0 12px',
}

const hr = {
  borderColor: '#e6ebf1',
  margin: '32px 0',
}

const footer = {
  padding: '0 40px',
}

const footerText = {
  color: '#8898aa',
  fontSize: '13px',
  lineHeight: '20px',
  textAlign: 'center' as const,
  margin: '8px 0',
}

export default IntegrationDisconnectedEmail
