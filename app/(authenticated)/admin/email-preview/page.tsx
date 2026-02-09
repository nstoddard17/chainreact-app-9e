'use client'

import { useState, useEffect } from 'react'
import { render } from '@react-email/render'
import WelcomeEmail from '@/emails/welcome'
import PasswordResetEmail from '@/emails/password-reset'
import TeamInvitationEmail from '@/emails/team-invitation'
import BetaInvitationEmail from '@/emails/beta-invitation'
import WaitlistWelcomeEmail from '@/emails/waitlist-welcome'
import WaitlistInvitationEmail from '@/emails/waitlist-invitation'
import IntegrationDisconnectedEmail from '@/emails/integration-disconnected'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Mail, Smartphone, Monitor, Code, Eye, Copy, Check } from 'lucide-react'

type EmailTemplate = 'welcome' | 'password-reset' | 'team-invitation' | 'beta-invitation' | 'waitlist-welcome' | 'waitlist-invitation' | 'integration-disconnected'

const emailTemplates: { value: EmailTemplate; label: string }[] = [
  { value: 'welcome', label: 'Welcome / Signup Confirmation' },
  { value: 'password-reset', label: 'Password Reset' },
  { value: 'team-invitation', label: 'Team Invitation' },
  { value: 'beta-invitation', label: 'Beta Invitation' },
  { value: 'waitlist-welcome', label: 'Waitlist Welcome' },
  { value: 'waitlist-invitation', label: 'Waitlist Invitation' },
  { value: 'integration-disconnected', label: 'Integration Disconnected' },
]

