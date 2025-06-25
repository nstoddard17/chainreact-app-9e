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
      
      // Listen for window close/navigation events
      window.addEventListener('beforeunload', function() {
        // Only send if we haven't already sent a success/error message
        if (window.opener && !window.sentResponse) {
          try {
            window.opener.postMessage({
              type: 'oauth-cancelled',
              provider: '${safeProvider}',
              message: 'Authorization cancelled'
            }, '${baseUrl}');
          } catch (e) {
            console.error('Error sending cancel message:', e);
          }
        }
      });
      
      try {
        if (window.opener) {
          // Set flag to indicate we've sent a response
          window.sentResponse = true;
          
          window.opener.postMessage({
              type: 'oauth-${type}',
              provider: '${safeProvider}',
              message: '${safeMessage}'
          }, '${baseUrl}');
          // Ensure window closes even if postMessage fails
          setTimeout(() => window.close(), 1000);
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
          <button class="close-button" onclick="window.close()">Close Window</button>
        </div>
        ${script}
      </body>
    </html>
  `
  return new Response(html, { status, headers: { "Content-Type": "text/html" } })
}
