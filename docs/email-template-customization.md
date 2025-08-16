# Email Template Customization Guide

This guide explains how to customize the email templates that Supabase sends for authentication events like email confirmation, password reset, and magic link authentication.

## Overview

Supabase provides default email templates for:
- **Email Confirmation**: Sent when users sign up with email/password
- **Password Reset**: Sent when users request a password reset
- **Magic Link**: Sent when users use passwordless authentication
- **Email Change**: Sent when users change their email address

## Customizing Email Templates

### 1. Access Supabase Dashboard

1. Go to [Supabase Dashboard](https://supabase.com/dashboard)
2. Select your project
3. Navigate to **Authentication** → **Settings** → **Email Templates**

### 2. Available Templates

#### Email Confirmation Template
- **Subject**: Confirm your signup
- **Default Redirect**: `{{ .SiteURL }}/auth/confirm`
- **Custom Variables**: 
  - `{{ .Email }}` - User's email address
  - `{{ .Token }}` - Confirmation token
  - `{{ .TokenHash }}` - Hashed token for security
  - `{{ .SiteURL }}` - Your site URL from auth settings

#### Password Reset Template
- **Subject**: Reset your password
- **Default Redirect**: `{{ .SiteURL }}/auth/reset-password`

#### Magic Link Template
- **Subject**: Your magic link
- **Default Redirect**: `{{ .SiteURL }}/auth/confirm`

### 3. Professional Email Template Example

Here's a professional email confirmation template for ChainReact:

```html
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Welcome to ChainReact</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      line-height: 1.6;
      color: #333;
      margin: 0;
      padding: 0;
      background-color: #f8fafc;
    }
    .container {
      max-width: 600px;
      margin: 40px auto;
      background: white;
      border-radius: 12px;
      box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
      overflow: hidden;
    }
    .header {
      background: linear-gradient(135deg, #3b82f6 0%, #8b5cf6 100%);
      color: white;
      padding: 40px 30px;
      text-align: center;
    }
    .header h1 {
      margin: 0;
      font-size: 28px;
      font-weight: 700;
    }
    .content {
      padding: 40px 30px;
    }
    .content h2 {
      color: #1e293b;
      font-size: 24px;
      margin: 0 0 20px 0;
    }
    .content p {
      color: #64748b;
      margin: 0 0 20px 0;
    }
    .button {
      display: inline-block;
      background: linear-gradient(135deg, #3b82f6 0%, #8b5cf6 100%);
      color: white;
      text-decoration: none;
      padding: 14px 28px;
      border-radius: 8px;
      font-weight: 600;
      margin: 20px 0;
      transition: transform 0.2s;
    }
    .button:hover {
      transform: translateY(-1px);
    }
    .footer {
      background: #f8fafc;
      padding: 30px;
      text-align: center;
      font-size: 14px;
      color: #64748b;
    }
    .footer a {
      color: #3b82f6;
      text-decoration: none;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>ChainReact</h1>
    </div>
    
    <div class="content">
      <h2>Welcome to ChainReact!</h2>
      
      <p>Hi there,</p>
      
      <p>Thank you for signing up with ChainReact! We're excited to help you automate your workflows and boost your productivity.</p>
      
      <p>To get started, please confirm your email address by clicking the button below:</p>
      
      <div style="text-align: center;">
        <a href="{{ .ConfirmationURL }}" class="button">Confirm Email Address</a>
      </div>
      
      <p>Once confirmed, you'll be able to:</p>
      <ul>
        <li>Create powerful workflow automations</li>
        <li>Connect with 20+ popular integrations</li>
        <li>Collaborate with your team</li>
        <li>Monitor your automation performance</li>
      </ul>
      
      <p>If you didn't create an account with ChainReact, you can safely ignore this email.</p>
      
      <p>Welcome aboard!</p>
      <p><strong>The ChainReact Team</strong></p>
    </div>
    
    <div class="footer">
      <p>If the button doesn't work, copy and paste this link into your browser:</p>
      <p><a href="{{ .ConfirmationURL }}">{{ .ConfirmationURL }}</a></p>
      
      <p>Questions? Contact us at <a href="mailto:support@chainreact.app">support@chainreact.app</a></p>
      
      <p>© 2024 ChainReact. All rights reserved.</p>
    </div>
  </div>
</body>
</html>
```

### 4. Configuration Steps

1. **Update Site URL**:
   - Go to **Authentication** → **Settings** → **Site URL**
   - Set to: `https://chainreact.app` (production) or `http://localhost:3000` (development)

2. **Configure Redirect URLs**:
   - Add allowed redirect URLs:
     - `https://chainreact.app/auth/confirm`
     - `https://chainreact.app/auth/reset-password`
     - `http://localhost:3000/auth/confirm` (development)

3. **Update Email Templates**:
   - Paste the custom HTML template
   - Update subject lines
   - Test with different email clients

### 5. Testing Email Templates

1. **Use Preview Feature**: Supabase provides a preview option in the dashboard
2. **Test Signup Flow**: Create test accounts to verify emails are working
3. **Check Spam Folders**: Ensure emails aren't being filtered
4. **Mobile Testing**: Verify templates look good on mobile devices

### 6. Advanced Customization

#### Custom SMTP (Optional)
For production environments, consider using a custom SMTP provider:
- SendGrid
- Mailgun
- Amazon SES
- Postmark

#### Email Analytics
Track email performance:
- Open rates
- Click-through rates
- Delivery rates
- Bounce rates

### 7. Best Practices

- **Keep it Simple**: Clean, professional design
- **Mobile-First**: Ensure templates work on mobile
- **Clear CTAs**: Make confirmation buttons prominent
- **Brand Consistency**: Use your brand colors and fonts
- **Security**: Never expose sensitive tokens in URLs
- **Accessibility**: Use proper contrast ratios and alt text

### 8. Troubleshooting

Common issues and solutions:
- **Emails not sending**: Check SMTP configuration
- **Links not working**: Verify redirect URLs are allowed
- **Template not updating**: Clear browser cache
- **Styling issues**: Test across email clients

### 9. Implementation Notes

The confirmation page at `/auth/confirm` has been created with:
- Professional ChainReact branding
- Success animations and feedback
- Automatic redirect to dashboard
- Error handling for failed confirmations
- Mobile-responsive design

The error page at `/auth/auth-code-error` handles:
- Expired confirmation links
- Network issues
- Already-used tokens
- Clear user guidance and next steps