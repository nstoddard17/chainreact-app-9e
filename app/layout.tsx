import type React from "react"
import type { Metadata } from "next"
import "./globals.css"
import localFont from "next/font/local"
import { ThemeProvider } from "@/components/theme-provider"
import SupabaseProvider from "@/components/providers/SupabaseProvider"
import AuthInitializer from "@/components/auth/AuthInitializer"
import AuthErrorBoundary from "@/components/auth/AuthErrorBoundary"
import { LightweightPresenceProvider } from "@/components/providers/LightweightPresenceProvider"
import { Toaster } from "@/components/ui/toaster"
import { Toaster as SonnerToaster } from "sonner"
import { GlobalErrorHandler } from "@/components/GlobalErrorHandler"
import { LoadingDetector } from "@/components/LoadingDetector"
import { IconPrefetcher } from "@/components/integrations/IconPrefetcher"
import { ChunkErrorHandler } from "@/components/ChunkErrorHandler"
import { GlobalAdminDebugPanel } from "@/components/debug/GlobalAdminDebugPanel"
// Discord bot now initialized server-side via instrumentation.ts
// import DiscordBotProvider from "@/components/providers/DiscordBotProvider"
// import ArchitectureProvider from "@/components/providers/ArchitectureProvider"

// Optimize font loading with display: swap for better LCP
const spaceGrotesk = localFont({
  src: [
    {
      path: "../public/fonts/SpaceGrotesk-Latin.woff2",
      weight: "300 700",
      style: "normal",
    },
    {
      path: "../public/fonts/SpaceGrotesk-LatinExt.woff2",
      weight: "300 700",
      style: "normal",
    },
    {
      path: "../public/fonts/SpaceGrotesk-Vietnamese.woff2",
      weight: "300 700",
      style: "normal",
    },
  ],
  display: "swap",
  preload: true,
  variable: "--font-space-grotesk",
})

export const metadata: Metadata = {
  title: {
    default: "ChainReact",
    template: "%s | ChainReact",
  },
  applicationName: "ChainReact",
  description: "Connect your favorite tools, build AI-powered automations visually, and let ChainReact run the busywork for you.",
  generator: "v0.dev",
  metadataBase: new URL("https://chainreact.app"),
  keywords: [
    "ChainReact",
    "workflow automation",
    "AI automation",
    "no-code workflows",
    "business automation",
    "automation platform",
    "workflow automation software",
    "AI workflow automation",
    "zapier alternative",
    "make alternative",
    "n8n alternative",
    "workflow automation tool",
    "business process automation",
    "automate workflows",
    "workflow builder",
    "visual workflow automation",
    "slack automation",
    "gmail automation",
    "notion automation",
    "google sheets automation",
    "airtable automation",
    "discord automation",
    "workflow integration platform",
    "workflow orchestration",
    "no code automation",
    "low code automation",
    "AI-powered automation",
    "intelligent workflows",
    "automated workflows",
  ],
  alternates: {
    canonical: "/",
  },
  openGraph: {
    type: "website",
    url: "https://chainreact.app",
    siteName: "ChainReact",
    title: "ChainReact – Automate Your Workflows 10x Faster with AI",
    description: "The visual automation platform that connects your favorite apps, runs intelligent workflows, and keeps your team in complete control. From simple tasks to complex AI-driven processes.",
    images: [
      {
        url: "/api/og",
        width: 1200,
        height: 630,
        alt: "ChainReact - AI-Powered Workflow Automation Platform",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "ChainReact – Automate Your Workflows 10x Faster with AI",
    description: "Build intelligent workflows that connect your apps, automate busywork, and scale with your team. 20+ integrations, AI-powered actions, and real-time monitoring.",
    creator: "@ChainReact_App",
    images: ["/api/og/twitter"],
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
        {/* Performance hints */}
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
        <meta name="theme-color" content="#1e293b" />
      </head>
      <body className={spaceGrotesk.className} suppressHydrationWarning>
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
          <SupabaseProvider>
            <AuthErrorBoundary>
              <GlobalErrorHandler />
              <AuthInitializer />
              <LoadingDetector />
              <ChunkErrorHandler />
              <IconPrefetcher />
              <LightweightPresenceProvider>
                <Toaster />
                <SonnerToaster position="top-right" />
                <GlobalAdminDebugPanel />
                {children}
              </LightweightPresenceProvider>
            </AuthErrorBoundary>
          </SupabaseProvider>
        </ThemeProvider>
      </body>
    </html>
  )
}
