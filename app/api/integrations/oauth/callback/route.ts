import type { NextRequest } from "next/server"
import { handleCallback } from "@/lib/oauth/oauthUtils"

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const code = searchParams.get("code")
    const state = searchParams.get("state")
    const provider = searchParams.get("provider")
    const error = searchParams.get("error")
    const errorDescription = searchParams.get("error_description")

    console.log("OAuth callback received:", { provider, code: !!code, state: !!state, error })

    // Get the app URL for proper origin
    const appUrl = process.env.NEXT_PUBLIC_SITE_URL || process.env.NEXT_PUBLIC_APP_URL || "https://chainreact.app"
    const origin = new URL(appUrl).origin

    // Handle OAuth errors from provider
    if (error) {
      console.error(`OAuth error for ${provider}:`, error, errorDescription)
      const errorMessage = errorDescription || error

      const errorHtml = `
        <!DOCTYPE html>
        <html>
        <head>
          <title>Connection Failed</title>
          <style>
            body { 
              font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
              display: flex; 
              align-items: center; 
              justify-content: center; 
              height: 100vh; 
              margin: 0;
              background: linear-gradient(135deg, #ff6b6b 0%, #ee5a24 100%);
              color: white;
            }
            .container { 
              text-align: center; 
              padding: 2rem;
              background: rgba(255,255,255,0.1);
              border-radius: 12px;
              backdrop-filter: blur(10px);
              max-width: 400px;
            }
            .error-icon { 
              font-size: 3rem; 
              margin-bottom: 1rem; 
            }
            h1 { 
              margin: 0 0 0.5rem 0; 
              font-size: 1.5rem;
            }
            p { 
              margin: 0.5rem 0; 
              opacity: 0.9;
              font-size: 0.9rem;
            }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="error-icon">❌</div>
            <h1>Connection Failed</h1>
            <p>${errorMessage}</p>
            <p>Closing window...</p>
          </div>
          <script>
            console.log('OAuth error page loaded');
            console.log('Window opener exists:', !!window.opener);
            console.log('Sending error message to origin:', '${origin}');
            
            // Send error message to parent window with correct origin
            if (window.opener && !window.opener.closed) {
              try {
                window.opener.postMessage({
                  type: 'oauth-error',
                  provider: '${provider || "unknown"}',
                  error: '${errorMessage.replace(/'/g, "\\'")}'
                }, '${origin}');
                console.log('Error message sent successfully');
              } catch (e) {
                console.error('Failed to send message:', e);
                // Fallback with wildcard
                try {
                  window.opener.postMessage({
                    type: 'oauth-error',
                    provider: '${provider || "unknown"}',
                    error: '${errorMessage.replace(/'/g, "\\'")}'
                  }, '*');
                } catch (e2) {
                  console.error('Fallback message also failed:', e2);
                }
              }
            } else {
              console.log('No opener window available');
            }
            
            // Close window after delay
            setTimeout(() => {
              console.log('Attempting to close window...');
              try {
                window.close();
              } catch (e) {
                console.error('Failed to close window:', e);
                window.location.href = 'about:blank';
              }
            }, 2000);
          </script>
        </body>
        </html>
      `

      return new Response(errorHtml, {
        headers: { "Content-Type": "text/html" },
      })
    }

    // Check for required parameters
    if (!code || !state) {
      console.error("Missing required parameters:", { code: !!code, state: !!state })

      const errorHtml = `
        <!DOCTYPE html>
        <html>
        <head>
          <title>Connection Failed</title>
          <style>
            body { 
              font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
              display: flex; 
              align-items: center; 
              justify-content: center; 
              height: 100vh; 
              margin: 0;
              background: linear-gradient(135deg, #ff6b6b 0%, #ee5a24 100%);
              color: white;
            }
            .container { 
              text-align: center; 
              padding: 2rem;
              background: rgba(255,255,255,0.1);
              border-radius: 12px;
              backdrop-filter: blur(10px);
              max-width: 400px;
            }
            .error-icon { 
              font-size: 3rem; 
              margin-bottom: 1rem; 
            }
            h1 { 
              margin: 0 0 0.5rem 0; 
              font-size: 1.5rem;
            }
            p { 
              margin: 0.5rem 0; 
              opacity: 0.9;
              font-size: 0.9rem;
            }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="error-icon">❌</div>
            <h1>Connection Failed</h1>
            <p>Missing required parameters from OAuth provider</p>
            <p>Closing window...</p>
          </div>
          <script>
            console.log('Missing parameters page loaded');
            
            if (window.opener && !window.opener.closed) {
              try {
                window.opener.postMessage({
                  type: 'oauth-error',
                  provider: '${provider || "unknown"}',
                  error: 'Missing required parameters'
                }, '${origin}');
              } catch (e) {
                console.error('Failed to send message:', e);
                try {
                  window.opener.postMessage({
                    type: 'oauth-error',
                    provider: '${provider || "unknown"}',
                    error: 'Missing required parameters'
                  }, '*');
                } catch (e2) {
                  console.error('Fallback message also failed:', e2);
                }
              }
            }
            
            setTimeout(() => {
              try {
                window.close();
              } catch (e) {
                window.location.href = 'about:blank';
              }
            }, 2000);
          </script>
        </body>
        </html>
      `

      return new Response(errorHtml, {
        headers: { "Content-Type": "text/html" },
      })
    }

    // Extract provider from state if not in query params
    let actualProvider = provider

    if (!actualProvider && state) {
      try {
        const stateData = JSON.parse(Buffer.from(state, "base64").toString())
        actualProvider = stateData.provider
        console.log("Extracted provider from state:", actualProvider)
      } catch (e) {
        console.error("Failed to parse state:", e)
      }
    }

    if (!actualProvider) {
      console.error("No provider identified")

      const errorHtml = `
        <!DOCTYPE html>
        <html>
        <head>
          <title>Connection Failed</title>
          <style>
            body { 
              font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
              display: flex; 
              align-items: center; 
              justify-content: center; 
              height: 100vh; 
              margin: 0;
              background: linear-gradient(135deg, #ff6b6b 0%, #ee5a24 100%);
              color: white;
            }
            .container { 
              text-align: center; 
              padding: 2rem;
              background: rgba(255,255,255,0.1);
              border-radius: 12px;
              backdrop-filter: blur(10px);
              max-width: 400px;
            }
            .error-icon { 
              font-size: 3rem; 
              margin-bottom: 1rem; 
            }
            h1 { 
              margin: 0 0 0.5rem 0; 
              font-size: 1.5rem;
            }
            p { 
              margin: 0.5rem 0; 
              opacity: 0.9;
              font-size: 0.9rem;
            }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="error-icon">❌</div>
            <h1>Connection Failed</h1>
            <p>Unable to identify the integration provider</p>
            <p>Closing window...</p>
          </div>
          <script>
            if (window.opener && !window.opener.closed) {
              try {
                window.opener.postMessage({
                  type: 'oauth-error',
                  provider: 'unknown',
                  error: 'Unable to identify provider'
                }, '${origin}');
              } catch (e) {
                try {
                  window.opener.postMessage({
                    type: 'oauth-error',
                    provider: 'unknown',
                    error: 'Unable to identify provider'
                  }, '*');
                } catch (e2) {
                  console.error('All message attempts failed:', e2);
                }
              }
            }
            
            setTimeout(() => {
              try {
                window.close();
              } catch (e) {
                window.location.href = 'about:blank';
              }
            }, 2000);
          </script>
        </body>
        </html>
      `

      return new Response(errorHtml, {
        headers: { "Content-Type": "text/html" },
      })
    }

    try {
      console.log(`Processing OAuth callback for ${actualProvider}`)
      const result = await handleCallback(actualProvider, code, state)
      console.log(`OAuth callback result for ${actualProvider}:`, { success: result.success, error: result.error })

      if (result.success) {
        // Success page that sends message to parent and closes
        const successHtml = `
          <!DOCTYPE html>
          <html>
          <head>
            <title>Connection Successful</title>
            <style>
              body { 
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                display: flex; 
                align-items: center; 
                justify-content: center; 
                height: 100vh; 
                margin: 0;
                background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                color: white;
              }
              .container { 
                text-align: center; 
                padding: 2rem;
                background: rgba(255,255,255,0.1);
                border-radius: 12px;
                backdrop-filter: blur(10px);
              }
              .success-icon { 
                font-size: 3rem; 
                margin-bottom: 1rem; 
              }
              h1 { 
                margin: 0 0 0.5rem 0; 
                font-size: 1.5rem;
              }
              p { 
                margin: 0; 
                opacity: 0.9;
              }
            </style>
          </head>
          <body>
            <div class="container">
              <div class="success-icon">✅</div>
              <h1>Connection Successful!</h1>
              <p>Your ${actualProvider} integration has been connected.</p>
              <p>Closing window...</p>
            </div>
            <script>
              console.log('OAuth success page loaded');
              console.log('Window opener exists:', !!window.opener);
              console.log('Window opener closed:', window.opener ? window.opener.closed : 'N/A');
              console.log('Sending success message to origin:', '${origin}');
              
              // Send success message to parent window with correct origin
              if (window.opener && !window.opener.closed) {
                try {
                  console.log('Sending success message...');
                  window.opener.postMessage({
                    type: 'oauth-success',
                    provider: '${actualProvider}',
                    timestamp: Date.now()
                  }, '${origin}');
                  console.log('Success message sent successfully');
                } catch (e) {
                  console.error('Failed to send success message:', e);
                  // Fallback with wildcard origin
                  try {
                    window.opener.postMessage({
                      type: 'oauth-success',
                      provider: '${actualProvider}',
                      timestamp: Date.now()
                    }, '*');
                    console.log('Fallback success message sent');
                  } catch (e2) {
                    console.error('Fallback success message also failed:', e2);
                  }
                }
              } else {
                console.log('No opener window available or opener is closed');
              }
              
              // Close window after delay
              setTimeout(() => {
                console.log('Attempting to close window...');
                try {
                  window.close();
                  console.log('Window.close() called');
                } catch (e) {
                  console.error('Failed to close window:', e);
                  // Fallback: try to navigate away
                  window.location.href = 'about:blank';
                }
              }, 1500);
              
              // Additional fallback
              setTimeout(() => {
                if (!window.closed) {
                  console.log('Window still open, trying alternative close methods...');
                  try {
                    window.location.href = 'about:blank';
                  } catch (e) {
                    console.error('All close methods failed:', e);
                  }
                }
              }, 3000);
            </script>
          </body>
          </html>
        `

        return new Response(successHtml, {
          headers: { "Content-Type": "text/html" },
        })
      } else {
        // Error page that sends message to parent and closes
        const errorMessage = result.error || "Connection failed"
        const errorHtml = `
          <!DOCTYPE html>
          <html>
          <head>
            <title>Connection Failed</title>
            <style>
              body { 
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                display: flex; 
                align-items: center; 
                justify-content: center; 
                height: 100vh; 
                margin: 0;
                background: linear-gradient(135deg, #ff6b6b 0%, #ee5a24 100%);
                color: white;
              }
              .container { 
                text-align: center; 
                padding: 2rem;
                background: rgba(255,255,255,0.1);
                border-radius: 12px;
                backdrop-filter: blur(10px);
                max-width: 400px;
              }
              .error-icon { 
                font-size: 3rem; 
                margin-bottom: 1rem; 
              }
              h1 { 
                margin: 0 0 0.5rem 0; 
                font-size: 1.5rem;
              }
              p { 
                margin: 0.5rem 0; 
                opacity: 0.9;
                font-size: 0.9rem;
              }
            </style>
          </head>
          <body>
            <div class="container">
              <div class="error-icon">❌</div>
              <h1>Connection Failed</h1>
              <p>${errorMessage}</p>
              <p>Closing window...</p>
            </div>
            <script>
              console.log('OAuth error page loaded');
              
              if (window.opener && !window.opener.closed) {
                try {
                  window.opener.postMessage({
                    type: 'oauth-error',
                    provider: '${actualProvider}',
                    error: '${errorMessage.replace(/'/g, "\\'")}'
                  }, '${origin}');
                } catch (e) {
                  console.error('Failed to send error message:', e);
                  try {
                    window.opener.postMessage({
                      type: 'oauth-error',
                      provider: '${actualProvider}',
                      error: '${errorMessage.replace(/'/g, "\\'")}'
                    }, '*');
                  } catch (e2) {
                    console.error('Fallback error message also failed:', e2);
                  }
                }
              }
              
              setTimeout(() => {
                try {
                  window.close();
                } catch (e) {
                  window.location.href = 'about:blank';
                }
              }, 2000);
            </script>
          </body>
          </html>
        `

        return new Response(errorHtml, {
          headers: { "Content-Type": "text/html" },
        })
      }
    } catch (error: any) {
      console.error(`OAuth callback error for ${actualProvider}:`, error)

      const errorHtml = `
        <!DOCTYPE html>
        <html>
        <head>
          <title>Connection Failed</title>
          <style>
            body { 
              font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
              display: flex; 
              align-items: center; 
              justify-content: center; 
              height: 100vh; 
              margin: 0;
              background: linear-gradient(135deg, #ff6b6b 0%, #ee5a24 100%);
              color: white;
            }
            .container { 
              text-align: center; 
              padding: 2rem;
              background: rgba(255,255,255,0.1);
              border-radius: 12px;
              backdrop-filter: blur(10px);
              max-width: 400px;
            }
            .error-icon { 
              font-size: 3rem; 
              margin-bottom: 1rem; 
            }
            h1 { 
              margin: 0 0 0.5rem 0; 
              font-size: 1.5rem;
            }
            p { 
              margin: 0.5rem 0; 
              opacity: 0.9;
              font-size: 0.9rem;
            }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="error-icon">❌</div>
            <h1>Connection Failed</h1>
            <p>${error.message || "An unexpected error occurred"}</p>
            <p>Closing window...</p>
          </div>
          <script>
            if (window.opener && !window.opener.closed) {
              try {
                window.opener.postMessage({
                  type: 'oauth-error',
                  provider: '${actualProvider}',
                  error: '${(error.message || "An unexpected error occurred").replace(/'/g, "\\'")}'
                }, '${origin}');
              } catch (e) {
                try {
                  window.opener.postMessage({
                    type: 'oauth-error',
                    provider: '${actualProvider}',
                    error: '${(error.message || "An unexpected error occurred").replace(/'/g, "\\'")}'
                  }, '*');
                } catch (e2) {
                  console.error('All message attempts failed:', e2);
                }
              }
            }
            
            setTimeout(() => {
              try {
                window.close();
              } catch (e) {
                window.location.href = 'about:blank';
              }
            }, 2000);
          </script>
        </body>
        </html>
      `

      return new Response(errorHtml, {
        headers: { "Content-Type": "text/html" },
      })
    }
  } catch (error: any) {
    console.error("OAuth callback error:", error)

    const appUrl = process.env.NEXT_PUBLIC_SITE_URL || process.env.NEXT_PUBLIC_APP_URL || "https://chainreact.app"
    const origin = new URL(appUrl).origin

    const errorHtml = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Connection Failed</title>
        <style>
          body { 
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            display: flex; 
            align-items: center; 
            justify-content: center; 
            height: 100vh; 
            margin: 0;
            background: linear-gradient(135deg, #ff6b6b 0%, #ee5a24 100%);
            color: white;
          }
          .container { 
            text-align: center; 
            padding: 2rem;
            background: rgba(255,255,255,0.1);
            border-radius: 12px;
            backdrop-filter: blur(10px);
            max-width: 400px;
          }
          .error-icon { 
            font-size: 3rem; 
            margin-bottom: 1rem; 
          }
          h1 { 
            margin: 0 0 0.5rem 0; 
            font-size: 1.5rem;
          }
          p { 
            margin: 0.5rem 0; 
            opacity: 0.9;
            font-size: 0.9rem;
          }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="error-icon">❌</div>
          <h1>Connection Failed</h1>
          <p>An unexpected error occurred during the OAuth callback</p>
          <p>Closing window...</p>
        </div>
        <script>
          if (window.opener && !window.opener.closed) {
            try {
              window.opener.postMessage({
                type: 'oauth-error',
                provider: 'unknown',
                error: 'OAuth callback failed'
              }, '${origin}');
            } catch (e) {
              try {
                window.opener.postMessage({
                  type: 'oauth-error',
                  provider: 'unknown',
                  error: 'OAuth callback failed'
                }, '*');
              } catch (e2) {
                console.error('All message attempts failed:', e2);
              }
            }
          }
          
          setTimeout(() => {
            try {
              window.close();
            } catch (e) {
              window.location.href = 'about:blank';
            }
          }, 2000);
        </script>
      </body>
      </html>
    `

    return new Response(errorHtml, {
      headers: { "Content-Type": "text/html" },
    })
  }
}
