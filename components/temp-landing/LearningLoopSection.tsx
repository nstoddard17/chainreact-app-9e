"use client"

import React from 'react'
import { ScrollSequence } from './ScrollSequence'
import { PlaceholderMedia } from './PlaceholderMedia'

const steps = [
  {
    stepNumber: 1,
    title: 'Describe what you need',
    description: "Type what you want in plain English. 'When I get a new Shopify order, send a Slack notification to #sales and add a row to Google Sheets.' That's it.",
    media: (
      <PlaceholderMedia
        label="CAPTURE: Screenshot of the AI chat panel in /workflows/builder. Show the chat input with a typed prompt like 'When I get a new Shopify order, send Slack to #sales and log to Google Sheets'. Capture before hitting send so the canvas is empty."
        aspectRatio="16/10"
        type="screenshot"
        className="w-full"
      />
    ),
  },
  {
    stepNumber: 2,
    title: 'Watch AI build it — live',
    description: 'AI creates your workflow node by node in real time. You see each step appear on the canvas, fields auto-populate, and connections form. No manual configuration.',
    media: (
      <PlaceholderMedia
        label="CAPTURE: Screen-record or screenshot the builder mid-generation. Open /workflows/builder, send a prompt, and capture the moment when nodes are appearing on canvas with connections forming. GIF preferred — show 3-4 nodes already placed with fields auto-filled."
        aspectRatio="16/10"
        type="video"
        className="w-full"
      />
    ),
  },
  {
    stepNumber: 3,
    title: 'Refine with conversation',
    description: "Don't like something? Just say so. 'Add a filter for orders over $100' or 'Use Discord instead of Slack.' AI updates the workflow instantly without rebuilding from scratch.",
    media: (
      <PlaceholderMedia
        label="CAPTURE: Screenshot of the chat panel showing a follow-up message like 'Add a filter for orders over $100' with the AI responding and the canvas showing the updated workflow with the new filter node added."
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
        sectionTitle="How it works"
      />
    </section>
  )
}
