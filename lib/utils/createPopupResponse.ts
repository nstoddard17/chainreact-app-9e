import { logger } from '@/lib/utils/logger'
import { getProviderDisplayName } from '@/lib/utils/provider-names'

/**
 * Creates a connecting/loading response for OAuth popup windows
 */
export function createConnectingResponse(provider: string) {
  const displayName = getProviderDisplayName(provider)
  const safeProvider = displayName.replace(/[\\'"]/g, '\\$&');

  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <title>Connecting to ${safeProvider}</title>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <style>
          * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
          }

          body {
            font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            display: flex;
            align-items: center;
            justify-content: center;
            height: 100vh;
            margin: 0;
            background: white;
          }

          .container {
            text-align: center;
            padding: 2rem;
            background: #f9fafb;
            border-radius: 12px;
            border: 2px solid #e5e7eb;
            animation: fadeIn 0.3s ease-out;
          }

          @keyframes fadeIn {
            from {
              opacity: 0;
              transform: scale(0.95);
            }
            to {
              opacity: 1;
              transform: scale(1);
            }
          }

          .spinner {
            width: 48px;
            height: 48px;
            border: 3px solid #e5e7eb;
            border-top: 3px solid #6b7280;
            border-radius: 50%;
            animation: spin 1s linear infinite;
            margin: 0 auto 1rem;
          }

          @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
          }

          h2 {
            margin: 0 0 0.5rem;
            color: #111827;
            font-size: 1.5rem;
            font-weight: 600;
          }

          .message {
            margin: 0;
            color: #6b7280;
            font-size: 0.875rem;
          }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="spinner"></div>
          <h2>Connecting to ${safeProvider}</h2>
          <p class="message">Please wait while we complete the connection...</p>
        </div>
      </body>
    </html>
  `

  return new Response(html, {
    status: 200,
    headers: { "Content-Type": "text/html" }
  })
}

/**
 * Creates a response for OAuth popup windows that communicates with the parent window
 * using both postMessage and localStorage for COOP policy compatibility
 */
function serializePayloadForScript(payload: Record<string, any>): string {
  return JSON.stringify(payload)
    .replace(/\\/g, "\\\\")
    .replace(/'/g, "\\'")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029")
    .replace(/\n/g, "\\n")
    .replace(/\r/g, "\\r")
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
}

export function createPopupResponse(
  type: "success" | "error",
  provider: string,
  message: string,
  baseUrl: string,
  options?: { autoClose?: boolean; payload?: Record<string, any> }
) {
  // Get proper display name for the provider
  const displayName = getProviderDisplayName(provider)

  // Log the popup response creation for debugging
  logger.debug(`🔄 Creating popup response: type=${type}, provider=${provider}, displayName=${displayName}, message=${message}`)
  const title = type === "success" ? `${displayName} Connection Successful` : `${displayName} Connection Failed`
  const header = type === "success" ? `${displayName} Connected!` : `Error Connecting ${displayName}`
  const status = type === "success" ? 200 : 400

  // Ensure strings are properly escaped for JavaScript
  const safeProvider = displayName.replace(/[\\'"]/g, '\\$&');
  const safeMessage = message.replace(/[\\'"]/g, '\\$&');

  // Create a unique storage key for this response (sanitize for key safety)
  const storageKey = `oauth_response_${provider.replace(/[^a-zA-Z0-9_-]/g, '_')}_${Date.now()}`;

  // Determine if this is a personal account error that shouldn't auto-close
  const isPersonalAccountError = type === 'error' &&
    (message.includes('Personal Microsoft accounts') ||
     message.includes('personal Microsoft accounts') ||
     message.includes('work or school account'));

  // Don't auto-close for errors unless explicitly set, especially for personal account errors
  const shouldAutoClose = options?.autoClose !== undefined
    ? options.autoClose
    : (type === 'success' || !isPersonalAccountError);

  const payloadScript = options?.payload
    ? `      const payloadData = JSON.parse('${serializePayloadForScript(options.payload)}');
      Object.assign(responseData, payloadData);
`
    : ''

  // Escape the original provider ID for the script
  const safeProviderId = provider.replace(/[\\'"]/g, '\\$&');

  const script = `
    <script>
      // Flag to track if we've already sent a response
      window.sentResponse = false;

      // Store provider (original ID for integration store) and message as JavaScript variables (properly escaped)
      const providerName = '${safeProvider}';
      const providerId = '${safeProviderId}';
      const messageText = '${safeMessage}';

      // Create response data object using the variables
      const responseData = {
        type: 'oauth-complete', // Use consistent message type
        success: ${type === 'success'},
        provider: providerId.replace(/\\\\(.)/g, '$1'), // Use original provider ID for integration store
        providerDisplayName: providerName.replace(/\\\\(.)/g, '$1'), // Pretty name for UI display
        message: messageText.replace(/\\\\(.)/g, '$1'), // Unescape the message
        error: ${type === 'error'} ? messageText.replace(/\\\\(.)/g, '$1') : null,
        timestamp: new Date().toISOString()
      };
${payloadScript}

      // Method 1: Try BroadcastChannel (works across same-origin contexts)
      try {
        const channel = new BroadcastChannel('oauth_channel');
        channel.postMessage(responseData);
        console.log('📡 Sent OAuth response via BroadcastChannel');
        channel.close();
      } catch (e) {
        console.log('BroadcastChannel not available or failed:', e);
      }

      // Method 2: Store in localStorage for parent window to find (COOP-safe)
      try {
        localStorage.setItem('${storageKey}', JSON.stringify(responseData));
        console.log('Response stored in localStorage with key: ${storageKey}');
        console.log('Response data:', responseData);
      } catch (e) {
        console.error('Failed to store in localStorage:', e);
      }

      // More robust handling of window closing
      function sendCancelMessage() {
        if (!window.sentResponse) {
          try {
            // Store cancellation in localStorage
            const cancelData = {
              type: 'oauth-cancelled',
              provider: providerName.replace(/\\\\(.)/g, '$1'), // Use unescaped provider name
              message: 'Authorization cancelled',
              timestamp: new Date().toISOString()
            };
            localStorage.setItem('${storageKey}_cancel', JSON.stringify(cancelData));

            // Also try postMessage if possible
            if (window.opener) {
              window.opener.postMessage(cancelData, '*');
              console.log('Cancel message sent to parent');
            }
            window.sentResponse = true;
          } catch (e) {
            console.error('Error sending cancel message:', e);
          }
        }
      }

      // Listen for window close/navigation events
      window.addEventListener('beforeunload', function(e) {
        sendCancelMessage();
      });

      try {
        // Set flag to indicate we've sent a response
        window.sentResponse = true;

        // Send message with retry logic
        let messageSent = false;
        let retryCount = 0;
        const maxRetries = 3;

        const sendMessage = () => {
          try {
            // Try postMessage if opener is available
            if (window.opener) {
              console.log('Sending message to parent window:', JSON.stringify(responseData));
              console.log('Target origin: ${baseUrl}');

              window.opener.postMessage(responseData, '*');
              console.log('Message sent successfully to parent window');
            }
            messageSent = true;
          } catch (e) {
            console.error('Failed to send message:', e);
            retryCount++;
            if (retryCount < maxRetries) {
              setTimeout(sendMessage, 500);
            }
          }
        };

        sendMessage();

        // Only auto-close if configured to do so
        const shouldAutoClose = ${shouldAutoClose};
        if (shouldAutoClose) {
          // Ensure window closes after a delay, regardless of message success
          // Microsoft providers need more time to ensure the message is received
          const isMicrosoftProvider = ['microsoft-onenote', 'onenote', 'microsoft-outlook', 'outlook', 'teams', 'onedrive'].includes('${safeProvider}');
          const closeDelay = isMicrosoftProvider ? 3000 : 2000;
          setTimeout(() => {
            if (!messageSent) {
              console.warn('Closing window without confirming message was sent');
            }
            window.close();
          }, closeDelay);
        } else {
          console.log('Auto-close disabled for this message');
        }
      } catch (e) {
        console.error('Error in popup window:', e);
        // Only force close if auto-close is enabled
        if (${shouldAutoClose}) {
          setTimeout(() => window.close(), 1000);
        }
      }
    </script>
  `
  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <title>${title}</title>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <style>
          * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
          }

          @media (prefers-color-scheme: dark) {
            :root {
              --bg-primary: #0a0a0a;
              --bg-secondary: #1a1a1a;
              --border-color: rgba(255, 255, 255, 0.1);
              --text-primary: #ffffff;
              --text-secondary: rgba(255, 255, 255, 0.6);
              --success-bg: rgba(34, 197, 94, 0.1);
              --success-border: rgba(34, 197, 94, 0.3);
              --success-color: #22c55e;
              --error-bg: rgba(239, 68, 68, 0.1);
              --error-border: rgba(239, 68, 68, 0.3);
              --error-color: #ef4444;
            }
          }

          @media (prefers-color-scheme: light) {
            :root {
              --bg-primary: #ffffff;
              --bg-secondary: #f9fafb;
              --border-color: #e5e7eb;
              --text-primary: #111827;
              --text-secondary: #6b7280;
              --success-bg: rgba(34, 197, 94, 0.1);
              --success-border: rgba(34, 197, 94, 0.2);
              --success-color: #16a34a;
              --error-bg: rgba(239, 68, 68, 0.1);
              --error-border: rgba(239, 68, 68, 0.2);
              --error-color: #dc2626;
            }
          }

          body {
            font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            display: flex;
            align-items: center;
            justify-content: center;
            height: 100vh;
            margin: 0;
            background: var(--bg-primary);
            color: var(--text-primary);
            overflow: hidden;
          }

          .container {
            text-align: center;
            padding: 3rem 2rem;
            max-width: 450px;
            width: 90%;
            background: var(--bg-secondary);
            border-radius: 16px;
            border: 1px solid var(--border-color);
            box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06);
            animation: slideIn 0.3s ease-out;
            position: relative;
          }

          @keyframes slideIn {
            from {
              opacity: 0;
              transform: translateY(10px);
            }
            to {
              opacity: 1;
              transform: translateY(0);
            }
          }

          .logo {
            width: 40px;
            height: 40px;
            margin: 0 auto 2rem;
            display: block;
          }

          .status-icon {
            width: 72px;
            height: 72px;
            margin: 0 auto 1.5rem;
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 2.5rem;
            animation: ${type === "success" ? "successPop" : "errorShake"} 0.5s ease-out;
            background: ${type === "success" ? "var(--success-bg)" : "var(--error-bg)"};
            border: 2px solid ${type === "success" ? "var(--success-border)" : "var(--error-border)"};
            color: ${type === "success" ? "var(--success-color)" : "var(--error-color)"};
          }

          @keyframes successPop {
            0% {
              transform: scale(0);
              opacity: 0;
            }
            50% {
              transform: scale(1.05);
            }
            100% {
              transform: scale(1);
              opacity: 1;
            }
          }

          @keyframes errorShake {
            0%, 100% { transform: translateX(0); }
            25% { transform: translateX(-6px); }
            75% { transform: translateX(6px); }
          }

          h1 {
            margin: 0 0 0.5rem;
            color: var(--text-primary);
            font-size: 1.5rem;
            font-weight: 600;
            line-height: 1.3;
          }

          .provider-name {
            color: ${type === "success" ? "var(--success-color)" : "var(--error-color)"};
            font-weight: 700;
          }

          .message {
            margin: 0 0 1.5rem;
            color: var(--text-secondary);
            font-size: 0.95rem;
            line-height: 1.5;
          }

          .subtitle {
            margin: 0.5rem 0 0;
            color: var(--text-secondary);
            font-size: 0.875rem;
          }

          .progress-bar {
            width: 100%;
            height: 3px;
            background: var(--border-color);
            border-radius: 2px;
            overflow: hidden;
            margin: 1.5rem 0 0;
          }

          .progress-fill {
            height: 100%;
            background: ${type === "success" ? "var(--success-color)" : "var(--error-color)"};
            width: 0%;
            animation: fillProgress 2s ease-out forwards;
            border-radius: 2px;
          }

          @keyframes fillProgress {
            to { width: 100%; }
          }

          .close-button {
            margin-top: 1.5rem;
            padding: 0.625rem 1.25rem;
            background: var(--text-primary);
            color: var(--bg-primary);
            border: none;
            border-radius: 8px;
            cursor: pointer;
            font-weight: 500;
            font-size: 0.875rem;
            transition: all 0.2s ease;
          }

          @media (prefers-color-scheme: dark) {
            .close-button {
              background: rgba(255, 255, 255, 0.9);
              color: #0a0a0a;
            }
            .close-button:hover {
              background: rgba(255, 255, 255, 1);
            }
          }

          @media (prefers-color-scheme: light) {
            .close-button {
              background: #111827;
              color: #ffffff;
            }
            .close-button:hover {
              background: #1f2937;
            }
          }

          .close-button:hover {
            transform: translateY(-1px);
          }

          .close-button:active {
            transform: translateY(0);
          }

          .brand-footer {
            margin-top: 2rem;
            padding-top: 1rem;
            border-top: 1px solid var(--border-color);
            font-size: 0.75rem;
            color: var(--text-secondary);
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 0.5rem;
          }

          .brand-footer img {
            width: 14px;
            height: 14px;
            opacity: 0.6;
          }
        </style>
      </head>
      <body>
        <div class="container">
          <img src="/logo.svg" alt="ChainReact" class="logo" onerror="this.style.display='none'">

          <div class="status-icon">
            ${type === "success" ? "✓" : "✗"}
          </div>

          <h1>
            ${type === "success"
              ? `<span class="provider-name">${safeProvider}</span> Connected!`
              : `<span class="provider-name">${safeProvider}</span> Connection Failed`
            }
          </h1>

          <p class="message">${safeMessage}</p>

          ${type === "success"
            ? `<p class="subtitle">This window will close automatically...</p>
               <div class="progress-bar">
                 <div class="progress-fill"></div>
               </div>`
            : isPersonalAccountError
              ? `<p class="subtitle">Please use a work or school Microsoft account instead.</p>
                 <button class="close-button" onclick="window.close()">Close Window</button>`
              : `<p class="subtitle">Please try again or contact support if the issue persists.</p>
                 <button class="close-button" onclick="window.close()">Try Again</button>`
          }

          <div class="brand-footer">
            <img src="/logo.svg" alt="ChainReact" onerror="this.style.display='none'">
            <span>Powered by ChainReact</span>
          </div>
        </div>
        ${script}
      </body>
    </html>
  `
  return new Response(html, { status, headers: { "Content-Type": "text/html" } })
}
