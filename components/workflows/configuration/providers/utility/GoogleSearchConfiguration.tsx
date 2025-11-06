"use client"

import React, { useState } from 'react';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Search, AlertCircle, Info } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { ConfigurationContainer } from '../../components/ConfigurationContainer';

interface GoogleSearchConfigurationProps {
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

export function GoogleSearchConfiguration({
  values,
  errors,
  setValue,
  onSubmit,
  isLoading,
  onCancel,
  onBack,
  nodeInfo,
  isEditMode = false,
}: GoogleSearchConfigurationProps) {
  const [activeTab, setActiveTab] = useState('basic');

  // Set default values
  React.useEffect(() => {
    if (!values.numResults) {
      setValue('numResults', 10);
    }
    if (!values.language) {
      setValue('language', 'en');
    }
    if (!values.safeSearch) {
      setValue('safeSearch', 'moderate');
    }
    if (!values.searchType) {
      setValue('searchType', 'web');
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

  const languages = [
    { value: 'en', label: 'English' },
    { value: 'es', label: 'Spanish' },
    { value: 'fr', label: 'French' },
    { value: 'de', label: 'German' },
    { value: 'it', label: 'Italian' },
    { value: 'pt', label: 'Portuguese' },
    { value: 'ja', label: 'Japanese' },
    { value: 'zh', label: 'Chinese' },
  ];

  const countries = [
    { value: '', label: 'All Countries' },
    { value: 'us', label: 'United States' },
    { value: 'uk', label: 'United Kingdom' },
    { value: 'ca', label: 'Canada' },
    { value: 'au', label: 'Australia' },
    { value: 'de', label: 'Germany' },
    { value: 'fr', label: 'France' },
    { value: 'es', label: 'Spain' },
    { value: 'jp', label: 'Japan' },
  ];

  const searchTypes = [
    { value: 'web', label: 'Web Search', description: 'Regular web search results' },
    { value: 'image', label: 'Image Search', description: 'Image search results' },
    { value: 'news', label: 'News Search', description: 'News articles' },
  ];

  const safeSearchLevels = [
    { value: 'off', label: 'Off', description: 'No filtering' },
    { value: 'moderate', label: 'Moderate', description: 'Filter explicit content' },
    { value: 'strict', label: 'Strict', description: 'Filter explicit and sensitive content' },
  ];

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
          <Search className="w-5 h-5" />
          Google Search
        </h3>
        <p className="text-sm text-muted-foreground mt-1">
          Find information and web pages from Google
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
                Search Google and get structured results including titles, URLs, snippets, and positions. Perfect for research, monitoring, and data collection.
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
                placeholder="Enter your search query"
                className="mt-2"
              />
              {errors.query && (
                <p className="text-xs text-destructive mt-1">{errors.query}</p>
              )}
              <p className="text-xs text-muted-foreground mt-1">
                The keywords or phrase to search for
              </p>
            </div>

            {/* Number of Results */}
            <div>
              <Label htmlFor="numResults">Number of Results</Label>
              <Input
                id="numResults"
                type="number"
                value={values.numResults || 10}
                onChange={(e) => setValue('numResults', parseInt(e.target.value))}
                min={1}
                max={100}
                className="mt-2"
              />
              <p className="text-xs text-muted-foreground mt-1">
                How many search results to return (1-100)
              </p>
            </div>

            {/* Search Type */}
            <div>
              <Label htmlFor="searchType">Search Type</Label>
              <Select
                value={values.searchType || 'web'}
                onValueChange={(value) => setValue('searchType', value)}
              >
                <SelectTrigger className="mt-2">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {searchTypes.map((type) => (
                    <SelectItem key={type.value} value={type.value}>
                      {type.label} - {type.description}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground mt-1">
                Type of search to perform
              </p>
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
      "snippet": "Description...",
      "position": 1
    }
  ],
  "totalResults": 12500000,
  "query": "your search",
  "searchTime": 0.45
}`}
              </pre>
            </div>
          </TabsContent>

          <TabsContent value="advanced" className="space-y-4 mt-0">
            {/* Language */}
            <div>
              <Label htmlFor="language">Language</Label>
              <Select
                value={values.language || 'en'}
                onValueChange={(value) => setValue('language', value)}
              >
                <SelectTrigger className="mt-2">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {languages.map((lang) => (
                    <SelectItem key={lang.value} value={lang.value}>
                      {lang.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground mt-1">
                Preferred language for search results
              </p>
            </div>

            {/* Country */}
            <div>
              <Label htmlFor="country">Country/Region</Label>
              <Select
                value={values.country || ''}
                onValueChange={(value) => setValue('country', value)}
              >
                <SelectTrigger className="mt-2">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {countries.map((country) => (
                    <SelectItem key={country.value} value={country.value}>
                      {country.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground mt-1">
                Filter results by country (leave as "All Countries" for global results)
              </p>
            </div>

            {/* Safe Search */}
            <div>
              <Label htmlFor="safeSearch">Safe Search</Label>
              <Select
                value={values.safeSearch || 'moderate'}
                onValueChange={(value) => setValue('safeSearch', value)}
              >
                <SelectTrigger className="mt-2">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {safeSearchLevels.map((level) => (
                    <SelectItem key={level.value} value={level.value}>
                      {level.label} - {level.description}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground mt-1">
                Filter explicit or sensitive content
              </p>
            </div>

            {/* Date Range */}
            <div>
              <Label htmlFor="dateRange">Date Range (Optional)</Label>
              <Select
                value={values.dateRange || ''}
                onValueChange={(value) => setValue('dateRange', value)}
              >
                <SelectTrigger className="mt-2">
                  <SelectValue placeholder="All time" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">All time</SelectItem>
                  <SelectItem value="day">Past 24 hours</SelectItem>
                  <SelectItem value="week">Past week</SelectItem>
                  <SelectItem value="month">Past month</SelectItem>
                  <SelectItem value="year">Past year</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground mt-1">
                Filter results by publication date
              </p>
            </div>

            {/* Exact Terms */}
            <div>
              <Label htmlFor="exactTerms">Exact Terms (Optional)</Label>
              <Input
                id="exactTerms"
                value={values.exactTerms || ''}
                onChange={(e) => setValue('exactTerms', e.target.value)}
                placeholder="e.g., machine learning"
                className="mt-2"
              />
              <p className="text-xs text-muted-foreground mt-1">
                Search for an exact phrase (will be enclosed in quotes)
              </p>
            </div>

            {/* Exclude Terms */}
            <div>
              <Label htmlFor="excludeTerms">Exclude Terms (Optional)</Label>
              <Input
                id="excludeTerms"
                value={values.excludeTerms || ''}
                onChange={(e) => setValue('excludeTerms', e.target.value)}
                placeholder="e.g., tutorial"
                className="mt-2"
              />
              <p className="text-xs text-muted-foreground mt-1">
                Words to exclude from results (separated by spaces)
              </p>
            </div>

            {/* Site Filter */}
            <div>
              <Label htmlFor="siteFilter">Site Filter (Optional)</Label>
              <Input
                id="siteFilter"
                value={values.siteFilter || ''}
                onChange={(e) => setValue('siteFilter', e.target.value)}
                placeholder="e.g., github.com"
                className="mt-2"
              />
              <p className="text-xs text-muted-foreground mt-1">
                Limit results to a specific domain
              </p>
            </div>

            {/* Include Metadata */}
            <div className="flex items-start space-x-3 p-3 rounded-lg border border-border">
              <Checkbox
                id="includeMetadata"
                checked={values.includeMetadata !== false}
                onCheckedChange={(checked) => setValue('includeMetadata', checked)}
              />
              <div className="flex-1">
                <label
                  htmlFor="includeMetadata"
                  className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
                >
                  Include Search Metadata
                </label>
                <p className="text-xs text-muted-foreground mt-1">
                  Include total results count and search time in the output
                </p>
              </div>
            </div>

            {/* API Notice */}
            <Alert variant="default">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription className="text-xs">
                This action uses the Google Custom Search API. You may need to provide an API key and Search Engine ID in your integration settings. Free tier includes 100 searches per day.
              </AlertDescription>
            </Alert>
          </TabsContent>
        </Tabs>
    </ConfigurationContainer>
  );
}
