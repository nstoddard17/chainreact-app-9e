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

interface TeamInvitationEmailProps {
  inviteeName: string
  inviterName: string
  inviterEmail: string
  teamName: string
  role: string
  acceptUrl: string
  expiresAt: string
}

export const TeamInvitationEmail = ({
  inviteeName,
  inviterName,
  inviterEmail,
  teamName,
  role,
  acceptUrl,
  expiresAt,
}: TeamInvitationEmailProps) => {
  const previewText = `${inviterName} invited you to join ${teamName} on ChainReact`

  const roleDescriptions: Record<string, string> = {
    member: 'You\'ll be able to view and work with team workflows.',
    manager: 'You\'ll be able to manage workflows and invite other members.',
    admin: 'You\'ll have full administrative access to the team.',
  }

  return (
    <Html>
      <Head />
      <Preview>{previewText}</Preview>
      <Body style={main}>
        <Container style={container}>
          <Section style={header}>
            <Heading style={h1}>Team Invitation</Heading>
          </Section>

          <Section style={content}>
            <Heading as="h2" style={h2}>
              You've been invited to join {teamName}
            </Heading>

            <Text style={paragraph}>Hi {inviteeName},</Text>

            <Text style={paragraph}>
              <strong>{inviterName}</strong> ({inviterEmail}) has invited you to join their team <strong>{teamName}</strong> on ChainReact.
            </Text>

            <Text style={importantNote}>
              <strong>Note:</strong> To accept this invitation and join the team, you'll need to have at least a Pro plan subscription. You can view the invitation now, but you'll be prompted to upgrade if needed when you try to accept.
            </Text>

            <Section style={roleBox}>
              <Text style={roleTitle}>Your Role: <span style={roleBadge}>{role.charAt(0).toUpperCase() + role.slice(1)}</span></Text>
              <Text style={roleDescription}>
                {roleDescriptions[role] || 'You\'ll be able to collaborate with the team.'}
              </Text>
            </Section>

            <Text style={paragraph}>
              ChainReact is a powerful workflow automation platform that helps teams automate their processes and collaborate efficiently. Join {teamName} to start building workflows together.
            </Text>

            <Section style={buttonContainer}>
              <Button style={button} href={acceptUrl}>
                Accept Invitation
              </Button>
            </Section>

            <Text style={expiryText}>
              This invitation expires on <strong>{new Date(expiresAt).toLocaleDateString('en-US', {
                month: 'long',
                day: 'numeric',
                year: 'numeric'
              })}</strong>
            </Text>

            <Hr style={hr} />

            <Text style={helpText}>
              <strong>What happens next?</strong>
            </Text>
            <Text style={paragraph}>
              1. Click the "Accept Invitation" button above<br />
              2. You'll be redirected to ChainReact<br />
              3. Once accepted, you'll have immediate access to {teamName}
            </Text>

            <Text style={paragraph}>
              If you have any questions, you can reply to this email or contact {inviterName} directly.
            </Text>
          </Section>

          <Hr style={hr} />

          <Section style={footer}>
            <Text style={footerText}>
              This invitation was sent by {inviterEmail} via ChainReact
            </Text>
            <Text style={footerText}>
              If you didn't expect this invitation, you can safely ignore this email.
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
  background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
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

const roleBox = {
  backgroundColor: '#f0f7ff',
  borderLeft: '4px solid #7c3aed',
  borderRadius: '6px',
  padding: '20px',
  margin: '24px 0',
}

const roleTitle = {
  color: '#333',
  fontSize: '16px',
  fontWeight: 'bold',
  margin: '0 0 8px',
}

const roleBadge = {
  backgroundColor: '#7c3aed',
  color: '#ffffff',
  padding: '4px 12px',
  borderRadius: '4px',
  fontSize: '14px',
  fontWeight: 'bold',
  marginLeft: '8px',
}

const roleDescription = {
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
  backgroundColor: '#7c3aed',
  borderRadius: '8px',
  color: '#fff',
  fontSize: '16px',
  fontWeight: 'bold',
  textDecoration: 'none',
  textAlign: 'center' as const,
  display: 'inline-block',
  padding: '14px 40px',
  margin: '0 auto',
  boxShadow: '0 4px 14px 0 rgba(124, 58, 237, 0.3)',
}

const expiryText = {
  color: '#dc2626',
  fontSize: '14px',
  textAlign: 'center' as const,
  margin: '20px 0',
}

const helpText = {
  color: '#333',
  fontSize: '16px',
  fontWeight: 'bold',
  margin: '24px 0 12px',
}

const importantNote = {
  color: '#525252',
  fontSize: '14px',
  lineHeight: '22px',
  margin: '16px 0',
  padding: '12px 16px',
  backgroundColor: '#fef3c7',
  borderLeft: '4px solid #f59e0b',
  borderRadius: '4px',
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

export default TeamInvitationEmail
