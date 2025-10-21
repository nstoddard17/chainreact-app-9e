"use client"

import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Globe, ChevronLeft } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { KeyValuePairs, KeyValuePair } from '../../fields/KeyValuePairs';
import { VariablePicker } from '../../VariablePicker';

interface HttpRequestConfigurationProps {
  values: Record<string, any>;
  errors: Record<string, string>;
  setValue: (name: string, value: any) => void;
  handleSubmit: (e: React.FormEvent) => void;
  isLoading: boolean;
  onCancel: () => void;
  nodeInfo: any;
  isEditMode?: boolean;
  availableVariables?: any[];
}

export function HttpRequestConfiguration({
  values,
  errors,
  setValue,
  handleSubmit,
  isLoading,
  onCancel,
  nodeInfo,
  isEditMode = false,
  availableVariables = []
}: HttpRequestConfigurationProps) {

  const [activeTab, setActiveTab] = useState('request');

  // Set default values
  React.useEffect(() => {
    if (!values.method) {
      setValue('method', 'GET');
    }
    if (!values.authType) {
      setValue('authType', 'none');
    }
    if (!values.timeoutSeconds) {
      setValue('timeoutSeconds', 30);
    }
  }, []);

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();

    // Validate required fields
    if (!values.url) {
      alert('Please enter a URL');
      return;
    }

    // Validate URL format
    try {
      new URL(values.url.startsWith('http') ? values.url : `https://${values.url}`);
    } catch (err) {
      alert('Please enter a valid URL');
      return;
    }

    // Validate auth fields based on auth type
    if (values.authType === 'bearer' && !values.bearerToken) {
      alert('Please enter a bearer token');
      return;
    }
    if (values.authType === 'basic' && (!values.basicUsername || !values.basicPassword)) {
      alert('Please enter both username and password for Basic auth');
      return;
    }
    if (values.authType === 'apikey' && (!values.apiKeyHeader || !values.apiKeyValue)) {
      alert('Please enter both header name and value for API Key auth');
      return;
    }

    handleSubmit(e);
  };

  const methodsWithBody = ['POST', 'PUT', 'PATCH'];
  const showBodyField = methodsWithBody.includes(values.method);

  return (
    <form onSubmit={handleSave} className="flex flex-col h-full">
      <div className="flex-1 px-8 py-5 overflow-y-auto overflow-x-hidden">
          <div className="mb-6">
            <h3 className="text-lg font-semibold flex items-center gap-2">
              <Globe className="w-5 h-5" />
              HTTP Request
            </h3>
            <p className="text-sm text-muted-foreground mt-1">
              Send data to any custom API endpoint
            </p>
          </div>

          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="grid w-full grid-cols-3 mb-6">
              <TabsTrigger value="request">Request</TabsTrigger>
              <TabsTrigger value="auth">Authentication</TabsTrigger>
              <TabsTrigger value="advanced">Advanced</TabsTrigger>
            </TabsList>

            <TabsContent value="request" className="space-y-4 mt-0">
              {/* Method */}
              <div>
                <Label htmlFor="method">HTTP Method</Label>
                <Select
                  value={values.method || 'GET'}
                  onValueChange={(value) => setValue('method', value)}
                >
                  <SelectTrigger id="method" className="mt-2">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="GET">GET</SelectItem>
                    <SelectItem value="POST">POST</SelectItem>
                    <SelectItem value="PUT">PUT</SelectItem>
                    <SelectItem value="PATCH">PATCH</SelectItem>
                    <SelectItem value="DELETE">DELETE</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* URL */}
              <div>
                <Label htmlFor="url">URL</Label>
                <div className="mt-2 flex gap-2">
                  <Input
                    id="url"
                    value={values.url || ''}
                    onChange={(e) => setValue('url', e.target.value)}
                    placeholder="https://api.example.com/endpoint"
                    className="flex-1"
                  />
                  {availableVariables.length > 0 && (
                    <VariablePicker
                      value={values.url || ''}
                      onChange={(value) => setValue('url', value)}
                      availableVariables={availableVariables}
                    />
                  )}
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  The full URL to send the request to (can include variables)
                </p>
              </div>

              {/* Query Parameters */}
              <div>
                <Label>Query Parameters</Label>
                <div className="mt-2">
                  <KeyValuePairs
                    value={values.queryParams || []}
                    onChange={(pairs: KeyValuePair[]) => setValue('queryParams', pairs)}
                    keyPlaceholder="Parameter name"
                    valuePlaceholder="Value"
                    showVariablePicker={true}
                  />
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  Parameters will be appended to the URL as ?key=value
                </p>
              </div>

              {/* Headers */}
              <div>
                <Label>Headers</Label>
                <div className="mt-2">
                  <KeyValuePairs
                    value={values.headers || []}
                    onChange={(pairs: KeyValuePair[]) => setValue('headers', pairs)}
                    keyPlaceholder="Header name"
                    valuePlaceholder="Header value"
                    showVariablePicker={true}
                  />
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  Custom HTTP headers to send with the request
                </p>
              </div>

              {/* Body */}
              {showBodyField && (
                <div>
                  <Label htmlFor="body">Request Body</Label>
                  <div className="mt-2 flex gap-2 items-start">
                    <Textarea
                      id="body"
                      value={values.body || ''}
                      onChange={(e) => setValue('body', e.target.value)}
                      placeholder={'{\n  "key": "value",\n  "data": "{{variable}}"\n}'}
                      className="flex-1 font-mono text-sm"
                      rows={8}
                    />
                    {availableVariables.length > 0 && (
                      <div className="mt-2">
                        <VariablePicker
                          value={values.body || ''}
                          onChange={(value) => setValue('body', value)}
                          availableVariables={availableVariables}
                        />
                      </div>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    JSON body to send with the request (supports variables)
                  </p>
                </div>
              )}
            </TabsContent>

            <TabsContent value="auth" className="space-y-4 mt-0">
              {/* Auth Type */}
              <div>
                <Label htmlFor="authType">Authentication Type</Label>
                <Select
                  value={values.authType || 'none'}
                  onValueChange={(value) => setValue('authType', value)}
                >
                  <SelectTrigger id="authType" className="mt-2">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None</SelectItem>
                    <SelectItem value="bearer">Bearer Token</SelectItem>
                    <SelectItem value="basic">Basic Auth</SelectItem>
                    <SelectItem value="apikey">API Key</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Bearer Token */}
              {values.authType === 'bearer' && (
                <div>
                  <Label htmlFor="bearerToken">Bearer Token</Label>
                  <div className="mt-2 flex gap-2">
                    <Input
                      id="bearerToken"
                      type="password"
                      value={values.bearerToken || ''}
                      onChange={(e) => setValue('bearerToken', e.target.value)}
                      placeholder="Your bearer token"
                      className="flex-1"
                    />
                    {availableVariables.length > 0 && (
                      <VariablePicker
                        value={values.bearerToken || ''}
                        onChange={(value) => setValue('bearerToken', value)}
                        availableVariables={availableVariables}
                      />
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    Token will be sent as "Authorization: Bearer {'{'}token{'}'}"
                  </p>
                </div>
              )}

              {/* Basic Auth */}
              {values.authType === 'basic' && (
                <>
                  <div>
                    <Label htmlFor="basicUsername">Username</Label>
                    <div className="mt-2 flex gap-2">
                      <Input
                        id="basicUsername"
                        value={values.basicUsername || ''}
                        onChange={(e) => setValue('basicUsername', e.target.value)}
                        placeholder="Username"
                        className="flex-1"
                      />
                      {availableVariables.length > 0 && (
                        <VariablePicker
                          value={values.basicUsername || ''}
                          onChange={(value) => setValue('basicUsername', value)}
                          availableVariables={availableVariables}
                        />
                      )}
                    </div>
                  </div>
                  <div>
                    <Label htmlFor="basicPassword">Password</Label>
                    <div className="mt-2 flex gap-2">
                      <Input
                        id="basicPassword"
                        type="password"
                        value={values.basicPassword || ''}
                        onChange={(e) => setValue('basicPassword', e.target.value)}
                        placeholder="Password"
                        className="flex-1"
                      />
                      {availableVariables.length > 0 && (
                        <VariablePicker
                          value={values.basicPassword || ''}
                          onChange={(value) => setValue('basicPassword', value)}
                          availableVariables={availableVariables}
                        />
                      )}
                    </div>
                  </div>
                </>
              )}

              {/* API Key */}
              {values.authType === 'apikey' && (
                <>
                  <div>
                    <Label htmlFor="apiKeyHeader">Header Name</Label>
                    <Input
                      id="apiKeyHeader"
                      value={values.apiKeyHeader || ''}
                      onChange={(e) => setValue('apiKeyHeader', e.target.value)}
                      placeholder="X-API-Key"
                      className="mt-2"
                    />
                    <p className="text-xs text-muted-foreground mt-1">
                      Common values: X-API-Key, API-Key, Authorization
                    </p>
                  </div>
                  <div>
                    <Label htmlFor="apiKeyValue">API Key</Label>
                    <div className="mt-2 flex gap-2">
                      <Input
                        id="apiKeyValue"
                        type="password"
                        value={values.apiKeyValue || ''}
                        onChange={(e) => setValue('apiKeyValue', e.target.value)}
                        placeholder="Your API key"
                        className="flex-1"
                      />
                      {availableVariables.length > 0 && (
                        <VariablePicker
                          value={values.apiKeyValue || ''}
                          onChange={(value) => setValue('apiKeyValue', value)}
                          availableVariables={availableVariables}
                        />
                      )}
                    </div>
                  </div>
                </>
              )}

              {values.authType === 'none' && (
                <div className="p-4 bg-muted/30 rounded border text-sm text-muted-foreground">
                  No authentication will be used. Select an authentication type above if your API requires it.
                </div>
              )}
            </TabsContent>

            <TabsContent value="advanced" className="space-y-4 mt-0">
              {/* Timeout */}
              <div>
                <Label htmlFor="timeoutSeconds">Timeout (seconds)</Label>
                <Input
                  id="timeoutSeconds"
                  type="number"
                  value={values.timeoutSeconds || 30}
                  onChange={(e) => setValue('timeoutSeconds', parseInt(e.target.value) || 30)}
                  min={1}
                  max={300}
                  className="mt-2"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Request will fail if it takes longer than this (max: 300 seconds)
                </p>
              </div>

              <div className="p-4 bg-muted/30 rounded border">
                <p className="text-sm font-medium mb-2">Response Data</p>
                <p className="text-sm text-muted-foreground">
                  The response from this HTTP request will be available in subsequent nodes as:
                </p>
                <ul className="text-sm text-muted-foreground mt-2 space-y-1">
                  <li>• <code className="bg-background px-1 py-0.5 rounded">{'{{nodeOutputs.this_node.body}}'}</code> - Response body (JSON parsed if applicable)</li>
                  <li>• <code className="bg-background px-1 py-0.5 rounded">{'{{nodeOutputs.this_node.status}}'}</code> - HTTP status code</li>
                  <li>• <code className="bg-background px-1 py-0.5 rounded">{'{{nodeOutputs.this_node.headers}}'}</code> - Response headers</li>
                </ul>
              </div>
            </TabsContent>
          </Tabs>
        </div>

      <div className="border-t border-border px-8 py-4">
        <div className="flex justify-between items-center">
          <div>
            <Button type="button" variant="outline" onClick={onCancel}>
              <ChevronLeft className="w-4 h-4 mr-1" />
              Cancel
            </Button>
          </div>
          <Button type="submit" disabled={isLoading}>
            {isEditMode ? 'Update' : 'Save'} Request
          </Button>
        </div>
      </div>
    </form>
  );
}
