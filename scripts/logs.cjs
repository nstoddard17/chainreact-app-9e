#!/usr/bin/env node

const fs = require('fs')
const path = require('path')
const { spawn } = require('child_process')

// Get command from arguments
const command = process.argv[2] || 'help'
const logDir = path.join(process.cwd(), 'logs')

// Helper function to get latest log file
function getLatestLogFile() {
  if (!fs.existsSync(logDir)) {
    console.log('❌ No logs directory found. Make sure logging is enabled.')
    return null
  }

  const files = fs.readdirSync(logDir)
    .filter(file => file.endsWith('.log'))
    .map(file => ({
      name: file,
      path: path.join(logDir, file),
      mtime: fs.statSync(path.join(logDir, file)).mtime
    }))
    .sort((a, b) => b.mtime - a.mtime)

  if (files.length === 0) {
    console.log('❌ No log files found. Run the app with ENABLE_FILE_LOGGING=true')
    return null
  }

  return files[0].path
}

// Commands
const commands = {
  help: () => {
    console.log(`
📁 ChainReact Log Viewer
========================

Commands:
  npm run logs              - Show this help
  npm run logs:view         - View the latest log file
  npm run logs:tail         - Tail the latest log file (real-time)
  npm run logs:list         - List all log files
  npm run logs:clear        - Clear all log files
  npm run logs:open         - Open logs directory in file explorer

Tips:
  - Logs are stored in: ${logDir}
  - To enable logging, set ENABLE_FILE_LOGGING=true in .env.local
  - Logs rotate automatically when they reach 100MB
    `)
  },

  view: () => {
    const logFile = getLatestLogFile()
    if (!logFile) return

    console.log(`📄 Viewing: ${path.basename(logFile)}`)
    console.log('─'.repeat(80))

    const content = fs.readFileSync(logFile, 'utf-8')
    console.log(content)
  },

  tail: () => {
    const logFile = getLatestLogFile()
    if (!logFile) return

    console.log(`📄 Tailing: ${path.basename(logFile)}`)
    console.log(`Press Ctrl+C to stop`)
    console.log('─'.repeat(80))

    // Use tail command on Unix-like systems
    const isWindows = process.platform === 'win32'

    if (isWindows) {
      // For Windows, use PowerShell Get-Content with -Wait
      const ps = spawn('powershell.exe', [
        '-Command',
        `Get-Content "${logFile}" -Wait -Tail 50`
      ], { stdio: 'inherit' })

      process.on('SIGINT', () => {
        ps.kill()
        process.exit()
      })
    } else {
      // For Mac/Linux, use tail
      const tail = spawn('tail', ['-f', logFile], { stdio: 'inherit' })

      process.on('SIGINT', () => {
        tail.kill()
        process.exit()
      })
    }
  },

  list: () => {
    if (!fs.existsSync(logDir)) {
      console.log('❌ No logs directory found.')
      return
    }

    const files = fs.readdirSync(logDir)
      .filter(file => file.endsWith('.log'))
      .map(file => {
        const filePath = path.join(logDir, file)
        const stats = fs.statSync(filePath)
        return {
          name: file,
          size: (stats.size / 1024 / 1024).toFixed(2) + ' MB',
          modified: stats.mtime.toLocaleString()
        }
      })
      .sort((a, b) => new Date(b.modified) - new Date(a.modified))

    if (files.length === 0) {
      console.log('❌ No log files found.')
      return
    }

    console.log(`📁 Log Files (${files.length} total)`)
    console.log('─'.repeat(80))

    files.forEach((file, index) => {
      const marker = index === 0 ? '→' : ' '
      console.log(`${marker} ${file.name.padEnd(40)} ${file.size.padEnd(10)} ${file.modified}`)
    })
  },

  clear: () => {
    if (!fs.existsSync(logDir)) {
      console.log('❌ No logs directory found.')
      return
    }

    const files = fs.readdirSync(logDir)
      .filter(file => file.endsWith('.log'))

    if (files.length === 0) {
      console.log('✅ No log files to clear.')
      return
    }

    // Ask for confirmation
    console.log(`⚠️  This will delete ${files.length} log file(s).`)
    console.log('Press Ctrl+C to cancel, or any other key to continue...')

    process.stdin.setRawMode(true)
    process.stdin.resume()
    process.stdin.once('data', () => {
      files.forEach(file => {
        fs.unlinkSync(path.join(logDir, file))
      })
      console.log(`✅ Cleared ${files.length} log file(s).`)
      process.exit()
    })
  },

  open: () => {
    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true })
    }

    const platform = process.platform
    let command

    if (platform === 'darwin') {
      command = 'open'
    } else if (platform === 'win32') {
      command = 'explorer'
    } else {
      command = 'xdg-open'
    }

    spawn(command, [logDir], { detached: true }).unref()
    console.log(`📁 Opening logs directory: ${logDir}`)
  }
}

// Execute command
const cmd = command.replace(':', '')
if (commands[cmd]) {
  commands[cmd]()
} else {
  console.log(`❌ Unknown command: ${command}`)
  commands.help()
}