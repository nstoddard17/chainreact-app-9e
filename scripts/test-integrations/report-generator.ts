/**
 * Test Report Generator
 *
 * Generates comprehensive HTML and JSON reports for integration tests.
 */

import * as fs from 'fs'
import * as path from 'path'

interface TestResult {
  provider: string
  type: 'action' | 'trigger'
  name: string
  passed: boolean
  error?: string
  duration: number
  skipped: boolean
  skipReason?: string
}

interface TestSummary {
  total: number
  passed: number
  failed: number
  skipped: number
  duration: number
  results: TestResult[]
}

/**
 * Generate HTML and JSON test reports
 */
export function generateReport(summary: TestSummary): string {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
  const reportDir = path.join(process.cwd(), 'test-reports')

  // Create reports directory if it doesn't exist
  if (!fs.existsSync(reportDir)) {
    fs.mkdirSync(reportDir, { recursive: true })
  }

  // Generate JSON report
  const jsonPath = path.join(reportDir, `integration-tests-${timestamp}.json`)
  fs.writeFileSync(
    jsonPath,
    JSON.stringify({
      timestamp: new Date().toISOString(),
      summary,
      results: summary.results,
    }, null, 2)
  )

  // Generate HTML report
  const htmlPath = path.join(reportDir, `integration-tests-${timestamp}.html`)
  fs.writeFileSync(htmlPath, generateHtmlReport(summary))

  // Generate latest symlink
  const latestHtmlPath = path.join(reportDir, 'latest.html')
  if (fs.existsSync(latestHtmlPath)) {
    fs.unlinkSync(latestHtmlPath)
  }
  fs.symlinkSync(htmlPath, latestHtmlPath)

  return htmlPath
}

/**
 * Generate HTML report
 */
function generateHtmlReport(summary: TestSummary): string {
  const passRate = Math.round((summary.passed / summary.total) * 100)
  const failRate = Math.round((summary.failed / summary.total) * 100)
  const skipRate = Math.round((summary.skipped / summary.total) * 100)

  // Group results by provider
  const byProvider = summary.results.reduce((acc, result) => {
    if (!acc[result.provider]) {
      acc[result.provider] = []
    }
    acc[result.provider].push(result)
    return acc
  }, {} as Record<string, TestResult[]>)

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Integration Test Report - ${new Date().toLocaleString()}</title>
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }

    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
      background: #f5f5f5;
      color: #333;
      padding: 20px;
    }

    .container {
      max-width: 1200px;
      margin: 0 auto;
      background: white;
      border-radius: 8px;
      box-shadow: 0 2px 8px rgba(0,0,0,0.1);
      overflow: hidden;
    }

    header {
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      padding: 30px;
    }

    h1 {
      font-size: 28px;
      margin-bottom: 10px;
    }

    .timestamp {
      opacity: 0.9;
      font-size: 14px;
    }

    .summary {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 20px;
      padding: 30px;
      border-bottom: 1px solid #e0e0e0;
    }

    .summary-card {
      background: #f9f9f9;
      padding: 20px;
      border-radius: 6px;
      border-left: 4px solid #667eea;
    }

    .summary-card.passed {
      border-left-color: #10b981;
    }

    .summary-card.failed {
      border-left-color: #ef4444;
    }

    .summary-card.skipped {
      border-left-color: #f59e0b;
    }

    .summary-card h3 {
      font-size: 14px;
      color: #666;
      margin-bottom: 8px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }

    .summary-card .value {
      font-size: 32px;
      font-weight: bold;
      color: #333;
    }

    .summary-card .percentage {
      font-size: 14px;
      color: #888;
      margin-top: 4px;
    }

    .results {
      padding: 30px;
    }

    .provider-section {
      margin-bottom: 40px;
    }

    .provider-header {
      display: flex;
      align-items: center;
      gap: 10px;
      margin-bottom: 15px;
      padding-bottom: 10px;
      border-bottom: 2px solid #667eea;
    }

    .provider-name {
      font-size: 20px;
      font-weight: 600;
      color: #333;
    }

    .provider-stats {
      margin-left: auto;
      font-size: 14px;
      color: #666;
    }

    .test-list {
      display: grid;
      gap: 10px;
    }

    .test-item {
      background: #f9f9f9;
      padding: 15px;
      border-radius: 6px;
      display: flex;
      align-items: center;
      gap: 15px;
      border-left: 4px solid transparent;
    }

    .test-item.passed {
      border-left-color: #10b981;
    }

    .test-item.failed {
      border-left-color: #ef4444;
      background: #fef2f2;
    }

    .test-item.skipped {
      border-left-color: #f59e0b;
      background: #fffbeb;
    }

    .test-icon {
      font-size: 20px;
      flex-shrink: 0;
    }

    .test-details {
      flex: 1;
    }

    .test-name {
      font-weight: 500;
      color: #333;
      margin-bottom: 4px;
    }

    .test-type {
      display: inline-block;
      padding: 2px 8px;
      background: #e0e0e0;
      border-radius: 4px;
      font-size: 11px;
      text-transform: uppercase;
      font-weight: 600;
      color: #666;
      margin-right: 8px;
    }

    .test-duration {
      font-size: 12px;
      color: #888;
    }

    .test-error {
      margin-top: 8px;
      padding: 10px;
      background: white;
      border-radius: 4px;
      font-size: 13px;
      color: #dc2626;
      font-family: 'Courier New', monospace;
      white-space: pre-wrap;
      word-break: break-word;
    }

    .test-skip-reason {
      margin-top: 8px;
      font-size: 13px;
      color: #92400e;
      font-style: italic;
    }

    footer {
      padding: 20px 30px;
      background: #f9f9f9;
      border-top: 1px solid #e0e0e0;
      text-align: center;
      color: #666;
      font-size: 14px;
    }

    .progress-bar {
      height: 6px;
      background: #e0e0e0;
      border-radius: 3px;
      overflow: hidden;
      margin-top: 15px;
    }

    .progress-fill {
      height: 100%;
      display: flex;
    }

    .progress-segment {
      height: 100%;
    }

    .progress-segment.passed {
      background: #10b981;
    }

    .progress-segment.failed {
      background: #ef4444;
    }

    .progress-segment.skipped {
      background: #f59e0b;
    }
  </style>
