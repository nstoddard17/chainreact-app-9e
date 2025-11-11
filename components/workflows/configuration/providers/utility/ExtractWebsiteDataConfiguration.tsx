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
import { Checkbox } from '@/components/ui/checkbox';
import { Globe, Sparkles } from 'lucide-react';

interface ExtractWebsiteDataConfigurationProps {
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

export function ExtractWebsiteDataConfiguration({
  values,
  errors,
  setValue,
  onSubmit,
  isLoading,
  onCancel,
  onBack,
  nodeInfo,
  isEditMode = false,
}: ExtractWebsiteDataConfigurationProps) {
  const [activeTab, setActiveTab] = useState('basic');

  // Set default values
  React.useEffect(() => {
    if (!values.extractionMethod) {
      setValue('extractionMethod', 'ai');
    }
    if (!values.timeout) {
      setValue('timeout', 30);
    }
    if (!values.waitForElement) {
      setValue('waitForElement', false);
    }
  }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();

    // Validate required fields
    if (!values.url || values.url.trim() === '') {
      alert('Please enter a URL to scrape');
      return;
    }

    // URL validation
    try {
      new URL(values.url);
    } catch {
      alert('Please enter a valid URL (must include http:// or https://)');
      return;
    }

    // Validate based on extraction method
    if (values.extractionMethod === 'css') {
      if (!values.cssSelectors || Object.keys(values.cssSelectors).length === 0) {
        alert('Please define at least one CSS selector');
        return;
      }
    } else if (values.extractionMethod === 'ai') {
      if (!values.extractionPrompt || values.extractionPrompt.trim() === '') {
        alert('Please describe what data you want to extract');
        return;
      }
    }

    await onSubmit(values);
  };

  const [selectorFields, setSelectorFields] = useState<Array<{key: string, value: string}>>([
    { key: '', value: '' }
  ]);

  React.useEffect(() => {
    if (values.cssSelectors && typeof values.cssSelectors === 'object') {
      const entries = Object.entries(values.cssSelectors);
      if (entries.length > 0) {
        setSelectorFields(entries.map(([key, value]) => ({ key, value: value as string })));
      }
    }
  }, []);

  const handleSelectorChange = (index: number, field: 'key' | 'value', newValue: string) => {
    const updated = [...selectorFields];
    updated[index][field] = newValue;
    setSelectorFields(updated);

    // Update values object
    const selectors: Record<string, string> = {};
    updated.forEach(({ key, value }) => {
      if (key.trim() && value.trim()) {
        selectors[key] = value;
      }
    });
    setValue('cssSelectors', selectors);
  };

  const addSelectorField = () => {
    setSelectorFields([...selectorFields, { key: '', value: '' }]);
  };

  const removeSelectorField = (index: number) => {
    const updated = selectorFields.filter((_, i) => i !== index);
    setSelectorFields(updated);

    const selectors: Record<string, string> = {};
    updated.forEach(({ key, value }) => {
      if (key.trim() && value.trim()) {
        selectors[key] = value;
      }
    });
    setValue('cssSelectors', selectors);
  };

  const isFormValid = React.useMemo(() => {
    if (!values.url || values.url.trim() === '') return false;
    try {
      new URL(values.url);
      return true;
    } catch {
      return false;
    }
  }, [values.url]);

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
          <Globe className="w-5 h-5" />
          Extract Website Data
        </h3>
        <p className="text-sm text-muted-foreground mt-1">
          Scrape and extract specific data from websites
        </p>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid w-full grid-cols-2 mb-6">
            <TabsTrigger value="basic">Basic Setup</TabsTrigger>
            <TabsTrigger value="advanced">Advanced Options</TabsTrigger>
          </TabsList>

          <TabsContent value="basic" className="space-y-4 mt-0">
            {/* URL */}
            <div>
              <Label htmlFor="url">
                Website URL <span className="text-destructive">*</span>
              </Label>
              <Input
                id="url"
                type="url"
                value={values.url || ''}
                onChange={(e) => setValue('url', e.target.value)}
                placeholder="https://example.com/page"
                className="mt-2"
              />
              {errors.url && (
                <p className="text-xs text-destructive mt-1">{errors.url}</p>
              )}
              <p className="text-xs text-muted-foreground mt-1">
                The webpage URL to extract data from
              </p>
            </div>

            {/* Extraction Method */}
            <div>
              <Label className="mb-3 block">
                Extraction Method <span className="text-destructive">*</span>
              </Label>
              <RadioGroup
                value={values.extractionMethod || 'ai'}
                onValueChange={(value) => setValue('extractionMethod', value)}
                className="space-y-3"
              >
                <div className="flex items-start space-x-3 p-3 rounded-lg border border-border hover:bg-accent/50 transition-colors">
                  <RadioGroupItem value="ai" id="method-ai" className="mt-1" />
                  <div className="flex-1">
                    <label htmlFor="method-ai" className="text-sm font-medium cursor-pointer flex items-center gap-2">
                      <Sparkles className="w-4 h-4" />
                      AI-Powered Extraction
                      <Badge variant="secondary" className="text-xs">Recommended</Badge>
                    </label>
                    <p className="text-xs text-muted-foreground mt-1">
                      Describe what you want to extract in plain English. AI will find and extract the data.
                    </p>
                  </div>
                </div>

                <div className="flex items-start space-x-3 p-3 rounded-lg border border-border hover:bg-accent/50 transition-colors">
                  <RadioGroupItem value="css" id="method-css" className="mt-1" />
                  <div className="flex-1">
                    <label htmlFor="method-css" className="text-sm font-medium cursor-pointer flex items-center gap-2">
                      <Code2 className="w-4 h-4" />
                      CSS Selectors
                    </label>
                    <p className="text-xs text-muted-foreground mt-1">
                      Use CSS selectors to target specific elements on the page (for advanced users).
                    </p>
                  </div>
                </div>
              </RadioGroup>
            </div>

            {/* AI Extraction Prompt */}
            {values.extractionMethod === 'ai' && (
              <div>
                <Label htmlFor="extractionPrompt">
                  What to Extract <span className="text-destructive">*</span>
                </Label>
                <Textarea
                  id="extractionPrompt"
                  value={values.extractionPrompt || ''}
                  onChange={(e) => setValue('extractionPrompt', e.target.value)}
                  placeholder="Example: Extract the product title, price, description, and customer rating from this product page"
                  className="mt-2 min-h-[120px]"
                />
                {errors.extractionPrompt && (
                  <p className="text-xs text-destructive mt-1">{errors.extractionPrompt}</p>
                )}
                <p className="text-xs text-muted-foreground mt-1">
                  Describe the data you want to extract in plain language
                </p>

                <Alert className="mt-3">
                  <Info className="h-4 w-4" />
                  <AlertDescription className="text-xs">
                    <strong>Examples:</strong>
                    <ul className="list-disc list-inside mt-1 space-y-1">
                      <li>Extract all product names and prices from the catalog</li>
                      <li>Get the article headline, author, and publish date</li>
                      <li>Find all email addresses and phone numbers on the page</li>
                    </ul>
                  </AlertDescription>
                </Alert>
              </div>
            )}

            {/* CSS Selectors */}
            {values.extractionMethod === 'css' && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label>
                    CSS Selectors <span className="text-destructive">*</span>
                  </Label>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={addSelectorField}
                  >
                    + Add Selector
                  </Button>
                </div>

                <div className="space-y-3">
                  {selectorFields.map((field, index) => (
                    <div key={index} className="flex gap-2">
                      <div className="flex-1">
                        <Input
                          placeholder="Field name (e.g., title)"
                          value={field.key}
                          onChange={(e) => handleSelectorChange(index, 'key', e.target.value)}
                          className="font-mono text-sm"
                        />
                      </div>
                      <div className="flex-1">
                        <Input
                          placeholder="CSS selector (e.g., h1.product-title)"
                          value={field.value}
                          onChange={(e) => handleSelectorChange(index, 'value', e.target.value)}
                          className="font-mono text-sm"
                        />
                      </div>
                      {selectorFields.length > 1 && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => removeSelectorField(index)}
                        >
                          ×
                        </Button>
                      )}
                    </div>
                  ))}
                </div>

