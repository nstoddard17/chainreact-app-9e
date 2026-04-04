"use client"

import React from 'react'
import { ScrollSequence } from './ScrollSequence'
import { PlaceholderMedia } from './PlaceholderMedia'

const steps = [
  {
    stepNumber: 1,
    title: 'You build the workflow',
    description: 'Drag and drop — or just describe what you need and let AI wire it up. Connect Gmail, Slack, HubSpot, and 20 other tools in minutes.',
    media: (
      <PlaceholderMedia
        label="Screenshot: Workflow Builder canvas with nodes"
        aspectRatio="16/10"
        type="screenshot"
        className="w-full"
      />
    ),
  },
  {
    stepNumber: 2,
    title: 'AI hits a case it\'s unsure about',
    description: 'Instead of guessing wrong and breaking your workflow, it pauses and asks you. You make the call. Takes 10 seconds.',
    media: (
      <PlaceholderMedia
        label="GIF: HITL flow — AI pauses, human corrects, workflow continues"
        aspectRatio="16/10"
        type="video"
        className="w-full"
      />
    ),
  },
  {
    stepNumber: 3,
    title: 'It doesn\'t ask twice',
    description: 'Your correction becomes permanent knowledge. Next time a similar case appears, the AI handles it automatically. Accuracy goes from 70% to 95% over weeks.',
    media: (
      <PlaceholderMedia
        label="Screenshot: Analytics showing accuracy improvement over time"
        aspectRatio="16/10"
        type="screenshot"
        className="w-full"
      />
    ),
  },
]

export function LearningLoopSection() {
  return (
    <section id="how-it-works">
      <ScrollSequence
        steps={steps}
        sectionTitle="How it actually works"
      />
    </section>
  )
}
