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

const inter = Inter({ subsets: ["latin"] })

export const metadata: Metadata = {
  title: "ChainReact",
  description: "Automate your workflows with ChainReact.",
  generator: "v0.dev",
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link rel="icon" type="image/png" href="/logo.png" />
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
