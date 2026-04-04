"use client"

import React, { useRef } from 'react'
import { motion, useScroll, useTransform } from 'framer-motion'

interface ScrollStep {
  title: string
  description: string
  media: React.ReactNode
  stepNumber: number
}

interface ScrollSequenceProps {
  steps: ScrollStep[]
  sectionTitle?: string
  sectionSubtitle?: string
}

export function ScrollSequence({ steps, sectionTitle, sectionSubtitle }: ScrollSequenceProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const { scrollYProgress } = useScroll({
    target: containerRef,
    offset: ["start start", "end end"],
  })

  // 150vh per step
  const totalHeight = steps.length * 150

  return (
    <>
      {/* Desktop: scroll-triggered transitions */}
      <div className="hidden lg:block">
        <div
          ref={containerRef}
          className="relative"
          style={{ height: `${totalHeight}vh` }}
        >
          <div className="sticky top-0 h-screen flex items-center overflow-hidden">
            <div className="max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8">
              {sectionTitle && (
                <div className="text-center mb-12">
                  <h2 className="font-[var(--font-space-grotesk)] text-3xl md:text-4xl lg:text-5xl font-bold text-slate-900 dark:text-white mb-3">
                    {sectionTitle}
                  </h2>
                  {sectionSubtitle && (
                    <p className="text-lg text-slate-600 dark:text-slate-400 max-w-2xl mx-auto">
                      {sectionSubtitle}
                    </p>
                  )}
                </div>
              )}

              <div className="grid lg:grid-cols-2 gap-16 items-center">
                <div className="relative">
                  {/* Step indicators */}
                  <div className="absolute -left-8 top-0 bottom-0 flex flex-col items-center justify-center gap-3">
                    {steps.map((_, index) => (
                      <StepDot
                        key={index}
                        index={index}
                        total={steps.length}
                        scrollProgress={scrollYProgress}
                      />
                    ))}
                  </div>

                  <div className="relative h-[220px]">
                    {steps.map((step, index) => (
                      <StepText
                        key={step.stepNumber}
                        step={step}
                        index={index}
                        total={steps.length}
                        scrollProgress={scrollYProgress}
                      />
                    ))}
                  </div>
                </div>

                <div className="relative h-[420px]">
                  {steps.map((step, index) => (
                    <StepMedia
                      key={step.stepNumber}
                      step={step}
                      index={index}
                      total={steps.length}
                      scrollProgress={scrollYProgress}
                    />
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Mobile: stacked cards */}
      <div className="lg:hidden px-4 sm:px-6 py-20">
        <div className="max-w-2xl mx-auto">
          {sectionTitle && (
            <div className="text-center mb-12">
              <h2 className="font-[var(--font-space-grotesk)] text-3xl font-bold text-slate-900 dark:text-white mb-3">
                {sectionTitle}
              </h2>
              {sectionSubtitle && (
                <p className="text-base text-slate-600 dark:text-slate-400">
                  {sectionSubtitle}
                </p>
              )}
            </div>
          )}

          <div className="space-y-16">
            {steps.map((step) => (
              <motion.div
                key={step.stepNumber}
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, amount: 0.3 }}
                transition={{ duration: 0.5, delay: 0.1 }}
              >
                <div className="mb-4">
                  <span className="text-4xl font-bold bg-gradient-to-r from-orange-500 to-rose-500 bg-clip-text text-transparent">
                    {step.stepNumber}
                  </span>
                </div>
                <h3 className="font-[var(--font-space-grotesk)] text-2xl font-bold text-slate-900 dark:text-white mb-3">
                  {step.title}
                </h3>
                <p className="text-base text-slate-600 dark:text-slate-400 mb-6 leading-relaxed">
                  {step.description}
                </p>
                {step.media}
              </motion.div>
            ))}
          </div>
        </div>
      </div>
    </>
  )
}

