export function createPopupResponse(
  type: "success" | "error",
  provider: string,
  message: string,
  baseUrl: string,
) {
  const title = type === "success" ? `${provider} Connection Successful` : `${provider} Connection Failed`
  const header = type === "success" ? `${provider} Connected!` : `Error Connecting ${provider}`
  const status = type === "success" ? 200 : 400
  
  // Ensure strings are properly escaped for JavaScript
  const safeProvider = provider.replace(/[\\'"]/g, '\\$&');
  const safeMessage = message.replace(/[\\'"]/g, '\\$&');
  
  const script = `
    <script>
      // Flag to track if we've already sent a response
      window.sentResponse = false;
      
      // More robust handling of window closing
      function sendCancelMessage() {
        if (window.opener && !window.sentResponse) {
          try {
            window.opener.postMessage({
              type: 'oauth-cancelled',
              provider: '${safeProvider}',
              message: 'Authorization cancelled'
            }, '${baseUrl}');
            console.log('Cancel message sent to parent');
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
      
      // Periodic check to notify parent if connection is lost
      let connectionCheckInterval = setInterval(function() {
        if (window.opener === null) {
          console.log('Lost connection to parent window');
          clearInterval(connectionCheckInterval);
          window.close();
        }
      }, 1000);
      
      try {
        if (window.opener) {
          // Set flag to indicate we've sent a response
          window.sentResponse = true;
          
          // Send message with retry logic
          let messageSent = false;
          let retryCount = 0;
          const maxRetries = 3;
          
          const sendMessage = () => {
            try {
              window.opener.postMessage({
                  type: 'oauth-${type}',
                  provider: '${safeProvider}',
                  message: '${safeMessage}'
              }, '${baseUrl}');
              messageSent = true;
              console.log('Message sent successfully to parent window');
            } catch (e) {
              console.error('Failed to send message:', e);
              retryCount++;
              if (retryCount < maxRetries) {
                setTimeout(sendMessage, 500);
              }
            }
          };
          
          sendMessage();
          
          // Ensure window closes after a delay, regardless of message success
          setTimeout(() => {
            if (!messageSent) {
              console.warn('Closing window without confirming message was sent');
            }
            window.close();
          }, 2000);
        } else {
           document.getElementById('message').innerText = 'Something went wrong. Please close this window and try again.';
        }
      } catch (e) {
        console.error('Error in popup window:', e);
        // Force close the window even if an error occurs
        setTimeout(() => window.close(), 1000);
      }
    </script>
  `
  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <title>${title}</title>
        <style>
          body { 
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            display: flex; 
            align-items: center; 
            justify-content: center; 
            height: 100vh; 
            margin: 0;
            background: ${type === "success" ? "linear-gradient(135deg, #24c6dc 0%, #514a9d 100%)" : "linear-gradient(135deg, #ff6b6b 0%, #ee5a24 100%)"};
            color: white;
          }
          .container { 
            text-align: center; 
            padding: 2rem;
            background: rgba(255,255,255,0.1);
            border-radius: 12px;
            backdrop-filter: blur(10px);
          }
          .icon { font-size: 3rem; margin-bottom: 1rem; }
          h1 { margin: 0 0 0.5rem 0; font-size: 1.5rem; }
          p { margin: 0.5rem 0; opacity: 0.9; }
          .close-button {
            margin-top: 1rem;
            padding: 0.5rem 1rem;
            background: rgba(255,255,255,0.2);
            border: none;
            border-radius: 4px;
            color: white;
            cursor: pointer;
          }
          .close-button:hover {
            background: rgba(255,255,255,0.3);
          }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="icon">${type === "success" ? "✅" : "❌"}</div>
          <h1 id="header">${header}</h1>
          <p id="message">${message}</p>
          <p>This window will close automatically...</p>
          <button class="close-button" onclick="sendCancelMessage(); window.close()">Close Window</button>
        </div>
        ${script}
      </body>
    </html>
  `
  return new Response(html, { status, headers: { "Content-Type": "text/html" } })
}
