import type React from "react"
import type { Metadata } from "next"
import "./globals.css"
import { Inter } from "next/font/google"
import { ThemeProvider } from "@/components/theme-provider"
import SupabaseProvider from "@/components/providers/SupabaseProvider"
import AuthInitializer from "@/components/auth/AuthInitializer"
import { UserActivityTracker } from "@/components/UserActivityTracker"
import { Toaster } from "@/components/ui/toaster"
import { ReAuthNotification } from "@/components/integrations/ReAuthNotification"
import { GlobalErrorHandler } from "@/components/GlobalErrorHandler"

// Optimize font loading with display: swap for better LCP
const inter = Inter({ 
  subsets: ["latin"],
  display: 'swap',
  preload: true,
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
        <link rel="preload" href="/logo.png" as="image" type="image/png" />
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
      <body className={inter.className} suppressHydrationWarning>
        <ThemeProvider attribute="class" defaultTheme="dark" enableSystem disableTransitionOnChange>
          <SupabaseProvider>
            <GlobalErrorHandler />
            <AuthInitializer />
            <UserActivityTracker />
            <ReAuthNotification />
            <Toaster />
            {children}
          </SupabaseProvider>
        </ThemeProvider>
      </body>
    </html>
  )
}
