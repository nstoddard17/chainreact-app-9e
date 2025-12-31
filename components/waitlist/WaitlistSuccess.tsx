"use client"

import React, { useEffect, useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import {
  CheckCircle2,
  Mail,
  Linkedin,
  Facebook,
  Share2,
  ArrowRight,
  Sparkles,
} from 'lucide-react'
import { motion } from 'framer-motion'

const XLogo = (props: React.SVGProps<SVGSVGElement>) => (
  <svg
    viewBox="0 0 24 24"
    fill="currentColor"
    aria-hidden="true"
    focusable="false"
    {...props}
  >
    <path d="M18.244 1.807h3.396l-7.406 8.47 8.739 12.595h-6.842l-5.367-7.557-6.144 7.557H1.512l7.77-8.893L0 1.807h6.999l4.833 6.7 6.412-6.7z" />
  </svg>
)

export function WaitlistSuccess() {
  const searchParams = useSearchParams()
  const name = searchParams.get('name')
  const [copied, setCopied] = useState(false)
  const DEFAULT_SHARE_TIP =
    'LinkedIn & Facebook block pre-filled text—paste with Cmd+V / Ctrl+V after the dialog opens.'
  const [shareTip, setShareTip] = useState<string>(DEFAULT_SHARE_TIP)

  const shareUrl = typeof window !== 'undefined' ? window.location.origin + '/waitlist' : ''
  const shareText = "I just joined the ChainReact waitlist! The future of workflow automation is coming. Join me!"
  const shareMessage = `${shareText} ${shareUrl}`

  const handleShare = async (platform: string) => {
    const encodedUrl = encodeURIComponent(shareUrl)
    const encodedText = encodeURIComponent(shareText)

    const urls: Record<string, string> = {
      twitter: `https://x.com/intent/post?text=${encodedText}&url=${encodedUrl}`,
      linkedin: `https://www.linkedin.com/shareArticle?mini=true&url=${encodedUrl}&title=${encodedText}&summary=${encodedText}`,
      facebook: `https://www.facebook.com/sharer/sharer.php?u=${encodedUrl}&quote=${encodedText}`,
    }

    if (platform !== 'twitter') {
      try {
        await navigator.clipboard.writeText(shareMessage)
        setCopied(true)
        setTimeout(() => setCopied(false), 2000)
        setShareTip(DEFAULT_SHARE_TIP)
      } catch (error) {
        console.error('Failed to copy share message:', error)
        setShareTip('Copying the message failed. You can still click the button and paste manually.')
      }
    } else {
      setShareTip(DEFAULT_SHARE_TIP)
    }

    if (urls[platform]) {
      window.open(urls[platform], '_blank', 'width=600,height=400')
    }
  }

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (error) {
      console.error('Failed to copy:', error)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-orange-950 to-rose-950 relative overflow-hidden">
      {/* Animated Background Elements */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-orange-500/10 rounded-full blur-3xl animate-pulse" />
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-rose-500/10 rounded-full blur-3xl animate-pulse delay-1000" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-orange-500/5 rounded-full blur-3xl" />
      </div>

      {/* Grid Pattern Overlay */}
      <div
        className="absolute inset-0 opacity-10"
        style={{
          backgroundImage: `linear-gradient(rgba(255, 255, 255, 0.05) 1px, transparent 1px),
                           linear-gradient(90deg, rgba(255, 255, 255, 0.05) 1px, transparent 1px)`,
          backgroundSize: '50px 50px',
        }}
      />

      {/* Navigation */}
      <nav className="relative z-20 px-4 sm:px-6 lg:px-8 py-6">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <Link href="/" className="text-3xl font-bold bg-gradient-to-r from-orange-400 to-rose-400 bg-clip-text text-transparent hover:opacity-80 transition-opacity">
            ChainReact
          </Link>

          <Link href="/">
            <Button variant="ghost" className="text-white hover:bg-white/10">
              Back to Home
            </Button>
          </Link>
        </div>
      </nav>

      {/* Main Content */}
      <main className="relative z-10 px-4 sm:px-6 lg:px-8 py-12 sm:py-20">
        <div className="max-w-3xl mx-auto">
          {/* Success Card */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
          >
            <Card className="border-2 border-green-500/50 bg-white/95 dark:bg-slate-900/95 backdrop-blur-sm shadow-2xl">
              <CardContent className="pt-12 pb-12 px-6 sm:px-12">
                {/* Success Icon */}
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ delay: 0.2, type: 'spring', stiffness: 200 }}
                  className="flex justify-center mb-6"
                >
                  <div className="relative">
                    <div className="absolute inset-0 bg-green-500/20 rounded-full blur-xl" />
                    <CheckCircle2 className="h-24 w-24 text-green-500 relative" strokeWidth={1.5} />
                  </div>
                </motion.div>

                {/* Success Message */}
                <div className="text-center space-y-4 mb-8">
                  <h1 className="text-3xl sm:text-4xl font-bold text-slate-900 dark:text-white">
                    You're on the list{name ? `, ${name}` : ''}! 🎉
                  </h1>
                  <p className="text-lg text-slate-600 dark:text-slate-300">
                    Welcome to the ChainReact early access program
                  </p>
                </div>

                {/* What's Next Section */}
                <div className="bg-orange-50 dark:bg-orange-950/30 rounded-xl p-6 mb-8">
                  <div className="flex items-center gap-2 mb-4">
                    <Mail className="h-5 w-5 text-orange-600 dark:text-orange-400" />
                    <h2 className="text-xl font-semibold text-slate-900 dark:text-white">
                      What happens next?
                    </h2>
                  </div>
                  <ul className="space-y-3 text-slate-700 dark:text-slate-300">
                    <li className="flex items-start gap-3">
                      <CheckCircle2 className="h-5 w-5 text-green-500 flex-shrink-0 mt-0.5" />
                      <span>Check your inbox - we've sent you a welcome email</span>
                    </li>
                    <li className="flex items-start gap-3">
                      <CheckCircle2 className="h-5 w-5 text-green-500 flex-shrink-0 mt-0.5" />
                      <span>We'll review your integration preferences and needs</span>
                    </li>
                    <li className="flex items-start gap-3">
                      <CheckCircle2 className="h-5 w-5 text-green-500 flex-shrink-0 mt-0.5" />
                      <span>You'll get priority access when we launch</span>
                    </li>
                    <li className="flex items-start gap-3">
                      <CheckCircle2 className="h-5 w-5 text-green-500 flex-shrink-0 mt-0.5" />
                      <span>Expect exclusive updates and early adopter benefits</span>
                    </li>
                  </ul>
                </div>

                {/* Share Section */}
                <div className="bg-rose-50 dark:bg-rose-950/30 rounded-xl p-6 mb-8">
                  <div className="flex items-center gap-2 mb-4">
                    <Sparkles className="h-5 w-5 text-rose-600 dark:text-rose-400" />
                    <h2 className="text-xl font-semibold text-slate-900 dark:text-white">
                      Want to move up the waitlist?
                    </h2>
                  </div>
                  <div className="flex flex-col gap-2 sm:flex-row sm:flex-nowrap sm:items-center sm:justify-between mb-4">
                    <p className="text-slate-700 dark:text-slate-300 flex-1">
                      Share ChainReact with colleagues who might benefit from workflow automation!
                    </p>
                    {shareTip && (
                      <p className="text-xs sm:text-sm text-rose-700 dark:text-rose-200 sm:text-right sm:pl-4">
                        {shareTip}
                      </p>
                    )}
                  </div>

                  <div className="flex flex-wrap gap-3">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleShare('twitter')}
                      className="flex-1 sm:flex-none"
                    >
                      <XLogo className="h-4 w-4 mr-2" />
                      Post on X
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleShare('linkedin')}
                      className="flex-1 sm:flex-none"
                    >
                      <Linkedin className="h-4 w-4 mr-2" />
                      LinkedIn
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleShare('facebook')}
                      className="flex-1 sm:flex-none"
                    >
                      <Facebook className="h-4 w-4 mr-2" />
                      Facebook
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleCopyLink}
                      className="flex-1 sm:flex-none"
                    >
                      <Share2 className="h-4 w-4 mr-2" />
                      {copied ? 'Copied!' : 'Copy Link'}
                    </Button>
                  </div>
                </div>

                {/* CTA Buttons */}
                <div className="flex flex-col sm:flex-row gap-4">
                  <Link href="/" className="flex-1">
                    <Button
                      variant="outline"
                      size="lg"
                      className="w-full"
                    >
                      Back to Home
                    </Button>
                  </Link>
                  <a
                    href="mailto:support@chainreact.app"
                    className="flex-1"
                  >
                    <Button
                      size="lg"
                      className="w-full bg-gradient-to-r from-orange-500 to-rose-600 hover:from-orange-600 hover:to-rose-700 text-white"
                    >
                      Contact Us
                      <ArrowRight className="ml-2 h-5 w-5" />
                    </Button>
                  </a>
                </div>
              </CardContent>
            </Card>
          </motion.div>

          {/* Additional Info */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.5 }}
            className="text-center mt-8 text-slate-400 text-sm"
          >
            <p>Have questions? Reach out at support@chainreact.app</p>
            <p className="mt-2">
              Follow us on{' '}
              <a href="https://x.com/ChainReact_App" className="text-orange-400 hover:underline">
                X
              </a>{' '}
              and{' '}
              <a href="https://www.linkedin.com/company/chainreactapp" className="text-orange-400 hover:underline">
                LinkedIn
              </a>
            </p>
          </motion.div>
        </div>
      </main>
    </div>
  )
}
