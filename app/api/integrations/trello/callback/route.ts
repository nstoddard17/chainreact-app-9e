import { type NextRequest } from "next/server"
import { createPopupResponse } from "@/lib/utils/createPopupResponse"
import { getBaseUrl } from "@/lib/utils/getBaseUrl"

function createTrelloInitialPage(baseUrl: string, state: string | null) {
  // Ensure state is safely encoded
  const safeState = state ? state.replace(/[\\'"]/g, '\\$&') : '';
  
  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <title>Connecting to Trello...</title>
        <script>
          async function processTrelloAuth() {
            const hash = window.location.hash.substring(1);
            const params = new URLSearchParams(hash);
            const token = params.get('token');
            const stateFromUrl = '${safeState}'; // Use state passed from server

            if (token && stateFromUrl) {
              try {
                const stateData = JSON.parse(atob(stateFromUrl));
                const { userId } = stateData;

                if (!userId) {
                  throw new Error('User ID not found in state');
                }

                const response = await fetch('/api/integrations/trello/process-token', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ token, userId }),
                });

                if (!response.ok) {
                  const errorData = await response.json();
                  throw new Error(errorData.error || 'Failed to process Trello token.');
                }
                
                // Add a delay to allow the database to update before posting the message
                await new Promise(resolve => setTimeout(resolve, 500));

                // Use the centralized popup response utility for consistency
                const responseData = {
                  type: 'oauth-success',
                  provider: 'trello',
                  message: 'Trello connected successfully!',
                  timestamp: new Date().toISOString()
                };

                // Store in localStorage for COOP-safe communication
                const storageKey = 'oauth_response_trello_' + Date.now();
                try {
                  localStorage.setItem(storageKey, JSON.stringify(responseData));
                } catch (e) {
                  console.error('Failed to store in localStorage:', e);
                }

                // Try postMessage if available
                if (window.opener) {
                  window.opener.postMessage(responseData, '${baseUrl}');
                }

              } catch (error) {
                const errorMessage = error.message ? error.message.replace(/[\\'"]/g, '\\$&') : 'An unknown error occurred.';
                
                // Use the centralized popup response utility for consistency
                const errorData = {
                  type: 'oauth-error',
                  provider: 'trello',
                  message: errorMessage,
                  timestamp: new Date().toISOString()
                };

                // Store in localStorage for COOP-safe communication
                const storageKey = 'oauth_response_trello_' + Date.now();
                try {
                  localStorage.setItem(storageKey, JSON.stringify(errorData));
                } catch (e) {
                  console.error('Failed to store in localStorage:', e);
                }

                // Try postMessage if available
                if (window.opener) {
                  window.opener.postMessage(errorData, '${baseUrl}');
                }
              } finally {
                // Ensure the window always closes
                setTimeout(() => window.close(), 1000);
              }
            } else {
              // Use the centralized popup response utility for consistency
              const errorData = {
                type: 'oauth-error',
                provider: 'trello',
                message: 'Trello authentication failed. Token not found.',
                timestamp: new Date().toISOString()
              };

              // Store in localStorage for COOP-safe communication
              const storageKey = 'oauth_response_trello_' + Date.now();
              try {
                localStorage.setItem(storageKey, JSON.stringify(errorData));
              } catch (e) {
                console.error('Failed to store in localStorage:', e);
              }

              // Try postMessage if available
              if (window.opener) {
                window.opener.postMessage(errorData, '${baseUrl}');
              }
              
              setTimeout(() => window.close(), 1000);
            }
          }
          processTrelloAuth();
        </script>
      </head>
      <body>
        <p>Please wait, connecting to Trello...</p>
      </body>
    </html>
  `
  return new Response(html, { status: 200, headers: { "Content-Type": "text/html" } })
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  // Trello provides the token in the URL fragment, not search params.
  // The state IS available in the query params on the first redirect.
  const state = searchParams.get("state")
  const error = searchParams.get("error")
  const errorDescription = searchParams.get("error_description")
  const baseUrl = getBaseUrl()
  const provider = "trello"

  if (error) {
    console.error(`Trello OAuth error: ${error} - ${errorDescription}`)
    return createPopupResponse("error", provider, errorDescription || "An unknown error occurred.", baseUrl)
  }

  // The GET request only serves the initial HTML page.
  // The client-side script will extract the token from the hash and call the process-token API endpoint.
  return createTrelloInitialPage(baseUrl, state)
}
