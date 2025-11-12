"use client"

import React, { useState } from 'react';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { AlertCircle, Info, Sparkles } from 'lucide-react';
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
import { ConfigurationContainer } from '../../components/ConfigurationContainer';
import { ConfigurationSectionHeader } from '../../components/ConfigurationSectionHeader';

interface TavilySearchConfigurationProps {
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

export function TavilySearchConfiguration({
  values,
  errors,
  setValue,
  onSubmit,
  isLoading,
  onCancel,
  onBack,
  nodeInfo,
  isEditMode = false,
}: TavilySearchConfigurationProps) {
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

  const isFormValid = React.useMemo(() => {
    return !!(values.query && values.query.trim() !== '');
  }, [values.query]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();

    // Validate required fields
    if (!values.query || values.query.trim() === '') {
      alert('Please enter a search query');
      return;
    }

    await onSubmit(values);
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

  const TAVILY_ALL_TIME_VALUE = "__chainreact_internal__tavily_all_time__"

  const timeRangeOptions = [
    { value: '', label: 'All time' },
    { value: 'day', label: 'Past 24 hours' },
    { value: 'week', label: 'Past week' },
    { value: 'month', label: 'Past month' },
    { value: 'year', label: 'Past year' },
  ];

  return (
    <ConfigurationContainer
      onSubmit={handleSave}
      onCancel={onCancel}
      onBack={onBack}
      isEditMode={isEditMode}
      isFormValid={isFormValid}
    >
      <div className="space-y-6">
        <section className="space-y-4">
          <ConfigurationSectionHeader label="Basic Search" caption="Required" />
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
        </section>

        <section className="space-y-4 pt-6 border-t border-border/60">
          <ConfigurationSectionHeader label="Advanced Options" caption="Fine-tune your search" />
            {/* Time Range */}
            <div>
              <Label htmlFor="timeRange">Time Range</Label>
              <Select
                value={
                  values.timeRange && values.timeRange.length > 0
                    ? values.timeRange
                    : TAVILY_ALL_TIME_VALUE
                }
                onValueChange={(value) =>
                  setValue('timeRange', value === TAVILY_ALL_TIME_VALUE ? '' : value)
                }
              >
                <SelectTrigger className="mt-2">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {timeRangeOptions.map((option) => (
                    <SelectItem
                      key={option.value || TAVILY_ALL_TIME_VALUE}
                      value={option.value === '' ? TAVILY_ALL_TIME_VALUE : option.value}
                    >
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
        </section>
      </div>
    </ConfigurationContainer>
  );
}
