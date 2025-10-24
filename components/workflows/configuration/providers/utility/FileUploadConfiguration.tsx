"use client"

import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Upload, ChevronLeft, AlertCircle, Info, FileText } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';

interface FileUploadConfigurationProps {
  values: Record<string, any>;
  errors: Record<string, string>;
  setValue: (name: string, value: any) => void;
  handleSubmit: (e: React.FormEvent) => void;
  isLoading: boolean;
  onCancel: () => void;
  nodeInfo: any;
  isEditMode?: boolean;
}

export function FileUploadConfiguration({
  values,
  errors,
  setValue,
  handleSubmit,
  isLoading,
  onCancel,
  nodeInfo,
  isEditMode = false,
}: FileUploadConfigurationProps) {
  const [activeTab, setActiveTab] = useState('source');

  // Set default values
  React.useEffect(() => {
    if (!values.source) {
      setValue('source', 'upload');
    }
    if (!values.maxFileSize) {
      setValue('maxFileSize', 10);
    }
    if (!values.autoDetectFormat) {
      setValue('autoDetectFormat', true);
    }
    if (!values.csvDelimiter) {
      setValue('csvDelimiter', ',');
    }
  }, []);

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();

    // Validate based on source type
    if (values.source === 'upload' && !values.file) {
      alert('Please select a file to upload');
      return;
    }
    if (values.source === 'url' && (!values.fileUrl || values.fileUrl.trim() === '')) {
      alert('Please enter a file URL');
      return;
    }
    if (values.source === 'previous_step' && (!values.fileField || values.fileField.trim() === '')) {
      alert('Please select the file field from the previous step');
      return;
    }

    handleSubmit(e);
  };

  const supportedFormats = [
    { value: 'csv', label: 'CSV', description: 'Comma-separated values' },
    { value: 'excel', label: 'Excel', description: '.xlsx, .xls files' },
    { value: 'pdf', label: 'PDF', description: 'Text extraction' },
    { value: 'txt', label: 'Text', description: 'Plain text files' },
    { value: 'json', label: 'JSON', description: 'JSON data files' },
  ];

  return (
    <form onSubmit={handleSave} className="flex flex-col h-full">
      <div className="flex-1 px-8 py-5 overflow-y-auto overflow-x-hidden">
        <div className="mb-6">
          <h3 className="text-lg font-semibold flex items-center gap-2">
            <Upload className="w-5 h-5" />
            File Upload
          </h3>
          <p className="text-sm text-muted-foreground mt-1">
            Upload and process files to extract data
          </p>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid w-full grid-cols-2 mb-6">
            <TabsTrigger value="source">File Source</TabsTrigger>
            <TabsTrigger value="parsing">Parsing Options</TabsTrigger>
          </TabsList>

          <TabsContent value="source" className="space-y-4 mt-0">
            <Alert>
              <Info className="h-4 w-4" />
              <AlertDescription className="text-xs">
                Choose where to get your file from. You can upload directly, provide a URL, or use a file from a previous workflow step.
              </AlertDescription>
            </Alert>

            {/* File Source */}
            <div>
              <Label className="mb-3 block">
                File Source <span className="text-destructive">*</span>
              </Label>
              <RadioGroup
                value={values.source || 'upload'}
                onValueChange={(value) => setValue('source', value)}
                className="space-y-3"
              >
                <div className="flex items-start space-x-3 p-3 rounded-lg border border-border hover:bg-accent/50 transition-colors">
                  <RadioGroupItem value="upload" id="source-upload" className="mt-1" />
                  <div className="flex-1">
                    <label htmlFor="source-upload" className="text-sm font-medium cursor-pointer">
                      Direct Upload
                    </label>
                    <p className="text-xs text-muted-foreground mt-1">
                      Upload a file from your computer
                    </p>
                  </div>
                </div>

                <div className="flex items-start space-x-3 p-3 rounded-lg border border-border hover:bg-accent/50 transition-colors">
                  <RadioGroupItem value="url" id="source-url" className="mt-1" />
                  <div className="flex-1">
                    <label htmlFor="source-url" className="text-sm font-medium cursor-pointer">
                      URL
                    </label>
                    <p className="text-xs text-muted-foreground mt-1">
                      Download file from a URL
                    </p>
                  </div>
                </div>

                <div className="flex items-start space-x-3 p-3 rounded-lg border border-border hover:bg-accent/50 transition-colors">
                  <RadioGroupItem value="previous_step" id="source-previous" className="mt-1" />
                  <div className="flex-1">
                    <label htmlFor="source-previous" className="text-sm font-medium cursor-pointer">
                      From Previous Step
                    </label>
                    <p className="text-xs text-muted-foreground mt-1">
                      Use a file from a previous workflow step
                    </p>
                  </div>
                </div>
              </RadioGroup>
            </div>

            {/* Conditional Fields Based on Source */}
            {values.source === 'upload' && (
              <div>
                <Label htmlFor="file">
                  Select File <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="file"
                  type="file"
                  onChange={(e) => setValue('file', e.target.files?.[0])}
                  className="mt-2"
                  accept=".csv,.xlsx,.xls,.pdf,.txt,.json"
                />
                {errors.file && (
                  <p className="text-xs text-destructive mt-1">{errors.file}</p>
                )}
                <p className="text-xs text-muted-foreground mt-1">
                  Supported: CSV, Excel, PDF, TXT, JSON (max {values.maxFileSize || 10}MB)
                </p>
              </div>
            )}

            {values.source === 'url' && (
              <div>
                <Label htmlFor="fileUrl">
                  File URL <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="fileUrl"
                  type="url"
                  value={values.fileUrl || ''}
                  onChange={(e) => setValue('fileUrl', e.target.value)}
                  placeholder="https://example.com/file.csv"
                  className="mt-2"
                />
                {errors.fileUrl && (
                  <p className="text-xs text-destructive mt-1">{errors.fileUrl}</p>
                )}
                <p className="text-xs text-muted-foreground mt-1">
                  Direct link to a file (must be publicly accessible)
                </p>
              </div>
            )}

            {values.source === 'previous_step' && (
              <div>
                <Label htmlFor="fileField">
                  File Field <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="fileField"
                  value={values.fileField || ''}
                  onChange={(e) => setValue('fileField', e.target.value)}
                  placeholder="{{trigger.file_url}}"
                  className="mt-2"
                />
                {errors.fileField && (
                  <p className="text-xs text-destructive mt-1">{errors.fileField}</p>
                )}
                <p className="text-xs text-muted-foreground mt-1">
                  Use the variable picker to select a file field from a previous step
                </p>
              </div>
            )}

            {/* Supported Formats Display */}
            <div className="bg-muted/50 border border-border rounded-lg p-4">
              <h4 className="text-sm font-medium mb-2 flex items-center gap-2">
                <FileText className="w-4 h-4" />
                Supported File Formats
              </h4>
              <div className="flex flex-wrap gap-2">
                {supportedFormats.map((format) => (
                  <Badge key={format.value} variant="outline" className="text-xs">
                    {format.label}
                  </Badge>
                ))}
              </div>
            </div>
          </TabsContent>

          <TabsContent value="parsing" className="space-y-4 mt-0">
            {/* Auto-Detect Format */}
            <div className="flex items-start space-x-3 p-3 rounded-lg border border-border">
              <Checkbox
                id="autoDetectFormat"
                checked={values.autoDetectFormat !== false}
                onCheckedChange={(checked) => setValue('autoDetectFormat', checked)}
              />
              <div className="flex-1">
                <label
                  htmlFor="autoDetectFormat"
                  className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
                >
                  Auto-Detect File Format
                </label>
                <p className="text-xs text-muted-foreground mt-1">
                  Automatically detect and parse the file format based on extension
                </p>
              </div>
            </div>

            {/* CSV Options */}
            <div className="space-y-3">
              <h4 className="text-sm font-medium">CSV Options</h4>

              <div>
                <Label htmlFor="csvDelimiter">Delimiter</Label>
                <Select
                  value={values.csvDelimiter || ','}
                  onValueChange={(value) => setValue('csvDelimiter', value)}
                >
                  <SelectTrigger className="mt-2">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value=",">Comma (,)</SelectItem>
                    <SelectItem value=";">Semicolon (;)</SelectItem>
                    <SelectItem value="\t">Tab (\t)</SelectItem>
                    <SelectItem value="|">Pipe (|)</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground mt-1">
                  Character used to separate values in CSV files
                </p>
              </div>

              <div className="flex items-start space-x-3 p-3 rounded-lg border border-border">
                <Checkbox
                  id="hasHeaders"
                  checked={values.hasHeaders !== false}
                  onCheckedChange={(checked) => setValue('hasHeaders', checked)}
                />
                <div className="flex-1">
                  <label
                    htmlFor="hasHeaders"
                    className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
                  >
                    First Row Contains Headers
                  </label>
                  <p className="text-xs text-muted-foreground mt-1">
                    Use the first row as column names
                  </p>
                </div>
              </div>
            </div>

            {/* Excel Options */}
            <div className="space-y-3">
              <h4 className="text-sm font-medium">Excel Options</h4>

              <div>
                <Label htmlFor="sheetName">Sheet Name (Optional)</Label>
                <Input
                  id="sheetName"
                  value={values.sheetName || ''}
                  onChange={(e) => setValue('sheetName', e.target.value)}
                  placeholder="Leave empty for first sheet"
                  className="mt-2"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Specific sheet to read (defaults to first sheet)
                </p>
              </div>
            </div>

            {/* Max File Size */}
            <div>
              <Label htmlFor="maxFileSize">Maximum File Size (MB)</Label>
              <Input
                id="maxFileSize"
                type="number"
                value={values.maxFileSize || 10}
                onChange={(e) => setValue('maxFileSize', parseInt(e.target.value))}
                min={1}
                max={100}
                className="mt-2"
              />
              <p className="text-xs text-muted-foreground mt-1">
                Files larger than this will be rejected (1-100 MB)
              </p>
            </div>

            {/* Security Notice */}
            <Alert variant="default">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription className="text-xs">
                Files are scanned for viruses and malicious content. Large files may take longer to process. PDF text extraction works best with text-based PDFs (not scanned images).
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
