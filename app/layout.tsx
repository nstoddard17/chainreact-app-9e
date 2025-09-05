import type React from "react"
import type { Metadata } from "next"
import "./globals.css"
import { Space_Grotesk } from "next/font/google"
import { ThemeProvider } from "@/components/theme-provider"
import SupabaseProvider from "@/components/providers/SupabaseProvider"
import AuthInitializer from "@/components/auth/AuthInitializer"
import { LightweightPresenceProvider } from "@/components/providers/LightweightPresenceProvider"
import { Toaster } from "@/components/ui/toaster"
import { GlobalErrorHandler } from "@/components/GlobalErrorHandler"
import DiscordBotProvider from "@/components/providers/DiscordBotProvider"
// import ArchitectureProvider from "@/components/providers/ArchitectureProvider"

// Optimize font loading with display: swap for better LCP
const spaceGrotesk = Space_Grotesk({ 
  subsets: ["latin"],
  display: 'swap',
  preload: true,
  variable: '--font-space-grotesk',
})

export const metadata: Metadata = {
  title: "ChainReact",
  description: "Automate your workflows with ChainReact.",
  generator: "v0.dev",
  // Add performance optimizations
  metadataBase: new URL('https://chainreact.app'),
  openGraph: {
    title: "ChainReact",
    description: "Automate your workflows with ChainReact.",
    type: 'website',
  },
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* Preload critical resources */}
        <link rel="dns-prefetch" href="//fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.googleapis.com" crossOrigin="anonymous" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        
        {/* Optimize favicon */}
        <link rel="icon" type="image/png" href="/logo.png" sizes="any" />
        <link rel="apple-touch-icon" href="/logo.png" />
        
        {/* Performance hints */}
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
        <meta name="theme-color" content="#1e293b" />
      </head>
      <body className={spaceGrotesk.className} suppressHydrationWarning>
        <ThemeProvider attribute="class" defaultTheme="dark" enableSystem disableTransitionOnChange>
          <SupabaseProvider>
            <GlobalErrorHandler />
            <AuthInitializer />
            <LightweightPresenceProvider>
              <DiscordBotProvider />
              <Toaster />
              {children}
            </LightweightPresenceProvider>
          </SupabaseProvider>
        </ThemeProvider>
      </body>
    </html>
  )
}
