import { logger } from '@/lib/utils/logger'

/**
 * Creates a connecting/loading response for OAuth popup windows
 */
export function createConnectingResponse(provider: string) {
  const safeProvider = provider.replace(/[\\'"]/g, '\\$&');

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
  // Log the popup response creation for debugging
  logger.debug(`🔄 Creating popup response: type=${type}, provider=${provider}, message=${message}`)
  const title = type === "success" ? `${provider} Connection Successful` : `${provider} Connection Failed`
  const header = type === "success" ? `${provider} Connected!` : `Error Connecting ${provider}`
  const status = type === "success" ? 200 : 400

  // Ensure strings are properly escaped for JavaScript
  const safeProvider = provider.replace(/[\\'"]/g, '\\$&');
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

  const script = `
    <script>
      // Flag to track if we've already sent a response
      window.sentResponse = false;

      // Store provider and message as JavaScript variables (properly escaped)
      const providerName = '${safeProvider}';
      const messageText = '${safeMessage}';

      // Create response data object using the variables
      const responseData = {
        type: 'oauth-complete', // Use consistent message type
        success: ${type === 'success'},
        provider: providerName.replace(/\\\\(.)/g, '$1'), // Unescape the provider name
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

          body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            display: flex;
            align-items: center;
            justify-content: center;
            height: 100vh;
            margin: 0;
            background: ${type === "success"
              ? "linear-gradient(135deg, #667eea 0%, #764ba2 100%)"
              : "linear-gradient(135deg, #ff6b6b 0%, #ee5a24 100%)"};
            color: #1a202c;
            overflow: hidden;
          }

          .container {
            text-align: center;
            padding: 3rem 2rem;
            max-width: 500px;
            width: 90%;
            background: white;
            border-radius: 20px;
            box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
            animation: slideIn 0.4s cubic-bezier(0.34, 1.56, 0.64, 1);
            position: relative;
          }

          @keyframes slideIn {
            from {
              opacity: 0;
              transform: translateY(-30px) scale(0.9);
            }
            to {
              opacity: 1;
              transform: translateY(0) scale(1);
            }
          }

          .logo {
            width: 48px;
            height: 48px;
            margin: 0 auto 1.5rem;
            display: block;
          }

          .status-icon {
            width: 80px;
            height: 80px;
            margin: 0 auto 1.5rem;
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 3rem;
            font-weight: bold;
            animation: ${type === "success" ? "successPop" : "errorShake"} 0.6s ease-out;
            background: ${type === "success"
              ? "linear-gradient(135deg, #10b981 0%, #059669 100%)"
              : "linear-gradient(135deg, #ef4444 0%, #dc2626 100%)"};
            color: white;
            box-shadow: 0 8px 24px ${type === "success"
              ? "rgba(16, 185, 129, 0.3)"
              : "rgba(239, 68, 68, 0.3)"};
          }

          @keyframes successPop {
            0% {
              transform: scale(0);
              opacity: 0;
            }
            50% {
              transform: scale(1.1);
            }
            100% {
              transform: scale(1);
              opacity: 1;
            }
          }

          @keyframes errorShake {
            0%, 100% { transform: translateX(0); }
            10%, 30%, 50%, 70%, 90% { transform: translateX(-8px); }
            20%, 40%, 60%, 80% { transform: translateX(8px); }
          }

          h1 {
            margin: 0 0 0.75rem;
            color: #1a202c;
            font-size: 1.875rem;
            font-weight: 700;
            line-height: 1.2;
          }

          .provider-name {
            color: ${type === "success" ? "#10b981" : "#ef4444"};
            font-weight: 800;
          }

          .message {
            margin: 0 0 1.5rem;
            color: #4a5568;
            font-size: 1.125rem;
            line-height: 1.6;
          }

          .subtitle {
            margin: 0.5rem 0 0;
            color: #718096;
            font-size: 0.875rem;
            font-weight: 500;
          }

          .progress-bar {
            width: 100%;
            height: 4px;
            background: #e2e8f0;
            border-radius: 2px;
            overflow: hidden;
            margin: 1rem 0;
          }

          .progress-fill {
            height: 100%;
            background: ${type === "success"
              ? "linear-gradient(90deg, #10b981 0%, #059669 100%)"
              : "linear-gradient(90deg, #ef4444 0%, #dc2626 100%)"};
            width: 0%;
            animation: fillProgress 2s ease-out forwards;
            border-radius: 2px;
          }

          @keyframes fillProgress {
            to { width: 100%; }
          }

          .close-button {
            margin-top: 1.5rem;
            padding: 0.75rem 1.5rem;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            border: none;
            border-radius: 8px;
            color: white;
            cursor: pointer;
            font-weight: 600;
            font-size: 0.875rem;
            transition: all 0.2s ease;
            box-shadow: 0 4px 12px rgba(102, 126, 234, 0.3);
          }

          .close-button:hover {
            transform: translateY(-1px);
            box-shadow: 0 6px 16px rgba(102, 126, 234, 0.4);
          }

          .close-button:active {
            transform: translateY(0);
          }

          .brand-footer {
            margin-top: 1.5rem;
            padding-top: 1rem;
            border-top: 1px solid #e2e8f0;
            font-size: 0.75rem;
            color: #a0aec0;
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 0.5rem;
          }

          .brand-footer img {
            width: 16px;
            height: 16px;
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
