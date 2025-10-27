/**
 * Tutorial Orchestrator
 *
 * Orchestrates animated tutorials that show users how to use the UI
 * Kadabra-style: cursor moves, clicks, scrolls to demonstrate where data is stored
 */

import type { CursorPosition, CursorAnimation } from '@/components/workflows/ai/AnimatedCursor'

export interface TutorialStep {
  type: 'move' | 'click' | 'double-click' | 'right-click' | 'scroll' | 'wait' | 'highlight'
  target?: string // CSS selector
  targetPosition?: CursorPosition
  duration: number
  label?: string
  action?: () => void | Promise<void>
  scrollAmount?: number
}

export interface TutorialState {
  isRunning: boolean
  currentStep: number
  cursorPosition: CursorPosition
  cursorAnimation: CursorAnimation
  cursorLabel?: string
}

export class TutorialOrchestrator {
  private steps: TutorialStep[] = []
  private currentStep = 0
  private isRunning = false
  private abortController: AbortController | null = null

  private onStateChange: (state: TutorialState) => void

  constructor(onStateChange: (state: TutorialState) => void) {
    this.onStateChange = onStateChange
  }

  /**
   * Build tutorial for showing where node config data is stored
   */
  buildNodeConfigTutorial(nodeId: string): void {
    this.steps = [
      // Step 1: Move to the node
      {
        type: 'move',
        target: `[data-id="${nodeId}"]`,
        duration: 1000,
        label: 'Moving to your new node'
      },
      // Step 2: Wait
      {
        type: 'wait',
        duration: 500
      },
      // Step 3: Double-click to open config
      {
        type: 'double-click',
        target: `[data-id="${nodeId}"]`,
        duration: 500,
        label: 'Opening configuration',
        action: async () => {
          const node = document.querySelector(`[data-id="${nodeId}"]`)
          if (node) {
            // Simulate double-click
            const event = new MouseEvent('dblclick', {
              bubbles: true,
              cancelable: true,
              view: window
            })
            node.dispatchEvent(event)

            // Wait for modal to open
            await this.waitForElement('[data-modal="node-config"]', 2000)
          }
        }
      },
      // Step 4: Wait for modal animation
      {
        type: 'wait',
        duration: 800
      },
      // Step 5: Move to config content
      {
        type: 'move',
        target: '[data-modal-content="config-fields"]',
        duration: 600,
        label: 'Here\'s where your data is stored'
      },
      // Step 6: Scroll through config
      {
        type: 'scroll',
        target: '[data-modal-content="config-fields"]',
        duration: 2000,
        scrollAmount: 200,
        action: async () => {
          const content = document.querySelector('[data-modal-content="config-fields"]')
          if (content) {
            // Smooth scroll
            content.scrollTo({
              top: content.scrollHeight / 2,
              behavior: 'smooth'
            })
            await this.delay(1500)
          }
        }
      },
      // Step 7: Wait
      {
        type: 'wait',
        duration: 1000
      },
      // Step 8: Move to close button
      {
        type: 'move',
        target: '[data-modal-close]',
        duration: 500,
        label: 'You can come back here anytime'
      },
      // Step 9: Click close
      {
        type: 'click',
        target: '[data-modal-close]',
        duration: 300,
        action: () => {
          const closeBtn = document.querySelector('[data-modal-close]')
          if (closeBtn) {
            ;(closeBtn as HTMLElement).click()
          }
        }
      },
      // Step 10: Wait for modal to close
      {
        type: 'wait',
        duration: 500
      },
      // Step 11: Move back to node
      {
        type: 'move',
        target: `[data-id="${nodeId}"]`,
        duration: 800
      },
      // Step 12: Right-click for context menu
      {
        type: 'right-click',
        target: `[data-id="${nodeId}"]`,
        duration: 500,
        action: async () => {
          const node = document.querySelector(`[data-id="${nodeId}"]`)
          if (node) {
            const event = new MouseEvent('contextmenu', {
              bubbles: true,
              cancelable: true,
              view: window
            })
            node.dispatchEvent(event)
            await this.delay(300)
          }
        }
      },
      // Step 13: Wait for context menu
      {
        type: 'wait',
        duration: 400
      },
      // Step 14: Move to "Test Node" button
      {
        type: 'move',
        target: '[data-action="test-node"]',
        duration: 400,
        label: 'Let\'s test this node'
      },
      // Step 15: Click test
      {
        type: 'click',
        target: '[data-action="test-node"]',
        duration: 300,
        action: () => {
          const testBtn = document.querySelector('[data-action="test-node"]')
          if (testBtn) {
            ;(testBtn as HTMLElement).click()
          }
        }
      },
      // Step 16: Final wait
      {
        type: 'wait',
        duration: 500
      }
    ]
  }