function StepDot({
  index,
  total,
  scrollProgress,
}: {
  index: number
  total: number
  scrollProgress: any
}) {
  const segmentSize = 1 / total
  const start = index * segmentSize
  const end = start + segmentSize
  const isFirst = index === 0
  const isLast = index === total - 1

  const fadeIn = isFirst ? start : start + segmentSize * 0.08
  const fadeOut = isLast ? end : end - segmentSize * 0.08

  const opacity = useTransform(
    scrollProgress,
    isFirst
      ? [0, fadeOut, end]
      : isLast
      ? [start, fadeIn, 1]
      : [start, fadeIn, fadeOut, end],
    isFirst
      ? [1, 1, 0.15]
      : isLast
      ? [0.15, 1, 1]
      : [0.15, 1, 1, 0.15]
  )
  const scale = useTransform(
    scrollProgress,
    isFirst
      ? [0, fadeOut, end]
      : isLast
      ? [start, fadeIn, 1]
      : [start, fadeIn, fadeOut, end],
    isFirst
      ? [1, 1, 0.5]
      : isLast
      ? [0.5, 1, 1]
      : [0.5, 1, 1, 0.5]
  )

  return (
    <motion.div
      className="w-2 h-2 rounded-full bg-orange-500"
      style={{ opacity, scale }}
    />
  )
}

function StepText({
  step,
  index,
  total,
  scrollProgress,
}: {
  step: ScrollStep
  index: number
  total: number
  scrollProgress: any
}) {
  const segmentSize = 1 / total
  const start = index * segmentSize
  const end = start + segmentSize
  const isFirst = index === 0
  const isLast = index === total - 1

  // First step: starts visible, fades out. Last step: fades in, stays visible.
  const fadeIn = isFirst ? start : start + segmentSize * 0.08
  const fadeOut = isLast ? end : end - segmentSize * 0.08

  const opacity = useTransform(
    scrollProgress,
    isFirst
      ? [0, fadeOut, end]
      : isLast
      ? [start, fadeIn, 1]
      : [start, fadeIn, fadeOut, end],
    isFirst
      ? [1, 1, 0]
      : isLast
      ? [0, 1, 1]
      : [0, 1, 1, 0]
  )
  const y = useTransform(
    scrollProgress,
    isFirst
      ? [0, fadeOut, end]
      : isLast
      ? [start, fadeIn, 1]
      : [start, fadeIn, fadeOut, end],
    isFirst
      ? [0, 0, -20]
      : isLast
      ? [20, 0, 0]
      : [20, 0, 0, -20]
  )

  return (
    <motion.div className="absolute inset-0 flex flex-col justify-center" style={{ opacity, y }}>
      <span className="text-5xl font-bold bg-gradient-to-r from-orange-500 to-rose-500 bg-clip-text text-transparent mb-4">
        {step.stepNumber}
      </span>
      <h3 className="font-[var(--font-space-grotesk)] text-3xl font-bold text-slate-900 dark:text-white mb-4">
        {step.title}
      </h3>
      <p className="text-lg text-slate-600 dark:text-slate-400 leading-relaxed max-w-md">
        {step.description}
      </p>
    </motion.div>
  )
}

function StepMedia({
  step,
  index,
  total,
  scrollProgress,
}: {
  step: ScrollStep
  index: number
  total: number
  scrollProgress: any
}) {
  const segmentSize = 1 / total
  const start = index * segmentSize
  const end = start + segmentSize
  const isFirst = index === 0
  const isLast = index === total - 1

  const fadeIn = isFirst ? start : start + segmentSize * 0.08
  const fadeOut = isLast ? end : end - segmentSize * 0.08

  const opacity = useTransform(
    scrollProgress,
    isFirst
      ? [0, fadeOut, end]
      : isLast
      ? [start, fadeIn, 1]
      : [start, fadeIn, fadeOut, end],
    isFirst
      ? [1, 1, 0]
      : isLast
      ? [0, 1, 1]
      : [0, 1, 1, 0]
  )
  const scale = useTransform(
    scrollProgress,
    isFirst
      ? [0, fadeOut, end]
      : isLast
      ? [start, fadeIn, 1]
      : [start, fadeIn, fadeOut, end],
    isFirst
      ? [1, 1, 0.97]
      : isLast
      ? [0.97, 1, 1]
      : [0.97, 1, 1, 0.97]
  )

  return (
    <motion.div className="absolute inset-0 flex items-center" style={{ opacity, scale }}>
      {step.media}
    </motion.div>
  )
}