</head>
<body>
  <div class="container">
    <header>
      <h1>🧪 Integration Test Report</h1>
      <div class="timestamp">${new Date().toLocaleString()}</div>
    </header>

    <div class="summary">
      <div class="summary-card">
        <h3>Total Tests</h3>
        <div class="value">${summary.total}</div>
        <div class="percentage">Duration: ${(summary.duration / 1000).toFixed(2)}s</div>
      </div>

      <div class="summary-card passed">
        <h3>Passed</h3>
        <div class="value">${summary.passed}</div>
        <div class="percentage">${passRate}%</div>
      </div>

      <div class="summary-card failed">
        <h3>Failed</h3>
        <div class="value">${summary.failed}</div>
        <div class="percentage">${failRate}%</div>
      </div>

      <div class="summary-card skipped">
        <h3>Skipped</h3>
        <div class="value">${summary.skipped}</div>
        <div class="percentage">${skipRate}%</div>
      </div>
    </div>

    <div class="progress-bar">
      <div class="progress-fill">
        <div class="progress-segment passed" style="width: ${passRate}%"></div>
        <div class="progress-segment failed" style="width: ${failRate}%"></div>
        <div class="progress-segment skipped" style="width: ${skipRate}%"></div>
      </div>
    </div>

    <div class="results">
      ${Object.entries(byProvider).map(([provider, results]) => {
        const providerPassed = results.filter(r => r.passed).length
        const providerFailed = results.filter(r => !r.passed && !r.skipped).length
        const providerSkipped = results.filter(r => r.skipped).length

        return `
          <div class="provider-section">
            <div class="provider-header">
              <span class="provider-name">${provider.toUpperCase()}</span>
              <span class="provider-stats">
                ${providerPassed} passed / ${providerFailed} failed / ${providerSkipped} skipped
              </span>
            </div>

            <div class="test-list">
              ${results.map(result => `
                <div class="test-item ${result.passed ? 'passed' : result.skipped ? 'skipped' : 'failed'}">
                  <div class="test-icon">
                    ${result.passed ? '✅' : result.skipped ? '⏭️' : '❌'}
                  </div>
                  <div class="test-details">
                    <div class="test-name">${result.name}</div>
                    <div>
                      <span class="test-type">${result.type}</span>
                      ${!result.skipped ? `<span class="test-duration">${result.duration}ms</span>` : ''}
                    </div>
                    ${result.error ? `<div class="test-error">${result.error}</div>` : ''}
                    ${result.skipReason ? `<div class="test-skip-reason">Skipped: ${result.skipReason}</div>` : ''}
                  </div>
                </div>
              `).join('')}
            </div>
          </div>
        `
      }).join('')}
    </div>

    <footer>
      Generated by ChainReact Automated Integration Test Suite
    </footer>
  </div>
</body>
</html>
  `.trim()
}