  /**
   * Build simple tutorial for highlighting a node
   */
  buildHighlightTutorial(nodeId: string): void {
    this.steps = [
      {
        type: 'move',
        target: `[data-id="${nodeId}"]`,
        duration: 800,
        label: 'Your new node!'
      },
      {
        type: 'wait',
        duration: 1500
      }
    ]
  }

  /**
   * Start playing the tutorial
   */
  async play(): Promise<void> {
    if (this.isRunning || this.steps.length === 0) return

    this.isRunning = true
    this.currentStep = 0
    this.abortController = new AbortController()

    try {
      for (let i = 0; i < this.steps.length; i++) {
        if (this.abortController.signal.aborted) break

        this.currentStep = i
        const step = this.steps[i]

        await this.executeStep(step)
      }
    } finally {
      this.isRunning = false
      this.updateState({
        isRunning: false,
        currentStep: 0,
        cursorPosition: { x: 0, y: 0 },
        cursorAnimation: 'idle'
      })
    }
  }

  /**
   * Stop the tutorial
   */
  stop(): void {
    if (this.abortController) {
      this.abortController.abort()
    }
    this.isRunning = false
    this.currentStep = 0
  }

  /**
   * Execute a single tutorial step
   */
  private async executeStep(step: TutorialStep): Promise<void> {
    // Get target position
    let position = step.targetPosition

    if (step.target && !position) {
      const element = document.querySelector(step.target)
      if (element) {
        const rect = element.getBoundingClientRect()
        position = {
          x: rect.left + rect.width / 2,
          y: rect.top + rect.height / 2
        }
      }
    }

    if (!position) {
      position = { x: window.innerWidth / 2, y: window.innerHeight / 2 }
    }

    // Update cursor state
    const animation: CursorAnimation =
      step.type === 'wait' || step.type === 'highlight' ? 'idle' : step.type

    this.updateState({
      isRunning: true,
      currentStep: this.currentStep,
      cursorPosition: position,
      cursorAnimation: animation,
      cursorLabel: step.label
    })

    // Execute action if provided
    if (step.action) {
      await step.action()
    }

    // Wait for duration
    await this.delay(step.duration)
  }

  /**
   * Update tutorial state
   */
  private updateState(state: Partial<TutorialState>): void {
    this.onStateChange({
      isRunning: this.isRunning,
      currentStep: this.currentStep,
      cursorPosition: { x: 0, y: 0 },
      cursorAnimation: 'idle',
      ...state
    })
  }

  /**
   * Wait for an element to appear
   */
  private waitForElement(selector: string, timeout: number = 5000): Promise<Element | null> {
    return new Promise((resolve) => {
      const element = document.querySelector(selector)
      if (element) {
        resolve(element)
        return
      }

      const observer = new MutationObserver(() => {
        const element = document.querySelector(selector)
        if (element) {
          observer.disconnect()
          resolve(element)
        }
      })

      observer.observe(document.body, {
        childList: true,
        subtree: true
      })

      setTimeout(() => {
        observer.disconnect()
        resolve(null)
      }, timeout)
    })
  }

  /**
   * Delay helper
   */
  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms))
  }

  /**
   * Get current state
   */
  getState(): TutorialState {
    return {
      isRunning: this.isRunning,
      currentStep: this.currentStep,
      cursorPosition: { x: 0, y: 0 },
      cursorAnimation: 'idle'
    }
  }
}
