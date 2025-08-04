'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';

export default function DebugOAuthPage() {
  const [results, setResults] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [provider, setProvider] = useState('google-calendar');

  const testOAuthRedirect = async () => {
    try {
      setLoading(true);
      setError(null);
      
      const response = await fetch('/api/debug-oauth-redirect', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ provider }),
      });
      
      const data = await response.json();
      setResults(data);
      
      if (data.testUrl) {
        // Open the OAuth URL in a new window
        window.open(data.testUrl, 'oauth_test_popup', 'width=600,height=700,scrollbars=yes');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  };

  const testOAuthGeneration = async () => {
    try {
      setLoading(true);
      setError(null);
      
      // Get the user session
      const sessionResponse = await fetch('/api/auth/session');
      const sessionData = await sessionResponse.json();
      
      if (!sessionData?.access_token) {
        setError('Not authenticated. Please sign in first.');
        return;
      }
      
      // Generate the OAuth URL
      const response = await fetch('/api/integrations/auth/generate-url', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${sessionData.access_token}`,
        },
        body: JSON.stringify({ provider }),
      });
      
      const data = await response.json();
      setResults(data);
      
      if (data.authUrl) {
        // Open the OAuth URL in a new window
        window.open(data.authUrl, 'oauth_test_popup', 'width=600,height=700,scrollbars=yes');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="container py-10">
      <h1 className="text-3xl font-bold mb-6">OAuth Debug Tool</h1>
      
      <Tabs defaultValue="redirect">
        <TabsList className="mb-4">
          <TabsTrigger value="redirect">Test Direct Redirect</TabsTrigger>
          <TabsTrigger value="generation">Test OAuth URL Generation</TabsTrigger>
        </TabsList>
        
        <TabsContent value="redirect">
          <Card>
            <CardHeader>
              <CardTitle>Test OAuth Redirect</CardTitle>
              <CardDescription>
                Test direct OAuth URL generation and redirection without going through the normal flow
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-4 mb-4">
                <div className="w-full">
                  <label className="block text-sm font-medium mb-1">Provider</label>
                  <select
                    className="w-full p-2 border rounded"
                    value={provider}
                    onChange={(e) => setProvider(e.target.value)}
                  >
                    <option value="google-calendar">Google Calendar</option>
                    <option value="microsoft-outlook">Microsoft Outlook</option>
                  </select>
                </div>
              </div>
              
              {error && (
                <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
                  {error}
                </div>
              )}
            </CardContent>
            <CardFooter>
              <Button onClick={testOAuthRedirect} disabled={loading}>
                {loading ? 'Testing...' : 'Test OAuth Redirect'}
              </Button>
            </CardFooter>
          </Card>
        </TabsContent>
        
        <TabsContent value="generation">
          <Card>
            <CardHeader>
              <CardTitle>Test OAuth URL Generation</CardTitle>
              <CardDescription>
                Test the actual OAuth URL generation API endpoint
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-4 mb-4">
                <div className="w-full">
                  <label className="block text-sm font-medium mb-1">Provider</label>
                  <select
                    className="w-full p-2 border rounded"
                    value={provider}
                    onChange={(e) => setProvider(e.target.value)}
                  >
                    <option value="google-calendar">Google Calendar</option>
                    <option value="microsoft-outlook">Microsoft Outlook</option>
                  </select>
                </div>
              </div>
              
              {error && (
                <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
                  {error}
                </div>
              )}
            </CardContent>
            <CardFooter>
              <Button onClick={testOAuthGeneration} disabled={loading}>
                {loading ? 'Testing...' : 'Test OAuth Generation'}
              </Button>
            </CardFooter>
          </Card>
        </TabsContent>
      </Tabs>
      
      {results && (
        <div className="mt-8">
          <h2 className="text-xl font-semibold mb-2">Results</h2>
          <div className="bg-gray-100 p-4 rounded overflow-auto max-h-96">
            <pre className="text-sm">{JSON.stringify(results, null, 2)}</pre>
          </div>
        </div>
      )}
    </div>
  );
}