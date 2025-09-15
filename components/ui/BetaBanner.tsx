"use client"

import React, { useState, useEffect } from 'react';
import { X, MessageSquare, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import { getShortVersion } from '@/lib/config/version';

export function BetaBanner() {
  const [isVisible, setIsVisible] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // Check if user has dismissed the banner
    const dismissed = localStorage.getItem('betaBannerDismissed');
    const dismissedUntil = localStorage.getItem('betaBannerDismissedUntil');

    if (dismissed === 'permanent') {
      setIsVisible(false);
    } else if (dismissedUntil) {
      // Check if temporary dismissal has expired (7 days)
      const dismissedDate = new Date(dismissedUntil);
      const now = new Date();
      if (now < dismissedDate) {
        setIsVisible(false);
      } else {
        setIsVisible(true);
        localStorage.removeItem('betaBannerDismissedUntil');
      }
    } else {
      setIsVisible(true);
    }
    setIsLoading(false);
  }, []);

  const handleDismiss = (permanent: boolean = false) => {
    setIsVisible(false);
    if (permanent) {
      localStorage.setItem('betaBannerDismissed', 'permanent');
    } else {
      // Dismiss for 7 days
      const dismissUntil = new Date();
      dismissUntil.setDate(dismissUntil.getDate() + 7);
      localStorage.setItem('betaBannerDismissedUntil', dismissUntil.toISOString());
    }
  };

  // Don't render anything while checking localStorage
  if (isLoading) return null;

  // Don't render if not visible
  if (!isVisible) return null;

  return (
    <div className="relative bg-gradient-to-r from-blue-600/10 via-purple-600/10 to-pink-600/10 border-b border-blue-200/20 dark:border-blue-800/20">
      <div className="px-4 py-2.5">
        <div className="flex items-center justify-between max-w-7xl mx-auto">
          <div className="flex items-center gap-3 flex-1">
            <div className="flex items-center gap-2">
              <div className="relative">
                <Sparkles className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                <div className="absolute inset-0 animate-ping">
                  <Sparkles className="w-5 h-5 text-blue-600/30 dark:text-blue-400/30" />
                </div>
              </div>
              <span className="text-sm font-medium text-slate-700 dark:text-slate-200">
                ChainReact Beta
              </span>
              <span className="hidden sm:inline text-sm text-slate-600 dark:text-slate-400">
                {getShortVersion()}
              </span>
            </div>

            <div className="hidden md:flex items-center gap-1 text-sm text-slate-600 dark:text-slate-400">
              <span className="mx-2">•</span>
              <span>We're improving every day. Your feedback helps us build better!</span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Link href="/feedback" className="hidden sm:block">
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-xs gap-1.5 text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100"
              >
                <MessageSquare className="w-3.5 h-3.5" />
                <span className="hidden lg:inline">Send Feedback</span>
                <span className="lg:hidden">Feedback</span>
              </Button>
            </Link>

            <div className="flex items-center">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => handleDismiss(false)}
                className="h-7 px-2 text-xs text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
                title="Dismiss for 7 days"
              >
                <span className="hidden sm:inline mr-1">Later</span>
                <X className="w-3.5 h-3.5" />
              </Button>
            </div>
          </div>
        </div>

        {/* Mobile-only row */}
        <div className="flex md:hidden items-center justify-between mt-2 pt-2 border-t border-slate-200/50 dark:border-slate-700/50">
          <span className="text-xs text-slate-600 dark:text-slate-400">
            Your feedback helps us improve!
          </span>
          <Link href="/feedback">
            <Button
              variant="ghost"
              size="sm"
              className="h-6 text-xs gap-1 text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100"
            >
              <MessageSquare className="w-3 h-3" />
              Feedback
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
}