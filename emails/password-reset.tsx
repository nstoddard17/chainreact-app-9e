import {
  Body,
  Button,
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

interface PasswordResetEmailProps {
  username?: string
  resetUrl: string
}

export const PasswordResetEmail = ({
  username = 'there',
  resetUrl,
}: PasswordResetEmailProps) => (
  <Html>
    <Head />
    <Preview>Reset your ChainReact password</Preview>
    <Body style={main}>
      <Container style={container}>
        <Section style={header}>
          <Heading style={h1}>ChainReact</Heading>
        </Section>
        
        <Section style={content}>
          <Heading style={h2}>Reset Your Password</Heading>
          
          <Text style={text}>Hi {username},</Text>
          
          <Text style={text}>
            We received a request to reset your password for your ChainReact account. 
            If you didn't make this request, you can safely ignore this email.
          </Text>
          
          <Text style={text}>
            To reset your password, click the button below:
          </Text>
          
          <Section style={buttonContainer}>
            <Button style={button} href={resetUrl}>
              Reset Password
            </Button>
          </Section>
          
          <Text style={text}>
            This link will expire in 24 hours for your security.
          </Text>
          
          <Text style={text}>
            If you continue to have problems, please contact our support team.
          </Text>
          
          <Text style={signature}><strong>The ChainReact Team</strong></Text>
        </Section>
        
        <Hr style={hr} />
        
        <Section style={footer}>
          <Text style={footerText}>
            If the button doesn't work, copy and paste this link into your browser:
          </Text>
          <Link href={resetUrl} style={link}>
            {resetUrl}
          </Link>
          
          <Text style={footerText}>
            Questions? Contact us at{' '}
            <Link href="mailto:support@chainreact.app" style={link}>
              support@chainreact.app
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

export default PasswordResetEmail

// Styles (reusing from welcome email)
const main = {
  backgroundColor: '#f8fafc',
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

const signature = {
  color: '#64748b',
  fontSize: '16px',
  lineHeight: '1.6',
  margin: '20px 0 0 0',
}

const buttonContainer = {
  textAlign: 'center' as const,
  margin: '20px 0',
}

const button = {
  backgroundColor: '#3b82f6',
  borderRadius: '8px',
  color: '#ffffff',
  fontSize: '16px',
  fontWeight: '600',
  textDecoration: 'none',
  textAlign: 'center' as const,
  display: 'inline-block',
  padding: '14px 28px',
  background: 'linear-gradient(135deg, #3b82f6 0%, #8b5cf6 100%)',
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