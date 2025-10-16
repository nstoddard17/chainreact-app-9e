"use client"

import React from 'react'
import { Dialog, DialogContentWithoutClose, DialogTitle } from '@/components/ui/dialog'
import { VisuallyHidden } from '@radix-ui/react-visually-hidden'
import { X, Mail, Send, MessageCircle } from 'lucide-react'

interface ContactModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function ContactModal({ open, onOpenChange }: ContactModalProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContentWithoutClose className="sm:max-w-[600px] bg-white dark:bg-slate-900 p-0 gap-0 overflow-hidden border-slate-200 dark:border-slate-700">
        <VisuallyHidden>
          <DialogTitle>Contact Support</DialogTitle>
        </VisuallyHidden>

        {/* Header with gradient */}
        <div className="relative bg-gradient-to-br from-blue-600 via-blue-700 to-indigo-700 px-10 py-12">
          {/* Decorative background elements */}
          <div className="absolute top-0 right-0 w-40 h-40 bg-white/5 rounded-full blur-3xl pointer-events-none" />
          <div className="absolute bottom-0 left-0 w-32 h-32 bg-indigo-400/10 rounded-full blur-2xl pointer-events-none" />

          {/* Close button */}
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="absolute right-4 top-4 z-10 rounded-full p-2 bg-white/10 hover:bg-white/20 backdrop-blur-sm transition-colors border border-white/20"
          >
            <X className="h-4 w-4 text-white" />
            <span className="sr-only">Close</span>
          </button>

          <div className="relative text-center">
            {/* Icon container - rectangular with subtle gradient */}
            <div className="w-20 h-24 mx-auto mb-6 rounded-3xl bg-gradient-to-br from-white/15 to-white/5 backdrop-blur-sm border border-white/10 flex items-center justify-center shadow-xl">
              <MessageCircle className="w-10 h-10 text-white" strokeWidth={1.5} />
            </div>

            {/* Title */}
            <h2 className="text-3xl font-bold text-white mb-2">
              Get in Touch
            </h2>

            {/* Subtitle */}
            <p className="text-blue-100 text-base">
              We're here to help and answer any questions
            </p>
          </div>
        </div>

        {/* Content */}
        <div className="px-10 py-8 bg-white dark:bg-slate-900">
          {/* Email info card */}
          <div className="bg-slate-50 dark:bg-slate-800/50 rounded-xl p-6 mb-6 border border-slate-200 dark:border-slate-700">
            <div className="flex items-start gap-4">
              <div className="p-3 bg-blue-100 dark:bg-blue-900/30 rounded-xl flex-shrink-0">
                <Mail className="w-6 h-6 text-blue-600 dark:text-blue-400" />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="text-base font-semibold text-slate-900 dark:text-white mb-2">
                  Email Support
                </h3>
                <p className="text-sm text-slate-600 dark:text-slate-400 mb-3 leading-relaxed">
                  Send us an email and we'll respond within 24 hours
                </p>
                <a
                  href="mailto:support@chainreact.app"
                  className="text-sm font-medium text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 transition-colors"
                >
                  support@chainreact.app
                </a>
              </div>
            </div>
          </div>

          {/* Send Email Button */}
          <a
            href="mailto:support@chainreact.app"
            className="w-full flex items-center justify-center gap-2 px-6 py-4 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-semibold rounded-xl transition-all duration-200 shadow-lg shadow-blue-500/20 hover:shadow-xl hover:shadow-blue-500/30 hover:scale-[1.02] active:scale-[0.98]"
          >
            <Send className="w-5 h-5" />
            <span>Send Email</span>
          </a>

          {/* Response time */}
          <p className="text-center text-xs text-slate-500 dark:text-slate-400 mt-6">
            Average response time: <span className="font-semibold text-slate-700 dark:text-slate-300">2-4 hours</span>
          </p>
        </div>
      </DialogContentWithoutClose>
    </Dialog>
  )
}
