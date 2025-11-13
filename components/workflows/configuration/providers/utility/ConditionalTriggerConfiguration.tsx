"use client"

import React, { useState } from 'react';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { ConfigurationContainer } from '../../components/ConfigurationContainer';
import { Badge } from '@/components/ui/badge';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Zap, Info, Clock, AlertCircle } from 'lucide-react';

interface ConditionalTriggerConfigurationProps {
  values: Record<string, any>;
  errors: Record<string, string>;
  setValue: (name: string, value: any) => void;
  onSubmit: (values: Record<string, any>) => Promise<void>;
  isLoading: boolean;
  onCancel: () => void;
  onBack?: () => void;
  nodeInfo: any;
  isEditMode?: boolean;
}

export function ConditionalTriggerConfiguration({
  values,
  errors,
  setValue,
  onSubmit,
  isLoading,
  onCancel,
  onBack,
  nodeInfo,
  isEditMode = false,
}: ConditionalTriggerConfigurationProps) {
  const [activeTab, setActiveTab] = useState('source');

  // Set default values
  React.useEffect(() => {
    if (!values.checkType) {
      setValue('checkType', 'api');
    }
    if (!values.checkInterval) {
      setValue('checkInterval', '15m');
    }
    if (!values.condition) {
      setValue('condition', 'equals');
    }
  }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();

    // Validate based on check type
    if (values.checkType === 'api') {
      if (!values.apiUrl || values.apiUrl.trim() === '') {
        alert('Please enter an API endpoint URL');
        return;
      }
      try {
        new URL(values.apiUrl);
      } catch {
        alert('Please enter a valid API URL');
        return;
      }
      if (!values.jsonPath || values.jsonPath.trim() === '') {
        alert('Please enter a JSON path to extract the value');
        return;
      }
    } else if (values.checkType === 'website') {
      if (!values.websiteUrl || values.websiteUrl.trim() === '') {
        alert('Please enter a website URL');
        return;
      }
      try {
        new URL(values.websiteUrl);
      } catch {
        alert('Please enter a valid website URL');
        return;
      }
      if (!values.cssSelector || values.cssSelector.trim() === '') {
        alert('Please enter a CSS selector');
        return;
      }
    } else if (values.checkType === 'database') {
      if (!values.databaseQuery || values.databaseQuery.trim() === '') {
        alert('Please enter a database query');
        return;
      }
    }

    // Validate condition value (except for 'changes' condition)
    if (values.condition !== 'changes') {
      if (!values.expectedValue || values.expectedValue.trim() === '') {
        alert('Please enter an expected value for the condition');
        return;
      }
    }

    await onSubmit(values);
  };

  const checkTypes = [
    { value: 'api', label: 'API Endpoint', description: 'Monitor a REST API endpoint' },
    { value: 'website', label: 'Website Data', description: 'Check data on a webpage' },
    { value: 'database', label: 'Database Query', description: 'Run a database query' },
  ];

  const conditions = [
    { value: 'equals', label: 'Equals', description: 'Value matches exactly' },
    { value: 'not_equals', label: 'Not Equals', description: 'Value does not match' },
    { value: 'contains', label: 'Contains', description: 'Value contains text' },
    { value: 'greater_than', label: 'Greater Than', description: 'Numeric value is greater' },
    { value: 'less_than', label: 'Less Than', description: 'Numeric value is less' },
    { value: 'changes', label: 'Value Changes', description: 'Value is different from last check' },
  ];

  const intervals = [
    { value: '1m', label: 'Every 1 minute' },
    { value: '5m', label: 'Every 5 minutes' },
    { value: '15m', label: 'Every 15 minutes' },
    { value: '30m', label: 'Every 30 minutes' },
    { value: '1h', label: 'Every 1 hour' },
    { value: '6h', label: 'Every 6 hours' },
    { value: '24h', label: 'Every 24 hours' },
  ];

  const isFormValid = React.useMemo(() => {
    if (values.checkType === 'api') {
      if (!values.apiUrl || values.apiUrl.trim() === '') return false;
      try {
        new URL(values.apiUrl);
      } catch {
        return false;
      }
    }
    return true;
  }, [values.checkType, values.apiUrl]);

  return (
    <ConfigurationContainer
      onSubmit={handleSave}
      onCancel={onCancel}
      onBack={onBack}
      isEditMode={isEditMode}
      isFormValid={isFormValid}
    >
      <div className="mb-6">
        <h3 className="text-lg font-semibold flex items-center gap-2">
          <Zap className="w-5 h-5" />
          Conditional Trigger
        </h3>
        <p className="text-sm text-muted-foreground mt-1">
          Automatically start when a specific condition is met
        </p>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid w-full grid-cols-2 mb-6">
            <TabsTrigger value="source">Data Source</TabsTrigger>
            <TabsTrigger value="condition">Condition & Schedule</TabsTrigger>
          </TabsList>

          <TabsContent value="source" className="space-y-4 mt-0">
            <Alert>
              <Info className="h-4 w-4" />
              <AlertDescription className="text-xs">
                Choose where to check for your condition. The workflow will run automatically when the condition is met.
              </AlertDescription>
            </Alert>

            {/* Check Type */}
            <div>
              <Label className="mb-3 block">
                What to Monitor <span className="text-destructive">*</span>
              </Label>
              <RadioGroup
                value={values.checkType || 'api'}
                onValueChange={(value) => setValue('checkType', value)}
                className="space-y-3"
              >
                {checkTypes.map((type) => (
                  <div key={type.value} className="flex items-start space-x-3 p-3 rounded-lg border border-border hover:bg-accent/50 transition-colors">
                    <RadioGroupItem value={type.value} id={`type-${type.value}`} className="mt-1" />
                    <div className="flex-1">
                      <label htmlFor={`type-${type.value}`} className="text-sm font-medium cursor-pointer">
                        {type.label}
                      </label>
                      <p className="text-xs text-muted-foreground mt-1">
                        {type.description}
                      </p>
                    </div>
                  </div>
                ))}
              </RadioGroup>
            </div>

            {/* API Endpoint Fields */}
            {values.checkType === 'api' && (
              <>
                <div>
                  <Label htmlFor="apiUrl">
                    API Endpoint URL <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    id="apiUrl"
                    type="url"
                    value={values.apiUrl || ''}
                    onChange={(e) => setValue('apiUrl', e.target.value)}
                    placeholder="https://api.example.com/status"
                    className="mt-2"
                  />
                  {errors.apiUrl && (
                    <p className="text-xs text-destructive mt-1">{errors.apiUrl}</p>
                  )}
                  <p className="text-xs text-muted-foreground mt-1">
                    The API endpoint to monitor
                  </p>
                </div>

                <div>
                  <Label htmlFor="jsonPath">
                    JSON Path <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    id="jsonPath"
                    value={values.jsonPath || ''}
                    onChange={(e) => setValue('jsonPath', e.target.value)}
                    placeholder="data.status"
                    className="mt-2 font-mono text-sm"
                  />
                  {errors.jsonPath && (
                    <p className="text-xs text-destructive mt-1">{errors.jsonPath}</p>
                  )}
                  <p className="text-xs text-muted-foreground mt-1">
                    Path to extract the value from the API response (e.g., "data.user.name")
                  </p>
                </div>

                <div>
                  <Label htmlFor="apiMethod">Request Method</Label>
                  <Select
                    value={values.apiMethod || 'GET'}
                    onValueChange={(value) => setValue('apiMethod', value)}
                  >
                    <SelectTrigger className="mt-2">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="GET">GET</SelectItem>
                      <SelectItem value="POST">POST</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label htmlFor="apiHeaders">Custom Headers (JSON, Optional)</Label>
                  <Textarea
                    id="apiHeaders"
                    value={values.apiHeaders || ''}
                    onChange={(e) => setValue('apiHeaders', e.target.value)}
                    placeholder={'{\n  "Authorization": "Bearer token"\n}'}
                    className="mt-2 font-mono text-sm min-h-[100px]"
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    Custom headers in JSON format (leave empty if not needed)
                  </p>
                </div>
              </>
            )}

            {/* Website Fields */}
            {values.checkType === 'website' && (
              <>
                <div>
                  <Label htmlFor="websiteUrl">
                    Website URL <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    id="websiteUrl"
                    type="url"
                    value={values.websiteUrl || ''}
                    onChange={(e) => setValue('websiteUrl', e.target.value)}
                    placeholder="https://example.com/page"
                    className="mt-2"
                  />
                  {errors.websiteUrl && (
                    <p className="text-xs text-destructive mt-1">{errors.websiteUrl}</p>
                  )}
                  <p className="text-xs text-muted-foreground mt-1">
                    The webpage to monitor
                  </p>
                </div>

                <div>
                  <Label htmlFor="cssSelector">
                    CSS Selector <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    id="cssSelector"
                    value={values.cssSelector || ''}
                    onChange={(e) => setValue('cssSelector', e.target.value)}
                    placeholder=".price-value"
                    className="mt-2 font-mono text-sm"
                  />
                  {errors.cssSelector && (
                    <p className="text-xs text-destructive mt-1">{errors.cssSelector}</p>
                  )}
                  <p className="text-xs text-muted-foreground mt-1">
                    CSS selector to extract the value from the page
                  </p>
                </div>
              </>
            )}

            {/* Database Fields */}
            {values.checkType === 'database' && (
              <>
                <div>
                  <Label htmlFor="databaseQuery">
                    Database Query <span className="text-destructive">*</span>
                  </Label>
                  <Textarea
                    id="databaseQuery"
                    value={values.databaseQuery || ''}
                    onChange={(e) => setValue('databaseQuery', e.target.value)}
                    placeholder="SELECT count(*) as total FROM orders WHERE status = 'pending'"
                    className="mt-2 font-mono text-sm min-h-[120px]"
                  />
                  {errors.databaseQuery && (
                    <p className="text-xs text-destructive mt-1">{errors.databaseQuery}</p>
                  )}
                  <p className="text-xs text-muted-foreground mt-1">
                    SQL query to run (must return a single value)
                  </p>
                </div>

                <Alert>
                  <Info className="h-4 w-4" />
                  <AlertDescription className="text-xs">
                    Query should return a single column/value. Use aggregations like COUNT, SUM, or MAX for monitoring.
                  </AlertDescription>
                </Alert>
              </>
            )}
          </TabsContent>

          <TabsContent value="condition" className="space-y-4 mt-0">
            {/* Condition */}
            <div>
              <Label htmlFor="condition">
                Condition <span className="text-destructive">*</span>
              </Label>
              <Select
                value={values.condition || 'equals'}
                onValueChange={(value) => setValue('condition', value)}
              >
                <SelectTrigger className="mt-2">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {conditions.map((condition) => (
                    <SelectItem key={condition.value} value={condition.value}>
                      {condition.label} - {condition.description}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground mt-1">
                When this condition is true, the workflow will run
              </p>
            </div>

            {/* Expected Value */}
            {values.condition !== 'changes' && (
              <div>
                <Label htmlFor="expectedValue">
                  Expected Value <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="expectedValue"
                  value={values.expectedValue || ''}
                  onChange={(e) => setValue('expectedValue', e.target.value)}
                  placeholder="Enter the value to compare against"
                  className="mt-2"
                />
                {errors.expectedValue && (
                  <p className="text-xs text-destructive mt-1">{errors.expectedValue}</p>
                )}
                <p className="text-xs text-muted-foreground mt-1">
                  The value to compare against
                </p>
              </div>
            )}

            {values.condition === 'changes' && (
              <Alert>
                <Info className="h-4 w-4" />
                <AlertDescription className="text-xs">
                  The workflow will run whenever the monitored value changes from its previous value.
                </AlertDescription>
              </Alert>
            )}

            {/* Check Interval */}
            <div>
              <Label htmlFor="checkInterval" className="flex items-center gap-2">
                <Clock className="w-4 h-4" />
                Check Interval <span className="text-destructive">*</span>
              </Label>
              <Select
                value={values.checkInterval || '15m'}
                onValueChange={(value) => setValue('checkInterval', value)}
              >
                <SelectTrigger className="mt-2">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {intervals.map((interval) => (
                    <SelectItem key={interval.value} value={interval.value}>
                      {interval.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground mt-1">
                How often to check if the condition is met
              </p>
            </div>

            {/* Example Output Preview */}
            <div className="bg-muted/50 border border-border rounded-lg p-4">
              <h4 className="text-sm font-medium mb-2">When Condition is Met</h4>
              <p className="text-xs text-muted-foreground mb-3">
                The workflow will receive this data:
              </p>
              <pre className="text-xs text-muted-foreground font-mono">
{`{
  "conditionMet": true,
  "checkedValue": "...",
  "timestamp": "2024-01-15T10:30:00Z",
  "previousValue": "..."
}`}
              </pre>
            </div>

            {/* Important Notice */}
            <Alert variant="default">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription className="text-xs">
                <strong>Important:</strong> This workflow will only run when the condition is met. If the condition is already true when you activate the workflow, it will run immediately. Subsequent runs will only happen when the condition changes from false to true (or when the value changes for "Value Changes" condition).
              </AlertDescription>
            </Alert>
          </TabsContent>
        </Tabs>
    </ConfigurationContainer>
  );
}
