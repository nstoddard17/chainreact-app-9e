import { test, expect, chromium } from '@playwright/test'

/**
 * Diagnostic test to debug the "stuck on loading after login" issue.
 *
 * This test:
 * 1. Opens Chrome (visible)
 * 2. Checks if already logged in — if so, logs out first
 * 3. Pauses for manual login
 * 4. Monitors console logs, network requests, and auth state during post-login loading
 * 5. Reports what's happening and where it gets stuck
 */
test('debug login loading issue', async () => {
  const browser = await chromium.launch({
    headless: false,
    channel: 'chrome',
    slowMo: 100,
  })

  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
  })
  const page = await context.newPage()

  // Collect console logs
  const consoleLogs: { type: string; text: string; time: number }[] = []
  const startTime = Date.now()

  page.on('console', (msg) => {
    const elapsed = Date.now() - startTime
    consoleLogs.push({
      type: msg.type(),
      text: msg.text(),
      time: elapsed,
    })
    // Print auth-related logs in real time
    const text = msg.text()
    if (
      text.includes('boot') ||
      text.includes('auth') ||
      text.includes('phase') ||
      text.includes('profile') ||
      text.includes('session') ||
      text.includes('initialized') ||
      text.includes('degraded') ||
      text.includes('rehydrat')
    ) {
      console.log(`[${elapsed}ms] [CONSOLE ${msg.type()}] ${text}`)
    }
  })

  // Collect failed network requests
  const failedRequests: { url: string; status: number; time: number }[] = []
  const slowRequests: { url: string; duration: number; status: number }[] = []
  const pendingRequests = new Map<string, number>()

  page.on('request', (req) => {
    pendingRequests.set(req.url(), Date.now())
  })

  page.on('response', async (res) => {
    const url = res.url()
    const reqStart = pendingRequests.get(url)
    const elapsed = Date.now() - startTime

    if (reqStart) {
      const duration = Date.now() - reqStart
      pendingRequests.delete(url)

      if (duration > 3000) {
        slowRequests.push({ url, duration, status: res.status() })
        console.log(`[${elapsed}ms] [SLOW REQUEST] ${url} took ${duration}ms (status ${res.status()})`)
      }
    }

    if (res.status() >= 400) {
      failedRequests.push({ url, status: res.status(), time: elapsed })
      console.log(`[${elapsed}ms] [FAILED REQUEST] ${url} → ${res.status()}`)
    }

    // Log auth-related API responses
    if (url.includes('/auth/') || url.includes('/api/auth/')) {
      console.log(`[${elapsed}ms] [AUTH API] ${url} → ${res.status()}`)
    }
  })

  page.on('requestfailed', (req) => {
    const elapsed = Date.now() - startTime
    console.log(`[${elapsed}ms] [REQUEST FAILED] ${req.url()} → ${req.failure()?.errorText}`)
    pendingRequests.delete(req.url())
  })

  // Step 1: Navigate to app
  console.log('\n=== STEP 1: Navigating to app ===')
  await page.goto('http://localhost:3001', { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(2000)

  // Step 2: Check if already logged in by looking for auth state
  console.log('\n=== STEP 2: Checking current auth state ===')
  const currentUrl = page.url()
  console.log(`Current URL: ${currentUrl}`)

  // Check if we're on a logged-in page (e.g., /workflows) or the landing page
  const isLoggedIn = await page.evaluate(() => {
    // Check localStorage for Supabase auth
    const keys = Object.keys(localStorage)
    const authKeys = keys.filter(k => k.includes('supabase') || k.includes('auth'))
    console.log('Auth-related localStorage keys:', authKeys)

    // Check for Supabase session
    for (const key of keys) {
      if (key.includes('supabase') && key.includes('auth')) {
        try {
          const data = JSON.parse(localStorage.getItem(key) || '{}')
          if (data?.access_token || data?.session) {
            console.log('Found Supabase session in localStorage')
            return true
          }
        } catch { /* ignore */ }
      }
    }

    // Also check the auth store state
    for (const key of keys) {
      if (key.includes('auth') && key.includes('store')) {
        try {
          const data = JSON.parse(localStorage.getItem(key) || '{}')
          console.log('Auth store state:', JSON.stringify(data).substring(0, 500))
          if (data?.state?.user) {
            return true
          }
        } catch { /* ignore */ }
      }
    }

    return false
  })

  console.log(`Is logged in: ${isLoggedIn}`)

  if (isLoggedIn) {
    console.log('\n=== STEP 2b: Already logged in — logging out ===')

    // Try navigating to workflows first to see if loading issue reproduces
    await page.goto('http://localhost:3001/workflows', { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(3000)

    // Now sign out via Supabase
    await page.evaluate(async () => {
      // Clear auth from localStorage
      const keys = Object.keys(localStorage)
      for (const key of keys) {
        if (key.includes('supabase') || key.includes('auth')) {
          localStorage.removeItem(key)
          console.log(`Removed localStorage key: ${key}`)
        }
      }
    })

    // Navigate to auth/login or root to trigger sign out
    await page.goto('http://localhost:3001/auth/login', { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(2000)
    console.log(`After logout, URL: ${page.url()}`)
  }

  // Step 3: Pause for manual login
  console.log('\n=== STEP 3: Pausing for manual login ===')
  console.log('Please log in to the app in the browser window.')
  console.log('The test will resume automatically once you are redirected after login.')
  console.log('(Or press Resume in the Playwright inspector)')

  // Navigate to login page if not there
  if (!page.url().includes('/auth/login')) {
    await page.goto('http://localhost:3001/auth/login', { waitUntil: 'domcontentloaded' })
  }

  // PAUSE here — user logs in manually
  await page.pause()

  // Step 4: After login — monitor the loading behavior
  console.log('\n=== STEP 4: Monitoring post-login loading ===')
  const postLoginUrl = page.url()
  console.log(`Post-login URL: ${postLoginUrl}`)

  // Monitor auth boot phases by polling the Zustand store
  const phaseLog: { phase: string; time: number }[] = []
  let lastPhase = ''

  const monitorPhases = async (durationMs: number) => {
    const monitorStart = Date.now()
    while (Date.now() - monitorStart < durationMs) {
      const state = await page.evaluate(() => {
        try {
          // Access Zustand store directly
          const storeData = (window as any).__ZUSTAND_AUTH_STORE__
          if (storeData) {
            return {
              phase: storeData.phase,
              user: !!storeData.user,
              profile: !!storeData.profile,
              bootError: storeData.bootError,
            }
          }

          // Fallback: check localStorage
          const keys = Object.keys(localStorage)
          for (const key of keys) {
            if (key.includes('auth') && key.includes('store')) {
              try {
                const data = JSON.parse(localStorage.getItem(key) || '{}')
                return {
                  phase: data?.state?.phase || 'unknown',
                  user: !!data?.state?.user,
                  profile: !!data?.state?.profile,
                  bootError: data?.state?.bootError,
                  source: 'localStorage',
                }
              } catch { /* ignore */ }
            }
          }
          return { phase: 'unknown', user: false, profile: false }
        } catch (e) {
          return { phase: 'error-reading', error: String(e) }
        }
      })

      const elapsed = Date.now() - startTime
      if (state.phase !== lastPhase) {
        console.log(`[${elapsed}ms] [AUTH PHASE] ${lastPhase || 'initial'} → ${state.phase} (user=${state.user}, profile=${state.profile}${state.bootError ? ', error=' + state.bootError : ''})`)
        phaseLog.push({ phase: state.phase, time: elapsed })
        lastPhase = state.phase
      }

      await page.waitForTimeout(200)
    }
  }

  // Monitor for 15 seconds to see what happens
  console.log('Monitoring auth phases for 15 seconds...')
  await monitorPhases(15000)

  // Step 5: Check final state
  console.log('\n=== STEP 5: Final state analysis ===')
  const finalUrl = page.url()
  console.log(`Final URL: ${finalUrl}`)

  // Check what's visible on screen
  const pageState = await page.evaluate(() => {
    const body = document.body

    // Check for loading spinner
    const spinners = body.querySelectorAll('[class*="spinner"], [class*="loading"], [class*="animate-spin"]')
    const spinnerTexts = Array.from(spinners).map(s => s.textContent?.trim()).filter(Boolean)

    // Check for "Loading..." text
    const allText = body.innerText
    const hasLoadingText = allText.includes('Loading...')
    const hasRedirecting = allText.includes('Redirecting')

    // Check for the AuthReadyGuard's PageLoadingSpinner
    const loadingMessages = body.querySelectorAll('[class*="PageLoadingSpinner"], [role="status"]')

    // Check for the degraded banner
    const degradedBanner = body.querySelector('[class*="amber"]')

    // Check for main app content (sidebar, header)
    const hasSidebar = !!body.querySelector('[class*="sidebar"], nav')
    const hasHeader = !!body.querySelector('header')

    return {
      hasSpinners: spinners.length > 0,
      spinnerTexts,
      hasLoadingText,
      hasRedirecting,
      hasLoadingMessage: loadingMessages.length > 0,
      hasDegradedBanner: !!degradedBanner,
      degradedText: degradedBanner?.textContent?.trim(),
      hasSidebar,
      hasHeader,
      visibleText: allText.substring(0, 500),
    }
  })

  console.log('Page state:', JSON.stringify(pageState, null, 2))

  // Check for pending network requests (stuck fetches)
  if (pendingRequests.size > 0) {
    console.log('\n=== PENDING (stuck) network requests ===')
    for (const [url, startTs] of pendingRequests) {
      console.log(`  ${url} — pending for ${Date.now() - startTs}ms`)
    }
  }

  // Summary
  console.log('\n=== SUMMARY ===')
  console.log(`Auth phase transitions: ${phaseLog.map(p => p.phase).join(' → ')}`)
  console.log(`Failed requests: ${failedRequests.length}`)
  console.log(`Slow requests (>3s): ${slowRequests.length}`)
  console.log(`Final URL: ${finalUrl}`)
  console.log(`Page shows loading: ${pageState.hasLoadingText || pageState.hasSpinners}`)
  console.log(`Page shows app content: ${pageState.hasSidebar && pageState.hasHeader}`)

  if (pageState.hasLoadingText && !pageState.hasSidebar) {
    console.log('\n*** DIAGNOSIS: Page is stuck on loading spinner ***')
    console.log('The AuthReadyGuard is preventing content from rendering.')
    console.log('Auth boot phase never reached "ready" or "degraded".')
    if (phaseLog.length > 0) {
      console.log(`Last known phase: ${phaseLog[phaseLog.length - 1].phase}`)
    }
  }

  // Print relevant console errors
  const errors = consoleLogs.filter(l => l.type === 'error')
  if (errors.length > 0) {
    console.log('\n=== CONSOLE ERRORS ===')
    errors.forEach(e => console.log(`  [${e.time}ms] ${e.text}`))
  }

  // Keep browser open for manual inspection
  console.log('\n=== Test complete. Browser staying open for inspection. ===')
  console.log('Press Ctrl+C to close.')

  // Wait a long time so you can inspect
  await page.waitForTimeout(300000) // 5 minutes

  await browser.close()
})
