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
        logger.debug('📡 Sent OAuth response via BroadcastChannel');
        channel.close();
      } catch (e) {
        logger.debug('BroadcastChannel not available or failed:', e);
      }
      
      // Method 2: Store in localStorage for parent window to find (COOP-safe)
      try {
        localStorage.setItem('${storageKey}', JSON.stringify(responseData));
        logger.debug('Response stored in localStorage with key: ${storageKey}');
        logger.debug('Response data:', responseData);
      } catch (e) {
        logger.error('Failed to store in localStorage:', e);
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
              logger.debug('Cancel message sent to parent');
            }
            window.sentResponse = true;
          } catch (e) {
            logger.error('Error sending cancel message:', e);
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
              logger.debug('Sending message to parent window:', JSON.stringify(responseData));
              logger.debug('Target origin: ${baseUrl}');
              
              window.opener.postMessage(responseData, '*');
              logger.debug('Message sent successfully to parent window');
            }
            messageSent = true;
          } catch (e) {
            logger.error('Failed to send message:', e);
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
              logger.warn('Closing window without confirming message was sent');
            }
            window.close();
          }, closeDelay);
        } else {
          logger.debug('Auto-close disabled for this message');
        }
      } catch (e) {
        logger.error('Error in popup window:', e);
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
            font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            display: flex; 
            align-items: center; 
            justify-content: center; 
            height: 100vh; 
            margin: 0;
            background: white;
            color: #1a202c;
          }
          
          .container { 
            text-align: center; 
            padding: 2rem;
            background: ${type === "success" ? "#f3f4f6" : "#fef2f2"};
            border-radius: 12px;
            border: 2px solid ${type === "success" ? "#d1d5db" : "#fca5a5"};
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
          
          .status-icon { 
            width: 48px;
            height: 48px;
            margin: 0 auto 1rem;
            color: ${type === "success" ? "#10b981" : "#ef4444"};
          }
          
          h2 { 
            margin: 0 0 0.5rem; 
            color: #111827;
            font-size: 1.5rem;
            font-weight: 600;
          }
          
          .message { 
            margin: 0 0 1rem; 
            color: #6b7280;
            font-size: 1rem;
          }
          
          .subtitle {
            margin: 0;
            color: #9ca3af;
            font-size: 0.875rem;
          }
        </style>
      </head>
      <body>
        <div class="container">
          ${type === "success" 
            ? `<svg class="status-icon" viewBox="0 0 24 24" fill="none">
                <path d="M9 11L12 14L22 4" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                <path d="M21 12V19C21 20.1046 20.1046 21 19 21H5C3.89543 21 3 20.1046 3 19V5C3 3.89543 3.89543 3 5 3H16" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>`
            : `<svg class="status-icon" viewBox="0 0 24 24" fill="none">
                <path d="M12 9V13M12 17H12.01M12 3C7.02944 3 3 7.02944 3 12C3 16.9706 7.02944 21 12 21C16.9706 21 21 16.9706 21 12C21 7.02944 16.9706 3 12 3Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>`
          }
          
          <h2>${type === "success" ? "Success!" : "Connection Failed"}</h2>
          
          <p class="message">${safeProvider} ${type === "success" ? "has been connected successfully." : "connection failed."}</p>
          
          ${type === "success" 
            ? `<p class="subtitle">This window will close automatically...</p>` 
            : isPersonalAccountError 
              ? `<p class="subtitle">Please use a work or school Microsoft account instead.</p>`
              : `<p class="subtitle">Please try again or contact support if the issue persists.</p>`
          }
        </div>
        ${script}
      </body>
    </html>
  `
  return new Response(html, { status, headers: { "Content-Type": "text/html" } })
}