export default function EmailPreviewPage() {
  const [selectedTemplate, setSelectedTemplate] = useState<EmailTemplate>('welcome')
  const [viewMode, setViewMode] = useState<'desktop' | 'mobile'>('desktop')
  const [copied, setCopied] = useState(false)
  const [htmlContent, setHtmlContent] = useState<string>('')

  // Sample data for each template
  const [formData, setFormData] = useState({
    username: 'John',
    email: 'john@example.com',
    confirmationUrl: 'https://chainreact.app/auth/confirm?token=abc123',
    resetUrl: 'https://chainreact.app/auth/reset?token=xyz789',
    inviterName: 'Sarah Smith',
    inviterEmail: 'sarah@company.com',
    teamName: 'Acme Corp',
    role: 'member',
    acceptUrl: 'https://chainreact.app/teams/accept?token=team123',
    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    signupUrl: 'https://chainreact.app/signup?beta=true',
    maxWorkflows: 50,
    maxExecutions: 5000,
    expiresInDays: 30,
    providerName: 'Gmail',
    reconnectUrl: 'https://chainreact.app/integrations/gmail/reconnect',
    disconnectReason: 'Token expired',
    consecutiveFailures: 3,
  })

  const getEmailComponent = () => {
    switch (selectedTemplate) {
      case 'welcome':
        return WelcomeEmail({
          username: formData.username,
          confirmationUrl: formData.confirmationUrl,
        })
      case 'password-reset':
        return PasswordResetEmail({
          username: formData.username,
          resetUrl: formData.resetUrl,
        })
      case 'team-invitation':
        return TeamInvitationEmail({
          inviteeName: formData.username,
          inviterName: formData.inviterName,
          inviterEmail: formData.inviterEmail,
          teamName: formData.teamName,
          role: formData.role,
          acceptUrl: formData.acceptUrl,
          expiresAt: formData.expiresAt,
        })
      case 'beta-invitation':
        return BetaInvitationEmail({
          email: formData.email,
          signupUrl: formData.signupUrl,
          maxWorkflows: formData.maxWorkflows,
          maxExecutions: formData.maxExecutions,
          expiresInDays: formData.expiresInDays,
        })
      case 'waitlist-welcome':
        return WaitlistWelcomeEmail({
          name: formData.username,
        })
      case 'waitlist-invitation':
        return WaitlistInvitationEmail({
          email: formData.email,
          name: formData.username,
          signupUrl: formData.signupUrl,
        })
      case 'integration-disconnected':
        return IntegrationDisconnectedEmail({
          userName: formData.username,
          providerName: formData.providerName,
          reconnectUrl: formData.reconnectUrl,
          disconnectReason: formData.disconnectReason,
          consecutiveFailures: formData.consecutiveFailures,
        })
      default:
        return WelcomeEmail({
          username: formData.username,
          confirmationUrl: formData.confirmationUrl,
        })
    }
  }

  // Generate HTML when template or data changes
  const generateHtml = async () => {
    try {
      const html = await render(getEmailComponent())
      setHtmlContent(html)
    } catch (error) {
      console.error('Error rendering email:', error)
    }
  }

  // Generate on mount and when dependencies change
  useEffect(() => {
    generateHtml()
  }, [selectedTemplate, formData])

  const copyHtml = async () => {
    await navigator.clipboard.writeText(htmlContent)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="container mx-auto py-8 px-4 max-w-7xl">
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2">Email Template Preview</h1>
        <p className="text-muted-foreground">
          Preview and test email templates before sending. Use this to verify how emails look across different devices.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Panel - Controls */}
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Mail className="h-5 w-5" />
              Template Settings
            </CardTitle>
            <CardDescription>
              Select a template and customize the preview data
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Template Selector */}
            <div className="space-y-2">
              <Label>Email Template</Label>
              <Select
                value={selectedTemplate}
                onValueChange={(value: EmailTemplate) => {
                  setSelectedTemplate(value)
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select a template" />
                </SelectTrigger>
                <SelectContent>
                  {emailTemplates.map((template) => (
                    <SelectItem key={template.value} value={template.value}>
                      {template.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Dynamic Form Fields */}
            <div className="space-y-4">
              <Label className="text-sm font-medium">Preview Data</Label>

              <div className="space-y-3">
                <div>
                  <Label htmlFor="username" className="text-xs text-muted-foreground">
                    Username
                  </Label>
                  <Input
                    id="username"
                    value={formData.username}
                    onChange={(e) => {
                      setFormData({ ...formData, username: e.target.value })
                    }}
                  />
                </div>

                <div>
                  <Label htmlFor="email" className="text-xs text-muted-foreground">
                    Email
                  </Label>
                  <Input
                    id="email"
                    value={formData.email}
                    onChange={(e) => {
                      setFormData({ ...formData, email: e.target.value })
                    }}
                  />
                </div>

                {selectedTemplate === 'team-invitation' && (
                  <>
                    <div>
                      <Label htmlFor="teamName" className="text-xs text-muted-foreground">
                        Team Name
                      </Label>
                      <Input
                        id="teamName"
                        value={formData.teamName}
                        onChange={(e) => {
                          setFormData({ ...formData, teamName: e.target.value })
                        }}
                      />
                    </div>
                    <div>
                      <Label htmlFor="inviterName" className="text-xs text-muted-foreground">
                        Inviter Name
                      </Label>
                      <Input
                        id="inviterName"
                        value={formData.inviterName}
                        onChange={(e) => {
                          setFormData({ ...formData, inviterName: e.target.value })
                        }}
                      />
                    </div>
                  </>
                )}

                {selectedTemplate === 'integration-disconnected' && (
                  <div>
                    <Label htmlFor="providerName" className="text-xs text-muted-foreground">
                      Provider Name
                    </Label>
                    <Input
                      id="providerName"
                      value={formData.providerName}
                      onChange={(e) => {
                        setFormData({ ...formData, providerName: e.target.value })
                      }}
                    />
                  </div>
                )}
              </div>
            </div>

            {/* View Mode Toggle */}
            <div className="space-y-2">
              <Label>View Mode</Label>
              <div className="flex gap-2">
                <Button
                  variant={viewMode === 'desktop' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setViewMode('desktop')}
                  className="flex-1"
                >
                  <Monitor className="h-4 w-4 mr-2" />
                  Desktop
                </Button>
                <Button
                  variant={viewMode === 'mobile' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setViewMode('mobile')}
                  className="flex-1"
                >
                  <Smartphone className="h-4 w-4 mr-2" />
                  Mobile
                </Button>
              </div>
            </div>

            {/* Actions */}
            <div className="pt-4 border-t space-y-3">
              <Button onClick={generateHtml} className="w-full">
                <Eye className="h-4 w-4 mr-2" />
                Refresh Preview
              </Button>
              <Button variant="outline" onClick={copyHtml} className="w-full">
                {copied ? (
                  <Check className="h-4 w-4 mr-2" />
                ) : (
                  <Copy className="h-4 w-4 mr-2" />
                )}
                {copied ? 'Copied!' : 'Copy HTML'}
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Right Panel - Preview */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Eye className="h-5 w-5" />
              Email Preview
            </CardTitle>
            <CardDescription>
              {viewMode === 'desktop' ? 'Desktop view (600px width)' : 'Mobile view (375px width)'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Tabs defaultValue="preview">
              <TabsList className="mb-4">
                <TabsTrigger value="preview">
                  <Eye className="h-4 w-4 mr-2" />
                  Preview
                </TabsTrigger>
                <TabsTrigger value="html">
                  <Code className="h-4 w-4 mr-2" />
                  HTML
                </TabsTrigger>
              </TabsList>

              <TabsContent value="preview">
                <div
                  className="border rounded-lg overflow-hidden bg-gray-100 dark:bg-gray-900"
                  style={{
                    display: 'flex',
                    justifyContent: 'center',
                    padding: '20px',
                    minHeight: '600px',
                  }}
                >
                  <div
                    style={{
                      width: viewMode === 'desktop' ? '600px' : '375px',
                      backgroundColor: '#f4f4f5',
                      boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
                      borderRadius: '8px',
                      overflow: 'hidden',
                    }}
                  >
                    <iframe
                      srcDoc={htmlContent}
                      style={{
                        width: '100%',
                        height: '800px',
                        border: 'none',
                        backgroundColor: '#ffffff',
                      }}
                      title="Email Preview"
                    />
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="html">
                <div className="relative">
                  <pre className="bg-gray-900 text-gray-100 p-4 rounded-lg overflow-auto max-h-[600px] text-sm">
                    <code>{htmlContent}</code>
                  </pre>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={copyHtml}
                    className="absolute top-2 right-2"
                  >
                    {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                  </Button>
                </div>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      </div>

      {/* Deliverability Tips */}
      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Email Deliverability Best Practices</CardTitle>
          <CardDescription>
            Follow these guidelines to prevent your emails from going to spam
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            <div className="space-y-2">
              <h3 className="font-semibold text-green-600 dark:text-green-400">Domain Authentication</h3>
              <ul className="text-sm text-muted-foreground space-y-1">
                <li>✓ Set up SPF record for chainreact.app</li>
                <li>✓ Configure DKIM signing via Resend</li>
                <li>✓ Add DMARC policy</li>
                <li>✓ Verify domain in Resend dashboard</li>
              </ul>
            </div>

            <div className="space-y-2">
              <h3 className="font-semibold text-blue-600 dark:text-blue-400">Content Best Practices</h3>
              <ul className="text-sm text-muted-foreground space-y-1">
                <li>✓ Include plain text version</li>
                <li>✓ Avoid spam trigger words (FREE!!!, ACT NOW)</li>
                <li>✓ Balance text-to-image ratio</li>
                <li>✓ Include physical address</li>
              </ul>
            </div>

            <div className="space-y-2">
              <h3 className="font-semibold text-purple-600 dark:text-purple-400">Technical Headers</h3>
              <ul className="text-sm text-muted-foreground space-y-1">
                <li>✓ List-Unsubscribe header (required by Gmail/Yahoo)</li>
                <li>✓ Reply-To address set</li>
                <li>✓ Consistent From address</li>
                <li>✓ No misleading subject lines</li>
              </ul>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
