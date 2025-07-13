import DiscordBotDebug from '@/components/debug/DiscordBotDebug'

export default function DebugDiscordPage() {
  return (
    <div className="min-h-screen bg-background p-8">
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="text-center space-y-2">
          <h1 className="text-3xl font-bold">Discord Bot Debug</h1>
          <p className="text-muted-foreground">
            Check your Discord bot configuration and troubleshoot connection issues
          </p>
        </div>
        
        <DiscordBotDebug />
        
        <div className="bg-muted p-6 rounded-lg">
          <h2 className="text-xl font-semibold mb-4">Common Issues & Solutions</h2>
          <div className="space-y-4">
            <div>
              <h3 className="font-medium text-red-600">Error 4013: Invalid intent(s)</h3>
              <p className="text-sm text-muted-foreground">
                This means your Discord bot doesn't have the required Gateway Intents enabled. 
                Go to your Discord Developer Portal → Your Application → Bot section → 
                Privileged Gateway Intents and enable:
              </p>
              <ul className="list-disc list-inside mt-2 text-sm text-muted-foreground">
                <li>Server Members Intent</li>
                <li>Message Content Intent</li>
              </ul>
            </div>
            
            <div>
              <h3 className="font-medium text-red-600">Bot not appearing online</h3>
              <p className="text-sm text-muted-foreground">
                Make sure your bot token is correct and the bot has been invited to your Discord servers 
                with the proper permissions.
              </p>
            </div>
            
            <div>
              <h3 className="font-medium text-red-600">Authentication failed</h3>
              <p className="text-sm text-muted-foreground">
                Check that your DISCORD_BOT_TOKEN environment variable is set correctly and the token is valid.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
} 