                <p className="text-xs text-muted-foreground">
                  Define field names and their corresponding CSS selectors
                </p>

                <Alert>
                  <Info className="h-4 w-4" />
                  <AlertDescription className="text-xs">
                    <strong>CSS Selector Examples:</strong>
                    <ul className="list-disc list-inside mt-1 space-y-1 font-mono text-xs">
                      <li>h1.title - Element with class 'title'</li>
                      <li>#product-price - Element with ID 'product-price'</li>
                      <li>div.content p - All paragraphs inside div.content</li>
                    </ul>
                  </AlertDescription>
                </Alert>
              </div>
            )}
          </TabsContent>

          <TabsContent value="advanced" className="space-y-4 mt-0">
            {/* Wait for Element */}
            <div className="flex items-start space-x-3 p-3 rounded-lg border border-border">
              <Checkbox
                id="waitForElement"
                checked={values.waitForElement === true}
                onCheckedChange={(checked) => setValue('waitForElement', checked)}
              />
              <div className="flex-1">
                <label
                  htmlFor="waitForElement"
                  className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
                >
                  Wait for Dynamic Content
                </label>
                <p className="text-xs text-muted-foreground mt-1">
                  Wait for JavaScript to load content before extracting (useful for dynamic sites)
                </p>
              </div>
            </div>

            {/* Wait Selector */}
            {values.waitForElement && (
              <div>
                <Label htmlFor="waitSelector">Wait For Selector (Optional)</Label>
                <Input
                  id="waitSelector"
                  value={values.waitSelector || ''}
                  onChange={(e) => setValue('waitSelector', e.target.value)}
                  placeholder=".content-loaded"
                  className="mt-2 font-mono text-sm"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  CSS selector to wait for before extracting (leave empty to wait for page load)
                </p>
              </div>
            )}

            {/* Custom User Agent */}
            <div>
              <Label htmlFor="userAgent">Custom User Agent (Optional)</Label>
              <Input
                id="userAgent"
                value={values.userAgent || ''}
                onChange={(e) => setValue('userAgent', e.target.value)}
                placeholder="Leave empty for default browser user agent"
                className="mt-2"
              />
              <p className="text-xs text-muted-foreground mt-1">
                Custom user agent string (useful if the website blocks automated requests)
              </p>
            </div>

            {/* Timeout */}
            <div>
              <Label htmlFor="timeout">Timeout (seconds)</Label>
              <Input
                id="timeout"
                type="number"
                value={values.timeout || 30}
                onChange={(e) => setValue('timeout', parseInt(e.target.value))}
                min={5}
                max={120}
                className="mt-2"
              />
              <p className="text-xs text-muted-foreground mt-1">
                Maximum time to wait for page load and extraction (5-120 seconds)
              </p>
            </div>

            {/* Include Screenshots */}
            <div className="flex items-start space-x-3 p-3 rounded-lg border border-border">
              <Checkbox
                id="includeScreenshot"
                checked={values.includeScreenshot === true}
                onCheckedChange={(checked) => setValue('includeScreenshot', checked)}
              />
              <div className="flex-1">
                <label
                  htmlFor="includeScreenshot"
                  className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
                >
                  Include Screenshot
                </label>
                <p className="text-xs text-muted-foreground mt-1">
                  Take a screenshot of the page for debugging (increases execution time)
                </p>
              </div>
            </div>

            {/* Security & Privacy Notice */}
            <Alert variant="default">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription className="text-xs">
                <strong>Important Notes:</strong>
                <ul className="list-disc list-inside mt-1 space-y-1">
                  <li>Respect website terms of service and robots.txt</li>
                  <li>Some websites may block automated scraping</li>
                  <li>Rate limiting may apply to prevent server overload</li>
                  <li>AI extraction uses credits and may take longer than CSS selectors</li>
                </ul>
              </AlertDescription>
            </Alert>
          </TabsContent>
        </Tabs>
    </ConfigurationContainer>
  );
}
