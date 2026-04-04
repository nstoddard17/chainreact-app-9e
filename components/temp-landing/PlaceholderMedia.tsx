"use client"

import React from 'react'
import { ImageIcon, Play } from 'lucide-react'

interface PlaceholderMediaProps {
  label: string
  aspectRatio?: string
  type?: 'screenshot' | 'video'
  src?: string
  alt?: string
  className?: string
}

export function PlaceholderMedia({
  label,
  aspectRatio = '16/9',
  type = 'screenshot',
  src,
  alt,
  className = '',
}: PlaceholderMediaProps) {
  if (src) {
    if (type === 'video') {
      return (
        <div className={`relative rounded-xl overflow-hidden ${className}`}>
          <video
            autoPlay
            muted
            loop
            playsInline
            className="w-full h-auto"
            style={{ aspectRatio }}
          >
            <source src={src} type="video/mp4" />
          </video>
        </div>
      )
    }

    return (
      <div className={`relative rounded-xl overflow-hidden ${className}`}>
        <img
          src={src}
          alt={alt || label}
          className="w-full h-auto"
          style={{ aspectRatio, objectFit: 'cover' }}
        />
      </div>
    )
  }

  return (
    <div
      className={`relative rounded-xl overflow-hidden bg-gradient-to-br from-slate-50 to-slate-100/80 dark:from-slate-800 dark:to-slate-900 border border-slate-200/60 dark:border-slate-700/40 ${className}`}
      style={{ aspectRatio }}
    >
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-6">
        <div className="w-10 h-10 rounded-lg bg-white/60 dark:bg-slate-700/50 border border-slate-200/50 dark:border-slate-600/30 flex items-center justify-center shadow-sm">
          {type === 'video' ? (
            <Play className="w-5 h-5 text-slate-400 dark:text-slate-500" />
          ) : (
            <ImageIcon className="w-5 h-5 text-slate-400 dark:text-slate-500" />
          )}
        </div>
        <p className="text-xs text-slate-400 dark:text-slate-500 text-center max-w-[280px] leading-relaxed">
          {label}
        </p>
      </div>
      {/* Subtle dot pattern */}
      <div
        className="absolute inset-0 opacity-[0.03] dark:opacity-[0.05]"
        style={{
          backgroundImage: 'radial-gradient(circle, currentColor 1px, transparent 1px)',
          backgroundSize: '20px 20px',
        }}
      />
    </div>
  )
}
