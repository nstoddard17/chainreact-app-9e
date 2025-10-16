"use client"

import React from 'react'
import { Dialog, DialogContentWithoutClose, DialogTitle } from '@/components/ui/dialog'
import { VisuallyHidden } from '@radix-ui/react-visually-hidden'
import { X, Mail, Send, MessageCircle } from 'lucide-react'
import { motion } from 'framer-motion'

interface ContactModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function ContactModal({ open, onOpenChange }: ContactModalProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContentWithoutClose
        className="sm:max-w-2xl bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 p-0 gap-0 overflow-hidden"
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        {/* Hidden DialogTitle for accessibility */}
        <VisuallyHidden>
          <DialogTitle>Contact Support</DialogTitle>
        </VisuallyHidden>

        {/* Gradient header background */}
        <div className="relative bg-gradient-to-br from-blue-600 via-blue-700 to-indigo-700 px-8 pt-12 pb-8">
          {/* Custom close button inside header */}
          <button
            onClick={() => onOpenChange(false)}
            className="absolute right-4 top-4 rounded-full p-2 bg-white/10 hover:bg-white/20 backdrop-blur-sm transition-all duration-200 z-50 group border border-white/20"
          >
            <X className="h-4 w-4 text-white" />
            <span className="sr-only">Close</span>
          </button>

          {/* Decorative circles */}
          <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full blur-2xl"></div>
          <div className="absolute bottom-0 left-0 w-24 h-24 bg-indigo-400/20 rounded-full blur-xl"></div>

          <div className="relative">
            {/* Icon */}
            <motion.div
              initial={{ scale: 0, rotate: -180 }}
              animate={{ scale: 1, rotate: 0 }}
              transition={{ type: "spring", stiffness: 200, damping: 15 }}
              className="relative w-16 h-20 mx-auto mb-4 flex items-center justify-center group"
            >
              {/* Glow effect */}
              <div className="absolute inset-0 bg-gradient-to-br from-white/20 via-white/10 to-transparent rounded-[20px] blur-sm"></div>
              {/* Main container */}
              <div className="relative w-full h-full bg-gradient-to-br from-white/15 via-white/8 to-white/5 backdrop-blur-md rounded-[20px] flex items-center justify-center shadow-2xl">
                <MessageCircle className="w-7 h-7 text-white" strokeWidth={1.5} />
              </div>
            </motion.div>

            {/* Title */}
            <motion.h2
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
              className="text-3xl font-bold text-white text-center mb-3 whitespace-nowrap"
            >
              Get in Touch
            </motion.h2>

            <motion.p
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
              className="text-blue-100 text-center text-sm whitespace-nowrap"
            >
              We're here to help and answer any questions
            </motion.p>
          </div>
        </div>

        {/* Content */}
        <div className="px-8 py-8 bg-white dark:bg-slate-900">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="space-y-6"
          >
            {/* Email info card */}
            <div className="bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-800/50 dark:to-slate-800/30 rounded-xl p-5 border border-slate-200 dark:border-slate-700">
              <div className="flex items-start gap-4">
                <div className="p-3 bg-blue-100 dark:bg-blue-900/30 rounded-lg shrink-0">
                  <Mail className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="text-sm font-semibold text-slate-900 dark:text-white mb-1 whitespace-nowrap">
                    Email Support
                  </h3>
                  <p className="text-sm text-slate-600 dark:text-slate-400 mb-3">
                    Send us an email and we'll respond within 24 hours
                  </p>
                  <a
                    href="mailto:support@chainreact.app"
                    className="text-sm font-medium text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 break-all"
                  >
                    support@chainreact.app
                  </a>
                </div>
              </div>
            </div>

            {/* CTA Button */}
            <a
              href="mailto:support@chainreact.app"
              className="group relative w-full flex items-center justify-center gap-2 px-6 py-3.5 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-semibold rounded-xl transition-all duration-200 shadow-lg shadow-blue-500/25 hover:shadow-xl hover:shadow-blue-500/40 hover:scale-[1.02] active:scale-[0.98] whitespace-nowrap"
            >
              <Send className="w-4 h-4 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
              <span>Send Email</span>
            </a>

            {/* Additional info */}
            <p className="text-xs text-center text-slate-500 dark:text-slate-400 whitespace-nowrap">
              Average response time: <span className="font-semibold text-slate-700 dark:text-slate-300">2-4 hours</span>
            </p>
          </motion.div>
        </div>
      </DialogContentWithoutClose>
    </Dialog>
  )
}
