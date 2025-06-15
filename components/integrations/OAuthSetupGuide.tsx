"use client"

import { useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { ExternalLink, Copy, CheckCircle, AlertTriangle } from "lucide-react"

interface OAuthSetupGuideProps {
  provider: string
  error?: string
}

export function OAuthSetupGuide({ provider, error }: OAuthSetupGuideProps) {
  const [copied, setCopied] = useState<string | null>(null)

  const copyToClipboard = (text: string, key: string) => {
    navigator.clipboard.writeText(text)
    setCopied(key)
    setTimeout(() => setCopied(null), 2000)
  }

  const getProviderConfig = (provider: string) => {
    const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || process.env.NEXT_PUBLIC_APP_URL || window.location.origin

    switch (provider.toLowerCase()) {
      case "google":
      case "gmail":
      case "google-drive":
      case "google-sheets":
      case "google-docs":
      case "google-calendar":
      case "youtube":
        return {
          name: "Google Cloud Console",
          setupUrl: "https://console.developers.google.com/",
          redirectUri: `${baseUrl}/api/integrations/google/callback`,
          steps: [
            "Go to Google Cloud Console",
            "Create a new project or select existing one",
            "Enable the required APIs (Gmail API, Drive API, etc.)",
            'Go to "Credentials" → "Create Credentials" → "OAuth 2.0 Client IDs"',
            'Set Application type to "Web application"',
            "Add the redirect URI below",
            "Copy the Client ID and Client Secret to your environment variables",
          ],
          envVars: [
            { key: "NEXT_PUBLIC_GOOGLE_CLIENT_ID", description: "Your Google OAuth Client ID" },
            { key: "GOOGLE_CLIENT_SECRET", description: "Your Google OAuth Client Secret" },
          ],
          commonIssues: [
            "Make sure the redirect URI exactly matches what's configured in Google Console",
            "Enable the required APIs for your use case",
            "Verify your domain is added to authorized domains",
            "Check that OAuth consent screen is properly configured",
          ],
        }

      case "slack":
        return {
          name: "Slack App Management",
          setupUrl: "https://api.slack.com/apps",
          redirectUri: `${baseUrl}/api/integrations/slack/callback`,
          steps: [
            "Go to Slack API website",
            'Click "Create New App" → "From scratch"',
            "Enter app name and select workspace",
            'Go to "OAuth & Permissions"',
            "Add the redirect URI below",
            'Add required scopes under "Bot Token Scopes"',
            "Install the app to your workspace",
          ],
          envVars: [
            { key: "NEXT_PUBLIC_SLACK_CLIENT_ID", description: "Your Slack App Client ID" },
            { key: "SLACK_CLIENT_SECRET", description: "Your Slack App Client Secret" },
          ],
        }

      case "github":
        return {
          name: "GitHub Developer Settings",
          setupUrl: "https://github.com/settings/developers",
          redirectUri: `${baseUrl}/api/integrations/github/callback`,
          steps: [
            "Go to GitHub Developer Settings",
            'Click "New OAuth App"',
            "Fill in application details",
            "Set Authorization callback URL to the redirect URI below",
            "Copy Client ID and generate Client Secret",
          ],
          envVars: [
            { key: "NEXT_PUBLIC_GITHUB_CLIENT_ID", description: "Your GitHub OAuth App Client ID" },
            { key: "GITHUB_CLIENT_SECRET", description: "Your GitHub OAuth App Client Secret" },
          ],
        }

      default:
        return null
    }
  }

  const config = getProviderConfig(provider)
  if (!config) return null

  return (
    <Card className="mt-4">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <AlertTriangle className="h-5 w-5 text-orange-500" />
          {config.name} Setup Required
        </CardTitle>
        <CardDescription>Configure OAuth for {provider} to enable this integration</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {error && (
          <Alert>
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <div>
          <h4 className="font-medium mb-2">Setup Steps:</h4>
          <ol className="list-decimal list-inside space-y-1 text-sm text-muted-foreground">
            {config.steps.map((step, index) => (
              <li key={index}>{step}</li>
            ))}
          </ol>
        </div>

        <div>
          <h4 className="font-medium mb-2">Redirect URI:</h4>
          <div className="flex items-center gap-2">
            <code className="flex-1 p-2 bg-muted rounded text-sm font-mono">{config.redirectUri}</code>
            <Button size="sm" variant="outline" onClick={() => copyToClipboard(config.redirectUri, "redirect")}>
              {copied === "redirect" ? <CheckCircle className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
            </Button>
          </div>
        </div>

        <div>
          <h4 className="font-medium mb-2">Environment Variables:</h4>
          <div className="space-y-2">
            {config.envVars.map((envVar) => (
              <div key={envVar.key} className="flex items-center justify-between p-2 bg-muted rounded">
                <div>
                  <code className="text-sm font-mono">{envVar.key}</code>
                  <p className="text-xs text-muted-foreground">{envVar.description}</p>
                </div>
                <Badge variant={process.env[envVar.key] ? "default" : "destructive"}>
                  {process.env[envVar.key] ? "Set" : "Missing"}
                </Badge>
              </div>
            ))}
          </div>
        </div>

        {config.commonIssues && (
          <div>
            <h4 className="font-medium mb-2">Common Issues:</h4>
            <ul className="list-disc list-inside space-y-1 text-sm text-muted-foreground">
              {config.commonIssues.map((issue, index) => (
                <li key={index}>{issue}</li>
              ))}
            </ul>
          </div>
        )}

        <Button asChild className="w-full">
          <a href={config.setupUrl} target="_blank" rel="noopener noreferrer">
            Open {config.name} <ExternalLink className="ml-2 h-4 w-4" />
          </a>
        </Button>
      </CardContent>
    </Card>
  )
}
