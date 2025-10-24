"use client"

import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Code2, ChevronLeft, AlertCircle, Info } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';

interface TransformerConfigurationProps {
  values: Record<string, any>;
  errors: Record<string, string>;
  setValue: (name: string, value: any) => void;
  handleSubmit: (e: React.FormEvent) => void;
  isLoading: boolean;
  onCancel: () => void;
  nodeInfo: any;
  isEditMode?: boolean;
}

export function TransformerConfiguration({
  values,
  errors,
  setValue,
  handleSubmit,
  isLoading,
  onCancel,
  nodeInfo,
  isEditMode = false,
}: TransformerConfigurationProps) {
  const [activeTab, setActiveTab] = useState('code');

  // Set default values
  React.useEffect(() => {
    if (!values.timeout) {
      setValue('timeout', 30);
    }
    if (!values.allowedImports) {
      setValue('allowedImports', ['json', 're', 'datetime', 'math']);
    }
    if (!values.pythonCode) {
      setValue('pythonCode', `# Available variables:
# - data: Previous node's output
# - trigger: Trigger data
# - nodeOutputs: All previous node outputs

# Example: Transform user data
result = {
    "name": data.get("name", "").upper(),
    "count": len(data.get("items", [])),
    "processed": True
}

# Return the result (must be JSON-serializable)
return result`);
    }
  }, []);

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();

    // Validate required fields
    if (!values.pythonCode || values.pythonCode.trim() === '') {
      alert('Please enter Python code');
      return;
    }

    // Check if code includes a return statement
    if (!values.pythonCode.includes('return')) {
      alert('Python code must include a "return" statement');
      return;
    }

    handleSubmit(e);
  };

  const availableLibraries = [
    { value: 'json', label: 'json', description: 'JSON parsing' },
    { value: 're', label: 're', description: 'Regular expressions' },
    { value: 'datetime', label: 'datetime', description: 'Date/time manipulation' },
    { value: 'math', label: 'math', description: 'Mathematical functions' },
    { value: 'requests', label: 'requests', description: 'HTTP requests' },
    { value: 'pandas', label: 'pandas', description: 'Data manipulation' },
    { value: 'numpy', label: 'numpy', description: 'Numerical computing' },
  ];

  const handleLibraryToggle = (library: string) => {
    const current = values.allowedImports || [];
    const updated = current.includes(library)
      ? current.filter((l: string) => l !== library)
      : [...current, library];
    setValue('allowedImports', updated);
  };

  return (
    <form onSubmit={handleSave} className="flex flex-col h-full">
      <div className="flex-1 px-8 py-5 overflow-y-auto overflow-x-hidden">
        <div className="mb-6">
          <h3 className="text-lg font-semibold flex items-center gap-2">
            <Code2 className="w-5 h-5" />
            Python Transformer
          </h3>
          <p className="text-sm text-muted-foreground mt-1">
            Transform and customize data using Python code
          </p>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid w-full grid-cols-2 mb-6">
            <TabsTrigger value="code">Code</TabsTrigger>
            <TabsTrigger value="settings">Settings</TabsTrigger>
          </TabsList>

          <TabsContent value="code" className="space-y-4 mt-0">
            <Alert>
              <Info className="h-4 w-4" />
              <AlertDescription className="text-xs">
                Write Python code to transform your data. Your code has access to <code className="text-xs bg-muted px-1 py-0.5 rounded">data</code>, <code className="text-xs bg-muted px-1 py-0.5 rounded">trigger</code>, and <code className="text-xs bg-muted px-1 py-0.5 rounded">nodeOutputs</code> variables. Must return a JSON-serializable dictionary.
              </AlertDescription>
            </Alert>

            {/* Python Code */}
            <div>
              <Label htmlFor="pythonCode">
                Python Code <span className="text-destructive">*</span>
              </Label>
              <Textarea
                id="pythonCode"
                value={values.pythonCode || ''}
                onChange={(e) => setValue('pythonCode', e.target.value)}
                placeholder="# Write your Python code here..."
                className="mt-2 font-mono text-sm min-h-[400px]"
                style={{ fontFamily: 'Monaco, Consolas, monospace' }}
              />
              {errors.pythonCode && (
                <p className="text-xs text-destructive mt-1">{errors.pythonCode}</p>
              )}
              <p className="text-xs text-muted-foreground mt-1">
                Code must include a <code>return</code> statement with a dictionary
              </p>
            </div>

            {/* Example Output Preview */}
            <div className="bg-muted/50 border border-border rounded-lg p-4">
              <h4 className="text-sm font-medium mb-2 flex items-center gap-2">
                <Code2 className="w-4 h-4" />
                Example Output
              </h4>
              <pre className="text-xs text-muted-foreground font-mono">
{`{
  "result": { ... },
  "success": true,
  "executionTime": 45
}`}
              </pre>
            </div>
          </TabsContent>

          <TabsContent value="settings" className="space-y-4 mt-0">
            {/* Allowed Imports */}
            <div>
              <Label className="mb-3 block">Allowed Python Libraries</Label>
              <div className="space-y-2">
                {availableLibraries.map((lib) => (
                  <div key={lib.value} className="flex items-start space-x-3 p-3 rounded-lg border border-border hover:bg-accent/50 transition-colors">
                    <Checkbox
                      id={`lib-${lib.value}`}
                      checked={(values.allowedImports || []).includes(lib.value)}
                      onCheckedChange={() => handleLibraryToggle(lib.value)}
                    />
                    <div className="flex-1">
                      <label
                        htmlFor={`lib-${lib.value}`}
                        className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
                      >
                        <code className="text-xs bg-muted px-1.5 py-0.5 rounded mr-2">{lib.label}</code>
                      </label>
                      <p className="text-xs text-muted-foreground mt-1">{lib.description}</p>
                    </div>
                  </div>
                ))}
              </div>
              <p className="text-xs text-muted-foreground mt-3">
                Select which Python libraries your code can import. More libraries = slower execution.
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
                min={1}
                max={300}
                className="mt-2"
              />
              <p className="text-xs text-muted-foreground mt-1">
                Maximum execution time before the script is terminated (1-300 seconds)
              </p>
            </div>

            {/* Security Notice */}
            <Alert variant="default">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription className="text-xs">
                Python code runs in a sandboxed environment with limited access. Network requests and file system operations are restricted for security.
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
