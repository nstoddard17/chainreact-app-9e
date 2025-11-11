"use client"

import React from 'react';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { AlertCircle } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Checkbox } from '@/components/ui/checkbox';
import { GenericSelectField } from '../../fields/shared/GenericSelectField';
import { ConfigurationContainer } from '../../components/ConfigurationContainer';

interface FileUploadConfigurationProps {
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

export function FileUploadConfiguration({
  values,
  errors,
  setValue,
  onSubmit,
  onCancel,
  onBack,
  isEditMode = false,
}: FileUploadConfigurationProps) {

  // Set default values
  React.useEffect(() => {
    if (!values.source) {
      setValue('source', 'url');
    }
    if (!values.fileType) {
      setValue('fileType', 'csv');
    }
    if (!values.csvDelimiter) {
      setValue('csvDelimiter', ',');
    }
    if (values.hasHeaders === undefined) {
      setValue('hasHeaders', true);
    }
  }, []);

  // Compute form validity
  const isFormValid = React.useMemo(() => {
    if (values.source === 'url' && (!values.fileUrl || values.fileUrl.trim() === '')) return false;
    if (values.source === 'previous_step' && (!values.fileField || values.fileField.trim() === '')) return false;
    return true;
  }, [values.source, values.fileUrl, values.fileField]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();

    // Validate based on source type
    if (values.source === 'url' && (!values.fileUrl || values.fileUrl.trim() === '')) {
      alert('Please enter a file URL');
      return;
    }
    if (values.source === 'previous_step' && (!values.fileField || values.fileField.trim() === '')) {
      alert('Please select the file field from the previous step');
      return;
    }

    await onSubmit(values);
  };

  return (
    <ConfigurationContainer
      onSubmit={handleSave}
      onCancel={onCancel}
      onBack={onBack}
      isEditMode={isEditMode}
      isFormValid={isFormValid}
    >
      <div className="space-y-6">
        {/* File Source Section */}
        <div className="space-y-4">
          <div>
            <Label className="mb-1 block">
              File Source <span className="text-destructive">*</span>
            </Label>
            <p className="text-xs text-muted-foreground">
              Choose where to get your file from
            </p>
          </div>

          <div>
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
          <div className="text-xs text-muted-foreground">
            Supported formats: CSV, Excel (.xlsx, .xls), PDF, TXT, JSON
          </div>
        </div>

        {/* Parsing Options Section */}
        <div className="space-y-4 pt-6 border-t border-border">
          <div>
            <h3 className="text-sm font-semibold">Parsing Options</h3>
            <p className="text-xs text-muted-foreground mt-1">
              Configure how files are parsed and processed
            </p>
          </div>

          {/* File Type Selection */}
          <div>
            <Label htmlFor="fileType">File Type</Label>
            <div className="mt-2">
              <GenericSelectField
                field={{
                  name: 'fileType',
                  type: 'select',
                  label: 'File Type',
                  required: false,
                }}
                value={values.fileType || 'csv'}
                onChange={(value) => setValue('fileType', value)}
                options={[
                  { value: 'csv', label: 'CSV' },
                  { value: 'excel', label: 'Excel' },
                  { value: 'pdf', label: 'PDF' },
                  { value: 'txt', label: 'Text' },
                  { value: 'json', label: 'JSON' },
                ]}
              />
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Select the file format you'll be working with
            </p>
          </div>

          {/* Auto-Detect Fallback */}
          <div className="flex items-start space-x-3 p-3 rounded-lg border border-border">
            <Checkbox
              id="autoDetectFormat"
              checked={values.autoDetectFormat === true}
              onCheckedChange={(checked) => setValue('autoDetectFormat', checked)}
            />
            <div className="flex-1">
              <label
                htmlFor="autoDetectFormat"
                className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
              >
                Auto-detect if unclear
              </label>
              <p className="text-xs text-muted-foreground mt-1">
                Fall back to automatic detection if the file doesn't match the selected type
              </p>
            </div>
          </div>

          {/* CSV-specific Options */}
          {values.fileType === 'csv' && (
            <div className="space-y-3">
              <div>
                <Label htmlFor="csvDelimiter">Delimiter</Label>
                <div className="mt-2">
                  <GenericSelectField
                    field={{
                      name: 'csvDelimiter',
                      type: 'select',
                      label: 'Delimiter',
                      required: false,
                    }}
                    value={values.csvDelimiter || ','}
                    onChange={(value) => setValue('csvDelimiter', value)}
                    options={[
                      { value: ',', label: 'Comma (,)' },
                      { value: ';', label: 'Semicolon (;)' },
                      { value: '\t', label: 'Tab (\\t)' },
                      { value: '|', label: 'Pipe (|)' },
                    ]}
                  />
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  Character used to separate values
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
                    First row contains headers
                  </label>
                  <p className="text-xs text-muted-foreground mt-1">
                    Use the first row as column names
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Excel-specific Options */}
          {values.fileType === 'excel' && (
            <div className="space-y-3">
              <div>
                <Label htmlFor="sheetName">Sheet Name</Label>
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
                    First row contains headers
                  </label>
                  <p className="text-xs text-muted-foreground mt-1">
                    Use the first row as column names
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Max File Size - Universal */}
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
        </div>
      </div>
    </ConfigurationContainer>
  );
}
