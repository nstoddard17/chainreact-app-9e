"use client"

import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Search, ChevronLeft, AlertCircle, Info, Sparkles } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';

interface TavilySearchConfigurationProps {
  values: Record<string, any>;
  errors: Record<string, string>;
  setValue: (name: string, value: any) => void;
  handleSubmit: (e: React.FormEvent) => void;
  isLoading: boolean;
  onCancel: () => void;
  nodeInfo: any;
  isEditMode?: boolean;
}

export function TavilySearchConfiguration({
  values,
  errors,
  setValue,
  handleSubmit,
  isLoading,
  onCancel,
  nodeInfo,
  isEditMode = false,
}: TavilySearchConfigurationProps) {
  const [activeTab, setActiveTab] = useState('basic');

  // Set default values
  React.useEffect(() => {
    if (!values.searchDepth) {
      setValue('searchDepth', 'basic');
    }
    if (!values.maxResults) {
      setValue('maxResults', 5);
    }
    if (!values.includeAnswer) {
      setValue('includeAnswer', true);
    }
  }, []);

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();

    // Validate required fields
    if (!values.query || values.query.trim() === '') {
      alert('Please enter a search query');
      return;
    }

    handleSubmit(e);
  };

  const [includeDomains, setIncludeDomains] = useState<string[]>([]);
  const [excludeDomains, setExcludeDomains] = useState<string[]>([]);

  React.useEffect(() => {
    if (values.includeDomains && Array.isArray(values.includeDomains)) {
      setIncludeDomains(values.includeDomains);
    }
    if (values.excludeDomains && Array.isArray(values.excludeDomains)) {
      setExcludeDomains(values.excludeDomains);
    }
  }, []);

  const searchDepthOptions = [
    {
      value: 'basic',
      label: 'Basic',
      description: 'Fast search with good relevance',
      badge: 'Faster'
    },
    {
      value: 'advanced',
      label: 'Advanced',
      description: 'Thorough search with deeper analysis',
      badge: 'More Thorough'
    },
  ];

  const timeRangeOptions = [
    { value: '', label: 'All time' },
    { value: 'day', label: 'Past 24 hours' },
    { value: 'week', label: 'Past week' },
    { value: 'month', label: 'Past month' },
    { value: 'year', label: 'Past year' },
  ];

  return (
    <form onSubmit={handleSave} className="flex flex-col h-full">
      <div className="flex-1 px-8 py-5 overflow-y-auto overflow-x-hidden">
        <div className="mb-6">
          <h3 className="text-lg font-semibold flex items-center gap-2">
            <Search className="w-5 h-5" />
            Internet Search (Tavily)
          </h3>
          <p className="text-sm text-muted-foreground mt-1">
            Find relevant website links using Tavily API
          </p>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid w-full grid-cols-2 mb-6">
            <TabsTrigger value="basic">Basic Search</TabsTrigger>
            <TabsTrigger value="advanced">Advanced Options</TabsTrigger>
          </TabsList>

          <TabsContent value="basic" className="space-y-4 mt-0">
            <Alert>
              <Info className="h-4 w-4" />
              <AlertDescription className="text-xs">
                Tavily provides AI-optimized search results with relevance scoring and optional AI-generated answer summaries. Perfect for research and information gathering.
              </AlertDescription>
            </Alert>

            {/* Search Query */}
            <div>
              <Label htmlFor="query">
                Search Query <span className="text-destructive">*</span>
              </Label>
              <Input
                id="query"
                value={values.query || ''}
                onChange={(e) => setValue('query', e.target.value)}
                placeholder="Enter your search query or question"
                className="mt-2"
              />
              {errors.query && (
                <p className="text-xs text-destructive mt-1">{errors.query}</p>
              )}
              <p className="text-xs text-muted-foreground mt-1">
                The question or keywords to search for
              </p>
            </div>

            {/* Search Depth */}
            <div>
              <Label className="mb-3 block">
                Search Depth
              </Label>
              <div className="space-y-3">
                {searchDepthOptions.map((option) => (
                  <div
                    key={option.value}
                    className={`flex items-start space-x-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                      values.searchDepth === option.value
                        ? 'border-primary bg-accent/50'
                        : 'border-border hover:bg-accent/50'
                    }`}
                    onClick={() => setValue('searchDepth', option.value)}
                  >
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium">{option.label}</span>
                        <Badge variant="secondary" className="text-xs">
                          {option.badge}
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">
                        {option.description}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Max Results */}
            <div>
              <Label htmlFor="maxResults">Maximum Results</Label>
              <Input
                id="maxResults"
                type="number"
                value={values.maxResults || 5}
                onChange={(e) => setValue('maxResults', parseInt(e.target.value))}
                min={1}
                max={10}
                className="mt-2"
              />
              <p className="text-xs text-muted-foreground mt-1">
                Number of search results to return (1-10)
              </p>
            </div>

            {/* Include AI Answer */}
            <div className="flex items-start space-x-3 p-3 rounded-lg border border-border">
              <Checkbox
                id="includeAnswer"
                checked={values.includeAnswer !== false}
                onCheckedChange={(checked) => setValue('includeAnswer', checked)}
              />
              <div className="flex-1">
                <label
                  htmlFor="includeAnswer"
                  className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer flex items-center gap-2"
                >
                  <Sparkles className="w-4 h-4" />
                  Include AI-Generated Answer
                </label>
                <p className="text-xs text-muted-foreground mt-1">
                  Get an AI-generated summary answer based on the search results
                </p>
              </div>
            </div>

            {/* Example Output Preview */}
            <div className="bg-muted/50 border border-border rounded-lg p-4">
              <h4 className="text-sm font-medium mb-2">Example Search Result</h4>
              <pre className="text-xs text-muted-foreground font-mono">
{`{
  "results": [
    {
      "title": "Page Title",
      "url": "https://example.com",
      "content": "Relevant excerpt...",
      "score": 0.95
    }
  ],
  "answer": "AI-generated summary",
  "query": "your search",
  "responseTime": 1.2
}`}
              </pre>
            </div>
          </TabsContent>

          <TabsContent value="advanced" className="space-y-4 mt-0">
            {/* Time Range */}
            <div>
              <Label htmlFor="timeRange">Time Range</Label>
              <Select
                value={values.timeRange || ''}
                onValueChange={(value) => setValue('timeRange', value)}
              >
                <SelectTrigger className="mt-2">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {timeRangeOptions.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground mt-1">
                Filter results by publication date
              </p>
            </div>

            {/* Include Domains */}
            <div>
              <Label htmlFor="includeDomains">Include Only These Domains (Optional)</Label>
              <Textarea
                id="includeDomains"
                value={values.includeDomains?.join('\n') || ''}
                onChange={(e) => {
                  const domains = e.target.value.split('\n').filter(d => d.trim());
                  setValue('includeDomains', domains);
                  setIncludeDomains(domains);
                }}
                placeholder="example.com&#10;wikipedia.org&#10;github.com"
                className="mt-2 font-mono text-sm min-h-[100px]"
              />
              <p className="text-xs text-muted-foreground mt-1">
                Only search these domains (one per line). Leave empty to search all sites.
              </p>
            </div>

            {/* Exclude Domains */}
            <div>
              <Label htmlFor="excludeDomains">Exclude These Domains (Optional)</Label>
              <Textarea
                id="excludeDomains"
                value={values.excludeDomains?.join('\n') || ''}
                onChange={(e) => {
                  const domains = e.target.value.split('\n').filter(d => d.trim());
                  setValue('excludeDomains', domains);
                  setExcludeDomains(domains);
                }}
                placeholder="example.com&#10;spam-site.com"
                className="mt-2 font-mono text-sm min-h-[100px]"
              />
              <p className="text-xs text-muted-foreground mt-1">
                Exclude results from these domains (one per line)
              </p>
            </div>

            {/* Include Raw Content */}
            <div className="flex items-start space-x-3 p-3 rounded-lg border border-border">
              <Checkbox
                id="includeRawContent"
                checked={values.includeRawContent === true}
                onCheckedChange={(checked) => setValue('includeRawContent', checked)}
              />
              <div className="flex-1">
                <label
                  htmlFor="includeRawContent"
                  className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
                >
                  Include Full Page Content
                </label>
                <p className="text-xs text-muted-foreground mt-1">
                  Include the full text content from each result (increases response size)
                </p>
              </div>
            </div>

            {/* Include Images */}
            <div className="flex items-start space-x-3 p-3 rounded-lg border border-border">
              <Checkbox
                id="includeImages"
                checked={values.includeImages === true}
                onCheckedChange={(checked) => setValue('includeImages', checked)}
              />
              <div className="flex-1">
                <label
                  htmlFor="includeImages"
                  className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
                >
                  Include Image URLs
                </label>
                <p className="text-xs text-muted-foreground mt-1">
                  Include relevant image URLs from search results
                </p>
              </div>
            </div>

            {/* Search Language */}
            <div>
              <Label htmlFor="searchLanguage">Search Language (Optional)</Label>
              <Input
                id="searchLanguage"
                value={values.searchLanguage || ''}
                onChange={(e) => setValue('searchLanguage', e.target.value)}
                placeholder="en, es, fr, etc."
                className="mt-2"
                maxLength={2}
              />
              <p className="text-xs text-muted-foreground mt-1">
                Two-letter language code (ISO 639-1). Leave empty for auto-detect.
              </p>
            </div>

            {/* API Info */}
            <Alert variant="default">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription className="text-xs">
                <strong>About Tavily Search:</strong>
                <ul className="list-disc list-inside mt-1 space-y-1">
                  <li>Optimized for AI and research applications</li>
                  <li>Results include relevance scores (0-1)</li>
                  <li>Advanced mode provides deeper, more comprehensive results</li>
                  <li>Requires a Tavily API key (configure in integration settings)</li>
                </ul>
              </AlertDescription>
            </Alert>
          </TabsContent>
        </Tabs>
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between px-8 py-4 border-t border-border bg-muted/30">
        <Button type="button" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" disabled={isLoading}>
          {isLoading ? 'Saving...' : isEditMode ? 'Update' : 'Continue'}
        </Button>
      </div>
    </form>
  );
}
