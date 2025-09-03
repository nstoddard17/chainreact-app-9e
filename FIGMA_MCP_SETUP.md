# MCP Setup Guide - Figma & Playwright

## Setup Status
✅ Figma MCP server installed globally (`figma-mcp@0.1.4`)
✅ Official Playwright MCP installed globally (`@playwright/mcp@0.0.36`)
✅ Project configuration added to `/mcp.json` (in repo)
✅ User configuration added to `~/.cursor/mcp.json`
✅ Environment variable added to `.env.local`
⚠️ Figma Personal Access Token needed

## Configuration Locations:

### Project Level (Committed to Git):
- **mcp.json**: `/Users/nathanielstoddard/chainreact-app/chainreact-app-9e/mcp.json`
- **Environment variable**: Added `FIGMA_PERSONAL_ACCESS_TOKEN` to `.env.local`

### User Level (Local Only):
- **User config**: `~/.cursor/mcp.json`
- To open: `open ~/.cursor/mcp.json` (macOS)

## To Complete Figma Setup:

1. **Get your Figma Personal Access Token:**
   - Go to https://www.figma.com/settings
   - Scroll down to "Personal access tokens"
   - Click "Generate new token"
   - Give it a descriptive name (e.g., "ChainReact MCP")
   - Copy the token (you won't be able to see it again!)

2. **Add the token to your environment:**
   - Open `.env.local` in your project
   - Find the line: `FIGMA_PERSONAL_ACCESS_TOKEN=""`
   - Add your token between the quotes
   - Save the file
   
   OR for user-level config:
   - Open `~/.cursor/mcp.json`
   - Replace `"${FIGMA_PERSONAL_ACCESS_TOKEN}"` with your actual token
   - Save the file

3. **Restart Cursor/Claude:**
   - Completely quit and restart Cursor
   - The MCP servers should now be active

## Playwright MCP Setup
✅ Official Playwright MCP installed (`@playwright/mcp@0.0.36`)
✅ Configuration added to `~/.cursor/mcp.json`
✅ No additional authentication needed
✅ Better than Puppeteer - supports Chrome, Firefox, Safari

## Available MCP Tools After Setup:

### Figma MCP Tools:
- Access to Figma files and designs
- Read design properties
- Export assets
- Navigate Figma file structure

### Playwright MCP Tools (Browser Automation):
- **Multi-browser support**: Chrome, Firefox, Safari, Edge
- **Browser navigation**: Navigate to URLs, go back/forward
- **Page interaction**: Click, type, select, drag & drop
- **Screenshot capture**: Full page or element screenshots
- **Form automation**: Fill forms, upload files
- **Web scraping**: Extract data from pages
- **Network interception**: Monitor and modify requests
- **Mobile emulation**: Test responsive designs
- **Console monitoring**: Capture console messages
- **Dialog handling**: Handle alerts, prompts, confirms

## Troubleshooting:

If MCP servers don't appear after restart:
1. Check that both packages are installed globally:
   ```bash
   npm list -g figma-mcp @playwright/mcp
   ```

2. Verify the mcp.json file is valid JSON:
   ```bash
   cat ~/.cursor/mcp.json | jq .
   ```

3. Ensure Playwright browsers are installed:
   ```bash
   npx playwright install
   ```

4. Check Cursor's MCP logs for errors (if available)

## Why Playwright over Puppeteer:
- **Multi-browser support**: Test in all major browsers, not just Chrome
- **More reliable**: Better auto-waiting and retry mechanisms
- **Faster execution**: Optimized for speed and stability
- **Better API**: More intuitive and powerful
- **Active development**: Maintained by Microsoft with frequent updates